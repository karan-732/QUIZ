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
  // Phones drop Wi-Fi constantly during a live game — retry forever with a
  // quick first attempt and modest backoff so rejoins feel instant.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 400,
  reconnectionDelayMax: 4000,
  timeout: 10_000,
});

export function ensureConnected() {
  if (!socket.connected) socket.connect();
  return socket;
}
