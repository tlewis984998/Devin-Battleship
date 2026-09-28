# AI opponent

Chosen on the Home screen ("Play the computer"). Implemented in
`server/src/game/ai.ts` (pure strategy) and wired in `server/src/rooms.ts` /
`server/src/index.ts`.

## Room mechanics

- `createRoom('ai')` seats a bot as player 1 immediately, rolls it a random legal fleet,
  and starts the room in `placing` — the human never sees the lobby.
- The bot has no socket and no session token. `opponentConnected` is always `true`
  for it, and the room's cleanup timer considers only human seats.
- After every state change `scheduleBot(room)` checks `botShouldAct` (AI room, in
  battle, bot's turn) and, if so, fires 700 ms later. The delay exists only so the human
  can see the turn change.
- On rematch the bot auto-votes, so one human click restarts the game, and the bot's
  fleet and targeting state are re-rolled.

## Strategy: hunt / target

`chooseShot(view, state)` receives the human's board as the bot is allowed to see it
(`foeView`, i.e. only fired cells revealed) plus `state.hits` — the cells it has hit
that do not yet belong to a sunk ship.

1. **Line extension** — if two or more remembered hits share a row or column, shoot the
   first unfired cell beyond either end of that line (skipping over existing hits).
   This finishes a ship in the minimum number of shots once its axis is known.
2. **Neighbour probe** — otherwise, if there is any remembered hit, shoot a random
   unfired orthogonal neighbour of one of them.
3. **Parity hunt** — with no active hits, shoot a random unfired cell where
   `(row + col) % 2 === 0`. Every ship is at least 2 long, so it must cover a cell of
   each parity; searching one colour of the checkerboard halves the hunt.
4. Fallback to any unfired cell (only reachable if the parity set is exhausted).

`recordResult` maintains `state.hits`: push on `hit`; on `sunk`, drop every remembered
hit whose cell is now `sunk` in the post-shot view. Hits on a *different* ship that
happened to be adjacent are kept, so the bot returns to them.

## Performance

Against random fleets in the e2e runs the bot needs roughly 40–55 shots to sink all
17 cells, versus ~190 for pure random firing. It is deliberately not optimal (no
probability-density heat map), so a thoughtful human can still win.

## Tests

`server/src/game/ai.test.ts` covers parity hunting, neighbour probing, line extension
in both directions, `recordResult` bookkeeping, and a deterministic full game (seeded
LCG) that must finish in under 100 shots without ever firing on a used cell.
