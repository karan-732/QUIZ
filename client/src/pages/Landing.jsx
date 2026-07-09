import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-10 bg-gradient-to-b from-brand-50 to-white px-6">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Quiz<span className="text-brand-600">Live</span>
        </h1>
        <p className="mt-2 text-slate-500">Real-time multiplayer quiz, built for the room.</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <button
          type="button"
          onClick={() => navigate('/host')}
          className="rounded-2xl bg-brand-600 px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 active:scale-[0.98]"
        >
          Host a Quiz
        </button>
        <button
          type="button"
          onClick={() => navigate('/join')}
          className="rounded-2xl bg-white px-6 py-4 text-lg font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-[0.98]"
        >
          Join a Quiz
        </button>
      </div>
    </div>
  );
}
