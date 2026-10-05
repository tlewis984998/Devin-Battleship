import { describe, expect, it } from 'vitest';
import { ShipPlacement, plusCells } from '@battleship/shared';
import { fireAt } from './game/board';
import {
  Room,
  botFire,
  createRoom,
  fire,
  joinRoom,
  leaveRoom,
  markDisconnected,
  placeShips,
  rematch,
  superShot,
} from './rooms';

function validPlacements(): ShipPlacement[] {
  return [
    { name: 'Carrier', row: 0, col: 0, orientation: 'h' },
    { name: 'Battleship', row: 1, col: 0, orientation: 'h' },
    { name: 'Cruiser', row: 2, col: 0, orientation: 'h' },
    { name: 'Submarine', row: 3, col: 0, orientation: 'h' },
    { name: 'Destroyer', row: 4, col: 0, orientation: 'h' },
  ];
}

/** Human room, both players placed, player 0 to move. */
function setupBattle(): Room {
  const { room } = createRoom('human');
  joinRoom(room.code);
  placeShips(room, 0, validPlacements());
  placeShips(room, 1, validPlacements());
  room.turn = 0;
  return room;
}

describe('markDisconnected', () => {
  it('only clears the seat for the socket that actually holds it', () => {
    const { room, player } = createRoom('human');
    player.socketId = 'A';
    player.socketId = 'B'; // seat reclaimed by a newer socket
    markDisconnected(room, 0, 'A'); // stale socket disconnects
    expect(player.socketId).toBe('B');
    expect(room.cleanupTimer).toBeNull();
    markDisconnected(room, 0, 'B');
    expect(player.socketId).toBeNull();
    expect(room.cleanupTimer).not.toBeNull();
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  });
});

describe('createRoom ai', () => {
  it('starts placing with a pre-placed bot fleet', () => {
    const { room } = createRoom('ai');
    expect(room.phase).toBe('placing');
    expect(room.boards[1]).not.toBeNull();
    expect(room.players[1].isBot).toBe(true);
    expect(room.viewFor(0).opponentConnected).toBe(true);
  });
});

describe('superShot', () => {
  it('fires the whole pattern and ends the turn', () => {
    const room = setupBattle();
    const res = superShot(room, 0, { row: 9, col: 9 });
    expect('results' in res && res.results).toHaveLength(3); // corner: centre + 2 in-bounds
    if ('results' in res) expect(res.results.every((r) => r.result.kind === 'miss')).toBe(true);
    expect(room.superShotUsed[0]).toBe(true);
    expect(room.turn).toBe(1);
  });

  it('can only be used once', () => {
    const room = setupBattle();
    superShot(room, 0, { row: 9, col: 9 });
    room.turn = 0;
    const res = superShot(room, 0, { row: 8, col: 8 });
    expect(res).toEqual({ error: 'SuperShot already used' });
  });

  it('may centre on an already-fired cell and skips repeats', () => {
    const room = setupBattle();
    const first = fire(room, 0, { row: 4, col: 0 }); // hit on Destroyer (row 4, cols 0-1)
    expect('result' in first && first.result.kind).toBe('hit');
    room.turn = 0;
    const res = superShot(room, 0, { row: 4, col: 0 });
    expect('results' in res).toBe(true);
    if (!('results' in res)) return;
    const byCoord = new Map(res.results.map((r) => [`${r.coord.row},${r.coord.col}`, r.result]));
    expect(byCoord.has('4,0')).toBe(false); // repeat skipped
    expect(byCoord.get('4,1')).toEqual({ kind: 'sunk', shipName: 'Destroyer' });
    expect(byCoord.get('3,0')).toEqual({ kind: 'hit' }); // Submarine
    expect(byCoord.get('5,0')).toEqual({ kind: 'miss' });
  });

  it('refuses a fully-fired pattern without consuming the shot', () => {
    const room = setupBattle();
    for (const c of plusCells({ row: 9, col: 9 })) fireAt(room.boards[1]!, c);
    const res = superShot(room, 0, { row: 9, col: 9 });
    expect(res).toEqual({ error: 'no new cells to hit' });
    expect(room.superShotUsed[0]).toBe(false);
  });

  it('ends the game when it sinks the last ship', () => {
    const room = setupBattle();
    const foe = room.boards[1]!;
    for (const ship of foe.ships) {
      if (ship.name === 'Destroyer') continue;
      for (const c of ship.cells) fireAt(foe, c);
    }
    const res = superShot(room, 0, { row: 4, col: 0 });
    expect('results' in res).toBe(true);
    expect(room.phase).toBe('finished');
    expect(room.winner).toBe(0);
  });

  it('resets on rematch', () => {
    const room = setupBattle();
    superShot(room, 0, { row: 9, col: 9 });
    const foe = room.boards[1]!;
    for (const ship of foe.ships) for (const c of ship.cells) fireAt(foe, c);
    room.phase = 'finished';
    room.winner = 0;
    rematch(room, 0);
    rematch(room, 1);
    expect(room.superShotUsed).toEqual([false, false]);
    expect(room.phase).toBe('placing');
  });
});

describe('botFire SuperShot', () => {
  it('spends its SuperShot centred on a lone hit', () => {
    const { room } = createRoom('ai');
    placeShips(room, 0, validPlacements()); // bot fleet pre-placed; now in battle
    room.turn = 1;
    fireAt(room.boards[0]!, { row: 4, col: 0 }); // mark the lone hit the bot saw
    room.ai!.hits = [{ row: 4, col: 0 }];
    botFire(room);
    expect(room.superShotUsed[1]).toBe(true);
    expect(room.boards[0]!.cells[4][1].shot).toBe(true);
  });
});

describe('joinRoom', () => {
  it('rejects a stranger once the game has started, even after a seat frees up', () => {
    for (const leaver of [0, 1] as const) {
      const room = setupBattle();
      leaveRoom(room, leaver);
      expect(joinRoom(room.code)).toEqual({ error: 'game already started' });
      expect(room.players).toHaveLength(1);
      expect(room.phase).toBe('finished');
    }
  });
});
