// Classic 4-shape/4-color answer mapping — consistent across host + player
// screens regardless of question content. Each option gets a gradient so the
// buttons feel lit rather than flat.
export const SHAPE_META = {
  A: {
    color: 'var(--color-shape-a)',
    gradient: 'linear-gradient(140deg, #ff4d6d 0%, #e21b3c 55%, #b0122d 100%)',
    glow: 'rgba(226, 27, 60, 0.45)',
    shape: 'triangle',
  },
  B: {
    color: 'var(--color-shape-b)',
    gradient: 'linear-gradient(140deg, #3b8df0 0%, #1368ce 55%, #0d4fa3 100%)',
    glow: 'rgba(19, 104, 206, 0.45)',
    shape: 'diamond',
  },
  C: {
    color: 'var(--color-shape-c)',
    gradient: 'linear-gradient(140deg, #f7bc1c 0%, #d89e00 55%, #a97b00 100%)',
    glow: 'rgba(216, 158, 0, 0.45)',
    shape: 'circle',
  },
  D: {
    color: 'var(--color-shape-d)',
    gradient: 'linear-gradient(140deg, #3fae23 0%, #26890c 55%, #1b6608 100%)',
    glow: 'rgba(38, 137, 12, 0.45)',
    shape: 'square',
  },
};

export const OPTION_KEYS = ['A', 'B', 'C', 'D'];
