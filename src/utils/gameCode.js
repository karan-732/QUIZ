/**
 * Generates a random 4-digit game code (as a string, e.g. "0417"),
 * retrying until `isTaken` reports the code is not currently in use.
 */
export function generateUniqueGameCode(isTaken) {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (isTaken(code));

  return code;
}
