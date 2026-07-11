import { randomUUID } from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { sanitizeNickname } from '../utils/sanitize.js';
import { generateUniqueGameCode } from '../utils/gameCode.js';
import { calculatePoints } from '../utils/scoring.js';
import {
  MAX_PLAYERS_PER_ROOM,
  MAX_ACTIVE_ROOMS,
  MAX_NICKNAME_LENGTH,
  createRoom,
  getRoom,
  getAllRooms,
  getRoomCount,
  roomExists,
  deleteRoom,
  touchRoom,
  clearRoomTimers,
  addOrRestorePlayer,
  getPlayerByToken,
  resolveNickname,
  getSocketMeta,
  setSocketMeta,
  removeSocketMeta,
  markPlayerDisconnected,
  getPublicPlayerList,
  getConnectedPlayerCount,
  recordAnswer,
  hasAnswered,
  getAnswerStats,
  getLeaderboard,
  toPublicQuestion,
  toHostQuestion,
} from '../state/roomStore.js';

const MAX_QUESTIONS = 50;
const FINAL_LEADERBOARD_SIZE = 10;

// Bounds for host question edits.
const MAX_QUESTION_LENGTH = 300;
const MAX_OPTION_LENGTH = 150;
const MIN_TIME_LIMIT_S = 5;
const MAX_TIME_LIMIT_S = 180;

// Answers that are in flight when the visual timer hits zero shouldn't be
// unfairly dropped — accept them for a short network-grace window, then the
// server reveals on its own (the game never stalls on a missing host click).
const ANSWER_GRACE_MS = 800;
// Once every connected player has answered, reveal after a short beat.
const ALL_ANSWERED_REVEAL_DELAY_MS = 800;
// How long a disconnected host has to reclaim the room before it's closed.
const HOST_RECLAIM_GRACE_MS = 3 * 60 * 1000;
// Coalesce player-list broadcasts — with 60 players joining in a burst this
// turns O(n) broadcasts of O(n) payloads into a handful.
const BROADCAST_THROTTLE_MS = 250;
// Rooms idle longer than this (or finished games) get swept from memory.
const ROOM_IDLE_TTL_MS = 3 * 60 * 60 * 1000;
const ENDED_ROOM_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Per-socket rate limiting: cheap sliding window so a misbehaving client
// can't spam join/answer events and starve the event loop for everyone else.
// ---------------------------------------------------------------------------
const rateBuckets = new Map(); // socketId -> { count, windowStart }

function isRateLimited(socketId, limit = 20, windowMs = 5000) {
  const now = Date.now();
  const bucket = rateBuckets.get(socketId);

  if (!bucket || now - bucket.windowStart > windowMs) {
    rateBuckets.set(socketId, { count: 1, windowStart: now });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

function parseTimeLimit(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < MIN_TIME_LIMIT_S || seconds > MAX_TIME_LIMIT_S) {
    return null;
  }
  return seconds;
}

/**
 * Validates a full question payload (shared by update-question and
 * add-question). Returns { error } or the cleaned fields.
 */
function validateQuestionFields(payload) {
  const questionText = String(payload?.questionText ?? '').trim().slice(0, MAX_QUESTION_LENGTH);
  if (!questionText) {
    return { error: 'Question text cannot be empty.' };
  }

  const options = payload?.options ?? {};
  const cleaned = {};
  for (const key of ['A', 'B', 'C', 'D']) {
    cleaned[key] = String(options[key] ?? '').trim().slice(0, MAX_OPTION_LENGTH);
    if (!cleaned[key]) {
      return { error: `Option ${key} cannot be empty.` };
    }
  }

  const correctOption = String(payload?.correctOption ?? '').toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(correctOption)) {
    return { error: 'Correct option must be A, B, C, or D.' };
  }

  const timeLimitSeconds = parseTimeLimit(payload?.timeLimitSeconds);
  if (timeLimitSeconds === null) {
    return {
      error: `Time limit must be between ${MIN_TIME_LIMIT_S} and ${MAX_TIME_LIMIT_S} seconds.`,
    };
  }

  return { questionText, options: cleaned, correctOption, timeLimitSeconds };
}

function requireHost(socket, callback) {
  const ack = typeof callback === 'function' ? callback : () => {};
  const meta = getSocketMeta(socket.id);

  if (!meta || meta.role !== 'host') {
    ack({ ok: false, error: 'Only the host can do that.' });
    return null;
  }

  const room = getRoom(meta.gameCode);
  if (!room) {
    ack({ ok: false, error: 'Room no longer exists.' });
    return null;
  }

  return { room, ack };
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Throttled room-state fanout. The full player list only goes to the host
 * (players never render it), players just get a lightweight count — that's
 * the difference between 60×(60-entry list) and 60×(one int) per join burst.
 */
function scheduleRoomBroadcast(io, room) {
  if (room.broadcastTimer) return;

  room.broadcastTimer = setTimeout(() => {
    room.broadcastTimer = null;
    if (!roomExists(room.gameCode)) return;

    if (room.hostConnected) {
      io.to(room.hostSocketId).emit('player-list-updated', getPublicPlayerList(room));
    }
    io.to(room.gameCode).emit('lobby-update', { playerCount: getConnectedPlayerCount(room) });
  }, BROADCAST_THROTTLE_MS);
}

function emitAnswerProgress(io, room) {
  if (!room.hostConnected) return;
  io.to(room.hostSocketId).emit('answer-progress', {
    answered: getAnswerStats(room, room.currentQuestionIndex).totalAnswered,
    total: getConnectedPlayerCount(room),
  });
}

// ---------------------------------------------------------------------------
// Game phase transitions — all idempotent and guarded by room.status so the
// host button, the question timer, and the "everyone answered" fast path can
// race without double-firing.
// ---------------------------------------------------------------------------

/** Fire-and-forget bulk write of this question's buffered responses. */
async function flushPendingResponses(room) {
  if (room.pendingResponses.length === 0) return;

  const batch = room.pendingResponses;
  room.pendingResponses = [];

  const { error } = await supabase.from('player_responses').insert(batch);
  if (error) console.error('[responses] failed to log batch:', error.message);
}

function beginQuestion(io, room) {
  room.status = 'question';
  room.questionStartedAt = Date.now();
  room.lastRevealStats = null;
  touchRoom(room);

  const question = room.questions[room.currentQuestionIndex];
  const totalMs = question.time_limit_seconds * 1000;
  room.questionDeadline = room.questionStartedAt + totalMs + ANSWER_GRACE_MS;

  if (room.questionTimer) clearTimeout(room.questionTimer);
  room.questionTimer = setTimeout(() => {
    revealQuestion(io, room);
  }, totalMs + ANSWER_GRACE_MS);

  const payload = toPublicQuestion(question, room.currentQuestionIndex, room.questions.length);
  io.to(room.gameCode).emit('question-started', payload);
}

function buildRevealPayload(room) {
  const question = room.questions[room.currentQuestionIndex];
  const { optionCounts, totalAnswered, fastestCorrect } = getAnswerStats(
    room,
    room.currentQuestionIndex
  );

  return {
    index: room.currentQuestionIndex,
    correctOption: question.correct_option,
    optionCounts,
    totalAnswered,
    fastestCorrect,
    leaderboard: getLeaderboard(room, 5),
    isLastQuestion: room.currentQuestionIndex + 1 >= room.questions.length,
  };
}

function revealQuestion(io, room) {
  if (room.status !== 'question') return;

  room.status = 'reveal';
  touchRoom(room);

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
  if (room.allAnsweredTimer) {
    clearTimeout(room.allAnsweredTimer);
    room.allAnsweredTimer = null;
  }

  room.lastRevealStats = buildRevealPayload(room);
  io.to(room.gameCode).emit('question-revealed', room.lastRevealStats);

  flushPendingResponses(room);
}

async function endGame(io, room) {
  room.status = 'ended';
  touchRoom(room);
  clearRoomTimers(room);

  room.finalLeaderboard = getLeaderboard(room, FINAL_LEADERBOARD_SIZE);
  io.to(room.gameCode).emit('game-ended', { leaderboard: room.finalLeaderboard });

  await flushPendingResponses(room);

  const { error } = await supabase
    .from('game_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', room.sessionId);

  if (error) console.error('[end-game] failed to mark session completed:', error.message);
}

/**
 * Everything a client needs to render the room's current phase — used by
 * players and hosts (re)joining mid-game so a refresh never lands on a
 * blank/crashed screen.
 */
function buildRoomSnapshot(room) {
  const snapshot = {
    status: room.status,
    totalQuestions: room.questions.length,
    playerCount: getConnectedPlayerCount(room),
    hostConnected: room.hostConnected,
  };

  if (room.status === 'question' || room.status === 'reveal') {
    const question = room.questions[room.currentQuestionIndex];
    const totalMs = question.time_limit_seconds * 1000;
    const elapsed = Date.now() - room.questionStartedAt;
    snapshot.question = toPublicQuestion(
      question,
      room.currentQuestionIndex,
      room.questions.length,
      Math.max(totalMs - elapsed, 0)
    );
  }

  if (room.status === 'reveal') {
    snapshot.revealData = room.lastRevealStats ?? buildRevealPayload(room);
  }

  if (room.status === 'ended') {
    snapshot.finalLeaderboard = room.finalLeaderboard ?? getLeaderboard(room, FINAL_LEADERBOARD_SIZE);
  }

  return snapshot;
}

function closeRoom(io, room, reason) {
  io.to(room.gameCode).emit('room-closed', { reason });
  deleteRoom(room.gameCode);
}

// ---------------------------------------------------------------------------
// Periodic sweep so abandoned rooms can't accumulate for the lifetime of the
// process. Runs once per server, not per connection.
// ---------------------------------------------------------------------------
let sweeperStarted = false;

function startRoomSweeper(io) {
  if (sweeperStarted) return;
  sweeperStarted = true;

  const interval = setInterval(() => {
    const now = Date.now();
    for (const room of getAllRooms()) {
      const idleFor = now - room.lastActivityAt;
      const abandoned = !room.hostConnected && getConnectedPlayerCount(room) === 0;
      const endedAndStale = room.status === 'ended' && idleFor > ENDED_ROOM_TTL_MS;
      const zombie = idleFor > ROOM_IDLE_TTL_MS;

      if (abandoned || endedAndStale || zombie) {
        closeRoom(io, room, 'inactive');
      }
    }
  }, SWEEP_INTERVAL_MS);

  interval.unref();
}

export function registerGameSocket(io) {
  startRoomSweeper(io);

  io.on('connection', (socket) => {
    // -----------------------------------------------------------------
    // HOST: create-room
    // Pulls the active question bank from Supabase, opens a
    // game_sessions row, and stands up the in-memory room. The ack
    // includes the full questions (with answers) so the host can review
    // and edit them in the lobby before starting.
    // -----------------------------------------------------------------
    socket.on('create-room', async (_payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};

      if (isRateLimited(socket.id, 5, 10_000)) {
        return ack({ ok: false, error: 'Too many requests. Slow down a little.' });
      }

      if (getRoomCount() >= MAX_ACTIVE_ROOMS) {
        return ack({ ok: false, error: 'The server is at capacity right now. Try again shortly.' });
      }

      // Same host socket starting another round ("Play Again") — retire
      // whatever room it was previously hosting so memory doesn't leak
      // across repeated sessions.
      const previousMeta = getSocketMeta(socket.id);
      if (previousMeta?.role === 'host') {
        socket.leave(previousMeta.gameCode);
        deleteRoom(previousMeta.gameCode);
      }

      try {
        const { data: questionRows, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .order('display_order', { ascending: true });

        if (questionsError) throw questionsError;

        // Soft-deleted questions are filtered here (not in the query) so the
        // app keeps working even before the is_active migration is applied.
        const questions = (questionRows ?? [])
          .filter((q) => q.is_active !== false)
          .slice(0, MAX_QUESTIONS);

        if (questions.length === 0) {
          return ack({ ok: false, error: 'No questions are configured in the question bank.' });
        }

        const gameCode = generateUniqueGameCode(roomExists);
        const hostToken = randomUUID();

        const { data: session, error: sessionError } = await supabase
          .from('game_sessions')
          .insert({ game_code: gameCode, status: 'waiting' })
          .select()
          .single();

        if (sessionError) throw sessionError;

        const room = createRoom({
          gameCode,
          sessionId: session.id,
          hostSocketId: socket.id,
          hostToken,
          questions,
        });

        socket.join(gameCode);

        ack({
          ok: true,
          gameCode,
          hostToken,
          sessionId: session.id,
          totalQuestions: room.questions.length,
          questions: room.questions.map(toHostQuestion),
        });
      } catch (err) {
        console.error('[create-room] failed:', err.message);
        ack({ ok: false, error: 'Failed to create room. Please try again.' });
      }
    });

    // -----------------------------------------------------------------
    // HOST: update-question
    // Lobby-only pre-game editing of a question (text, options, correct
    // answer, time limit). Saved to the shared question bank in Supabase
    // so the change sticks for every future game.
    // -----------------------------------------------------------------
    socket.on('update-question', async (payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status !== 'lobby') {
        return ack({ ok: false, error: 'Questions can only be edited before the game starts.' });
      }

      const index = Number(payload?.index);
      if (!Number.isInteger(index) || index < 0 || index >= room.questions.length) {
        return ack({ ok: false, error: 'Invalid question index.' });
      }

      const fields = validateQuestionFields(payload);
      if (fields.error) {
        return ack({ ok: false, error: fields.error });
      }

      const question = room.questions[index];
      const { error } = await supabase
        .from('questions')
        .update({
          question_text: fields.questionText,
          option_a: fields.options.A,
          option_b: fields.options.B,
          option_c: fields.options.C,
          option_d: fields.options.D,
          correct_option: fields.correctOption,
          time_limit_seconds: fields.timeLimitSeconds,
        })
        .eq('id', question.id);

      if (error) {
        console.error('[update-question] failed to save:', error.message);
        return ack({ ok: false, error: 'Could not save the question. Please try again.' });
      }

      question.question_text = fields.questionText;
      question.option_a = fields.options.A;
      question.option_b = fields.options.B;
      question.option_c = fields.options.C;
      question.option_d = fields.options.D;
      question.correct_option = fields.correctOption;
      question.time_limit_seconds = fields.timeLimitSeconds;
      touchRoom(room);

      ack({ ok: true, question: toHostQuestion(question, index) });
    });

    // -----------------------------------------------------------------
    // HOST: add-question
    // Lobby-only. Inserts a new question at the end of the bank and
    // appends it to this room. Acks the refreshed full list so client
    // indexes stay in sync.
    // -----------------------------------------------------------------
    socket.on('add-question', async (payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status !== 'lobby') {
        return ack({ ok: false, error: 'Questions can only be edited before the game starts.' });
      }

      if (room.questions.length >= MAX_QUESTIONS) {
        return ack({ ok: false, error: `A game can have at most ${MAX_QUESTIONS} questions.` });
      }

      const fields = validateQuestionFields(payload);
      if (fields.error) {
        return ack({ ok: false, error: fields.error });
      }

      const displayOrder =
        room.questions.reduce((max, q) => Math.max(max, q.display_order ?? 0), 0) + 1;

      const { data: question, error } = await supabase
        .from('questions')
        .insert({
          question_text: fields.questionText,
          option_a: fields.options.A,
          option_b: fields.options.B,
          option_c: fields.options.C,
          option_d: fields.options.D,
          correct_option: fields.correctOption,
          time_limit_seconds: fields.timeLimitSeconds,
          display_order: displayOrder,
        })
        .select()
        .single();

      if (error) {
        console.error('[add-question] failed to insert:', error.message);
        return ack({ ok: false, error: 'Could not add the question. Please try again.' });
      }

      // The room may have started or been swept while the insert was in
      // flight — the bank row is saved either way.
      if (!roomExists(room.gameCode) || room.status !== 'lobby') {
        return ack({ ok: false, error: 'Questions can only be edited before the game starts.' });
      }

      room.questions.push(question);
      touchRoom(room);

      ack({ ok: true, questions: room.questions.map(toHostQuestion) });
    });

    // -----------------------------------------------------------------
    // HOST: remove-question
    // Lobby-only. Soft-deletes the bank row (is_active = false) so past
    // sessions' response logs keep their FK target, and drops it from
    // this room.
    // -----------------------------------------------------------------
    socket.on('remove-question', async (payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status !== 'lobby') {
        return ack({ ok: false, error: 'Questions can only be edited before the game starts.' });
      }

      const index = Number(payload?.index);
      if (!Number.isInteger(index) || index < 0 || index >= room.questions.length) {
        return ack({ ok: false, error: 'Invalid question index.' });
      }

      if (room.questions.length <= 1) {
        return ack({ ok: false, error: 'A game needs at least one question.' });
      }

      const question = room.questions[index];
      const { error } = await supabase
        .from('questions')
        .update({ is_active: false })
        .eq('id', question.id);

      if (error) {
        console.error('[remove-question] failed to remove:', error.message);
        return ack({ ok: false, error: 'Could not remove the question. Please try again.' });
      }

      // Re-locate by id: the list may have shifted while the write was in
      // flight, and index-based removal would then hit the wrong question.
      const currentIndex = room.questions.findIndex((q) => q.id === question.id);
      if (currentIndex !== -1) room.questions.splice(currentIndex, 1);
      touchRoom(room);

      ack({ ok: true, questions: room.questions.map(toHostQuestion) });
    });

    // -----------------------------------------------------------------
    // HOST: set-all-timers
    // Lobby-only. Applies one time limit to every question in this game
    // and persists it to the bank in a single update.
    // -----------------------------------------------------------------
    socket.on('set-all-timers', async (payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status !== 'lobby') {
        return ack({ ok: false, error: 'Questions can only be edited before the game starts.' });
      }

      const timeLimitSeconds = parseTimeLimit(payload?.timeLimitSeconds);
      if (timeLimitSeconds === null) {
        return ack({
          ok: false,
          error: `Time limit must be between ${MIN_TIME_LIMIT_S} and ${MAX_TIME_LIMIT_S} seconds.`,
        });
      }

      const ids = room.questions.map((q) => q.id);
      const { error } = await supabase
        .from('questions')
        .update({ time_limit_seconds: timeLimitSeconds })
        .in('id', ids);

      if (error) {
        console.error('[set-all-timers] failed to save:', error.message);
        return ack({ ok: false, error: 'Could not save the time limit. Please try again.' });
      }

      for (const question of room.questions) {
        question.time_limit_seconds = timeLimitSeconds;
      }
      touchRoom(room);

      ack({ ok: true, questions: room.questions.map(toHostQuestion) });
    });

    // -----------------------------------------------------------------
    // HOST: reclaim-host
    // A refreshed/reconnected host proves ownership with the hostToken
    // it received at create time and gets the full room snapshot back —
    // without this, a host refresh mid-game would strand every player.
    // -----------------------------------------------------------------
    socket.on('reclaim-host', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const gameCode = String(payload?.gameCode ?? '').trim();
      const hostToken = String(payload?.hostToken ?? '');

      const room = getRoom(gameCode);
      if (!room || room.hostToken !== hostToken) {
        return ack({ ok: false, error: 'This game is no longer available.' });
      }

      // Drop the index entry for the previous host socket, then rebind.
      removeSocketMeta(room.hostSocketId);
      room.hostSocketId = socket.id;
      room.hostConnected = true;
      touchRoom(room);
      setSocketMeta(socket.id, { gameCode, role: 'host', token: null, nickname: null });
      socket.join(gameCode);

      if (room.hostGraceTimer) {
        clearTimeout(room.hostGraceTimer);
        room.hostGraceTimer = null;
      }

      socket.to(gameCode).emit('host-reconnected');

      const snapshot = buildRoomSnapshot(room);
      ack({
        ok: true,
        gameCode,
        sessionId: room.sessionId,
        ...snapshot,
        players: getPublicPlayerList(room),
        questions: room.status === 'lobby' ? room.questions.map(toHostQuestion) : undefined,
        answerProgress:
          room.status === 'question'
            ? {
                answered: getAnswerStats(room, room.currentQuestionIndex).totalAnswered,
                total: getConnectedPlayerCount(room),
              }
            : null,
      });
    });

    // -----------------------------------------------------------------
    // PLAYER: join-room
    // Identity is the client-generated playerToken, not the nickname:
    //   - same token  -> rejoin (refresh/reconnect/tab takeover), score kept
    //   - name collision from a DIFFERENT person -> auto-suffix "Karan 2"
    // The ack carries a full snapshot so a mid-question refresh resumes
    // cleanly.
    // -----------------------------------------------------------------
    socket.on('join-room', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};

      if (isRateLimited(socket.id, 10, 5000)) {
        return ack({ ok: false, error: 'Too many attempts. Wait a moment and try again.' });
      }

      const gameCode = String(payload?.gameCode ?? '').trim();
      const requestedNickname = sanitizeNickname(payload?.nickname);
      const playerToken = String(payload?.playerToken ?? '').slice(0, 64) || randomUUID();

      if (!/^\d{4}$/.test(gameCode)) {
        return ack({ ok: false, error: 'Invalid game code.' });
      }

      if (!requestedNickname) {
        return ack({
          ok: false,
          error: `Nickname must be 1-${MAX_NICKNAME_LENGTH} characters (letters, numbers, spaces).`,
        });
      }

      const room = getRoom(gameCode);
      if (!room || room.status === 'ended') {
        return ack({ ok: false, error: 'Room not found. Check the code and try again.' });
      }

      const existing = getPlayerByToken(room, playerToken);

      if (!existing && room.status !== 'lobby') {
        return ack({ ok: false, error: 'This game has already started.' });
      }

      if (!existing && room.players.size >= MAX_PLAYERS_PER_ROOM) {
        return ack({ ok: false, error: 'This room is full.' });
      }

      // Known player opening a second tab: hand the game to the new tab and
      // cleanly drop the old one instead of erroring with "name taken".
      if (existing && existing.connected && existing.socketId && existing.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existing.socketId);
        oldSocket?.emit('session-superseded');
        oldSocket?.disconnect(true);
      }

      // New players get a collision-free display name ("Karan" -> "Karan 2").
      let nickname = existing ? existing.nickname : resolveNickname(room, requestedNickname);
      if (!nickname) {
        return ack({ ok: false, error: 'Could not find a free nickname — try another name.' });
      }

      // A socket hopping rooms (e.g. joined the wrong code first) must not
      // remain a member of the previous room.
      const previousMeta = getSocketMeta(socket.id);
      if (previousMeta?.role === 'player' && previousMeta.gameCode !== gameCode) {
        const previousRoom = getRoom(previousMeta.gameCode);
        socket.leave(previousMeta.gameCode);
        if (previousRoom) {
          markPlayerDisconnected(previousRoom, previousMeta.token);
          scheduleRoomBroadcast(io, previousRoom);
        }
      }

      const { player, rejoined } = addOrRestorePlayer(room, {
        token: playerToken,
        nickname,
        socketId: socket.id,
      });
      socket.join(gameCode);
      touchRoom(room);

      const snapshot = buildRoomSnapshot(room);
      const currentAnswer =
        room.status !== 'lobby' ? player.answers.get(room.currentQuestionIndex) ?? null : null;

      ack({
        ok: true,
        gameCode,
        nickname: player.nickname,
        renamed: player.nickname !== requestedNickname,
        playerToken,
        score: player.score,
        rejoined,
        ...snapshot,
        yourAnswer: currentAnswer
          ? {
              selectedOption: currentAnswer.selectedOption,
              isCorrect: currentAnswer.isCorrect,
              points: currentAnswer.points,
            }
          : null,
      });

      scheduleRoomBroadcast(io, room);
    });

    // -----------------------------------------------------------------
    // HOST: start-game
    // Moves the room out of the lobby and broadcasts question 0 to
    // everyone (host + players get the identical payload).
    // -----------------------------------------------------------------
    socket.on('start-game', async (_payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status !== 'lobby') {
        return ack({ ok: false, error: 'Game has already started.' });
      }

      room.currentQuestionIndex = 0;

      const { error } = await supabase
        .from('game_sessions')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', room.sessionId);

      if (error) {
        console.error('[start-game] failed to mark session active:', error.message);
      }

      // Re-check: the room may have been swept or the game state mutated
      // while the Supabase call was in flight.
      if (!roomExists(room.gameCode) || room.status !== 'lobby') {
        return ack({ ok: false, error: 'Game has already started.' });
      }

      beginQuestion(io, room);
      ack({ ok: true });
    });

    // -----------------------------------------------------------------
    // PLAYER: submit-answer
    // Server is the sole source of truth for timing/scoring — the
    // client-side button lock is just UX, this is the real guard
    // against double submissions and post-deadline answers.
    // -----------------------------------------------------------------
    socket.on('submit-answer', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};

      if (isRateLimited(socket.id, 20, 5000)) {
        return ack({ ok: false, error: 'Too many requests.' });
      }

      const meta = getSocketMeta(socket.id);
      if (!meta || meta.role !== 'player') {
        return ack({ ok: false, error: 'Only players can submit answers.' });
      }

      const room = getRoom(meta.gameCode);
      if (!room || room.status !== 'question') {
        return ack({ ok: false, error: 'No question is currently active.' });
      }

      if (Date.now() > room.questionDeadline) {
        return ack({ ok: false, error: "Time's up for this question." });
      }

      const selectedOption = String(payload?.selectedOption ?? '').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
        return ack({ ok: false, error: 'Invalid option.' });
      }

      if (hasAnswered(room, meta.token, room.currentQuestionIndex)) {
        return ack({ ok: false, error: 'You already answered this question.' });
      }

      const question = room.questions[room.currentQuestionIndex];
      const totalTimeMs = question.time_limit_seconds * 1000;
      const responseTimeMs = Math.min(Date.now() - room.questionStartedAt, totalTimeMs);
      const isCorrect = selectedOption === question.correct_option;
      const points = calculatePoints({ isCorrect, responseTimeMs, totalTimeMs });

      const player = recordAnswer(room, meta.token, room.currentQuestionIndex, {
        selectedOption,
        responseTimeMs,
        isCorrect,
        points,
      });

      if (!player) {
        return ack({ ok: false, error: 'You are not in this game.' });
      }

      touchRoom(room);
      ack({ ok: true, isCorrect, points, totalScore: player.score });

      // Buffered — flushed as one bulk insert at reveal time instead of 60
      // concurrent single-row writes mid-question.
      room.pendingResponses.push({
        session_id: room.sessionId,
        nickname: player.nickname,
        question_id: question.id,
        selected_option: selectedOption,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        points_awarded: points,
      });

      emitAnswerProgress(io, room);

      // Everyone in? Don't make the room stare at a dead timer — reveal
      // after a short beat.
      const { totalAnswered } = getAnswerStats(room, room.currentQuestionIndex);
      const connected = getConnectedPlayerCount(room);
      if (connected > 0 && totalAnswered >= connected && !room.allAnsweredTimer) {
        room.allAnsweredTimer = setTimeout(() => {
          room.allAnsweredTimer = null;
          revealQuestion(io, room);
        }, ALL_ANSWERED_REVEAL_DELAY_MS);
      }
    });

    // -----------------------------------------------------------------
    // HOST: next-question
    // Dual-purpose, matching the classic Kahoot host button:
    //   status 'question' -> reveal this question's results early
    //   status 'reveal'   -> advance to the next question, or end the game
    // The reveal can also fire automatically (timer / all-answered), so
    // every transition here re-checks room.status.
    // -----------------------------------------------------------------
    socket.on('next-question', async (_payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status === 'question') {
        revealQuestion(io, room);
        return ack({ ok: true, phase: 'reveal' });
      }

      if (room.status === 'reveal') {
        const isLastQuestion = room.currentQuestionIndex + 1 >= room.questions.length;

        if (isLastQuestion) {
          await endGame(io, room);
          return ack({ ok: true, phase: 'ended' });
        }

        room.currentQuestionIndex += 1;
        beginQuestion(io, room);
        return ack({ ok: true, phase: 'question' });
      }

      return ack({ ok: false, error: `Cannot advance from status "${room.status}".` });
    });

    // -----------------------------------------------------------------
    // disconnect: keep the player's score in memory so they can rejoin
    // with the same token via join-room later. Host disconnects start
    // a reclaim grace window; if the host never comes back the room is
    // closed so 60 players aren't left staring at a frozen screen.
    // -----------------------------------------------------------------
    socket.on('disconnect', () => {
      rateBuckets.delete(socket.id);

      const meta = getSocketMeta(socket.id);
      if (!meta) return;

      const room = getRoom(meta.gameCode);
      removeSocketMeta(socket.id);
      if (!room) return;

      if (meta.role === 'host') {
        // A reclaim may have already rebound the room to a newer socket —
        // in that case this is just the old socket going away.
        if (room.hostSocketId !== socket.id) return;

        room.hostConnected = false;
        socket.to(meta.gameCode).emit('host-disconnected');

        if (room.status !== 'ended' && !room.hostGraceTimer) {
          room.hostGraceTimer = setTimeout(() => {
            room.hostGraceTimer = null;
            if (roomExists(room.gameCode) && !room.hostConnected) {
              closeRoom(io, room, 'host-left');
            }
          }, HOST_RECLAIM_GRACE_MS);
        }
        return;
      }

      // A newer socket may have already taken over this player (tab
      // takeover) — only mark disconnected if this socket still owns them.
      const player = getPlayerByToken(room, meta.token);
      if (player && player.socketId && player.socketId !== socket.id) return;

      markPlayerDisconnected(room, meta.token);
      scheduleRoomBroadcast(io, room);
      if (room.status === 'question') emitAnswerProgress(io, room);

      // Lobby rooms with no host and no connected players are pruned so
      // memory doesn't grow unbounded across abandoned sessions.
      const anyoneConnected = room.hostConnected || getConnectedPlayerCount(room) > 0;
      if (!anyoneConnected) {
        deleteRoom(meta.gameCode);
      }
    });
  });
}
