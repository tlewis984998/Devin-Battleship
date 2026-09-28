# Known issues

Findings from a code review and live probing on 2026-09-27. Status is tracked here
until fixed; remove entries as they are resolved.

## Critical

### 1. Malformed socket payloads crash the server process
**Status: open.** Handlers trust payload shape. `fire` rejects out-of-range numbers but
not non-integers, so `{row: 1.5, col: 1}` passes the bounds check and
`board.cells[1.5][1]` throws a `TypeError` inside the Socket.IO handler. Node has no
handler for the exception, so the process exits and every active game is lost.
Reproduced against a dev server: `/healthz` stopped responding after one packet.

The same class of failure exists in `joinRoom` (non-string `roomCode` →
`.toUpperCase()` throws), `placeShips` (non-array `ships`), and `createRoom` / `resume`
(`null` payload breaks destructuring).

Fix: validate every payload at the top of its handler (`Number.isInteger`, `typeof`,
`Array.isArray`), and wrap handlers so any thrown error acks `{ok:false}` instead of
propagating.

## High

### 2. Reconnecting in a second tab clobbers the live session
**Status: open.** `resume` sets `player.socketId` to the newest socket, but when the
older socket disconnects, `markDisconnected` nulls `socketId` unconditionally. The
remaining tab stops receiving `state` and the opponent sees "Opponent disconnected".
Fix: in the `disconnect` handler only clear the seat if `player.socketId === socket.id`.

### 3. "Leave game" is client-side only
**Status: open.** `App.leave()` forgets the token and reconnects the socket, but the
server still holds the seat. The opponent is stuck on "Opponent disconnected — they can
rejoin anytime" indefinitely, and the leaver cannot rejoin because the token is gone.
Fix: add a `leaveRoom` event that frees the seat (or ends the game for the opponent).

## Medium

### 4. "Reconnecting…" / "Create a game" can hang with no way out
**Status: open.** If the server is unreachable, `resume` and `createRoom` never ack;
`App` stays on the reconnecting screen and `Home` stays `busy`. Add an ack timeout
that surfaces an error and clears the stored token.

### 5. In-memory state
**By design (MVP).** A server restart drops all rooms; every client's stored token is
then invalid and they are returned to Home. A Redis-backed room store would be the
next step for real deployment.

## Low / hardening

- **6.** `cors: { origin: true }` reflects any origin. Production is same-origin, so
  this should be restricted or removed there.
- **7.** The Rematch button passes an empty ack callback, so a failure is silent.
- **8.** A room's creator can join their own room as player 2 from a second tab.
- **9.** React StrictMode double-invokes the `resume` effect in dev; harmless (same
  seat re-attached) but noisy.

## Verified clean

Rules engine (placement validation, hit/sunk/win, view masking), room-code generation,
turn enforcement, AI targeting, bot-timer cleanup on room destruction, and the
empty-room TTL. Covered by 14 unit tests plus the e2e simulation.
