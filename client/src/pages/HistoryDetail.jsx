import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SERVER_URL } from '../lib/socket';
import { SHAPE_META } from '../lib/shapes';
import ShapeIcon from '../components/ShapeIcon';
import Avatar from '../components/Avatar';
import CenteredMessage from '../components/CenteredMessage';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const fmtSeconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

export default function HistoryDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null); // nickname of the open row

  useEffect(() => {
    fetch(`${SERVER_URL}/api/history/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(() => setError('Could not load this game report.'));
  }, [id]);

  if (error) {
    return (
      <CenteredMessage title="Report unavailable" subtitle={error}>
        <Link to="/history" className="btn-ghost mt-4 rounded-2xl px-6 py-3 font-bold">
          Back to history
        </Link>
      </CenteredMessage>
    );
  }

  if (!data) {
    return <CenteredMessage title="Loading report…" spinner />;
  }

  const { session, questions, participants, questionStats } = data;
  const statsByQuestion = Object.fromEntries(questionStats.map((s) => [s.questionId, s]));

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-5 py-10 safe-bottom">
      <header className="animate-float-up">
        <Link
          to="/history"
          className="text-sm font-semibold text-slate-500 transition hover:text-brand-300"
        >
          ← All games
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1
            className="text-4xl font-extrabold text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Game {session.game_code}
          </h1>
          <span className="text-sm font-medium text-slate-500">{formatDate(session.created_at)}</span>
        </div>
        <p className="mt-1 text-slate-400">
          {participants.length} {participants.length === 1 ? 'participant' : 'participants'} ·{' '}
          {questions.length} questions
        </p>
      </header>

      {participants.length === 0 ? (
        <div className="glass animate-fade-in rounded-3xl p-8 text-center text-slate-400">
          No answers were recorded in this game.
        </div>
      ) : (
        <>
          {/* ---------------- participants ---------------- */}
          <section className="animate-float-up" style={{ animationDelay: '100ms' }}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Participants — tap for per-question detail
            </h2>
            <div className="space-y-2">
              {participants.map((p, rank) => {
                const open = expanded === p.nickname;
                return (
                  <div key={p.nickname} className="glass overflow-hidden rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : p.nickname)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05]"
                    >
                      <span className="w-6 text-center text-sm font-bold text-slate-500">
                        {rank + 1}
                      </span>
                      <Avatar nickname={p.nickname} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-white">{p.nickname}</span>
                        <span className="block text-xs text-slate-500">
                          {p.correctCount}/{p.answeredCount} correct · avg {fmtSeconds(p.avgTimeMs)}
                        </span>
                      </span>
                      <span className="shrink-0 font-extrabold tabular-nums text-brand-300">
                        {p.totalPoints}
                      </span>
                      <span
                        className={`text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
                      >
                        ›
                      </span>
                    </button>

                    {open && (
                      <div className="animate-fade-in space-y-1.5 border-t border-white/5 px-4 py-3">
                        {questions.map((q, qi) => {
                          const a = p.answers[q.id];
                          const meta = a ? SHAPE_META[a.selectedOption] : null;
                          return (
                            <div key={q.id} className="flex items-center gap-3 text-sm">
                              <span className="w-6 shrink-0 text-xs font-bold text-slate-500">
                                Q{qi + 1}
                              </span>
                              {a ? (
                                <>
                                  <span
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
                                    style={{ background: meta.gradient }}
                                  >
                                    <ShapeIcon shape={meta.shape} className="h-3 w-3" />
                                  </span>
                                  <span
                                    className={`shrink-0 font-bold ${a.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}
                                  >
                                    {a.isCorrect ? '✓' : '✗'}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-slate-400">
                                    {fmtSeconds(a.responseTimeMs)}
                                  </span>
                                  <span className="ml-auto shrink-0 font-semibold tabular-nums text-slate-300">
                                    +{a.points}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-600">no answer</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------------- questions ---------------- */}
          <section className="animate-float-up" style={{ animationDelay: '200ms' }}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              Question breakdown
            </h2>
            <div className="space-y-2">
              {questions.map((q, qi) => {
                const stats = statsByQuestion[q.id];
                const pct = stats?.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
                const meta = SHAPE_META[q.correctOption];
                return (
                  <div key={q.id} className="glass rounded-2xl px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-6 shrink-0 text-xs font-bold text-slate-500">
                        Q{qi + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-slate-200">
                          {q.questionText}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="flex h-4 w-4 items-center justify-center rounded text-white"
                              style={{ background: meta?.gradient }}
                            >
                              <ShapeIcon shape={meta?.shape} className="h-2.5 w-2.5" />
                            </span>
                            correct: {q.correctOption}
                          </span>
                          <span>
                            <span className={pct >= 50 ? 'text-emerald-400' : 'text-amber-400'}>
                              {pct}%
                            </span>{' '}
                            got it ({stats?.correct ?? 0}/{stats?.answered ?? 0})
                          </span>
                          <span>avg time {fmtSeconds(stats?.avgTimeMs ?? 0)}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                          <div
                            className="animate-bar-grow h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
