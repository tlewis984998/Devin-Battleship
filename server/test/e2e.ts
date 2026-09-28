/**
 * End-to-end smoke test: two socket.io clients create a room, place ships,
 * and play a full game to completion. Expects a server on SERVER_URL
 * (default http://localhost:3099). Run with: npm run test:e2e
 */
import { io, Socket } from 'socket.io-client';
import {
  CellView,
  ClientToServer,
  RoomView,
  ServerToClient,
  randomPlacements,
} from '@battleship/shared';

const URL = process.env.SERVER_URL ?? 'http://localhost:3099';
const TIMEOUT_MS = 30_000;

type Client = Socket<ServerToClient, ClientToServer>;

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket: Client = io(URL, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

function emit<T>(socket: Client, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket.emit as any)(event, ...args, resolve);
  });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  const a = await connect();
  const b = await connect();
  const views = { a: null as RoomView | null, b: null as RoomView | null };
  a.on('state', (v) => (views.a = v));
  b.on('state', (v) => (views.b = v));

  const created = await emit<{ ok: boolean; token?: string; view?: RoomView; error?: string }>(
    a,
    'createRoom',
    { mode: 'human' },
  );
  assert(created.ok && created.view, `createRoom: ${created.error}`);
  const code = created.view!.roomCode;
  console.log(`room ${code} created`);

  const joined = await emit<{ ok: boolean; error?: string }>(b, 'joinRoom', { roomCode: code });
  assert(joined.ok, `joinRoom: ${joined.error}`);
  console.log('player B joined');

  const p1 = await emit<{ ok: boolean; error?: string }>(a, 'placeShips', {
    ships: randomPlacements(),
  });
  assert(p1.ok, `placeShips A: ${p1.error}`);
  const p2 = await emit<{ ok: boolean; error?: string }>(b, 'placeShips', {
    ships: randomPlacements(),
  });
  assert(p2.ok, `placeShips B: ${p2.error}`);
  console.log('both players placed ships');

  const deadline = Date.now() + TIMEOUT_MS;
  let shots = 0;
  while (Date.now() < deadline) {
    const va = views.a;
    const vb = views.b;
    if (va?.phase === 'finished' && vb?.phase === 'finished') {
      assert(va.winner !== vb.winner, 'exactly one winner');
      console.log(`game over after ${shots} shots — winner: player ${va.winner === 'you' ? 'A' : 'B'}`);
      // Verify the loser sees the winner's revealed fleet
      const loserView = va.winner === 'you' ? vb : va;
      const revealed = loserView!.opponentBoard
        .flat()
        .filter((c: CellView) => c === 'ship' || c === 'sunk' || c === 'hit');
      assert(revealed.length === 17, 'loser sees full enemy fleet (17 ship cells)');
      a.close();
      b.close();
      console.log('E2E PASS');
      await aiGame();
      await hardening();
      return;
    }
    const me = va?.yourTurn ? a : vb?.yourTurn ? b : null;
    const myView = va?.yourTurn ? va : vb;
    if (me && myView) {
      // pick a random unexplored cell on the opponent board
      const options: { row: number; col: number }[] = [];
      myView.opponentBoard.forEach((row, r) =>
        row.forEach((cell, c) => {
          if (cell === 'water') options.push({ row: r, col: c });
        }),
      );
      const target = options[Math.floor(Math.random() * options.length)];
      const res = await emit<{ ok: boolean; error?: string }>(me, 'fire', target);
      assert(res.ok, `fire ${JSON.stringify(target)}: ${res.error}`);
      shots++;
    } else {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  throw new Error('game did not finish in time');
}

/** Second scenario: one human client plays a full game against the AI, then rematches. */
async function aiGame() {
  const a = await connect();
  const views = { v: null as RoomView | null };
  a.on('state', (v) => (views.v = v));

  const created = await emit<{ ok: boolean; token?: string; view?: RoomView; error?: string }>(
    a,
    'createRoom',
    { mode: 'ai' },
  );
  assert(created.ok && created.view, `ai createRoom: ${created.error}`);
  const v0 = created.view!;
  assert(v0.phase === 'placing', `ai room phase: ${v0.phase}`);
  assert(v0.opponentIsAi === true, 'opponent should be AI');
  assert(v0.opponentPlaced === true, 'AI fleet should be pre-placed');
  console.log('ai room created, bot fleet placed');

  const p = await emit<{ ok: boolean; error?: string }>(a, 'placeShips', {
    ships: randomPlacements(),
  });
  assert(p.ok, `ai placeShips: ${p.error}`);

  const deadline = Date.now() + 60_000;
  let shots = 0;
  while (Date.now() < deadline) {
    const v = views.v;
    if (v?.phase === 'finished') {
      assert(v.winner !== null, 'ai game has a winner');
      console.log(
        `ai game over after ${shots} shots — winner: ${v.winner === 'you' ? 'human' : 'computer'}`,
      );
      const r = await emit<{ ok: boolean; error?: string }>(a, 'rematch');
      assert(r.ok, `rematch: ${r.error}`);
      const rematchDeadline = Date.now() + 5000;
      while (views.v?.phase !== 'placing' && Date.now() < rematchDeadline) {
        await new Promise((res) => setTimeout(res, 20));
      }
      assert(views.v?.phase === 'placing', `rematch phase: ${views.v?.phase}`);
      assert(views.v.youPlaced === false, 'rematch clears placed flag');
      a.close();
      console.log('AI E2E PASS');
      return;
    }
    if (v?.yourTurn) {
      const options: { row: number; col: number }[] = [];
      v.opponentBoard.forEach((row: CellView[], r: number) =>
        row.forEach((cell: CellView, c: number) => {
          if (cell === 'water') options.push({ row: r, col: c });
        }),
      );
      const target = options[Math.floor(Math.random() * options.length)];
      const res = await emit<{ ok: boolean; error?: string }>(a, 'fire', target);
      assert(res.ok, `ai fire ${JSON.stringify(target)}: ${res.error}`);
      shots++;
    } else {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error('ai game did not finish in time');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ack = { ok: boolean; error?: string; token?: string; view?: RoomView };

/** Third scenario: malformed payloads must be rejected without crashing the server. */
async function hardening() {
  const a = await connect();
  const views = { v: null as RoomView | null };
  a.on('state', (v) => (views.v = v));
  const health = async (label: string) => {
    const r = await fetch(`${URL}/healthz`);
    assert(r.ok, `healthz after ${label}`);
  };
  const rejects = async (event: string, payload: unknown, label: string) => {
    const res = await emit<Ack>(a, event, payload);
    assert(res.ok === false, `${label} should be rejected, got ${JSON.stringify(res)}`);
    await health(label);
  };

  await rejects('createRoom', null, 'createRoom null payload');
  await rejects('joinRoom', { roomCode: 5 }, 'joinRoom numeric code');
  await rejects('resume', {}, 'resume empty payload');

  const created = await emit<Ack>(a, 'createRoom', { mode: 'ai' });
  assert(created.ok && created.view, `hardening createRoom: ${created.error}`);
  await rejects('placeShips', { ships: 'nope' }, 'placeShips non-array');
  const p = await emit<Ack>(a, 'placeShips', { ships: randomPlacements() });
  assert(p.ok, `hardening placeShips: ${p.error}`);

  const deadline = Date.now() + 15_000;
  while (!views.v?.yourTurn && Date.now() < deadline) await sleep(50);
  assert(views.v?.yourTurn, 'ai battle started, waiting for our turn');
  await rejects('fire', { row: 1.5, col: 1 }, 'fire fractional coord');
  await rejects('fire', { row: 'a' }, 'fire string coord');
  await rejects('fire', null, 'fire null');
  a.close();
  console.log('HARDENING PASS');
  await leaveGame();
}

/** Fourth scenario: leaveRoom frees the seat and ends the game for the opponent. */
async function leaveGame() {
  const a = await connect();
  const b = await connect();
  const views = { a: null as RoomView | null };
  a.on('state', (v) => (views.a = v));

  const created = await emit<Ack>(a, 'createRoom', { mode: 'human' });
  assert(created.ok && created.view, `leave createRoom: ${created.error}`);
  const code = created.view!.roomCode;
  const selfJoin = await emit<Ack>(a, 'joinRoom', { roomCode: code });
  assert(
    selfJoin.ok === false && selfJoin.error === 'you are already in this room',
    `self-join should be rejected, got ${JSON.stringify(selfJoin)}`,
  );
  const joined = await emit<Ack>(b, 'joinRoom', { roomCode: code });
  assert(joined.ok, `leave joinRoom: ${joined.error}`);
  for (const s of [a, b]) {
    const p = await emit<Ack>(s, 'placeShips', { ships: randomPlacements() });
    assert(p.ok, `leave placeShips: ${p.error}`);
  }

  const lv = await emit<Ack>(b, 'leaveRoom');
  assert(lv.ok, `leaveRoom: ${lv.error}`);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const v = views.a;
    if (v?.opponentLeft && v.phase === 'finished') break;
    await sleep(20);
  }
  assert(views.a?.opponentLeft === true, 'opponent sees opponentLeft');
  assert(views.a.phase === 'finished', 'opponent sees finished phase');
  assert(views.a.winner === 'you', 'leaver forfeits to opponent');
  const rm = await emit<Ack>(a, 'rematch');
  assert(rm.ok === false, `rematch after leave should fail, got ${JSON.stringify(rm)}`);

  const created2 = await emit<Ack>(a, 'createRoom', { mode: 'human' });
  assert(created2.ok && created2.view, `leave createRoom 2: ${created2.error}`);
  const lv2 = await emit<Ack>(a, 'leaveRoom');
  assert(lv2.ok, `leaveRoom waiting room: ${lv2.error}`);
  const c = await connect();
  const jr = await emit<Ack>(c, 'joinRoom', { roomCode: created2.view!.roomCode });
  assert(jr.ok === false && /not found/.test(jr.error ?? ''), `expected room not found, got ${JSON.stringify(jr)}`);
  a.close();
  b.close();
  c.close();
  console.log('LEAVE PASS');
}

main().catch((err) => {
  console.error('E2E FAIL:', err);
  process.exit(1);
});
