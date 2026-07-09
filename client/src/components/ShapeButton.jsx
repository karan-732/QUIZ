import ShapeIcon from './ShapeIcon';
import { SHAPE_META } from '../lib/shapes';

export default function ShapeButton({ optionKey, label, disabled, selected, dimmed, onClick }) {
  const meta = SHAPE_META[optionKey];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: meta.gradient,
        boxShadow: dimmed ? 'none' : `0 10px 28px -10px ${meta.glow}`,
      }}
      className={[
        'flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 rounded-2xl px-3 py-5',
        'select-none text-white transition-[transform,opacity,box-shadow] duration-200 touch-manipulation',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer active:scale-[0.94]',
        selected ? 'ring-4 ring-white/90 scale-[1.02]' : 'ring-1 ring-white/15',
        dimmed ? 'opacity-25 saturate-50' : 'opacity-100',
      ].join(' ')}
    >
      <ShapeIcon shape={meta.shape} className="h-8 w-8 shrink-0 drop-shadow sm:h-10 sm:w-10" />
      {label && (
        <span
          className={[
            'text-center font-bold leading-snug drop-shadow-sm',
            label.length > 60 ? 'text-xs sm:text-base' : 'text-sm sm:text-lg',
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </button>
  );
}
