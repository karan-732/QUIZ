/**
 * In-memory live-game state.
 *
 * This is intentionally NOT persisted to Postgres — it's the fast-path
 * cache for an active session (scores, connection status, timers).
 * Supabase only receives durable logs (sessions + batched responses).
 *
 * Players are keyed by a client-generated `playerToken` (one per tab), NOT
 * by nickname: the token is the identity that survives refreshes, while
 * nicknames are display-only and deduplicated with a numeric suffix.
 *
 * Room {
 *   gameCode: string
 *   sessionId: string            // FK into game_sessions
 *   hostSocketId: string
 *   hostToken: string            // secret; lets a refreshed host reclaim the room
 *   hostConnected: boolean
 *   status: 'lobby' | 'question' | 'reveal' | 'ended'
 *   questions: Question[]        // full rows, including correct_option (server-only)
 *   currentQuestionIndex: number
 *   questionStartedAt: number | null   // ms epoch, set when a question is broadcast
 *   questionDeadline: number | null    // ms epoch after which answers are rejected
 *   questionTimer: Timeout | null      // auto-reveal timer
 *   allAnsweredTimer: Timeout | null   // short fuse once every player has answered
 *   hostGraceTimer: Timeout | null     // closes the room if the host never returns
 *   broadcastTimer: Timeout | null     // coalesces player-list broadcasts
 *   pendingResponses: object[]         // buffered player_responses rows, flushed per question
 *   lastRevealStats: object | null     // cached reveal payload for host/player rejoin
 *   finalLeaderboard: object[] | null
 *   lastActivityAt: number
 *   players: Map<playerToken, Player>
 *   nicknameIndex: Map<lowercased nickname, playerToken>
 * }
 *
 * Player {
 *   token: string
 *   nickname: string             // display name, unique per room (suffixum if needed)
 *   socketId: string | null      // null while disconnected
 *   connected: boolean
 *   score: number
 *   answers: Map<questionIndex, { selectedOption, responseTimeMs, isCorrect, points }>
 * }
 */

export const MAX_PLAYERS_PER_ROOM = 300;
export const MAX_ACTIVE_ROOMS = 100;
export const MAX_NICKNAME_LENGTH = 20;

// gameCode -> Room
const rooms = new Map();

// socket.id -> { gameCode, role: 'host' | 'player', token | null, nickname | null }
// Lets disconnect handlers find "who was this socket" in O(1) without
// scanning every room.
const socketIndex = new Map();

export function createRoom({ gameCode, sessionId, hostSocketId, hostToken, questions }) {
  const room = {
    gameCode,
    sessionId,
    hostSocketId,
    hostToken,
    hostConnected: true,
    status: 'lobby',
    questions,
    currentQuestionIndex: -1,
    questionStartedAt: null,
    questionDeadline: null,
    questionTimer: null,
    allAnsweredTimer: null,
    hostGraceTimer: null,
    broadcastTimer: null,
    pendingResponses: [],
    lastRevealStats: null,
    finalLeaderboard: null,
    lastActivityAt: Date.now(),
    players: new Map(),
    nicknameIndex: new Map(),
  };

  rooms.set(gameCode, room);
  socketIndex.set(hostSocketId, { gameCode, role: 'host', token: null, nickname: null });

  return room;
}

export function getRoom(gameCode) {
  return rooms.get(gameCode);
}

export function getAllRooms() {
  return rooms.values();
}

export function roomExists(gameCode) {
  return rooms.has(gameCode);
}

export function getRoomCount() {
  return rooms.size;
}

export function touchRoom(room) {
  room.lastActivityAt = Date.now();
}

/** Clears every pending timer a room might be holding. Safe to call twice. */
export function clearRoomTimers(room) {
  for (const key of ['questionTimer', 'allAnsweredTimer', 'hostGraceTimer', 'broadcastTimer']) {
    if (room[key]) {
      clearTimeout(room[key]);
      room[key] = null;
    }
  }
}

export function deleteRoom(gameCode) {
  const room = rooms.get(gameCode);
  if (!room) return;

  clearRoomTimers(room);
  socketIndex.delete(room.hostSocketId);
  for (const player of room.players.values()) {
    if (player.socketId) socketIndex.delete(player.socketId);
  }
  rooms.delete(gameCode);
}

export function getPlayerByToken(room, token) {
  return room.players.get(token);
}

/**
 * Returns `requested` if free, otherwise "requested 2", "requested 3", …
 * so two Karans can both join instead of the second being bounced.
 * Suffixed names still respect the max nickname length.
 */
export function resolveNickname(room, requested) {
  const taken = (name) => room.nicknameIndex.has(name.toLowerCase());
  if (!taken(requested)) return requested;

  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` ${n}`;
    const base = requested.slice(0, MAX_NICKNAME_LENGTH - suffix.length).trimEnd();
    const candidate = `${base}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
  return null;
}

export function addOrRestorePlayer(room, { token, nickname, socketId }) {
  const existing = room.players.get(token);

  if (existing) {
    // Same identity coming back (refresh / reconnect / extra tab). Any old
    // socket for this player must not keep an index entry pointing at them.
    if (existing.socketId && existing.socketId !== socketId) {
      socketIndex.delete(existing.socketId);
    }
    existing.socketId = socketId;
    existing.connected = true;
    socketIndex.set(socketId, {
      gameCode: room.gameCode,
      role: 'player',
      token,
      nickname: existing.nickname,
    });
    return { player: existing, rejoined: true };
  }

  const player = {
    token,
    nickname,
    socketId,
    connected: true,
    score: 0,
    answers: new Map(),
  };

  room.players.set(token, player);
  room.nicknameIndex.set(nickname.toLowerCase(), token);
  socketIndex.set(socketId, { gameCode: room.gameCode, role: 'player', token, nickname });

  return { player, rejoined: false };
}

export function getSocketMeta(socketId) {
  return socketIndex.get(socketId);
}

export function setSocketMeta(socketId, meta) {
  socketIndex.set(socketId, meta);
}

export function removeSocketMeta(socketId) {
  socketIndex.delete(socketId);
}

export function markPlayerDisconnected(room, token) {
  const player = room.players.get(token);
  if (!player) return;

  if (player.socketId) socketIndex.delete(player.socketId);
  player.connected = false;
  player.socketId = null;
}

export function getPublicPlayerList(room) {
  return Array.from(room.players.values()).map((p) => ({
    nickname: p.nickname,
    connected: p.connected,
    score: p.score,
  }));
}

export function getLeaderboard(room, limit = 5) {
  return Array.from(room.players.values())
    .map((p) => ({ nickname: p.nickname, score: p.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getConnectedPlayerCount(room) {
  let count = 0;
  for (const p of room.players.values()) {
    if (p.connected) count += 1;
  }
  return count;
}

export function recordAnswer(room, token, questionIndex, result) {
  const player = room.players.get(token);
  if (!player) return null;

  player.answers.set(questionIndex, result);
  player.score += result.points;
  return player;
}

export function hasAnswered(room, token, questionIndex) {
  const player = room.players.get(token);
  return Boolean(player?.answers.get(questionIndex));
}

/**
 * Tally of how many players picked each option for a question, plus the
 * fastest player among those who answered correctly (for the "speediest"
 * highlight on the reveal screen).
 */
export function getAnswerStats(room, questionIndex) {
  const optionCounts = { A: 0, B: 0, C: 0, D: 0 };
  let fastestCorrect = null;
  let totalAnswered = 0;

  for (const player of room.players.values()) {
    const answer = player.answers.get(questionIndex);
    if (!answer) continue;

    totalAnswered += 1;
    optionCounts[answer.selectedOption] = (optionCounts[answer.selectedOption] || 0) + 1;

    if (answer.isCorrect) {
      if (!fastestCorrect || answer.responseTimeMs < fastestCorrect.responseTimeMs) {
        fastestCorrect = { nickname: player.nickname, responseTimeMs: answer.responseTimeMs };
      }
    }
  }

  return { optionCounts, totalAnswered, fastestCorrect };
}

/**
 * Strips the correct answer before this question ever reaches the network —
 * both host and player clients get the same shape. `timeRemainingMs` lets a
 * mid-question (re)joiner start their local countdown at the right point.
 */
export function toPublicQuestion(question, index, total, timeRemainingMs = null) {
  const totalMs = question.time_limit_seconds * 1000;
  return {
    index,
    total,
    id: question.id,
    questionText: question.question_text,
    options: {
      A: question.option_a,
      B: question.option_b,
      C: question.option_c,
      D: question.option_d,
    },
    timeLimitSeconds: question.time_limit_seconds,
    timeRemainingMs: timeRemainingMs ?? totalMs,
  };
}

/**
 * Host-only view of a question: includes the correct answer, for the
 * pre-game review/edit panel. Never send this to players.
 */
export function toHostQuestion(question, index) {
  return {
    index,
    id: question.id,
    questionText: question.question_text,
    options: {
      A: question.option_a,
      B: question.option_b,
      C: question.option_c,
      D: question.option_d,
    },
    correctOption: question.correct_option,
    timeLimitSeconds: question.time_limit_seconds,
  };
}
