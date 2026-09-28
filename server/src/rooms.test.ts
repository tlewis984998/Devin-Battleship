import { describe, expect, it } from 'vitest';
import { createRoom, markDisconnected } from './rooms';

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
