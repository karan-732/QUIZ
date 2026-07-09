import ShapeIcon from './ShapeIcon';
import { SHAPE_META } from '../lib/shapes';

export default function ShapeButton({ optionKey, label, disabled, selected, dimmed, onClick }) {
  const meta = SHAPE_META[optionKey];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ backgroundColor: meta.color }}
      className={[
        'flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 text-left transition-transform duration-150',
        'text-white shadow-lg',
        disabled ? 'cursor-not-allowed' : 'active:scale-95 cursor-pointer',
        selected ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-900' : '',
        dimmed ? 'opacity-30' : 'opacity-100',
      ].join(' ')}
    >
      <ShapeIcon shape={meta.shape} className="h-8 w-8 shrink-0" />
      {label && <span className="text-sm font-semibold sm:text-base">{label}</span>}
    </button>
  );
}
