import { useNavigate } from 'react-router-dom';
import ShapeIcon from '../components/ShapeIcon';
import { OPTION_KEYS, SHAPE_META } from '../lib/shapes';

// Faint drifting shapes behind the hero — pure CSS transforms, GPU-cheap.
const FLOATERS = [
  { key: 'A', className: 'left-[8%] top-[16%] h-16 w-16', delay: '0s', opacity: 0.1 },
  { key: 'B', className: 'right-[10%] top-[22%] h-12 w-12', delay: '1.6s', opacity: 0.12 },
  { key: 'C', className: 'left-[16%] bottom-[18%] h-10 w-10', delay: '3.1s', opacity: 0.1 },
  { key: 'D', className: 'right-[14%] bottom-[14%] h-14 w-14', delay: '4.4s', opacity: 0.09 },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-12 overflow-hidden px-6 py-10 safe-bottom">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {FLOATERS.map((f) => (
          <span
            key={f.key}
            className={`animate-drift absolute ${f.className}`}
            style={{ color: SHAPE_META[f.key].color, opacity: f.opacity, animationDelay: f.delay }}
          >
            <ShapeIcon shape={SHAPE_META[f.key].shape} className="h-full w-full" />
          </span>
        ))}
      </div>

      <div className="animate-float-up relative text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          {OPTION_KEYS.map((key, i) => (
            <span
              key={key}
              className="animate-pop-in flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-lg sm:h-13 sm:w-13"
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
          className="glow-code text-5xl font-extrabold tracking-tight text-white sm:text-7xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Quiz<span className="text-gradient">Live</span>
        </h1>
        <p className="mt-3 text-lg text-slate-400 sm:text-xl">
          Real-time multiplayer quiz, built for the room.
        </p>
      </div>

      <div
        className="animate-float-up relative flex w-full max-w-sm flex-col gap-4"
        style={{ animationDelay: '150ms' }}
      >
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

      <p className="relative text-xs font-medium text-slate-600">
        Grab your phone, enter the code, and play with everyone.
      </p>
    </div>
  );
}
