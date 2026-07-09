import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export default function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [gameCode, setGameCode] = useState(code || '');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState(new URLSearchParams(window.location.search).get('error') || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(gameCode)) {
      setError('Enter the 4-digit game code.');
      return;
    }
    if (!nickname.trim()) {
      setError('Enter a nickname.');
      return;
    }

    sessionStorage.setItem('quiz.gameCode', gameCode);
    sessionStorage.setItem('quiz.nickname', nickname.trim());
    navigate('/play');
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-white px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200"
      >
        <h1 className="mb-6 text-center text-2xl font-extrabold text-slate-900">Join Quiz</h1>

        <label className="mb-1 block text-sm font-medium text-slate-600">Game Code</label>
        <input
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="0000"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />

        <label className="mb-1 block text-sm font-medium text-slate-600">Nickname</label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          placeholder="Your name"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />

        {error && <p className="mb-4 text-sm font-medium text-red-500">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-md shadow-brand-600/20 transition hover:bg-brand-700"
        >
          Join
        </button>
      </form>
    </div>
  );
}
