import { supabase } from '../config/supabaseClient.js';
import { sanitizeNickname } from '../utils/sanitize.js';
import { generateUniqueGameCode } from '../utils/gameCode.js';
import { calculatePoints } from '../utils/scoring.js';
import {
  createRoom,
  getRoom,
  roomExists,
  deleteRoom,
  addOrRestorePlayer,
  getSocketMeta,
  removeSocketMeta,
  markPlayerDisconnected,
  getPublicPlayerList,
  getConnectedPlayerCount,
  recordAnswer,
  hasAnswered,
  getAnswerStats,
  getLeaderboard,
  toPublicQuestion,
} from '../state/roomStore.js';

const QUESTION_COUNT = 5;
const MAX_NICKNAME_LENGTH = 20;
const FINAL_LEADERBOARD_SIZE = 10;

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

async function beginQuestion(io, room) {
  room.status = 'question';
  room.questionStartedAt = Date.now();

  const question = room.questions[room.currentQuestionIndex];
  const payload = toPublicQuestion(question, room.currentQuestionIndex, room.questions.length);

  io.to(room.gameCode).emit('question-started', payload);
}

async function endGame(io, room) {
  room.status = 'ended';

  const leaderboard = getLeaderboard(room, FINAL_LEADERBOARD_SIZE);
  io.to(room.gameCode).emit('game-ended', { leaderboard });

  const { error } = await supabase
    .from('game_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', room.sessionId);

  if (error) console.error('[end-game] failed to mark session completed:', error.message);
}

export function registerGameSocket(io) {
  io.on('connection', (socket) => {
    // -----------------------------------------------------------------
    // HOST: create-room
    // Pulls the 5 fixed default questions from Supabase, opens a
    // game_sessions row, and stands up the in-memory room.
    // -----------------------------------------------------------------
    socket.on('create-room', async (_payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};

      // Same host socket starting another round ("Play Again") — retire
      // whatever room it was previously hosting so memory doesn't leak
      // across repeated sessions.
      const previousMeta = getSocketMeta(socket.id);
      if (previousMeta?.role === 'host') {
        socket.leave(previousMeta.gameCode);
        deleteRoom(previousMeta.gameCode);
      }

      try {
        const { data: questions, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .order('display_order', { ascending: true })
          .limit(QUESTION_COUNT);

        if (questionsError) throw questionsError;
        if (!questions || questions.length === 0) {
          return ack({ ok: false, error: 'No questions are configured in the question bank.' });
        }

        const gameCode = generateUniqueGameCode(roomExists);

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
          questions,
        });

        socket.join(gameCode);

        ack({
          ok: true,
          gameCode,
          sessionId: session.id,
          totalQuestions: room.questions.length,
        });
      } catch (err) {
        console.error('[create-room] failed:', err.message);
        ack({ ok: false, error: 'Failed to create room. Please try again.' });
      }
    });

    // -----------------------------------------------------------------
    // PLAYER: join-room
    // Also doubles as the "rejoin" path: if the nickname already exists
    // in the room and is currently disconnected, this restores that
    // player's socket + score instead of creating a new one.
    // -----------------------------------------------------------------
    socket.on('join-room', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const gameCode = String(payload?.gameCode ?? '').trim();
      const nickname = sanitizeNickname(payload?.nickname);

      if (!/^\d{4}$/.test(gameCode)) {
        return ack({ ok: false, error: 'Invalid game code.' });
      }

      if (!nickname) {
        return ack({
          ok: false,
          error: `Nickname must be 1-${MAX_NICKNAME_LENGTH} characters (letters, numbers, spaces).`,
        });
      }

      const room = getRoom(gameCode);
      if (!room) {
        return ack({ ok: false, error: 'Room not found. Check the code and try again.' });
      }

      const existing = room.players.get(nickname);
      if (existing && existing.connected) {
        return ack({ ok: false, error: 'That nickname is already taken in this room.' });
      }

      if (!existing && room.status !== 'lobby') {
        return ack({ ok: false, error: 'This game has already started.' });
      }

      const { player, rejoined } = addOrRestorePlayer(room, { nickname, socketId: socket.id });
      socket.join(gameCode);

      ack({
        ok: true,
        gameCode,
        nickname: player.nickname,
        score: player.score,
        rejoined,
        status: room.status,
      });

      io.to(room.hostSocketId).emit('player-list-updated', getPublicPlayerList(room));
      socket.to(gameCode).emit('player-list-updated', getPublicPlayerList(room));
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

      await beginQuestion(io, room);
      ack({ ok: true });
    });

    // -----------------------------------------------------------------
    // PLAYER: submit-answer
    // Server is the sole source of truth for timing/scoring — the
    // client-side button lock is just UX, this is the real guard
    // against double submissions.
    // -----------------------------------------------------------------
    socket.on('submit-answer', async (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const meta = getSocketMeta(socket.id);

      if (!meta || meta.role !== 'player') {
        return ack({ ok: false, error: 'Only players can submit answers.' });
      }

      const room = getRoom(meta.gameCode);
      if (!room || room.status !== 'question') {
        return ack({ ok: false, error: 'No question is currently active.' });
      }

      const selectedOption = String(payload?.selectedOption ?? '').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
        return ack({ ok: false, error: 'Invalid option.' });
      }

      if (hasAnswered(room, meta.nickname, room.currentQuestionIndex)) {
        return ack({ ok: false, error: 'You already answered this question.' });
      }

      const question = room.questions[room.currentQuestionIndex];
      const totalTimeMs = question.time_limit_seconds * 1000;
      const responseTimeMs = Math.min(Date.now() - room.questionStartedAt, totalTimeMs);
      const isCorrect = selectedOption === question.correct_option;
      const points = calculatePoints({ isCorrect, responseTimeMs, totalTimeMs });

      const player = recordAnswer(room, meta.nickname, room.currentQuestionIndex, {
        selectedOption,
        responseTimeMs,
        isCorrect,
        points,
      });

      ack({ ok: true, isCorrect, points, totalScore: player.score });

      io.to(room.hostSocketId).emit('answer-progress', {
        answered: getAnswerStats(room, room.currentQuestionIndex).totalAnswered,
        total: getConnectedPlayerCount(room),
      });

      const { error } = await supabase.from('player_responses').insert({
        session_id: room.sessionId,
        nickname: meta.nickname,
        question_id: question.id,
        selected_option: selectedOption,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        points_awarded: points,
      });

      if (error) console.error('[submit-answer] failed to log response:', error.message);
    });

    // -----------------------------------------------------------------
    // HOST: next-question
    // Dual-purpose, matching the classic Kahoot host button:
    //   status 'question' -> reveal this question's results
    //   status 'reveal'   -> advance to the next question, or end the game
    // -----------------------------------------------------------------
    socket.on('next-question', async (_payload, callback) => {
      const ctx = requireHost(socket, callback);
      if (!ctx) return;
      const { room, ack } = ctx;

      if (room.status === 'question') {
        room.status = 'reveal';
        const question = room.questions[room.currentQuestionIndex];
        const { optionCounts, totalAnswered, fastestCorrect } = getAnswerStats(
          room,
          room.currentQuestionIndex
        );

        io.to(room.gameCode).emit('question-revealed', {
          index: room.currentQuestionIndex,
          correctOption: question.correct_option,
          optionCounts,
          totalAnswered,
          fastestCorrect,
          leaderboard: getLeaderboard(room, 5),
        });

        return ack({ ok: true, phase: 'reveal' });
      }

      if (room.status === 'reveal') {
        const isLastQuestion = room.currentQuestionIndex + 1 >= room.questions.length;

        if (isLastQuestion) {
          await endGame(io, room);
          return ack({ ok: true, phase: 'ended' });
        }

        room.currentQuestionIndex += 1;
        await beginQuestion(io, room);
        return ack({ ok: true, phase: 'question' });
      }

      return ack({ ok: false, error: `Cannot advance from status "${room.status}".` });
    });

    // -----------------------------------------------------------------
    // disconnect: keep the player's score in memory so they can rejoin
    // with the same nickname via join-room later. Host disconnects are
    // flagged but the room (and player scores) are kept alive.
    // -----------------------------------------------------------------
    socket.on('disconnect', () => {
      const meta = getSocketMeta(socket.id);
      if (!meta) return;

      const room = getRoom(meta.gameCode);
      removeSocketMeta(socket.id);
      if (!room) return;

      if (meta.role === 'host') {
        room.hostConnected = false;
        socket.to(meta.gameCode).emit('host-disconnected');
        return;
      }

      markPlayerDisconnected(room, meta.nickname);
      io.to(room.hostSocketId).emit('player-list-updated', getPublicPlayerList(room));
      socket.to(meta.gameCode).emit('player-list-updated', getPublicPlayerList(room));

      // Lobby rooms with no host and no connected players are pruned so
      // memory doesn't grow unbounded across abandoned sessions.
      const anyoneConnected =
        room.hostConnected || Array.from(room.players.values()).some((p) => p.connected);
      if (!anyoneConnected) {
        deleteRoom(meta.gameCode);
      }
    });
  });
}
