import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { registerGameSocket } from './src/sockets/gameSocket.js';
import { getRoomCount } from './src/state/roomStore.js';

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim());

const app = express();
app.use(cors({ origin: CLIENT_ORIGINS }));
app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), activeRooms: getRoomCount() });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGINS,
    methods: ['GET', 'POST'],
  },
  // Game events are tiny JSON blobs — anything bigger than 4KB is abuse.
  maxHttpBufferSize: 4096,
  // Detect dead phones (locked screens, dropped Wi-Fi) reasonably fast so
  // the host's player list and answer counts stay honest with 60+ devices.
  pingInterval: 10_000,
  pingTimeout: 8_000,
  // Compression costs CPU per message per socket; payloads here are far too
  // small to benefit, and with 60 connections the CPU matters more.
  perMessageDeflate: false,
});

registerGameSocket(io);

httpServer.listen(PORT, () => {
  console.log(`Quiz server listening on port ${PORT}`);
});

// A crash mid-game would drop every room — log and keep serving; state is
// in memory so staying alive is strictly better than restarting.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[fatal] unhandled rejection:', err);
});
