import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureConnected, socket } from '../lib/socket';
import { OPTION_KEYS, SHAPE_META } from '../lib/shapes';
import QRCodeCard from '../components/QRCodeCard';
import PlayerListLive from '../components/PlayerListLive';
import QuestionEditor from '../components/QuestionEditor';
import ShapeIcon from '../components/ShapeIcon';
import Timer from '../components/Timer';
import MiniLeaderboard from '../components/MiniLeaderboard';
import FinalLeaderboard from '../components/FinalLeaderboard';
import CenteredMessage from '../components/CenteredMessage';
import ConnectionBanner from '../components/ConnectionBanner';

const HOST_SESSION_KEY = 'quiz.hostSession';

export default function HostGame() {
  // creating | lobby | question | reveal | ended | error
  const [phase, setPhase] = useState('creating');
  const [gameCode, setGameCode] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [question, setQuestion] = useState(null);
  const [answerProgress, setAnswerProgress] = useState({ answered: 0, total: 0 });
  const [revealData, setRevealData] = useState(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState(null);
  const [error, setError] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const playersRef = useRef([]);
  playersRef.current = players;

  const createRoom = () => {
    setPhase('creating');
    setPlayers([]);
    setQuestions([]);
    setQuestion(null);
    setRevealData(null);
    setFinalLeaderboard(null);
    setError('');
    socket.emit('create-room', {}, (res) => {
      if (!res.ok) {
        setError(res.error);
        setPhase('error');
        return;
      }
      sessionStorage.setItem(
        HOST_SESSION_KEY,
        JSON.stringify({ gameCode: res.gameCode, hostToken: res.hostToken })
      );
      setGameCode(res.gameCode);
      setSessionId(res.sessionId);
      setQuestions(res.questions ?? []);
      setPhase('lobby');
    });
  };

  useEffect(() => {
    // Restores the full host view from the server snapshot after a refresh
    // or reconnect — the game keeps running server-side either way.
    const applySnapshot = (res) => {
      setGameCode(res.gameCode);
      setSessionId(res.sessionId ?? null);
      setPlayers(res.players ?? []);
      if (res.questions) setQuestions(res.questions);
      setError('');

      if (res.status === 'lobby') {
        setPhase('lobby');
        return;
      }
      if (res.status === 'ended') {
        setFinalLeaderboard(res.finalLeaderboard ?? []);
        setPhase('ended');
        return;
      }

      setQuestion(res.question);
      if (res.status === 'reveal') {
        setRevealData(res.revealData);
        setPhase('reveal');
      } else {
        setAnswerProgress(res.answerProgress ?? { answered: 0, total: 0 });
        setRevealData(null);
        setPhase('question');
      }
    };

    // Runs on first connect AND on every reconnect: reclaim the room we
    // were hosting if we have a token, otherwise start a fresh one.
    const boot = () => {
      const saved = JSON.parse(sessionStorage.getItem(HOST_SESSION_KEY) || 'null');
      if (!saved) {
        createRoom();
        return;
      }
      socket.emit('reclaim-host', saved, (res) => {
        if (res.ok) {
          applySnapshot(res);
        } else {
          sessionStorage.removeItem(HOST_SESSION_KEY);
          createRoom();
        }
      });
    };

    const onPlayerListUpdated = (list) => setPlayers(list);
    const onQuestionStarted = (q) => {
      setQuestion(q);
      setAnswerProgress({
        answered: 0,
        total: playersRef.current.filter((p) => p.connected).length,
      });
      setRevealData(null);
      setAdvancing(false);
      setPhase('question');
    };
    const onAnswerProgress = (p) => setAnswerProgress(p);
    const onQuestionRevealed = (data) => {
      setRevealData(data);
      setAdvancing(false);
      setPhase('reveal');
    };
    const onGameEnded = (data) => {
      setFinalLeaderboard(data.leaderboard);
      setAdvancing(false);
      setPhase('ended');
    };
    const onRoomClosed = () => {
      sessionStorage.removeItem(HOST_SESSION_KEY);
      setError('The room was closed due to inactivity.');
      setPhase('error');
    };

    socket.on('connect', boot);
    socket.on('player-list-updated', onPlayerListUpdated);
    socket.on('question-started', onQuestionStarted);
    socket.on('answer-progress', onAnswerProgress);
    socket.on('question-revealed', onQuestionRevealed);
    socket.on('game-ended', onGameEnded);
    socket.on('room-closed', onRoomClosed);

    ensureConnected();
    if (socket.connected) boot();

    return () => {
      socket.off('connect', boot);
      socket.off('player-list-updated', onPlayerListUpdated);
      socket.off('question-started', onQuestionStarted);
      socket.off('answer-progress', onAnswerProgress);
      socket.off('question-revealed', onQuestionRevealed);
      socket.off('game-ended', onGameEnded);
      socket.off('room-closed', onRoomClosed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    setAdvancing(true);
    socket.emit('start-game', {}, (res) => {
      setAdvancing(false);
      if (!res.ok) setError(res.error);
    });
  };

  const handleNext = () => {
    if (advancing) return;
    setAdvancing(true);
    socket.emit('next-question', {}, (res) => {
      setAdvancing(false);
      if (!res.ok && res.error) setError(res.error);
    });
  };

  const handleSaveQuestion = (index, draft, done) => {
    socket.emit('update-question', { index, ...draft }, (res) => {
      if (res.ok) {
        setQuestions((prev) => prev.map((q, i) => (i === index ? res.question : q)));
      }
      done(res);
    });
  };

  const joinUrl = gameCode ? `${window.location.origin}/join/${gameCode}` : '';
  const connectedCount = players.filter((p) => p.connected).length;

  if (phase === 'creating') {
    return (
      <>
        <ConnectionBanner />
        <CenteredMessage title="Setting up your quiz…" spinner />
      </>
    );
  }

  if (phase === 'error') {
    return (
      <CenteredMessage title="Couldn't run the quiz" subtitle={error}>
        <button
          type="button"
          onClick={createRoom}
          className="btn-primary mt-4 rounded-2xl px-6 py-3 font-bold"
        >
          Try Again
        </button>
      </CenteredMessage>
    );
  }

  if (phase === 'lobby') {
    return (
      <>
        <ConnectionBanner />
        <div className="mx-auto flex min-h-svh max-w-4xl flex-col gap-7 px-5 py-8 safe-bottom sm:px-8">
          <header className="animate-float-up text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400">
              Join with game code
            </p>
            <h1
              className="text-gradient mt-1 text-7xl font-extrabold tracking-[0.15em] sm:text-8xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {gameCode}
            </h1>
            <Link
              to="/history"
              className="mt-2 inline-block text-sm font-semibold text-slate-500 underline-offset-4 transition hover:text-brand-300 hover:underline"
            >
              View past games →
            </Link>
          </header>

          <div className="animate-float-up grid gap-5 sm:grid-cols-[auto_1fr]" style={{ animationDelay: '120ms' }}>
            <QRCodeCard joinUrl={joinUrl} />
            <PlayerListLive players={players} />
          </div>

          {questions.length > 0 && (
            <div className="animate-float-up" style={{ animationDelay: '200ms' }}>
              <QuestionEditor questions={questions} onSave={handleSaveQuestion} />
            </div>
          )}

          {error && (
            <p className="animate-fade-in text-center font-semibold text-red-400">{error}</p>
          )}

          <div className="mt-auto flex flex-col items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={connectedCount === 0 || advancing}
              className="btn-primary rounded-2xl px-12 py-4 text-xl font-extrabold"
            >
              {advancing ? 'Starting…' : 'Start Game'}
            </button>
            {connectedCount === 0 && (
              <p className="text-sm font-medium text-slate-500">
                Waiting for at least one player to join…
              </p>
            )}
          </div>
        </div>
      </>
    );
  }

  if (phase === 'question') {
    const progressPct =
      answerProgress.total > 0
        ? Math.min((answerProgress.answered / answerProgress.total) * 100, 100)
        : 0;

    return (
      <>
        <ConnectionBanner />
        <div className="flex min-h-svh flex-col gap-5 px-5 py-6 safe-bottom sm:px-10">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/5 px-4 py-1.5 text-sm font-bold text-slate-300 ring-1 ring-white/10">
              Question {question.index + 1} / {question.total}
            </span>
            <div className="flex items-center gap-3">
              <div className="hidden h-2 w-36 overflow-hidden rounded-full bg-white/10 sm:block">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="rounded-full bg-emerald-500/15 px-4 py-1.5 text-sm font-bold tabular-nums text-emerald-300 ring-1 ring-emerald-500/30">
                {answerProgress.answered}/{answerProgress.total} answered
              </span>
            </div>
          </div>

          <Timer
            totalSeconds={question.timeLimitSeconds}
            initialRemainingMs={question.timeRemainingMs}
            resetKey={question.index}
          />

          <h2
            className="animate-question-in text-center text-3xl font-extrabold leading-snug text-white sm:text-4xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {question.questionText}
          </h2>

          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
            {OPTION_KEYS.map((key, i) => {
              const meta = SHAPE_META[key];
              return (
                <div
                  key={key}
                  className="animate-pop-in flex items-center gap-4 rounded-2xl px-6 py-5 text-white ring-1 ring-white/15"
                  style={{
                    background: meta.gradient,
                    boxShadow: `0 10px 30px -12px ${meta.glow}`,
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  <ShapeIcon shape={meta.shape} className="h-9 w-9 shrink-0 drop-shadow" />
                  <span className="text-xl font-bold drop-shadow-sm sm:text-2xl">
                    {question.options[key]}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={advancing}
            className="btn-ghost mx-auto rounded-2xl px-8 py-3 font-bold"
          >
            Reveal answers now
          </button>
        </div>
      </>
    );
  }

  if (phase === 'reveal' && revealData) {
    const total = Object.values(revealData.optionCounts).reduce((a, b) => a + b, 0) || 1;
    return (
      <>
        <ConnectionBanner />
        <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-5 py-8 safe-bottom">
          <h2
            className="animate-question-in text-center text-3xl font-extrabold text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Question {revealData.index + 1} Results
          </h2>

          <div className="glass space-y-3 rounded-3xl p-5">
            {OPTION_KEYS.map((key) => {
              const meta = SHAPE_META[key];
              const count = revealData.optionCounts[key] || 0;
              const pct = Math.round((count / total) * 100);
              const isCorrect = key === revealData.correctOption;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ring-1 ring-white/15"
                    style={{ background: meta.gradient }}
                  >
                    <ShapeIcon shape={meta.shape} className="h-5 w-5" />
                  </div>
                  <div className="h-9 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={[
                        'animate-bar-grow h-full rounded-full',
                        isCorrect
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                          : 'bg-white/15',
                      ].join(' ')}
                      style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-bold tabular-nums text-slate-300">
                    {count}
                  </span>
                  <span className={`w-5 text-lg ${isCorrect ? 'text-emerald-400' : 'text-transparent'}`}>
                    ✓
                  </span>
                </div>
              );
            })}
          </div>

          {revealData.fastestCorrect && (
            <p className="animate-fade-in text-center font-semibold text-slate-300">
              ⚡ Fastest correct: <span className="text-white">{revealData.fastestCorrect.nickname}</span>{' '}
              <span className="text-slate-500">
                ({(revealData.fastestCorrect.responseTimeMs / 1000).toFixed(2)}s)
              </span>
            </p>
          )}

          <MiniLeaderboard leaderboard={revealData.leaderboard} title="Current Standings" />

          <button
            type="button"
            onClick={handleNext}
            disabled={advancing}
            className="btn-primary mx-auto rounded-2xl px-10 py-4 text-lg font-extrabold"
          >
            {advancing ? '…' : revealData.isLastQuestion ? 'Show Final Results' : 'Next Question'}
          </button>
        </div>
      </>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="min-h-svh px-4 py-10 safe-bottom">
        <FinalLeaderboard leaderboard={finalLeaderboard ?? []} />
        <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3">
          <button
            type="button"
            onClick={createRoom}
            className="btn-primary rounded-2xl px-10 py-4 text-lg font-extrabold"
          >
            Play Again
          </button>
          <Link
            to={sessionId ? `/history/${sessionId}` : '/history'}
            className="btn-ghost rounded-2xl px-8 py-3 text-center font-bold"
          >
            View detailed report →
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
