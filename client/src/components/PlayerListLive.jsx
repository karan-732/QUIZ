import Avatar from './Avatar';

/**
 * Live lobby roster. Virtual-list-free on purpose: even at 200 players the
 * chips are tiny DOM nodes; the flex-wrap grid with a max height + scroll
 * keeps layout stable however many people pile in.
 */
export default function PlayerListLive({ players }) {
  const connectedCount = players.filter((p) => p.connected).length;

  return (
    <div className="glass flex min-h-64 flex-col rounded-3xl p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Players</h3>
        <span className="flex items-center gap-2 rounded-full bg-brand-500/15 px-3 py-1 text-sm font-bold text-brand-300 ring-1 ring-brand-500/30">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse-dot" />
          {connectedCount} joined
        </span>
      </div>

      {players.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-500">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block h-2 w-2 rounded-full bg-slate-500 animate-pulse-dot"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
          <p className="text-sm font-medium">Waiting for players to join…</p>
        </div>
      ) : (
        <div className="flex max-h-80 flex-wrap content-start gap-2 overflow-y-auto">
          {players.map((p) => (
            <span
              key={p.nickname}
              className={[
                'animate-pop-in flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm font-semibold ring-1 transition-opacity',
                p.connected
                  ? 'bg-white/10 text-slate-100 ring-white/15'
                  : 'bg-white/[0.03] text-slate-500 ring-white/5 line-through opacity-60',
              ].join(' ')}
            >
              <Avatar nickname={p.nickname} size="sm" />
              {p.nickname}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
