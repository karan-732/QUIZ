import { useEffect, useRef, useState } from 'react';
import { ensureConnected, socket } from '../lib/socket';
import { OPTION_KEYS, SHAPE_META } from '../lib/shapes';
import QRCodeCard from '../components/QRCodeCard';
import PlayerListLive from '../components/PlayerListLive';
import ShapeButton from '../components/ShapeButton';
import Timer from '../components/Timer';
import MiniLeaderboard from '../components/MiniLeaderboard';
import FinalLeaderboard from '../components/FinalLeaderboard';

export default function HostGame() {
  const [phase, setPhase] = useState('creating'); // creating | lobby | question | reveal | ended | error
  const [gameCode, setGameCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [question, setQuestion] = useState(null);
  const [answerProgress, setAnswerProgress] = useState({ answered: 0, total: 0 });
  const [revealData, setRevealData] = useState(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState(null);
  const [error, setError] = useState('');
  const playersRef = useRef([]);
  playersRef.current = players;

  const createRoom = () => {
    setPhase('creating');
    setPlayers([]);
    setQuestion(null);
    setRevealData(null);
    setFinalLeaderboard(null);
    socket.emit('create-room', {}, (res) => {
      if (!res.ok) {
        setError(res.error);
        setPhase('error');
        return;
      }
      setGameCode(res.gameCode);
      setPhase('lobby');
    });
  };

  useEffect(() => {
    const onPlayerListUpdated = (list) => setPlayers(list);
    const onQuestionStarted = (q) => {
      setQuestion(q);
      setAnswerProgress({ answered: 0, total: playersRef.current.filter((p) => p.connected).length });
      setRevealData(null);
      setPhase('question');
    };
    const onAnswerProgress = (p) => setAnswerProgress(p);
    const onQuestionRevealed = (data) => {
      setRevealData(data);
      setPhase('reveal');
    };
    const onGameEnded = (data) => {
      setFinalLeaderboard(data.leaderboard);
      setPhase('ended');
    };

    socket.on('player-list-updated', onPlayerListUpdated);
    socket.on('question-started', onQuestionStarted);
    socket.on('answer-progress', onAnswerProgress);
    socket.on('question-revealed', onQuestionRevealed);
    socket.on('game-ended', onGameEnded);

    ensureConnected();
    if (socket.connected) {
      createRoom();
    } else {
      socket.once('connect', createRoom);
    }

    return () => {
      socket.off('player-list-updated', onPlayerListUpdated);
      socket.off('question-started', onQuestionStarted);
      socket.off('answer-progress', onAnswerProgress);
      socket.off('question-revealed', onQuestionRevealed);
      socket.off('game-ended', onGameEnded);
      socket.off('connect', createRoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    socket.emit('start-game', {}, (res) => {
      if (!res.ok) setError(res.error);
    });
  };

  const handleNext = () => {
    socket.emit('next-question', {}, (res) => {
      if (!res.ok) setError(res.error);
    });
  };

  const joinUrl = gameCode ? `${window.location.origin}/join/${gameCode}` : '';
  const isLastQuestion = question && revealData && question.index + 1 >= question.total;

  if (phase === 'creating') {
    return <CenteredMessage title="Setting up your quiz…" />;
  }

  if (phase === 'error') {
    return (
      <CenteredMessage title="Couldn't create the quiz" subtitle={error}>
        <button
          type="button"
          onClick={createRoom}
          className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white"
        >
          Try Again
        </button>
      </CenteredMessage>
    );
  }

  if (phase === 'lobby') {
    return (
      <div className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 px-6 py-10">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Game Code</p>
          <h1 className="text-6xl font-extrabold tracking-[0.2em] text-slate-900">{gameCode}</h1>
        </header>

        <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
          <QRCodeCard joinUrl={joinUrl} />
          <PlayerListLive players={players} />
        </div>

        {error && <p className="text-center font-medium text-red-500">{error}</p>}

        <button
          type="button"
          onClick={handleStart}
          className="mx-auto mt-4 rounded-2xl bg-brand-600 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700"
        >
          Start Game
        </button>
      </div>
    );
  }

  if (phase === 'question') {
    return (
      <div className="flex min-h-svh flex-col gap-6 bg-slate-900 px-8 py-8">
        <div className="flex items-center justify-between text-slate-400">
          <span className="font-semibold">
            Question {question.index + 1} / {question.total}
          </span>
          <span className="font-semibold">
            {answerProgress.answered}/{answerProgress.total} answered
          </span>
        </div>
        <Timer totalSeconds={question.timeLimitSeconds} resetKey={question.index} />
        <h2 className="text-center text-3xl font-bold text-white">{question.questionText}</h2>
        <div className="grid flex-1 grid-cols-2 gap-4">
          {OPTION_KEYS.map((key) => (
            <ShapeButton key={key} optionKey={key} label={question.options[key]} disabled />
          ))}
        </div>
        <button
          type="button"
          onClick={handleNext}
          className="mx-auto rounded-2xl bg-white px-8 py-3 font-bold text-slate-900 shadow-lg"
        >
          Next
        </button>
      </div>
    );
  }

  if (phase === 'reveal' && revealData) {
    const total = Object.values(revealData.optionCounts).reduce((a, b) => a + b, 0) || 1;
    return (
      <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-6 py-10">
        <h2 className="text-center text-2xl font-bold text-slate-900">
          Question {revealData.index + 1} Results
        </h2>

        <div className="space-y-2">
          {OPTION_KEYS.map((key) => {
            const meta = SHAPE_META[key];
            const count = revealData.optionCounts[key] || 0;
            const pct = Math.round((count / total) * 100);
            const isCorrect = key === revealData.correctOption;
            return (
              <div key={key} className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  {key}
                </div>
                <div className="h-8 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${isCorrect ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right font-semibold text-slate-600">{count}</span>
                {isCorrect && <span className="text-emerald-500">✓</span>}
              </div>
            );
          })}
        </div>

        {revealData.fastestCorrect && (
          <p className="text-center font-medium text-slate-600">
            ⚡ Fastest correct answer: <strong>{revealData.fastestCorrect.nickname}</strong> (
            {(revealData.fastestCorrect.responseTimeMs / 1000).toFixed(2)}s)
          </p>
        )}

        <MiniLeaderboard leaderboard={revealData.leaderboard} title="Current Standings" />

        <button
          type="button"
          onClick={handleNext}
          className="mx-auto rounded-2xl bg-brand-600 px-8 py-3 font-bold text-white shadow-lg shadow-brand-600/20"
        >
          {isLastQuestion ? 'Show Final Results' : 'Next Question'}
        </button>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="min-h-svh bg-gradient-to-b from-brand-50 to-white px-4 py-10">
        <FinalLeaderboard leaderboard={finalLeaderboard ?? []} />
        <button
          type="button"
          onClick={createRoom}
          className="mx-auto mt-8 block rounded-2xl bg-brand-600 px-8 py-3 font-bold text-white shadow-lg shadow-brand-600/20"
        >
          Play Again
        </button>
      </div>
    );
  }

  return null;
}

function CenteredMessage({ title, subtitle, children }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 bg-gradient-to-b from-brand-50 to-white px-6 text-center">
      <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
      {subtitle && <p className="text-slate-500">{subtitle}</p>}
      {children}
    </div>
  );
}
