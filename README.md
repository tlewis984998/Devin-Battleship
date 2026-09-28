# Devin-Battleship

An online, two-player Battleship game. Create a room, share the 4-letter code
with a friend, place your fleet, and take turns firing until one navy is sunk.

Built with TypeScript end to end: React + Vite on the client, Express +
Socket.IO on the server, and a shared package for types and game constants.

## Features

- Classic rules: 10×10 grid, five ships (5/4/3/3/2), alternating turns
- Server-authoritative game state — the client never receives the opponent's
  ship positions until the game is over
- Room codes instead of accounts; games live in memory
- Click-to-place with rotation (`R`), live placement preview, and Randomize
- Reconnection: refreshing the page resumes your game via a stored session token
- Rematch flow, and the full enemy fleet is revealed when the game ends

## Getting started

Requires Node 22+.

```bash
npm install
npm run dev
```

The client runs on http://localhost:5173 and talks to the server on :3001.
Open it in two browser windows (or send the code to a friend on your network).

> `.npmrc` sets `legacy-peer-deps=true`, which works around an npm bug when
> resolving vitest 5's optional peer dependencies.

## Scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Server (tsx watch) + client (Vite) with hot reload    |
| `npm run build`     | Type-check and build the client into `client/dist`    |
| `npm start`         | Run the server; serves `client/dist` if it exists     |
| `npm test`          | Unit tests for the game rules (vitest)                |
| `npm run test:e2e`  | Two socket clients play a full game against a server on `SERVER_URL` (default `http://localhost:3099`) |
| `npm run typecheck` | `tsc --noEmit` across all workspaces                  |

## Production

```bash
npm run build
PORT=3001 npm start
```

The server serves the built client and the Socket.IO endpoint from one port.

If the client is served from a different origin, set `CORS_ORIGIN` to that origin
(comma-separated for several). By default only the Vite dev origins
(`http://localhost:5173`, `http://127.0.0.1:5173`) are allowed.

### Docker

The `Dockerfile` builds the client and produces a small runtime image with only
production dependencies. The server reads `PORT` (default 3001).

```bash
docker build -t battleship .
docker run -p 3001:3001 battleship
```

## Deploy to Railway

Railway builds the `Dockerfile` automatically and redeploys on every push to `main`.

1. Sign up at https://railway.com and pick the **Hobby** plan (the free trial sleeps
   idle apps, which breaks games in progress).
2. **New Project → Deploy from GitHub repo** → authorize GitHub → choose
   `tlewis984998/Devin-Battleship`. Railway detects the Dockerfile; no build or
   start command needs to be set.
3. Wait for the first deploy to go green, then open the service → **Settings →
   Networking → Generate Domain**. That `*.up.railway.app` URL is what you share.
4. Recommended, under **Settings → Deploy**: set **Healthcheck Path** to `/healthz`
   so a broken build never replaces a working one, and choose the region closest to
   your players.

No environment variables are required: Railway injects `PORT`, and the client and
Socket.IO endpoint are served from the same origin so CORS needs no configuration.

Game state is in memory, so a redeploy ends any game in progress — deploy between
matches, not during them.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit, state machine, data flow
- [`docs/protocol.md`](docs/protocol.md) — socket events and the `RoomView` contract
- [`docs/ai-opponent.md`](docs/ai-opponent.md) — how the computer player works
- [`docs/known-issues.md`](docs/known-issues.md) — open bugs and hardening backlog
- [`docs/changelog.md`](docs/changelog.md) — what changed and why, including bug root causes
- [`AGENTS.md`](AGENTS.md) — setup quirks, verification commands, and conventions for contributors and coding agents

## Project layout

```
shared/   Types, ship definitions, socket event contracts, placement helpers
server/   Express + Socket.IO
  src/game/board.ts   Pure rules: placement validation, firing, sunk/win, views
  src/rooms.ts        Room lifecycle, turn handling, rematch, reconnection
  src/index.ts        Socket handlers and static serving
  test/e2e.ts         End-to-end game simulation
client/   React app
  src/screens/        Home → Lobby → Placement → Battle (incl. game over)
  src/components/     BoardGrid
```
