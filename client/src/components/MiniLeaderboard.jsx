export default function MiniLeaderboard({ leaderboard, title = 'Leaderboard' }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <ol className="space-y-2">
        {leaderboard.map((entry, i) => (
          <li key={entry.nickname} className="flex items-center justify-between text-slate-700">
            <span className="flex items-center gap-2 font-medium">
              <span className="w-5 text-slate-400">{i + 1}</span>
              {entry.nickname}
            </span>
            <span className="font-semibold text-brand-600">{entry.score}</span>
          </li>
        ))}
        {leaderboard.length === 0 && <li className="text-slate-400">No scores yet.</li>}
      </ol>
    </div>
  );
}
