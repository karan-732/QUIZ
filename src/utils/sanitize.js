const MAX_NICKNAME_LENGTH = 20;
// Letters, numbers, spaces, and a small set of safe punctuation only.
const ALLOWED_CHARS = /[^a-zA-Z0-9 _.-]/g;

/**
 * Trims, strips HTML/script-breaking characters, and clamps length so
 * nicknames can never inject markup or blow up the player list layout.
 */
export function sanitizeNickname(raw) {
  if (typeof raw !== 'string') return '';

  return raw
    .trim()
    .replace(ALLOWED_CHARS, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NICKNAME_LENGTH)
    .trim();
}
