import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server, Socket } from 'socket.io';
import { ClientToServer, ServerToClient } from '@battleship/shared';
import * as rooms from './rooms';
import { Room } from './rooms';

interface SocketData {
  code?: string;
  index?: 0 | 1;
}

type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(http, {
  cors: { origin: true },
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

io.on('connection', (socket: AppSocket) => {
  socket.on('createRoom', ({ mode }, cb) => {
    const { room, player } = rooms.createRoom(mode === 'ai' ? 'ai' : 'human');
    attach(socket, room, player);
    cb({ ok: true, token: player.token, view: room.viewFor(0) });
  });

  socket.on('joinRoom', ({ roomCode }, cb) => {
    const res = rooms.joinRoom(roomCode.toUpperCase().trim());
    if ('error' in res) return cb({ ok: false, error: res.error });
    attach(socket, res.room, res.player);
    cb({ ok: true, token: res.player.token, view: res.room.viewFor(res.player.index) });
    pushState(res.room);
  });

  socket.on('resume', ({ token }, cb) => {
    const res = rooms.resumeSession(token);
    if (!res) return cb({ ok: false, error: 'session not found' });
    attach(socket, res.room, res.player);
    cb({ ok: true, view: res.room.viewFor(res.player.index) });
    pushState(res.room);
    scheduleBot(res.room);
  });

  socket.on('placeShips', ({ ships }, cb) => {
    const ctx = context(socket);
    if (!ctx) return cb({ ok: false, error: 'not in a room' });
    const error = rooms.placeShips(ctx.room, ctx.index, ships);
    if (error) return cb({ ok: false, error });
    cb({ ok: true });
    pushState(ctx.room);
    scheduleBot(ctx.room);
  });

  socket.on('fire', (coord, cb) => {
    const ctx = context(socket);
    if (!ctx) return cb({ ok: false, error: 'not in a room' });
    const res = rooms.fire(ctx.room, ctx.index, coord);
    if ('error' in res) return cb({ ok: false, error: res.error });
    pushState(ctx.room);
    cb({ ok: true });
    scheduleBot(ctx.room);
  });

  socket.on('rematch', (cb) => {
    const ctx = context(socket);
    if (!ctx) return cb({ ok: false, error: 'not in a room' });
    const error = rooms.rematch(ctx.room, ctx.index);
    if (error) return cb({ ok: false, error });
    cb({ ok: true });
    pushState(ctx.room);
    scheduleBot(ctx.room);
  });

  socket.on('disconnect', () => {
    const ctx = context(socket);
    if (!ctx) return;
    rooms.markDisconnected(ctx.room, ctx.index);
    pushState(ctx.room);
  });
});

const port = Number(process.env.PORT ?? 3001);
http.listen(port, () => {
  console.log(`battleship server listening on :${port}`);
});
