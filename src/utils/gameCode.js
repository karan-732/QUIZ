const MAX_ATTEMPTS = 500;

/**
 * Generates a random 4-digit game code (as a string, e.g. "0417"),
 * retrying until `isTaken` reports the code is not currently in use.
 * Bounded so a nearly-full code space degrades into a clear error
 * instead of an infinite loop that blocks the event loop.
 */
export function generateUniqueGameCode(isTaken) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!isTaken(code)) return code;
  }

  throw new Error('No free game codes available — too many active rooms.');
}
