const PATHS = {
  triangle: 'M12 3 L22 20 L2 20 Z',
  diamond: 'M12 2 L22 12 L12 22 L2 12 Z',
  circle: null, // rendered as <circle>
  square: null, // rendered as <rect>
};

export default function ShapeIcon({ shape, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {shape === 'triangle' && <path d={PATHS.triangle} />}
      {shape === 'diamond' && <path d={PATHS.diamond} />}
      {shape === 'circle' && <circle cx="12" cy="12" r="9" />}
      {shape === 'square' && <rect x="3" y="3" width="18" height="18" rx="2" />}
    </svg>
  );
}
