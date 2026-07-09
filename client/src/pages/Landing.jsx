import { useNavigate } from 'react-router-dom';
import ShapeIcon from '../components/ShapeIcon';
import { OPTION_KEYS, SHAPE_META } from '../lib/shapes';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="bg-arena flex min-h-svh flex-col items-center justify-center gap-12 px-6 py-10 safe-bottom">
      <div className="animate-float-up text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          {OPTION_KEYS.map((key, i) => (
            <span
              key={key}
              className="animate-pop-in flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-lg"
              style={{
                background: SHAPE_META[key].gradient,
                boxShadow: `0 8px 24px -8px ${SHAPE_META[key].glow}`,
                animationDelay: `${i * 90}ms`,
              }}
            >
              <ShapeIcon shape={SHAPE_META[key].shape} className="h-5 w-5" />
            </span>
          ))}
        </div>
        <h1
          className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Quiz<span className="text-gradient">Live</span>
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Real-time multiplayer quiz, built for the room.
        </p>
      </div>

      <div className="animate-float-up flex w-full max-w-sm flex-col gap-4" style={{ animationDelay: '150ms' }}>
        <button
          type="button"
          onClick={() => navigate('/host')}
          className="btn-primary rounded-2xl px-6 py-4 text-lg font-bold"
        >
          Host a Quiz
        </button>
        <button
          type="button"
          onClick={() => navigate('/join')}
          className="btn-ghost rounded-2xl px-6 py-4 text-lg font-bold"
        >
          Join a Quiz
        </button>
      </div>

      <p className="text-xs font-medium text-slate-600">
        Grab your phone, enter the code, and play with everyone.
      </p>
    </div>
  );
}
