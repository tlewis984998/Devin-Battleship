# Changelog

Notable changes, newest first. Bug-fix entries describe the root cause, the fix, and
how it was verified so future readers can judge whether a regression is plausible.

## 2026-10-05 — Seat lifecycle fixes (`fix/session-and-join-bugs`)

Found in a full code review and reproduced against a live server with a Socket.IO
client probe.

- **Late join broke the room (high).** `joinRoom` only checked the player count, so
  once someone left, a stranger could take the free seat of a finished/in-progress
  game: phase reset to `placing` with both old boards kept (permanently stuck), and if
  the creator had left, two players shared index 1. Now rejects with
  `game already started` unless the room is `waiting`.
- **Reconnect lost the session (high).** The client resumed only on page load; after
  Socket.IO's automatic reconnect every action acked `not in a room` and state pushes
  stopped. The client now re-sends `resume` on every reconnect.
- **One socket could hold several seats (medium).** `attach` overwrote `socket.data`
  without releasing the previous seat, so earlier rooms kept a dead `socketId`, never
  got a cleanup timer (unbounded leak via repeated `createRoom`) and showed a phantom
  connected opponent. `attach` now marks the previous seat disconnected first.
- **Leave raced in-flight state (medium).** A `state` push arriving after "Leave game"
  restored the old room's screen. The client now ignores state for the room it left,
  drops `resume` acks for a session it no longer holds, and when leaving while offline
  queues `resume` before `leaveRoom` so the seat is still forfeited on reconnect.

Verified by: new `joinRoom` unit test; e2e `REGRESSIONS` scenario (late join after
either player leaves, second `createRoom` releases the first seat, resume after a
forced transport drop); browser check that firing still works after the
connection is dropped mid-game.

## 2026-09-28 — SuperShot (`feat/supershot`)

- New once-per-game weapon: `superShot {row,col}` fires a plus pattern — centre plus
  the four orthogonal neighbours, off-board cells ignored.
- Already-fired pattern cells are skipped; rejected with `no new cells to hit` if none
  are fresh, and `SuperShot already used` on a second attempt. Otherwise it ends the
  turn like `fire` and can end the game; resets on rematch; the bot gets one too.
- Server shares `shotPrecheck`/`endShot` between `fire` and `superShot`; the bot
  spends its shot centred on a lone hit. Client: arm with the button or `S`, hover to
  preview the pattern, click to fire.

## 2026-09-28 — Known-issues cleanup (`fix/known-issues-cleanup`)

- `cors: { origin: true }` reflected any origin → allow-list from `CORS_ORIGIN`,
  defaulting to the Vite dev origins (production is same-origin).
- A creator could join their own room as player 2 → `joinRoom` rejects when the
  socket is already seated in that room.
- StrictMode double-invoked the resume effect → guarded by a ref; runs once.

## 2026-09-28 — Hardening and lifecycle fixes (`37966b1`)

Follow-up to the bug review recorded in `known-issues.md`. Fixed items 1–4 and 7.

### 1. Server crash on malformed input (critical)

**Root cause.** Socket handlers trusted payload shape. `rooms.fire` bounds-checked with
`< 0 || >= 10`, so a non-integer such as `{row: 1.5, col: 1}` passed and
`board.cells[1.5][1]` threw a `TypeError` inside the Socket.IO handler. Node has no
handler for exceptions thrown there, so the process exited and every active game was
lost. Reproduced against a dev server: `/healthz` stopped answering after one packet.
The same class of failure existed in `joinRoom` (non-string `roomCode` →
`.toUpperCase()` throws), `placeShips` (non-array `ships`) and `createRoom` / `resume`
(`null` payload broke destructuring).

**Fix.**
- New `server/src/validate.ts` with type guards for every payload: `isCoord`
  (integers within the board), `isRoomCode`, `isToken`, `isGameMode`,
  `isShipPlacements`. Each handler validates first and acks
  `{ok:false, error:'invalid request'}` on failure.
- Every handler is wrapped in `safe()`, which catches a throw, logs it, and acks
  `{ok:false}` instead of letting it propagate.
- `process.on('uncaughtException' | 'unhandledRejection')` log rather than exit, as a
  last line of defence.
- `rooms.fire` also requires `Number.isInteger` on both coordinates.
- `createRoom` now rejects an unknown `mode` instead of silently coercing to `human`.

**Verified by.** 12 unit tests in `validate.test.ts`; the e2e `HARDENING` scenario
sends `null`/wrong-type/fractional payloads to every event and asserts each acks
`{ok:false}` and `/healthz` is still up afterwards.

### 2. Second tab clobbered the live session (high)

**Root cause.** `resume` set `player.socketId` to the newest socket, but when the older
socket disconnected, `markDisconnected` nulled `socketId` unconditionally. The
remaining tab silently stopped receiving `state` and the opponent saw "Opponent
disconnected".

**Fix.** `markDisconnected(room, index, socketId)` is a no-op unless the disconnecting
socket still owns the seat.

**Verified by.** `rooms.test.ts`: attach `'A'` then `'B'`; disconnecting `'A'` leaves
`socketId === 'B'` and starts no cleanup timer; disconnecting `'B'` clears the seat.

### 3. "Leave game" was client-side only (high)

**Root cause.** `App.leave()` forgot the token and reconnected the socket, but the
server still held the seat. The opponent was stuck on "Opponent disconnected — they can
rejoin anytime" indefinitely, and the leaver could not rejoin because the token was
gone.

**Fix.** New `leaveRoom` event. The server removes the seat and its token, then:
- destroys the room if it was still `waiting`, is an AI room, or has no humans left;
- otherwise ends the game (`finished`, winner = remaining player) and clears rematch
  votes. `RoomView.opponentLeft` tells the client to show "Opponent left the game." and
  hide Rematch; `rematch` acks `opponent left`.

**Verified by.** e2e `LEAVE` scenario: B leaves mid-battle → A sees
`opponentLeft && phase === 'finished' && winner === 'you'` and rematch is rejected;
a creator leaving a waiting room makes its code unjoinable (`room not found`).

### 4. UI could hang forever (medium)

**Root cause.** If the server was unreachable, `resume`, `createRoom` and `joinRoom`
never acked, so `App` stayed on "Reconnecting…" and `Home` stayed disabled.

**Fix.** Those emits use `socket.timeout(5000)`. On timeout the UI shows
"Could not reach the server. Please try again." The stored token is kept so a later
refresh retries; it is only cleared when the server explicitly reports
`session not found`.

### 7. Rematch errors were swallowed (low)

The Rematch button passed an empty ack callback. It now surfaces `error` in the
status area.

### Test suite after this change

- `npm test`: 28 tests across `board`, `ai`, `validate`, `rooms`.
- `npm run test:e2e`: four scenarios — human game, AI game + rematch, hardening,
  leave — run 3× green.

## 2026-09-28 — Project docs (`dadbc13`)

Added `docs/` (architecture, protocol, AI opponent, known issues) and `AGENTS.md`.

## 2026-09-27 — AI opponent (`19f4f45`)

Home-screen toggle to play the computer. Bot is seated as player 1 with a pre-placed
fleet; hunt/target strategy with parity hunting and line extension. See
`ai-opponent.md`.

## 2026-09-27 — Initial game (`aa4e782`)

Server-authoritative two-player Battleship with room codes, placement UI, classic
alternating turns, reconnection via session token, and rematch.
