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

main().catch((err) => {
  console.error('E2E FAIL:', err);
  process.exit(1);
});
