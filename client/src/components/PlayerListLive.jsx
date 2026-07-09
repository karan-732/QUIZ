export default function PlayerListLive({ players }) {
  const connectedCount = players.filter((p) => p.connected).length;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Players</h3>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-600">
          {connectedCount} joined
        </span>
      </div>

      {players.length === 0 ? (
        <p className="text-slate-400">Waiting for players to join…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((p) => (
            <span
              key={p.nickname}
              className={[
                'animate-pop-in rounded-full px-3 py-1.5 text-sm font-medium',
                p.connected ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-300 line-through',
              ].join(' ')}
            >
              {p.nickname}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
