import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';

export default function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [gameCode, setGameCode] = useState(code || '');
  const [nickname, setNickname] = useState(sessionStorage.getItem('quiz.nickname') || '');
  const [error, setError] = useState(new URLSearchParams(window.location.search).get('error') || '');
  const [shake, setShake] = useState(false);
  const codeInputRef = useRef(null);
  const nameInputRef = useRef(null);

  useEffect(() => {
    // Land the cursor where the user actually needs to type next.
    if (code && /^\d{4}$/.test(code)) nameInputRef.current?.focus();
    else codeInputRef.current?.focus();
  }, [code]);

  const fail = (message) => {
    setError(message);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(gameCode)) {
      return fail('Enter the 4-digit game code.');
    }
    if (!nickname.trim()) {
      return fail('Enter a nickname.');
    }

    // Stable per-tab identity: lets the server recognize this player across
    // refreshes/reconnects even if someone else took the same nickname.
    if (!sessionStorage.getItem('quiz.playerToken')) {
      sessionStorage.setItem('quiz.playerToken', crypto.randomUUID());
    }
    sessionStorage.setItem('quiz.gameCode', gameCode);
    sessionStorage.setItem('quiz.nickname', nickname.trim());
    navigate('/play');
  };

  return (
    <div className="bg-arena flex min-h-svh flex-col items-center justify-center px-5 py-8 safe-bottom">
      <form
        onSubmit={handleSubmit}
        className={[
          'glass animate-float-up w-full max-w-sm rounded-3xl p-7 backdrop-blur-sm',
          shake ? 'animate-shake' : '',
        ].join(' ')}
      >
        <h1
          className="mb-1 text-center text-3xl font-extrabold text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Join the game
        </h1>
        <p className="mb-7 text-center text-sm text-slate-400">
          Ask the host for the 4-digit code
        </p>

        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
          Game Code
        </label>
        <input
          ref={codeInputRef}
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••"
          className="mb-5 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center text-3xl font-extrabold tracking-[0.45em] text-white outline-none transition placeholder:text-slate-600 focus:border-brand-400 focus:bg-white/[0.08] focus:ring-4 focus:ring-brand-500/20"
        />

        <label className="mb-2 block text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
          Nickname
        </label>
        <div className="relative mb-5">
          <input
            ref={nameInputRef}
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            placeholder="Your name"
            maxLength={20}
            autoComplete="off"
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-4 pr-14 text-lg font-semibold text-white outline-none transition placeholder:text-slate-600 focus:border-brand-400 focus:bg-white/[0.08] focus:ring-4 focus:ring-brand-500/20"
          />
          {nickname.trim() && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <Avatar nickname={nickname.trim()} size="md" />
            </span>
          )}
        </div>

        {error && (
          <p className="animate-fade-in mb-5 rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm font-semibold text-red-400 ring-1 ring-red-500/25">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full rounded-2xl px-4 py-4 text-lg font-bold">
          Let's go
        </button>
      </form>
    </div>
  );
}
