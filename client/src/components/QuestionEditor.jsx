import { useState } from 'react';
import ShapeIcon from './ShapeIcon';
import { OPTION_KEYS, SHAPE_META } from '../lib/shapes';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-brand-400 focus:bg-white/[0.08] focus:ring-2 focus:ring-brand-500/20';

/**
 * Lobby-only panel where the host reviews and edits this session's
 * questions (text, options, correct answer, time limit) before starting.
 * Edits apply to this game only — the shared question bank is untouched.
 */
export default function QuestionEditor({ questions, onSave }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="glass rounded-3xl p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
          Questions — review before starting
        </h3>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-400 ring-1 ring-white/10">
          {questions.length} questions
        </span>
      </div>

      <div className="space-y-2">
        {questions.map((q, i) => (
          <QuestionRow
            key={q.id}
            question={q}
            index={i}
            open={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionRow({ question, index, open, onToggle, onSave }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { ok, message }

  const startEditing = () => {
    setDraft({
      questionText: question.questionText,
      options: { ...question.options },
      correctOption: question.correctOption,
      timeLimitSeconds: question.timeLimitSeconds,
    });
    setFeedback(null);
    onToggle();
  };

  const handleSave = () => {
    setSaving(true);
    setFeedback(null);
    onSave(index, draft, (res) => {
      setSaving(false);
      if (res.ok) {
        setFeedback({ ok: true, message: 'Saved' });
        setTimeout(onToggle, 600);
      } else {
        setFeedback({ ok: false, message: res.error });
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-left ring-1 ring-white/5 transition hover:bg-white/[0.08]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-300 ring-1 ring-brand-500/30">
          {index + 1}
        </span>
        <span className="flex-1 truncate text-sm font-semibold text-slate-200">
          {question.questionText}
        </span>
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-bold text-slate-400">
          {question.timeLimitSeconds}s
        </span>
        <span className="shrink-0 text-xs font-bold text-brand-400">Edit</span>
      </button>
    );
  }

  return (
    <div className="animate-fade-in space-y-3 rounded-2xl bg-white/[0.04] p-4 ring-1 ring-brand-500/30">
      <textarea
        value={draft.questionText}
        onChange={(e) => setDraft({ ...draft, questionText: e.target.value.slice(0, 300) })}
        rows={2}
        className={`${inputClass} resize-none`}
        placeholder="Question text"
      />

      <div className="grid gap-2 sm:grid-cols-2">
        {OPTION_KEYS.map((key) => {
          const meta = SHAPE_META[key];
          const isCorrect = draft.correctOption === key;
          return (
            <div key={key} className="flex items-center gap-2">
              <button
                type="button"
                title={isCorrect ? 'Correct answer' : 'Mark as correct answer'}
                onClick={() => setDraft({ ...draft, correctOption: key })}
                className={[
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition',
                  isCorrect ? 'ring-2 ring-emerald-400 scale-105' : 'ring-1 ring-white/15 opacity-60 hover:opacity-100',
                ].join(' ')}
                style={{ background: meta.gradient }}
              >
                {isCorrect ? '✓' : <ShapeIcon shape={meta.shape} className="h-4 w-4" />}
              </button>
              <input
                value={draft.options[key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    options: { ...draft.options, [key]: e.target.value.slice(0, 150) },
                  })
                }
                className={inputClass}
                placeholder={`Option ${key}`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Time limit
          <input
            type="number"
            min={5}
            max={180}
            value={draft.timeLimitSeconds}
            onChange={(e) => setDraft({ ...draft, timeLimitSeconds: Number(e.target.value) })}
            className={`${inputClass} w-20 text-center`}
          />
          sec
        </label>

        <div className="flex items-center gap-2">
          {feedback && (
            <span
              className={`text-sm font-bold ${feedback.ok ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {feedback.ok ? '✓ Saved' : feedback.message}
            </span>
          )}
          <button type="button" onClick={onToggle} className="btn-ghost rounded-xl px-4 py-2 text-sm font-bold">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary rounded-xl px-5 py-2 text-sm font-bold"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Tap a shape to set the correct answer. Changes apply to this game only.
      </p>
    </div>
  );
}
