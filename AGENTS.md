# Agent notes for Devin-Battleship

Online two-player Battleship. TypeScript npm-workspaces monorepo:
`shared/` (types + contracts), `server/` (Express + Socket.IO), `client/` (React + Vite).
Longer-form docs live in `docs/` — start with `docs/architecture.md`.

## Setup

```bash
npm install --legacy-peer-deps
```

Plain `npm install` crashes npm's arborist ("Cannot read properties of null (reading
'edgesOut')") while resolving vitest 5's optional peer deps. Always pass
`--legacy-peer-deps`. Node 22+.

## Run

- `npm run dev` — server on :3001 (tsx watch) + client on :5173 (Vite). The client
  targets `http://localhost:3001` in dev via `client/src/socket.ts`.
- `npm run build && npm start` — production: server serves `client/dist` and the
  Socket.IO endpoint from one port (`PORT`, default 3001).
- `tsx watch` restarts on file changes but NOT after an uncaught crash — restart
  `npm run dev` manually if `curl localhost:3001/healthz` stops answering.

## Verify (run the narrowest set that covers your change)

| Change touches            | Run                                                     |
| ------------------------- | ------------------------------------------------------- |
| anything                  | `npm run typecheck`                                     |
| `server/src/game/*`       | `npm test` (vitest: `board.test.ts`, `ai.test.ts`)      |
| `server/src/rooms.ts`, `server/src/index.ts`, `shared/` | e2e (below)               |
| `client/`                 | `npm run build` (tsc + vite)                            |

E2E (`server/test/e2e.ts`) needs a running server on a spare port:

```bash
PORT=3099 npm start &     # from repo root
npm run test:e2e          # human-vs-human game, then human-vs-AI game + rematch
kill %1
```

It plays random games to completion and prints `E2E PASS` and `AI E2E PASS`.
Run it 2-3 times — it is randomized. Never point it at :3001 if a dev server is up.

## Conventions

- Server is authoritative. Clients only ever receive `RoomView` (see `shared/src/index.ts`);
  never send opponent ship positions before `phase === 'finished'`.
- All client→server events take `(payload, ack)` and ack with `{ok:true}` or
  `{ok:false, error}`. Push updated state with `pushState(room)` BEFORE calling the ack
  in handlers that change turn state (the `fire` handler depends on this ordering).
- Game rules live in `server/src/game/board.ts` and must stay pure (no room/socket
  knowledge). Same for `server/src/game/ai.ts`.
- `shared/` is consumed as raw TypeScript source by both workspaces (no build step);
  keep it dependency-free.
- No comments unless they explain a non-obvious "why". Compact code, early returns.
- New dependencies: prefer versions published ≥7 days ago; the vitest pin (5.0.1) is
  deliberate for that reason.

## Git workflow

**Never commit directly to `main`.** Every change goes through a branch and a pull
request so the owner can review before it lands.

1. Start from up-to-date `main`: `git checkout main && git pull`.
2. Branch: `git checkout -b <type>/<short-description>` where type is `feat`, `fix`,
   `docs`, `chore`, or `refactor` (e.g. `fix/leave-room-timer`).
3. Commit on the branch with a message that explains *why*.
4. Push the branch and open a PR against `main` with `gh pr create --fill` (or with
   `--title/--body`). The body should cover what changed, why, and how it was
   verified (which of the commands above were run). Add `docs/changelog.md` and
   `docs/known-issues.md` updates in the same PR when they apply.
5. Do not merge the PR yourself; the owner reviews and merges. Squash-merge is
   preferred so `main` stays one commit per change.
6. After merge: `git checkout main && git pull && git branch -d <branch>`.

- Remote: `https://github.com/tlewis984998/Devin-Battleship.git`, default branch
  `main`.
- Credentials come from `gh` (`gh auth setup-git` is configured).
- History before 2026-09-28 (`aa4e782`..`f5f1f18`) was committed straight to `main`;
  everything after must follow the flow above.
