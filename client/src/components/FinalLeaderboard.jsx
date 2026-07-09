import { useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';

const PODIUM_STYLES = {
  1: { order: 'sm:order-2', height: 'sm:h-56', ring: 'ring-amber-400', badge: 'bg-amber-400', medal: '🥇' },
  2: { order: 'sm:order-1', height: 'sm:h-44', ring: 'ring-slate-300', badge: 'bg-slate-300', medal: '🥈' },
  3: { order: 'sm:order-3', height: 'sm:h-36', ring: 'ring-orange-400', badge: 'bg-orange-400', medal: '🥉' },
};

export default function FinalLeaderboard({ leaderboard }) {
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
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#e21b3c', '#1368ce', '#d89e00', '#26890c'],
      });
    }, fireAt);
    return () => clearTimeout(timeout);
  }, [revealDelays]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h2 className="mb-8 text-center text-3xl font-extrabold text-slate-800">Final Results</h2>

      {top3.length > 0 && (
        <div className="mb-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-center">
          {top3.map((entry, i) => {
            const rank = i + 1;
            const style = PODIUM_STYLES[rank];
            return (
              <div
                key={entry.nickname}
                className={`animate-pop-in flex flex-col items-center justify-end gap-2 rounded-2xl bg-white p-4 shadow-lg ring-2 ${style.ring} ${style.order} ${style.height}`}
                style={{ animationDelay: `${revealDelays[i]}ms` }}
              >
                <span className="text-3xl">{style.medal}</span>
                <span className="max-w-[10rem] truncate text-center font-bold text-slate-800">
                  {entry.nickname}
                </span>
                <span className="text-sm font-semibold text-slate-500">{entry.score} pts</span>
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
              className="animate-float-up flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"
              style={{ animationDelay: `${revealDelays[i + 3]}ms` }}
            >
              <span className="font-medium text-slate-700">
                <span className="mr-3 inline-block w-6 text-slate-400">{i + 4}</span>
                {entry.nickname}
              </span>
              <span className="font-semibold text-slate-500">{entry.score} pts</span>
            </li>
          ))}
        </ol>
      )}

      {leaderboard.length === 0 && (
        <p className="text-center text-slate-400">No players finished this game.</p>
      )}
    </div>
  );
}
