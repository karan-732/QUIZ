const RANK_STYLES = [
  'bg-amber-400/15 text-amber-300 ring-amber-400/30',
  'bg-slate-300/10 text-slate-300 ring-slate-300/25',
  'bg-orange-400/15 text-orange-300 ring-orange-400/30',
];

export default function MiniLeaderboard({ leaderboard, title = 'Leaderboard' }) {
  return (
    <div className="glass rounded-3xl p-5 backdrop-blur-sm">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{title}</h3>
      <ol className="space-y-2">
        {leaderboard.map((entry, i) => (
          <li
            key={entry.nickname}
            className="animate-float-up flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/5"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="flex items-center gap-3 font-semibold text-slate-200">
              <span
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-1',
                  RANK_STYLES[i] ?? 'bg-white/5 text-slate-400 ring-white/10',
                ].join(' ')}
              >
                {i + 1}
              </span>
              <span className="max-w-40 truncate">{entry.nickname}</span>
            </span>
            <span className="font-bold tabular-nums text-brand-300">{entry.score}</span>
          </li>
        ))}
        {leaderboard.length === 0 && <li className="text-sm text-slate-500">No scores yet.</li>}
      </ol>
    </div>
  );
}
