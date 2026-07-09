import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureConnected, socket } from '../lib/socket';
import { OPTION_KEYS } from '../lib/shapes';
import ShapeButton from '../components/ShapeButton';
import Timer from '../components/Timer';
import FinalLeaderboard from '../components/FinalLeaderboard';

export default function PlayerGame() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('connecting'); // connecting | lobby | question | locked | reveal | ended
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState(null);
  const [score, setScore] = useState(0);
  const [hostGone, setHostGone] = useState(false);
  const creds = useRef(null);

  useEffect(() => {
    const gameCode = sessionStorage.getItem('quiz.gameCode');
    const nickname = sessionStorage.getItem('quiz.nickname');

    if (!gameCode || !nickname) {
      navigate('/join');
      return;
    }
    creds.current = { gameCode, nickname };

    const doJoin = () => {
      socket.emit('join-room', { gameCode, nickname }, (res) => {
        if (!res.ok) {
          navigate(`/join?error=${encodeURIComponent(res.error)}`);
          return;
        }
        setScore(res.score);
        setPhase(res.status === 'lobby' ? 'lobby' : 'question');
      });
    };

    const onQuestionStarted = (q) => {
      setQuestion(q);
      setSelected(null);
      setLastResult(null);
      setRevealData(null);
      setHostGone(false);
      setPhase('question');
    };

    const onQuestionRevealed = (data) => {
      setRevealData(data);
      setPhase('reveal');
    };

    const onGameEnded = (data) => {
      setFinalLeaderboard(data.leaderboard);
      setPhase('ended');
    };

    const onHostDisconnected = () => setHostGone(true);

    socket.on('connect', doJoin);
    socket.on('question-started', onQuestionStarted);
    socket.on('question-revealed', onQuestionRevealed);
    socket.on('game-ended', onGameEnded);
    socket.on('host-disconnected', onHostDisconnected);

    ensureConnected();
    if (socket.connected) doJoin();

    return () => {
      socket.off('connect', doJoin);
      socket.off('question-started', onQuestionStarted);
      socket.off('question-revealed', onQuestionRevealed);
      socket.off('game-ended', onGameEnded);
      socket.off('host-disconnected', onHostDisconnected);
    };
  }, [navigate]);

  const handleAnswer = (optionKey) => {
    if (phase !== 'question' || selected) return;
    setSelected(optionKey);
    setPhase('locked');

    socket.emit('submit-answer', { selectedOption: optionKey }, (res) => {
      if (!res.ok) return;
      setLastResult(res);
      setScore(res.totalScore);
    });
  };

  if (phase === 'connecting') {
    return <CenteredMessage title="Connecting…" />;
  }

  if (phase === 'lobby') {
    return (
      <CenteredMessage
        title={`Hey, ${creds.current?.nickname}!`}
        subtitle="You're in. Waiting for the host to start the game…"
      />
    );
  }

  if (phase === 'ended') {
    const mine = finalLeaderboard?.find((p) => p.nickname === creds.current?.nickname);
    const rank = finalLeaderboard?.findIndex((p) => p.nickname === creds.current?.nickname);
    return (
      <div className="min-h-svh bg-gradient-to-b from-brand-50 to-white px-4 py-10">
        <FinalLeaderboard leaderboard={finalLeaderboard ?? []} />
        <p className="mt-6 text-center text-slate-500">
          {mine
            ? `You finished #${rank + 1} with ${mine.score} points.`
            : `Final score: ${score} points.`}
        </p>
      </div>
    );
  }

  if (phase === 'question' || phase === 'locked') {
    return (
      <div className="flex min-h-svh flex-col gap-6 bg-slate-900 px-4 py-6">
        {hostGone && (
          <div className="rounded-lg bg-amber-500/20 px-3 py-2 text-center text-sm text-amber-300">
            Host disconnected — hang tight.
          </div>
        )}
        <Timer totalSeconds={question.timeLimitSeconds} resetKey={question.index} />
        <p className="text-center text-lg font-semibold text-white">{question.questionText}</p>
        <div className="grid flex-1 grid-cols-2 gap-3">
          {OPTION_KEYS.map((key) => (
            <ShapeButton
              key={key}
              optionKey={key}
              label={question.options[key]}
              disabled={phase === 'locked'}
              selected={selected === key}
              dimmed={phase === 'locked' && selected !== key}
              onClick={() => handleAnswer(key)}
            />
          ))}
        </div>
        {phase === 'locked' && !lastResult && (
          <p className="text-center text-sm text-slate-400">Answer locked — waiting for results…</p>
        )}
      </div>
    );
  }

  if (phase === 'reveal') {
    const gotItRight = lastResult?.isCorrect;
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center">
        {lastResult ? (
          <>
            <div className={`text-5xl ${gotItRight ? '' : 'grayscale'}`}>{gotItRight ? '✅' : '❌'}</div>
            <p className="text-2xl font-bold text-white">
              {gotItRight ? `+${lastResult.points} points` : 'No points this round'}
            </p>
            <p className="text-slate-400">Total score: {score}</p>
          </>
        ) : (
          <p className="text-xl font-semibold text-white">Time's up!</p>
        )}
        <p className="mt-6 text-sm text-slate-500">Waiting for the next question…</p>
      </div>
    );
  }

  return null;
}

function CenteredMessage({ title, subtitle }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 bg-gradient-to-b from-brand-50 to-white px-6 text-center">
      <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
      {subtitle && <p className="text-slate-500">{subtitle}</p>}
    </div>
  );
}
