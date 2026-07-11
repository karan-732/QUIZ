/**
 * Game identity (player token/nickname/code, host session) lives in
 * localStorage so it survives a full browser close — sessionStorage dies
 * with the tab, which used to cost players their score and hosts their
 * whole room after an accidental close or crash. Second tabs are safe:
 * the server hands a player session to the newest tab ('session-superseded')
 * and a host reclaim simply rebinds the room to the newest socket.
 *
 * Reads fall back to sessionStorage once to migrate sessions created
 * before this change.
 */
export function getStored(key) {
  const value = localStorage.getItem(key) ?? sessionStorage.getItem(key);
  if (value !== null && localStorage.getItem(key) === null) {
    localStorage.setItem(key, value);
  }
  return value;
}

export function setStored(key, value) {
  localStorage.setItem(key, value);
}

export function removeStored(key) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
