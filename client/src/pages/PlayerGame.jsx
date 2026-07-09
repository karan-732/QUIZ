import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureConnected, socket } from '../lib/socket';
import { OPTION_KEYS, SHAPE_META } from '../lib/shapes';
import ShapeButton from '../components/ShapeButton';
import ShapeIcon from '../components/ShapeIcon';
import Timer from '../components/Timer';
import FinalLeaderboard from '../components/FinalLeaderboard';
import CenteredMessage from '../components/CenteredMessage';
import ConnectionBanner from '../components/ConnectionBanner';

export default function PlayerGame() {
  const navigate = useNavigate();
  // connecting | lobby | question | locked | reveal | ended | closed
  const [phase, setPhase] = useState('connecting');
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [revealData, setRevealData] = useState(null);
  const [finalLeaderboard, setFinalLeaderboard] = useState(null);
  const [score, setScore] = useState(0);
  const [hostGone, setHostGone] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [closedReason, setClosedReason] = useState(null);
  const creds = useRef(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const gameCode = sessionStorage.getItem('quiz.gameCode');
    const nickname = sessionStorage.getItem('quiz.nickname');

    if (!gameCode || !nickname) {
      navigate('/join');
      return;
    }
    creds.current = { gameCode, nickname };

    // Runs on first mount AND every reconnect. The ack carries a full room
    // snapshot, so a refresh or dropped connection mid-question lands the
    // player exactly where the game currently is.
    const doJoin = () => {
      socket.emit('join-room', { gameCode, nickname }, (res) => {
        if (!res.ok) {
          navigate(`/join?error=${encodeURIComponent(res.error)}`);
          return;
        }

        setScore(res.score);
        setHostGone(!res.hostConnected);
        setPlayerCount(res.playerCount ?? 0);

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

        if (res.yourAnswer) {
          setSelected(res.yourAnswer.selectedOption);
          setLastResult({
            ok: true,
            isCorrect: res.yourAnswer.isCorrect,
            points: res.yourAnswer.points,
          });
        } else {
          setSelected(null);
          setLastResult(null);
        }

        if (res.status === 'reveal') {
          setRevealData(res.revealData);
          setPhase('reveal');
        } else {
          setRevealData(null);
          setPhase(res.yourAnswer ? 'locked' : 'question');
        }
      });
    };

    const onQuestionStarted = (q) => {
      setQuestion(q);
      setSelected(null);
      setLastResult(null);
      setRevealData(null);
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

    const onLobbyUpdate = ({ playerCount: count }) => setPlayerCount(count);
    const onHostDisconnected = () => setHostGone(true);
    const onHostReconnected = () => setHostGone(false);
    const onRoomClosed = ({ reason }) => {
      setClosedReason(reason);
      setPhase('closed');
    };

    socket.on('connect', doJoin);
    socket.on('question-started', onQuestionStarted);
    socket.on('question-revealed', onQuestionRevealed);
    socket.on('game-ended', onGameEnded);
    socket.on('lobby-update', onLobbyUpdate);
    socket.on('host-disconnected', onHostDisconnected);
    socket.on('host-reconnected', onHostReconnected);
    socket.on('room-closed', onRoomClosed);

    ensureConnected();
    if (socket.connected) doJoin();

    return () => {
      socket.off('connect', doJoin);
      socket.off('question-started', onQuestionStarted);
      socket.off('question-revealed', onQuestionRevealed);
      socket.off('game-ended', onGameEnded);
      socket.off('lobby-update', onLobbyUpdate);
      socket.off('host-disconnected', onHostDisconnected);
      socket.off('host-reconnected', onHostReconnected);
      socket.off('room-closed', onRoomClosed);
    };
  }, [navigate]);

  const handleAnswer = (optionKey) => {
    if (phaseRef.current !== 'question') return;
    navigator.vibrate?.(25);
    setSelected(optionKey);
    setPhase('locked');

    socket.emit('submit-answer', { selectedOption: optionKey }, (res) => {
      if (!res.ok) {
        // Server said no (deadline passed / duplicate) — stay locked, the
        // reveal broadcast will straighten everything out shortly.
        return;
      }
      setLastResult(res);
      setScore(res.totalScore);
    });
  };

  const handleTimeUp = () => {
    if (phaseRef.current === 'question') setPhase('locked');
  };

  if (phase === 'connecting') {
    return (
      <>
        <ConnectionBanner />
        <CenteredMessage title="Connecting…" spinner />
      </>
    );
  }

  if (phase === 'closed') {
    return (
      <CenteredMessage
        title="This game has ended"
        subtitle={
          closedReason === 'host-left'
            ? 'The host left and the room was closed.'
            : 'The room is no longer active.'
        }
      >
        <button
          type="button"
          onClick={() => navigate('/join')}
          className="btn-primary mt-4 rounded-2xl px-6 py-3 font-bold"
        >
          Join another game
        </button>
      </CenteredMessage>
    );
  }

  if (phase === 'lobby') {
    return (
      <>
        <ConnectionBanner />
        <div className="bg-arena flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center safe-bottom">
          <div className="animate-pop-in flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/15 text-4xl ring-1 ring-brand-500/30">
            🎉
          </div>
          <div>
            <h1
              className="text-3xl font-extrabold text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              You're in, {creds.current?.nickname}!
            </h1>
            <p className="mt-2 text-slate-400">Waiting for the host to start the game…</p>
          </div>
          {playerCount > 1 && (
            <span className="animate-fade-in rounded-full bg-white/5 px-4 py-1.5 text-sm font-semibold text-slate-300 ring-1 ring-white/10">
              {playerCount} players in the room
            </span>
          )}
          <div className="mt-2 flex gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-2.5 w-2.5 rounded-full bg-brand-400 animate-pulse-dot"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (phase === 'ended') {
    const myNickname = creds.current?.nickname ?? '';
    const rank = finalLeaderboard?.findIndex(
      (p) => p.nickname.toLowerCase() === myNickname.toLowerCase()
    );
    const mine = rank >= 0 ? finalLeaderboard[rank] : null;
    return (
      <div className="bg-arena min-h-svh px-4 py-10 safe-bottom">
        <FinalLeaderboard leaderboard={finalLeaderboard ?? []} highlightNickname={myNickname} />
        <p className="animate-fade-in mt-8 text-center font-semibold text-slate-300">
          {mine
            ? `You finished #${rank + 1} with ${mine.score} points 🎯`
            : `Final score: ${score} points.`}
        </p>
      </div>
    );
  }

  if (phase === 'question' || phase === 'locked') {
    return (
      <>
        <ConnectionBanner />
        <div className="bg-arena flex min-h-svh flex-col gap-4 px-4 pt-4 safe-bottom">
          {hostGone && (
            <div className="animate-fade-in rounded-xl bg-amber-500/15 px-3 py-2 text-center text-sm font-semibold text-amber-300 ring-1 ring-amber-500/25">
              Host disconnected — hang tight, the game will resume.
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-400 ring-1 ring-white/10">
              Q{question.index + 1} / {question.total}
            </span>
            <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-bold tabular-nums text-brand-300 ring-1 ring-brand-500/30">
              {score} pts
            </span>
          </div>

          <Timer
            totalSeconds={question.timeLimitSeconds}
            initialRemainingMs={question.timeRemainingMs}
            resetKey={question.index}
            onExpire={handleTimeUp}
          />

          <p className="animate-question-in text-center text-lg font-bold leading-snug text-white sm:text-xl">
            {question.questionText}
          </p>

          <div className="grid flex-1 grid-cols-2 gap-3 pb-2">
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

          {phase === 'locked' && (
            <p className="animate-fade-in pb-2 text-center text-sm font-medium text-slate-400">
              {selected ? 'Answer locked — waiting for results…' : "Time's up — waiting for results…"}
            </p>
          )}
        </div>
      </>
    );
  }

  if (phase === 'reveal') {
    const gotItRight = lastResult?.isCorrect;
    const correctKey = revealData?.correctOption;
    const correctMeta = correctKey ? SHAPE_META[correctKey] : null;

    return (
      <>
        <ConnectionBanner />
        <div className="bg-arena flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center safe-bottom">
          {lastResult ? (
            <>
              <div
                className={[
                  'animate-score-pop flex h-24 w-24 items-center justify-center rounded-full text-5xl ring-2',
                  gotItRight
                    ? 'bg-emerald-500/15 ring-emerald-400/50 shadow-[0_0_60px_-10px_rgba(52,211,153,0.5)]'
                    : 'bg-red-500/10 ring-red-400/40',
                ].join(' ')}
              >
                {gotItRight ? '✅' : '❌'}
              </div>
              <p
                className="animate-score-pop text-3xl font-extrabold text-white"
                style={{ animationDelay: '120ms', fontFamily: 'var(--font-display)' }}
              >
                {gotItRight ? `+${lastResult.points} points` : 'No points this round'}
              </p>
            </>
          ) : (
            <>
              <div className="animate-score-pop flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-5xl ring-2 ring-white/15">
                ⏰
              </div>
              <p
                className="animate-score-pop text-3xl font-extrabold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Time's up!
              </p>
            </>
          )}

          {correctMeta && question?.options?.[correctKey] && (
            <div
              className="animate-float-up flex items-center gap-3 rounded-2xl px-4 py-3 text-white ring-1 ring-white/20"
              style={{ background: correctMeta.gradient, animationDelay: '250ms' }}
            >
              <ShapeIcon shape={correctMeta.shape} className="h-5 w-5" />
              <span className="text-sm font-bold">
                Correct answer: {question.options[correctKey]}
              </span>
            </div>
          )}

          <span className="animate-fade-in rounded-full bg-white/5 px-4 py-1.5 text-sm font-bold tabular-nums text-slate-300 ring-1 ring-white/10">
            Total score: {score}
          </span>

          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full bg-brand-400 animate-pulse-dot" />
            Waiting for the next question…
          </p>
        </div>
      </>
    );
  }

  return null;
}
