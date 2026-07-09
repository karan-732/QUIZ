import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerGameSocket } from './src/sockets/gameSocket.js';
import { getRoomCount } from './src/state/roomStore.js';
import { supabase } from './src/config/supabaseClient.js';

const PORT = process.env.PORT || 4000;
// "*" must be passed as-is (not inside an array) — the cors package treats
// array entries as literal origin strings, so ["*"] matches nothing.
const rawOrigins = (process.env.CLIENT_ORIGIN || '*').split(',').map((origin) => origin.trim());
const CLIENT_ORIGINS = rawOrigins.includes('*') ? '*' : rawOrigins;

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), activeRooms: getRoomCount() });
});

// ---------------------------------------------------------------------------
// Game history (read-only analytics over past sessions).
// ---------------------------------------------------------------------------

// PostgREST caps every response at 1000 rows regardless of .limit() — a
// 60-player game already produces 300 rows, so anything reading responses
// must page or it silently drops data.
async function fetchAllPages(buildQuery, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

// GET /api/history — recent sessions with participant counts.
app.get('/api/history', async (_req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from('game_sessions')
      .select('id, game_code, status, started_at, ended_at, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    // One paged query per session: a single .in() query over all sessions
    // truncates at the 1000-row cap once history grows, which zeroed out
    // recent sessions' player counts.
    const countsBySession = {};
    await Promise.all(
      sessions.map(async (s) => {
        const rows = await fetchAllPages(() =>
          supabase.from('player_responses').select('nickname').eq('session_id', s.id)
        );
        countsBySession[s.id] = new Set(rows.map((r) => r.nickname)).size;
      })
    );

    res.json({
      sessions: sessions.map((s) => ({
        ...s,
        playerCount: countsBySession[s.id] ?? 0,
      })),
    });
  } catch (err) {
    console.error('[history] list failed:', err.message);
    res.status(500).json({ error: 'Failed to load history.' });
  }
});

// GET /api/history/:id — full per-participant, per-question breakdown of one
// session: every answer, response time, and points, plus question aggregates.
app.get('/api/history/:id', async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid session id.' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('id, game_code, status, started_at, ended_at, created_at')
      .eq('id', id)
      .single();

    if (sessionError) throw sessionError;

    const rows = await fetchAllPages(() =>
      supabase
        .from('player_responses')
        .select(
          'nickname, selected_option, is_correct, response_time_ms, points_awarded, question_id, questions(question_text, correct_option, display_order)'
        )
        .eq('session_id', id)
        .order('created_at', { ascending: true })
    );

    // Questions actually answered in this session, in quiz order.
    const questionById = new Map();
    for (const row of rows) {
      if (row.questions && !questionById.has(row.question_id)) {
        questionById.set(row.question_id, {
          id: row.question_id,
          questionText: row.questions.question_text,
          correctOption: row.questions.correct_option,
          displayOrder: row.questions.display_order,
        });
      }
    }
    const questions = Array.from(questionById.values()).sort(
      (a, b) => a.displayOrder - b.displayOrder
    );

    // Per-participant rollup with per-question detail.
    const participantsByName = new Map();
    for (const row of rows) {
      const p = participantsByName.get(row.nickname) ?? {
        nickname: row.nickname,
        totalPoints: 0,
        correctCount: 0,
        answeredCount: 0,
        totalTimeMs: 0,
        answers: {},
      };
      p.totalPoints += row.points_awarded;
      p.answeredCount += 1;
      p.totalTimeMs += row.response_time_ms;
      if (row.is_correct) p.correctCount += 1;
      p.answers[row.question_id] = {
        selectedOption: row.selected_option,
        isCorrect: row.is_correct,
        responseTimeMs: row.response_time_ms,
        points: row.points_awarded,
      };
      participantsByName.set(row.nickname, p);
    }

    const participants = Array.from(participantsByName.values())
      .map((p) => ({
        ...p,
        avgTimeMs: p.answeredCount > 0 ? Math.round(p.totalTimeMs / p.answeredCount) : 0,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    // Per-question aggregates (correct rate + average response time).
    const questionStats = questions.map((q) => {
      let answered = 0;
      let correct = 0;
      let timeSum = 0;
      for (const p of participants) {
        const a = p.answers[q.id];
        if (!a) continue;
        answered += 1;
        timeSum += a.responseTimeMs;
        if (a.isCorrect) correct += 1;
      }
      return {
        questionId: q.id,
        answered,
        correct,
        avgTimeMs: answered > 0 ? Math.round(timeSum / answered) : 0,
      };
    });

    res.json({ session, questions, participants, questionStats });
  } catch (err) {
    console.error('[history] detail failed:', err.message);
    res.status(500).json({ error: 'Failed to load session details.' });
  }
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGINS,
    methods: ['GET', 'POST'],
  },
  // Game events are tiny JSON blobs — anything bigger than 8KB is abuse.
  // (Question edits from the host are the largest legitimate payload.)
  maxHttpBufferSize: 8192,
  // Detect dead phones (locked screens, dropped Wi-Fi) reasonably fast so
  // the host's player list and answer counts stay honest with 60+ devices.
  pingInterval: 10_000,
  pingTimeout: 8_000,
  // Compression costs CPU per message per socket; payloads here are far too
  // small to benefit, and with 60 connections the CPU matters more.
  perMessageDeflate: false,
});

registerGameSocket(io);

httpServer.listen(PORT, () => {
  console.log(`Quiz server listening on port ${PORT}`);
});

// A crash mid-game would drop every room — log and keep serving; state is
// in memory so staying alive is strictly better than restarting.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err);
});
