import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SERVER_URL } from '../lib/socket';
import CenteredMessage from '../components/CenteredMessage';

const STATUS_STYLES = {
  completed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  active: 'bg-brand-500/15 text-brand-300 ring-brand-500/30',
  waiting: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HistoryList() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${SERVER_URL}/api/history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setSessions(data.sessions))
      .catch(() => setError('Could not load game history.'));
  }, []);

  if (error) {
    return <CenteredMessage title="History unavailable" subtitle={error} />;
  }

  if (!sessions) {
    return <CenteredMessage title="Loading history…" spinner />;
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 px-5 py-10 safe-bottom">
      <header className="animate-float-up">
        <Link to="/" className="text-sm font-semibold text-slate-500 transition hover:text-brand-300">
          ← Home
        </Link>
        <h1
          className="mt-2 text-4xl font-extrabold text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Game History
        </h1>
        <p className="mt-1 text-slate-400">Every quiz you've hosted, most recent first.</p>
      </header>

      {sessions.length === 0 ? (
        <div className="glass animate-fade-in rounded-3xl p-8 text-center text-slate-400">
          No games yet — host your first quiz and it will show up here.
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s, i) => (
            <Link
              key={s.id}
              to={`/history/${s.id}`}
              className="glass animate-float-up flex items-center gap-4 rounded-2xl px-5 py-4 transition hover:bg-white/[0.07]"
              style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
            >
              <span
                className="text-2xl font-extrabold tracking-widest text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {s.game_code}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-300">{formatDate(s.created_at)}</p>
                <p className="text-xs text-slate-500">
                  {s.playerCount} {s.playerCount === 1 ? 'player' : 'players'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[s.status] ?? 'bg-white/5 text-slate-400 ring-white/10'}`}
              >
                {s.status}
              </span>
              <span className="text-slate-500">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
