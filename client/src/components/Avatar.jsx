import { getAvatar } from '../lib/avatar';

const SIZES = {
  sm: 'h-6 w-6 text-sm',
  md: 'h-9 w-9 text-lg',
  lg: 'h-14 w-14 text-3xl',
  xl: 'h-20 w-20 text-4xl',
};

export default function Avatar({ nickname, size = 'md', className = '' }) {
  const { emoji, gradient } = getAvatar(nickname);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ring-1 ring-white/20 ${SIZES[size]} ${className}`}
      style={{ background: gradient }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}
