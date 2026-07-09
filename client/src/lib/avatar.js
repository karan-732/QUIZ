// Deterministic avatars: the same nickname always maps to the same emoji +
// gradient, everywhere it appears (lobby, leaderboards, history) — no DB
// column or picker required, and duplicate-name suffixes ("Karan 2") get
// their own distinct look for free.

const EMOJIS = [
  '🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐯', '🐨',
  '🐵', '🦉', '🐳', '🦋', '🐢', '🦜', '🐝', '🦖',
  '🐺', '🦩', '🐲', '🦈', '🐞', '🦔', '🐧', '🦚',
  '🐰', '🦥', '🐹', '🦭', '🐴', '🦅', '🐬', '🦒',
];

const GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #f59e0b, #f97316)',
  'linear-gradient(135deg, #10b981, #14b8a6)',
  'linear-gradient(135deg, #3b82f6, #06b6d4)',
  'linear-gradient(135deg, #a855f7, #d946ef)',
  'linear-gradient(135deg, #ef4444, #f59e0b)',
  'linear-gradient(135deg, #22c55e, #84cc16)',
];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

export function getAvatar(nickname) {
  const h = hash(String(nickname ?? '').toLowerCase().trim());
  return {
    emoji: EMOJIS[h % EMOJIS.length],
    gradient: GRADIENTS[(h >> 5) % GRADIENTS.length],
  };
}
