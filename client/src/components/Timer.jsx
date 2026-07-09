import { useEffect, useRef, useState } from 'react';

/**
 * Pure client-side countdown, restarted whenever `resetKey` changes (pass
 * the question index). Deliberately doesn't try to reconcile server clock
 * skew — the visual bar just needs to look smooth, scoring is authoritative
 * on the server regardless of what this shows.
 */
export default function Timer({ totalSeconds, resetKey, onExpire }) {
  const [remainingMs, setRemainingMs] = useState(totalSeconds * 1000);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const totalMs = totalSeconds * 1000;
    const start = performance.now();
    setRemainingMs(totalMs);

    let frameId;
    const tick = () => {
      const elapsed = performance.now() - start;
      const next = Math.max(totalMs - elapsed, 0);
      setRemainingMs(next);
      if (next > 0) {
        frameId = requestAnimationFrame(tick);
      } else {
        onExpireRef.current?.();
      }
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [totalSeconds, resetKey]);

  const pct = totalSeconds > 0 ? (remainingMs / (totalSeconds * 1000)) * 100 : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="w-full">
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-sm font-semibold tabular-nums text-slate-500">
        {seconds}s
      </div>
    </div>
  );
}
