# Known issues

Findings from a code review and live probing on 2026-09-27. Status is tracked here
until fixed; remove entries as they are resolved.

## Medium

### 1. In-memory state
**By design (MVP).** A server restart drops all rooms; every client's stored token is
then invalid and they are returned to Home. A Redis-backed room store would be the
next step for real deployment.

## Low / hardening

- **2.** `cors: { origin: true }` reflects any origin. Production is same-origin, so
  this should be restricted or removed there.
- **3.** A room's creator can join their own room as player 2 from a second tab.
- **4.** React StrictMode double-invokes the `resume` effect in dev; harmless (same
  seat re-attached) but noisy.

## Fixed

Resolved on 2026-09-28 — full root-cause / fix / verification write-up in
[`changelog.md`](changelog.md):

- Malformed socket payloads no longer crash the server — every handler validates its
  payload (`validate.ts`) and is wrapped by `safe()`, which acks `{ok:false}` on a
  throw; `uncaughtException`/`unhandledRejection` are logged, not fatal.
- Reconnecting in a second tab no longer clobbers the live session —
  `markDisconnected` only clears the seat if the disconnecting socket still holds it.
- "Leave game" now emits `leaveRoom`: the seat is freed and the opponent sees the
  game as finished with themselves the winner.
- `resume`/`createRoom`/`joinRoom` acks time out after 5 s on the client, surfacing
  "Could not reach the server" instead of hanging.
- The Rematch button surfaces server errors instead of silently ignoring them.

## Verified clean

Rules engine (placement validation, hit/sunk/win, view masking), room-code generation,
turn enforcement, AI targeting, bot-timer cleanup on room destruction, and the
empty-room TTL. Covered by unit tests plus the e2e simulation.
