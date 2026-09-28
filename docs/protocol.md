# Socket protocol

All contracts are defined once in `shared/src/index.ts` (`ClientToServer`,
`ServerToClient`) and enforced by Socket.IO's typed generics on both sides. Change the
types there first; the compiler will point at every call site.

## Client → server

Every event takes a payload and an acknowledgement callback. Acks are one of:

```ts
{ ok: true, ... }             // success (extra fields per event)
{ ok: false, error: string }  // human-readable failure
```

| Event | Payload | Success ack | Errors |
| --- | --- | --- | --- |
| `createRoom` | `{ mode: 'human' \| 'ai' }` | `{ token, view }` | — |
| `joinRoom` | `{ roomCode }` (case-insensitive) | `{ token, view }` | `room not found`, `room is full` |
| `resume` | `{ token }` | `{ view }` | `session not found` |
| `placeShips` | `{ ships: ShipPlacement[] }` | `{}` | `not in placement phase`, `ships already placed`, validation messages |
| `fire` | `{ row, col }` | `{}` | `not in battle phase`, `not your turn`, `target out of bounds`, `cell already fired on` |
| `rematch` | — | `{}` | `game not finished` |

`token` must be persisted by the client (`localStorage['battleship-token']`) and sent
in `resume` on the next page load to reclaim the seat.

## Server → client

| Event | Payload | When |
| --- | --- | --- |
| `state` | `RoomView` | After every mutation, to every connected seat in the room |

There are no other server events. The client should treat each `state` as the full
truth and re-render from it.

## `RoomView`

```ts
{
  roomCode: string;
  phase: 'waiting' | 'placing' | 'battle' | 'finished';
  playerIndex: 0 | 1;             // your seat
  opponentConnected: boolean;     // always true for a bot
  opponentIsAi: boolean;
  youPlaced: boolean;
  opponentPlaced: boolean;
  yourBoard: CellView[][];        // 10x10: water | ship | hit | miss | sunk
  opponentBoard: CellView[][];    // intact enemy ships appear as 'water' until finished
  yourTurn: boolean;              // false outside 'battle'
  winner: 'you' | 'opponent' | null;
  sunkByYou: string[];            // enemy ship names you have sunk
  sunkByOpponent: string[];       // your ship names that are sunk
  rematchRequestedBy: number[];   // seat indices
}
```

## Ordering guarantee

Handlers that change whose turn it is (`fire`) call `pushState` **before** the ack, so
by the time a client's `fire` promise resolves it has already received the
post-shot `state`. Keep this ordering when adding handlers; the e2e test depends on it.

## Ship placement payload

```ts
{ name: 'Carrier' | 'Battleship' | 'Cruiser' | 'Submarine' | 'Destroyer',
  row: number, col: number, orientation: 'h' | 'v' }
```

`row, col` is the top-left cell; the ship extends right (`h`) or down (`v`).
Sizes are 5 / 4 / 3 / 3 / 2 (17 cells total).
