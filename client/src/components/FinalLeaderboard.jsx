import { useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import Avatar from './Avatar';

const PODIUM_STYLES = {
  1: {
    order: 'sm:order-2',
    height: 'sm:h-60',
    ring: 'ring-amber-400/70',
    glow: 'shadow-[0_0_50px_-10px_rgba(251,191,36,0.45)]',
    medal: '🥇',
  },
  2: {
    order: 'sm:order-1',
    height: 'sm:h-48',
    ring: 'ring-slate-300/50',
    glow: 'shadow-[0_0_36px_-12px_rgba(203,213,225,0.35)]',
    medal: '🥈',
  },
  3: {
    order: 'sm:order-3',
    height: 'sm:h-40',
    ring: 'ring-orange-400/60',
    glow: 'shadow-[0_0_36px_-12px_rgba(251,146,60,0.35)]',
    medal: '🥉',
  },
};

export default function FinalLeaderboard({ leaderboard, highlightNickname }) {
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3, 10);

  const revealDelays = useMemo(() => {
    // Build suspense from the bottom up: rank 10 appears first, rank 1 last.
    const total = leaderboard.length;
    return leaderboard.map((_, i) => (total - 1 - i) * 220);
  }, [leaderboard]);

  useEffect(() => {
    const fireAt = (revealDelays[0] ?? 0) + 500;
    const timeout = setTimeout(() => {
      confetti({
        particleCount: 140,
        spread: 85,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#e21b3c', '#1368ce', '#d89e00', '#26890c', '#d946ef'],
      });
    }, fireAt);
    return () => clearTimeout(timeout);
  }, [revealDelays]);

  const isMe = (nickname) =>
    highlightNickname && nickname.toLowerCase() === highlightNickname.toLowerCase();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="mb-1 text-center text-xs font-bold uppercase tracking-[0.3em] text-brand-400">
        Game over
      </p>
      <h2
        className="mb-10 text-center text-4xl font-extrabold text-white"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Final Results
      </h2>

      {top3.length > 0 && (
        <div className="mb-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-center">
          {top3.map((entry, i) => {
            const rank = i + 1;
            const style = PODIUM_STYLES[rank];
            return (
              <div
                key={entry.nickname}
                className={[
                  'glass animate-pop-in flex flex-col items-center justify-end gap-2 rounded-3xl p-5 ring-2 sm:w-44',
                  style.ring,
                  style.glow,
                  style.order,
                  style.height,
                  isMe(entry.nickname) ? 'outline outline-2 outline-brand-400' : '',
                ].join(' ')}
                style={{ animationDelay: `${revealDelays[i]}ms` }}
              >
                <span className="text-3xl">{style.medal}</span>
                <Avatar nickname={entry.nickname} size="lg" />
                <span className="max-w-[10rem] truncate text-center text-lg font-bold text-white">
                  {entry.nickname}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums text-brand-300">
                  {entry.score} pts
                </span>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <ol className="space-y-2">
          {rest.map((entry, i) => (
            <li
              key={entry.nickname}
              className={[
                'glass animate-float-up flex items-center justify-between rounded-2xl px-4 py-3',
                isMe(entry.nickname) ? 'ring-2 ring-brand-400/70' : '',
              ].join(' ')}
              style={{ animationDelay: `${revealDelays[i + 3]}ms` }}
            >
              <span className="flex items-center gap-3 font-semibold text-slate-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-xs font-bold text-slate-400 ring-1 ring-white/10">
                  {i + 4}
                </span>
                <Avatar nickname={entry.nickname} size="sm" />
                <span className="max-w-48 truncate">{entry.nickname}</span>
              </span>
              <span className="font-bold tabular-nums text-slate-300">{entry.score} pts</span>
            </li>
          ))}
        </ol>
      )}

      {leaderboard.length === 0 && (
        <p className="text-center text-slate-500">No players finished this game.</p>
      )}
    </div>
  );
}
