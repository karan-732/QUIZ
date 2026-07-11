import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureConnected, socket } from '../lib/socket';
import { getStored, removeStored } from '../lib/storage';
import QuestionEditor from '../components/QuestionEditor';
import CenteredMessage from '../components/CenteredMessage';
import ConnectionBanner from '../components/ConnectionBanner';

const HOST_SESSION_KEY = 'quiz.hostSession';

/**
 * Host-only question admin, on its own route so the lobby screen the host
 * projects/shares never shows question text or correct answers. Reclaims
 * the running room with the saved host token; the game is unaffected.
 */
export default function HostAdmin() {
  const navigate = useNavigate();
  // loading | ready | started
  const [phase, setPhase] = useState('loading');
  const [gameCode, setGameCode] = useState(null);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    const boot = () => {
      const saved = JSON.parse(getStored(HOST_SESSION_KEY) || 'null');
      if (!saved) {
        navigate('/host', { replace: true });
        return;
      }
      socket.emit('reclaim-host', saved, (res) => {
        if (!res.ok) {
          removeStored(HOST_SESSION_KEY);
          navigate('/host', { replace: true });
          return;
        }
        setGameCode(res.gameCode);
        if (res.status !== 'lobby') {
          setPhase('started');
          return;
        }
        setQuestions(res.questions ?? []);
        setPhase('ready');
      });
    };

    socket.on('connect', boot);
    ensureConnected();
    if (socket.connected) boot();

    return () => {
      socket.off('connect', boot);
    };
  }, [navigate]);

  const handleSaveQuestion = (index, draft, done) => {
    socket.emit('update-question', { index, ...draft }, (res) => {
      if (res.ok) {
        setQuestions((prev) => prev.map((q, i) => (i === index ? res.question : q)));
      }
      done(res);
    });
  };

  // add/remove/set-all acks carry the full refreshed list so client indexes
  // can never drift from the server's.
  const handleAddQuestion = (draft, done) => {
    socket.emit('add-question', draft, (res) => {
      if (res.ok) setQuestions(res.questions);
      done(res);
    });
  };

  const handleRemoveQuestion = (index, done) => {
    socket.emit('remove-question', { index }, (res) => {
      if (res.ok) setQuestions(res.questions);
      done(res);
    });
  };

  const handleSetAllTimers = (timeLimitSeconds, done) => {
    socket.emit('set-all-timers', { timeLimitSeconds }, (res) => {
      if (res.ok) setQuestions(res.questions);
      done(res);
    });
  };

  if (phase === 'loading') {
    return (
      <>
        <ConnectionBanner />
        <CenteredMessage title="Loading questions…" spinner />
      </>
    );
  }

  if (phase === 'started') {
    return (
      <CenteredMessage
        title="Game already started"
        subtitle="Questions can only be edited before the game starts."
      >
        <Link to="/host" className="btn-primary mt-4 rounded-2xl px-6 py-3 font-bold">
          Back to game
        </Link>
      </CenteredMessage>
    );
  }

  return (
    <>
      <ConnectionBanner />
      <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-5 py-8 safe-bottom sm:px-8">
        <header className="animate-float-up flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-400">
              Question admin
            </p>
            <h1
              className="mt-1 text-3xl font-extrabold text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Game {gameCode}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Keep this page off the shared screen. Changes are saved and stay for future games.
            </p>
          </div>
          <Link to="/host" className="btn-ghost shrink-0 rounded-2xl px-5 py-2.5 text-sm font-bold">
            ← Back to lobby
          </Link>
        </header>

        <div className="animate-float-up" style={{ animationDelay: '120ms' }}>
          <QuestionEditor
            questions={questions}
            onSave={handleSaveQuestion}
            onAdd={handleAddQuestion}
            onRemove={handleRemoveQuestion}
            onSetAllTimers={handleSetAllTimers}
          />
        </div>
      </div>
    </>
  );
}
