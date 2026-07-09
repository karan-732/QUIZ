/**
 * In-memory live-game state.
 *
 * This is intentionally NOT persisted to Postgres — it's the fast-path
 * cache for an active session (scores, connection status, timers).
 * Supabase only receives durable logs (sessions + individual responses).
 *
 * Shape:
 *
 * Room {
 *   gameCode: string
 *   sessionId: string            // FK into game_sessions
 *   hostSocketId: string
 *   hostConnected: boolean
 *   status: 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended'
 *   questions: Question[]        // full rows, including correct_option (server-only)
 *   currentQuestionIndex: number
 *   questionStartedAt: number | null   // ms epoch, set when a question is broadcast
 *   players: Map<nickname, Player>
 * }
 *
 * Player {
 *   nickname: string
 *   socketId: string | null      // null while disconnected
 *   connected: boolean
 *   score: number
 *   answers: Map<questionIndex, { selectedOption, responseTimeMs, isCorrect, points }>
 * }
 */

// gameCode -> Room
const rooms = new Map();

// socket.id -> { gameCode, nickname | null, role: 'host' | 'player' }
// Lets disconnect handlers find "who was this socket" in O(1) without
// scanning every room.
const socketIndex = new Map();

export function createRoom({ gameCode, sessionId, hostSocketId, questions }) {
  const room = {
    gameCode,
    sessionId,
    hostSocketId,
    hostConnected: true,
    status: 'lobby',
    questions,
    currentQuestionIndex: -1,
    questionStartedAt: null,
    players: new Map(),
  };

  rooms.set(gameCode, room);
  socketIndex.set(hostSocketId, { gameCode, nickname: null, role: 'host' });

  return room;
}

export function getRoom(gameCode) {
  return rooms.get(gameCode);
}

export function roomExists(gameCode) {
  return rooms.has(gameCode);
}

export function deleteRoom(gameCode) {
  const room = rooms.get(gameCode);
  if (!room) return;

  socketIndex.delete(room.hostSocketId);
  for (const player of room.players.values()) {
    if (player.socketId) socketIndex.delete(player.socketId);
  }
  rooms.delete(gameCode);
}

export function addOrRestorePlayer(room, { nickname, socketId }) {
  const existing = room.players.get(nickname);

  if (existing) {
    existing.socketId = socketId;
    existing.connected = true;
    socketIndex.set(socketId, { gameCode: room.gameCode, nickname, role: 'player' });
    return { player: existing, rejoined: true };
  }

  const player = {
    nickname,
    socketId,
    connected: true,
    score: 0,
    answers: new Map(),
  };

  room.players.set(nickname, player);
  socketIndex.set(socketId, { gameCode: room.gameCode, nickname, role: 'player' });

  return { player, rejoined: false };
}

export function getSocketMeta(socketId) {
  return socketIndex.get(socketId);
}

export function removeSocketMeta(socketId) {
  socketIndex.delete(socketId);
}

export function markPlayerDisconnected(room, nickname) {
  const player = room.players.get(nickname);
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

export function recordAnswer(room, nickname, questionIndex, result) {
  const player = room.players.get(nickname);
  if (!player) return null;

  player.answers.set(questionIndex, result);
  player.score += result.points;
  return player;
}

export function hasAnswered(room, nickname, questionIndex) {
  const player = room.players.get(nickname);
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
 * both host and player clients get the same shape.
 */
export function toPublicQuestion(question, index, total) {
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
  };
}
