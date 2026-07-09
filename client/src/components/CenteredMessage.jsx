/**
 * Full-viewport status screen (connecting, waiting, errors). `spinner` shows
 * three pulsing dots above the title.
 */
export default function CenteredMessage({ title, subtitle, spinner = false, children }) {
  return (
    <div className="bg-arena flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
      {spinner && (
        <div className="mb-2 flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-3 w-3 rounded-full bg-brand-400 animate-pulse-dot"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      )}
      <h1
        className="animate-fade-in text-2xl font-extrabold text-white sm:text-3xl"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h1>
      {subtitle && <p className="animate-fade-in max-w-md text-slate-400">{subtitle}</p>}
      {children}
    </div>
  );
}
