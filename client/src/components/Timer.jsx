import { useEffect, useRef, useState } from 'react';

/**
 * Client-side countdown, restarted whenever `resetKey` changes (pass the
 * question index). `initialRemainingMs` lets a mid-question rejoiner start
 * partway through instead of at full time. Purely visual — scoring is
 * authoritative on the server regardless of what this shows.
 */
export default function Timer({ totalSeconds, initialRemainingMs, resetKey, onExpire }) {
  const totalMs = totalSeconds * 1000;
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs ?? totalMs);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const startingMs = Math.min(initialRemainingMs ?? totalMs, totalMs);
    const start = performance.now();
    setRemainingMs(startingMs);

    let frameId;
    const tick = () => {
      const elapsed = performance.now() - start;
      const next = Math.max(startingMs - elapsed, 0);
      setRemainingMs(next);
      if (next > 0) {
        frameId = requestAnimationFrame(tick);
      } else {
        onExpireRef.current?.();
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSeconds, resetKey]);

  const pct = totalMs > 0 ? (remainingMs / totalMs) * 100 : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const low = pct <= 20;
  const mid = pct > 20 && pct <= 50;

  const barGradient = low
    ? 'linear-gradient(90deg, #f43f5e, #ef4444)'
    : mid
      ? 'linear-gradient(90deg, #f59e0b, #f97316)'
      : 'linear-gradient(90deg, #6366f1, #a855f7)';

  return (
    <div className="flex w-full items-center gap-3">
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%`, background: barGradient }}
        />
      </div>
      <div
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
          low ? 'bg-red-500/20 text-red-300 animate-pulse-soft' : 'bg-white/10 text-slate-200',
        ].join(' ')}
      >
        {seconds}
      </div>
    </div>
  );
}
