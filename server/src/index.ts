import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server, Socket } from 'socket.io';
import { ClientToServer, ServerToClient } from '@battleship/shared';
import * as rooms from './rooms';
import { Room } from './rooms';
import {
  isCoord,
  isGameMode,
  isRecord,
  isRoomCode,
  isShipPlacements,
  isToken,
} from './validate';

// Last line of defence: one bad packet must not kill every game.
process.on('uncaughtException', (err) => console.error('uncaught', err));
process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));

interface SocketData {
  code?: string;
  index?: 0 | 1;
}

type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const app = express();
const http = createServer(app);
const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(http, {
  cors: { origin: corsOrigins },
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// Serve the client build in production (npm run build && npm start).
const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

function scheduleBot(room: Room): void {
  if (!rooms.botShouldAct(room)) return;
  if (room.botTimer) clearTimeout(room.botTimer);
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    rooms.botFire(room);
    pushState(room);
    scheduleBot(room);
  }, 700);
}

function pushState(room: Room): void {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('state', room.viewFor(p.index));
  }
}

function attach(socket: AppSocket, room: Room, player: rooms.Player): void {
  socket.data.code = room.code;
  socket.data.index = player.index;
  player.socketId = socket.id;
  rooms.touch(room);
}

function context(socket: AppSocket): { room: Room; index: 0 | 1 } | null {
  const { code, index } = socket.data;
  if (code === undefined || index === undefined) return null;
  const room = rooms.getRoom(code);
  if (!room) return null;
  return { room, index };
}

/** Wraps a handler so a throw acks {ok:false} instead of propagating. */
function safe<Args extends unknown[]>(fn: (...args: Args) => void) {
  return (...args: Args) => {
    try {
      fn(...args);
    } catch (err) {
      console.error('handler error', err);
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb({ ok: false, error: 'invalid request' });
    }
  };
}

const invalid = { ok: false as const, error: 'invalid request' };

io.on('connection', (socket: AppSocket) => {
  socket.on(
    'createRoom',
    safe((p, cb) => {
      if (typeof cb !== 'function') return;
      if (!isRecord(p) || !isGameMode(p.mode)) return cb(invalid);
      const { room, player } = rooms.createRoom(p.mode);
      attach(socket, room, player);
      cb({ ok: true, token: player.token, view: room.viewFor(0) });
    }),
  );

  socket.on(
    'joinRoom',
    safe((p, cb) => {
      if (typeof cb !== 'function') return;
      if (!isRecord(p) || !isRoomCode(p.roomCode)) return cb(invalid);
      const code = p.roomCode.toUpperCase().trim();
      if (socket.data.code === code) {
        return cb({ ok: false, error: 'you are already in this room' });
      }
      const res = rooms.joinRoom(code);
      if ('error' in res) return cb({ ok: false, error: res.error });
      attach(socket, res.room, res.player);
      cb({ ok: true, token: res.player.token, view: res.room.viewFor(res.player.index) });
      pushState(res.room);
    }),
  );

  socket.on(
    'resume',
    safe((p, cb) => {
      if (typeof cb !== 'function') return;
      if (!isRecord(p) || !isToken(p.token)) return cb(invalid);
      const res = rooms.resumeSession(p.token);
      if (!res) return cb({ ok: false, error: 'session not found' });
      attach(socket, res.room, res.player);
      cb({ ok: true, view: res.room.viewFor(res.player.index) });
      pushState(res.room);
      scheduleBot(res.room);
    }),
  );

  socket.on(
    'placeShips',
    safe((p, cb) => {
      if (typeof cb !== 'function') return;
      if (!isRecord(p) || !isShipPlacements(p.ships)) return cb(invalid);
      const ctx = context(socket);
      if (!ctx) return cb({ ok: false, error: 'not in a room' });
      const error = rooms.placeShips(ctx.room, ctx.index, p.ships);
      if (error) return cb({ ok: false, error });
      cb({ ok: true });
      pushState(ctx.room);
      scheduleBot(ctx.room);
    }),
  );

  socket.on(
    'fire',
    safe((coord, cb) => {
      if (typeof cb !== 'function') return;
      if (!isCoord(coord)) return cb(invalid);
      const ctx = context(socket);
      if (!ctx) return cb({ ok: false, error: 'not in a room' });
      const res = rooms.fire(ctx.room, ctx.index, coord);
      if ('error' in res) return cb({ ok: false, error: res.error });
      pushState(ctx.room);
      cb({ ok: true });
      scheduleBot(ctx.room);
    }),
  );

  socket.on(
    'superShot',
    safe((coord, cb) => {
      if (typeof cb !== 'function') return;
      if (!isCoord(coord)) return cb(invalid);
      const ctx = context(socket);
      if (!ctx) return cb({ ok: false, error: 'not in a room' });
      const res = rooms.superShot(ctx.room, ctx.index, coord);
      if ('error' in res) return cb({ ok: false, error: res.error });
      pushState(ctx.room);
      cb({ ok: true });
      scheduleBot(ctx.room);
    }),
  );

  socket.on(
    'rematch',
    safe((cb) => {
      if (typeof cb !== 'function') return;
      const ctx = context(socket);
      if (!ctx) return cb({ ok: false, error: 'not in a room' });
      const error = rooms.rematch(ctx.room, ctx.index);
      if (error) return cb({ ok: false, error });
      cb({ ok: true });
      pushState(ctx.room);
      scheduleBot(ctx.room);
    }),
  );

  socket.on(
    'leaveRoom',
    safe((cb) => {
      if (typeof cb !== 'function') return;
      const ctx = context(socket);
      if (!ctx) return cb({ ok: true });
      const code = ctx.room.code;
      rooms.leaveRoom(ctx.room, ctx.index);
      socket.data = {};
      cb({ ok: true });
      const remaining = rooms.getRoom(code);
      if (remaining) pushState(remaining);
    }),
  );

  socket.on(
    'disconnect',
    safe(() => {
      const ctx = context(socket);
      if (!ctx) return;
      rooms.markDisconnected(ctx.room, ctx.index, socket.id);
      pushState(ctx.room);
    }),
  );
});

const port = Number(process.env.PORT ?? 3001);
http.listen(port, () => {
  console.log(`battleship server listening on :${port}`);
});
