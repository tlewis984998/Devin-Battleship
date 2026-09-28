# Architecture

## Overview

```
 Browser (React)                     Node server                     Browser (React)
 ┌───────────────┐   Socket.IO   ┌──────────────────────┐   Socket.IO   ┌───────────────┐
 │ App           │◄─── state ────│ index.ts  (handlers) │──── state ───►│ App           │
 │  Home/Lobby/  │──── fire ────►│ rooms.ts  (lifecycle)│◄─── fire ─────│  Home/Lobby/  │
 │  Placement/   │               │ game/board.ts (rules)│               │  Placement/   │
 │  Battle       │               │ game/ai.ts    (bot)  │               │  Battle       │
 └───────────────┘               └──────────────────────┘               └───────────────┘
                                   in-memory Map<code, Room>
```

Three workspaces, all TypeScript:

| Workspace | Role | Notes |
| --- | --- | --- |
| `shared/` | Types, ship definitions, socket event contracts, placement helpers | Consumed as raw `.ts` source by both sides; no build step, no dependencies |
| `server/` | Express + Socket.IO. Owns all game state. | `tsx` runs it directly; no compile step |
| `client/` | React 18 + Vite | Talks to the server exclusively through one typed socket |

## Design principles

**Server-authoritative.** The server holds the true boards. Each client receives only
a `RoomView` computed for its seat (`Room.viewFor(index)`), which contains its own
board in full but the opponent's board masked to fired-upon cells. Enemy ship
positions are revealed only when `phase === 'finished'`. Cheating by inspecting
network traffic is therefore impossible.

**Single state-push model.** There are no fine-grained events like `shotResult` or
`shipSunk`. After any mutation the server calls `pushState(room)`, which emits a fresh
`state: RoomView` to every connected seat. The client is a pure function of the latest
`RoomView`. This keeps the client trivially consistent at the cost of ~2 KB per update,
which is negligible.

**Pure rules, thin transport.** `server/src/game/board.ts` and `server/src/game/ai.ts`
know nothing about rooms or sockets and are unit-tested in isolation.
`server/src/rooms.ts` composes them into room lifecycle. `server/src/index.ts` is only
socket plumbing plus static file serving.

**No accounts, no database.** Rooms are keyed by a 4-character code (alphabet omits
`I L O 0 1` to avoid misreads). State is a process-local `Map`; a restart drops all
games. See `docs/known-issues.md` for the implications.

## Server modules

### `game/board.ts` — rules engine

- `validatePlacement(placements)` — exactly the five standard ships, in bounds, no
  overlap. Returns an error string or `null`.
- `createBoard(placements)` — builds a `Board` (`cells[row][col] = {ship, shot}` plus
  a `ships[]` list with each ship's cells).
- `fireAt(board, coord)` → `repeat | miss | hit | sunk{shipName}`.
- `allSunk`, `sunkNames`.
- `ownView(board)` — owner's perspective (`water | ship | hit | miss | sunk`).
- `foeView(board, reveal)` — enemy's perspective; intact ships are `water` unless
  `reveal` is true (game over).

### `game/ai.ts` — bot strategy

See `docs/ai-opponent.md`.

### `rooms.ts` — lifecycle

```
waiting ──joinRoom──► placing ──both placeShips──► battle ──allSunk──► finished
   ▲                     ▲                                                │
   │ (AI rooms start     └──────────── both rematch ──────────────────────┘
   │  here directly)
createRoom
```

- `Room` holds `phase`, `players[]`, `boards[2]`, `turn`, `winner`, `rematchVotes`,
  `ai` state, and two timers (`cleanupTimer`, `botTimer`).
- `Player = {token, socketId, index, isBot}`. `token` is a UUID handed to the browser
  and stored in `localStorage`; it is the reconnection credential. Bot players never
  get a token registered.
- **Turn rule (classic):** every shot, hit or miss, passes the turn. The first turn is
  random once both fleets are placed.
- **Reconnection:** `resume(token)` re-attaches a socket to its seat. When every human
  seat is disconnected a 10-minute `cleanupTimer` starts; any reattach cancels it
  (`touch`). On expiry `destroy` removes the room and its tokens.
- **Rematch:** both seats must vote; a bot votes automatically. Restart clears boards,
  returns to `placing`, and re-rolls the bot's fleet.
- **AI hooks:** `botShouldAct(room)` and `botFire(room)` are exported so `index.ts`
  can schedule the bot's move with a delay without `rooms.ts` touching sockets.

### `index.ts` — transport

- One handler per `ClientToServer` event. Each resolves the calling socket's seat via
  `socket.data` (`context()`), delegates to `rooms.ts`, acks, and `pushState`s.
- Every handler is wrapped in `safe()` (a throw acks `{ok:false}` instead of
  propagating) and validates its payload with the type guards in `validate.ts`;
  `uncaughtException`/`unhandledRejection` are logged rather than fatal.
- `leaveRoom` frees the seat: a `waiting` room, an AI room, or an emptied room is
  destroyed outright; otherwise the game ends with the leaver's opponent as winner
  and `opponentLeft` set on their `RoomView`.
- `scheduleBot(room)` fires the bot's shot 700 ms after it becomes the bot's turn; it is
  called after every state-changing handler so the bot always gets its move even after
  a human reconnects.
- `GET /healthz` → `{ok:true}`.
- If `client/dist` exists it is served statically with an SPA fallback, so production
  is one process on one port.

## Client

- `socket.ts` — one shared typed socket. Dev connects to `:3001`; production connects
  same-origin. `VITE_SERVER_URL` overrides.
- `App.tsx` — holds the latest `RoomView`, attempts `resume` on load if a token is in
  `localStorage`, and picks a screen from `view.phase`:
  `null → Home`, `waiting → Lobby`, `placing → Placement`, `battle | finished → Battle`.
- `Placement.tsx` — local-only drag-free placement: click to place the next ship,
  `R` rotates, click a placed ship to remove it, Randomize/Clear, then `placeShips`.
  Placement is validated client-side for UX and again server-side for truth.
- `Battle.tsx` — two `BoardGrid`s, turn banner, fleet status chips, rematch controls.
- `components/BoardGrid.tsx` — dumb 10×10 grid; caller supplies per-cell class and
  content.

## Data flow example: a shot

1. Player clicks an enemy cell → `socket.emit('fire', {row, col}, ack)`.
2. Server `fire` handler → `rooms.fire` → `board.fireAt` mutates the opponent's board,
   flips `turn`, or sets `phase='finished'` + `winner`.
3. `pushState(room)` emits a new `RoomView` to both seats; **then** the ack resolves
   (ordering matters so a fast client never sees a stale `yourTurn`).
4. `scheduleBot(room)`; in an AI room this fires the bot's reply after 700 ms and pushes
   state again.
