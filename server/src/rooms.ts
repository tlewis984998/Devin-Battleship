import { randomInt, randomUUID } from 'node:crypto';
import { BOARD_SIZE, Coord, Phase, RoomView, ShipPlacement } from '@battleship/shared';
import {
  Board,
  FireResult,
  allSunk,
  createBoard,
  emptyView,
  fireAt,
  foeView,
  ownView,
  sunkNames,
  validatePlacement,
} from './game/board';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const CODE_LENGTH = 4;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

export interface Player {
  token: string;
  socketId: string | null;
  index: 0 | 1;
}

export class Room {
  phase: Phase = 'waiting';
  players: Player[] = [];
  boards: [Board | null, Board | null] = [null, null];
  turn: 0 | 1 = 0;
  winner: 0 | 1 | null = null;
  rematchVotes = new Set<number>();
  cleanupTimer: NodeJS.Timeout | null = null;

  constructor(public code: string) {}

  player(index: number): Player | undefined {
    return this.players.find((p) => p.index === index);
  }

  viewFor(index: 0 | 1): RoomView {
    const mine = this.boards[index];
    const foe = this.boards[1 - index];
    const finished = this.phase === 'finished';
    return {
      roomCode: this.code,
      phase: this.phase,
      playerIndex: index,
      opponentConnected: Boolean(this.player(1 - index)?.socketId),
      youPlaced: mine !== null,
      opponentPlaced: foe !== null,
      yourBoard: mine ? ownView(mine) : emptyView(),
      opponentBoard: foe ? foeView(foe, finished) : emptyView(),
      yourTurn: this.phase === 'battle' && this.turn === index,
      winner: this.winner === null ? null : this.winner === index ? 'you' : 'opponent',
      sunkByYou: foe ? sunkNames(foe) : [],
      sunkByOpponent: mine ? sunkNames(mine) : [],
      rematchRequestedBy: [...this.rematchVotes],
    };
  }
}

const rooms = new Map<string, Room>();
const tokens = new Map<string, { code: string; index: 0 | 1 }>();

function genCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function addPlayer(room: Room, index: 0 | 1): Player {
  const player: Player = { token: randomUUID(), socketId: null, index };
  room.players.push(player);
  tokens.set(player.token, { code: room.code, index });
  return player;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function createRoom(): { room: Room; player: Player } {
  let code = genCode();
  while (rooms.has(code)) code = genCode();
  const room = new Room(code);
  rooms.set(code, room);
  return { room, player: addPlayer(room, 0) };
}

export function joinRoom(code: string): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: 'room not found' };
  if (room.players.length >= 2) return { error: 'room is full' };
  const player = addPlayer(room, 1);
  room.phase = 'placing';
  return { room, player };
}

export function resumeSession(token: string): { room: Room; player: Player } | null {
  const ref = tokens.get(token);
  if (!ref) return null;
  const room = rooms.get(ref.code);
  if (!room) return null;
  const player = room.player(ref.index);
  if (!player) return null;
  return { room, player };
}

/** Cancels pending room destruction; call whenever a player attaches. */
export function touch(room: Room): void {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
}

export function markDisconnected(room: Room, index: number): void {
  const player = room.player(index);
  if (player) player.socketId = null;
  if (room.players.every((p) => p.socketId === null)) {
    touch(room);
    room.cleanupTimer = setTimeout(() => destroy(room.code), EMPTY_ROOM_TTL_MS);
  }
}

function destroy(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  for (const p of room.players) tokens.delete(p.token);
  rooms.delete(code);
}

export function placeShips(
  room: Room,
  index: 0 | 1,
  placements: ShipPlacement[],
): string | null {
  if (room.phase !== 'placing') return 'not in placement phase';
  if (room.boards[index]) return 'ships already placed';
  const error = validatePlacement(placements);
  if (error) return error;
  room.boards[index] = createBoard(placements);
  if (room.boards[0] && room.boards[1]) {
    room.phase = 'battle';
    room.turn = randomInt(2) as 0 | 1;
  }
  return null;
}

export function fire(
  room: Room,
  index: 0 | 1,
  c: Coord,
): { result: FireResult } | { error: string } {
  if (room.phase !== 'battle') return { error: 'not in battle phase' };
  if (room.turn !== index) return { error: 'not your turn' };
  if (c.row < 0 || c.row >= BOARD_SIZE || c.col < 0 || c.col >= BOARD_SIZE) {
    return { error: 'target out of bounds' };
  }
  const foe = room.boards[1 - index];
  if (!foe) return { error: 'opponent board not ready' };
  const result = fireAt(foe, c);
  if (result.kind === 'repeat') return { error: 'cell already fired on' };
  if (allSunk(foe)) {
    room.phase = 'finished';
    room.winner = index;
  } else {
    room.turn = (1 - index) as 0 | 1; // classic rules: every shot ends the turn
  }
  return { result };
}

export function rematch(room: Room, index: 0 | 1): string | null {
  if (room.phase !== 'finished') return 'game not finished';
  room.rematchVotes.add(index);
  if (room.rematchVotes.size === 2) {
    room.boards = [null, null];
    room.phase = 'placing';
    room.winner = null;
    room.rematchVotes.clear();
  }
  return null;
}
