import { randomInt, randomUUID } from 'node:crypto';
import {
  BOARD_SIZE,
  Coord,
  GameMode,
  Phase,
  RoomView,
  SHIPS,
  ShipPlacement,
  plusCells,
  randomPlacements,
} from '@battleship/shared';
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
import { AiState, chooseShot, createAiState, recordResult } from './game/ai';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const CODE_LENGTH = 4;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

export interface Player {
  token: string;
  socketId: string | null;
  index: 0 | 1;
  isBot: boolean;
}

export class Room {
  phase: Phase = 'waiting';
  players: Player[] = [];
  boards: [Board | null, Board | null] = [null, null];
  turn: 0 | 1 = 0;
  winner: 0 | 1 | null = null;
  rematchVotes = new Set<number>();
  superShotUsed: [boolean, boolean] = [false, false];
  cleanupTimer: NodeJS.Timeout | null = null;
  ai: AiState | null = null;
  botTimer: NodeJS.Timeout | null = null;

  constructor(public code: string) {}

  player(index: number): Player | undefined {
    return this.players.find((p) => p.index === index);
  }

  viewFor(index: 0 | 1): RoomView {
    const mine = this.boards[index];
    const foe = this.boards[1 - index];
    const opponent = this.player(1 - index);
    const finished = this.phase === 'finished';
    return {
      roomCode: this.code,
      phase: this.phase,
      playerIndex: index,
      opponentConnected: Boolean(opponent && (opponent.socketId || opponent.isBot)),
      opponentIsAi: Boolean(opponent?.isBot),
      opponentLeft: this.phase !== 'waiting' && !opponent,
      youPlaced: mine !== null,
      opponentPlaced: foe !== null,
      yourBoard: mine ? ownView(mine) : emptyView(),
      opponentBoard: foe ? foeView(foe, finished) : emptyView(),
      yourTurn: this.phase === 'battle' && this.turn === index,
      superShotAvailable: !this.superShotUsed[index],
      opponentSuperShotAvailable: !this.superShotUsed[1 - index],
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

function addPlayer(room: Room, index: 0 | 1, isBot = false): Player {
  const player: Player = { token: randomUUID(), socketId: null, index, isBot };
  room.players.push(player);
  if (!isBot) tokens.set(player.token, { code: room.code, index });
  return player;
}

/** Bot fleets: keep drawing until a full legal layout comes out. */
function botBoard(): Board {
  let placements = randomPlacements();
  while (placements.length !== SHIPS.length) placements = randomPlacements();
  return createBoard(placements);
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function createRoom(mode: GameMode = 'human'): { room: Room; player: Player } {
  let code = genCode();
  while (rooms.has(code)) code = genCode();
  const room = new Room(code);
  rooms.set(code, room);
  const player = addPlayer(room, 0);
  if (mode === 'ai') {
    addPlayer(room, 1, true);
    room.ai = createAiState();
    room.phase = 'placing';
    room.boards[1] = botBoard();
  }
  return { room, player };
}

export function joinRoom(code: string): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: 'room not found' };
  if (room.players.length >= 2) return { error: 'room is full' };
  if (room.phase !== 'waiting') return { error: 'game already started' };
  const player = addPlayer(room, room.player(0) ? 1 : 0);
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

export function markDisconnected(room: Room, index: number, socketId: string): void {
  const player = room.player(index);
  if (!player || player.socketId !== socketId) return;
  player.socketId = null;
  if (room.players.filter((p) => !p.isBot).every((p) => p.socketId === null)) {
    touch(room);
    room.cleanupTimer = setTimeout(() => destroy(room.code), EMPTY_ROOM_TTL_MS);
  }
}

function destroy(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  if (room.botTimer) clearTimeout(room.botTimer);
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

function shotPrecheck(room: Room, index: 0 | 1, c: Coord): string | null {
  if (room.phase !== 'battle') return 'not in battle phase';
  if (room.turn !== index) return 'not your turn';
  if (
    !Number.isInteger(c.row) ||
    !Number.isInteger(c.col) ||
    c.row < 0 ||
    c.row >= BOARD_SIZE ||
    c.col < 0 ||
    c.col >= BOARD_SIZE
  ) {
    return 'target out of bounds';
  }
  return null;
}

/** Classic rules: every shot ends the turn unless it sinks the last ship. */
function endShot(room: Room, index: 0 | 1, foe: Board): void {
  if (allSunk(foe)) {
    room.phase = 'finished';
    room.winner = index;
  } else {
    room.turn = (1 - index) as 0 | 1;
  }
}

export function fire(
  room: Room,
  index: 0 | 1,
  c: Coord,
): { result: FireResult } | { error: string } {
  const precheck = shotPrecheck(room, index, c);
  if (precheck) return { error: precheck };
  const foe = room.boards[1 - index];
  if (!foe) return { error: 'opponent board not ready' };
  const result = fireAt(foe, c);
  if (result.kind === 'repeat') return { error: 'cell already fired on' };
  endShot(room, index, foe);
  return { result };
}

/** One-per-game volley on the centre and its orthogonal neighbours. */
export function superShot(
  room: Room,
  index: 0 | 1,
  c: Coord,
): { results: { coord: Coord; result: FireResult }[] } | { error: string } {
  const precheck = shotPrecheck(room, index, c);
  if (precheck) return { error: precheck };
  if (room.superShotUsed[index]) return { error: 'SuperShot already used' };
  const foe = room.boards[1 - index];
  if (!foe) return { error: 'opponent board not ready' };
  const results: { coord: Coord; result: FireResult }[] = [];
  for (const cell of plusCells(c)) {
    const result = fireAt(foe, cell);
    if (result.kind !== 'repeat') results.push({ coord: cell, result });
  }
  if (results.length === 0) return { error: 'no new cells to hit' };
  room.superShotUsed[index] = true;
  endShot(room, index, foe);
  return { results };
}

/** Frees a seat. Destroys the room if it was never joined, has a bot, or is now empty. */
export function leaveRoom(room: Room, index: 0 | 1): void {
  const player = room.player(index);
  if (!player) return;
  room.players = room.players.filter((p) => p !== player);
  tokens.delete(player.token);
  if (
    room.phase === 'waiting' ||
    room.players.some((p) => p.isBot) ||
    !room.players.some((p) => !p.isBot)
  ) {
    destroy(room.code);
    return;
  }
  if (room.phase === 'placing' || room.phase === 'battle') {
    room.phase = 'finished';
    room.winner = (1 - index) as 0 | 1;
  }
  room.rematchVotes.clear();
}

export function rematch(room: Room, index: 0 | 1): string | null {
  if (!room.player(1 - index)) return 'opponent left';
  if (room.phase !== 'finished') return 'game not finished';
  room.rematchVotes.add(index);
  const bot = room.players.find((p) => p.isBot);
  if (bot) room.rematchVotes.add(bot.index);
  if (room.rematchVotes.size === 2) {
    room.boards = [null, null];
    room.phase = 'placing';
    room.winner = null;
    room.rematchVotes.clear();
    room.superShotUsed = [false, false];
    if (room.ai) room.ai = createAiState();
    if (bot) room.boards[bot.index] = botBoard();
  }
  return null;
}

export function botShouldAct(room: Room): boolean {
  return room.ai !== null && room.phase === 'battle' && room.turn === 1;
}

export function botFire(room: Room): void {
  if (!room.ai || !room.boards[0]) return;
  if (room.ai.hits.length === 1 && !room.superShotUsed[1]) {
    const res = superShot(room, 1, room.ai.hits[0]);
    if (!('error' in res)) {
      const post = foeView(room.boards[0]);
      for (const { coord, result } of res.results) recordResult(room.ai, coord, result, post);
      return;
    }
  }
  const view = foeView(room.boards[0]);
  const c = chooseShot(view, room.ai);
  const res = fire(room, 1, c);
  if (!('error' in res)) {
    recordResult(room.ai, c, res.result, foeView(room.boards[0]));
  }
}
