import { io } from 'socket.io-client';

const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || 4000;

// Falls back to whatever host the page was loaded from (so opening the app
// via a LAN IP on a phone still reaches the backend on the same machine),
// unless an explicit server URL is provided at build time.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;

export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

export function ensureConnected() {
  if (!socket.connected) socket.connect();
  return socket;
}
