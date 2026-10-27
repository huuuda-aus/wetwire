# Decisions

One line each: date, decision, reason.

## Phase 1

- 2026-10-27 · Sim and client live in one `index.html`, split into `<script id="sim">` (pure, exposes `Sim`) and `<script id="client">`. · Phase 1 must be one file; the split lets `tests/phase1.test.mjs` load the sim in Node via `vm` with no build step, and keeps the Phase 2 extraction into `packages/sim` mechanical.
- 2026-10-27 · Tests use built-in `node:test` (`node --test tests/phase1.test.mjs`), not Vitest/fast-check. · Phase 1 has no package manager or dependencies; property tests use a seeded LCG. Switch to Vitest and fast-check in Phase 2.
- 2026-10-27 · All tunables in `CONFIG` at the top of the sim script. · CLAUDE.md "no magic numbers"; becomes `packages/content` in Phase 2.
- 2026-10-27 · Hunter first waypoints: H-1 heads for (13,1) first, then (2,1). H-2 starts with waypoint index 1, i.e. (9,3), as specified. · Spec gives H-1's endpoints but not its first target.
- 2026-10-27 · Hunters may share a tile; "blocked" means the planned tile is no longer passable. · Simplest option that keeps the telegraph promise.
- 2026-10-27 · "Adjacent" for hunter sight and attacks is Manhattan distance ≤ 1 (no diagonals). · Matches the attack rule in §3.6 step 6 and 4-neighbour movement.
- 2026-10-27 · Stunned hunters do not see Wren. Hunters in _body_ mode ignore camera alerts and sight (they keep heading for Kade's body). · §3.6 step 4 exempts body-mode hunters from alerts; sight is treated the same so the two rules agree.
- 2026-10-27 · A camera that sees Wren counts one alert and logs one event per camera per tick. · "Camera alerts" stat needs a definition.
- 2026-10-27 · End-state priority when several happen in one tick: Delivered, then Taken, then Flatlined (order of §3.6 step 8). · The read-out completing is the contract being fulfilled.
- 2026-10-27 · Recovery stun and burn stun are both set to 2 and decremented in step 7 of the same tick, so a hit-recovery stun costs the hunter exactly one further move, while a burn (applied in step 1) costs two. · Literal reading of §3.6 order; flagged for review in case recovery should also be two full ticks.
- 2026-10-27 · Kade hit by a hunter: load is raised to 70 in step 6, then decays by 6 in step 7 (no hack that tick), ending at 64. · Literal reading of §3.6 order.
- 2026-10-27 · Kade's legal Burn targets only hunters with no stun left. · Avoids wasting load on a no-op.
- 2026-10-27 · Net layer is not rendered while the wipe is fully on Street. · Skips a full offscreen pass with no visible effect; both layers render whenever the wipe is moving.
- 2026-10-27 · Chromatic offset on overload > 75 % is a double-draw offset at 60 % alpha, not a true channel split. · Cheap, readable; honours `prefers-reduced-motion`.
- 2026-10-27 · Hunter vision tiles, camera cones and legal action lists are cached per state change. · CLAUDE.md: no per-frame allocation in the render loop.
- 2026-10-27 · No third-party libraries in Phase 1; the §2 GitHub/npm search was NOT done. · Phase 1 is a single dependency-free file and BFS plus a Bresenham line of sight are about 40 lines, but the search is still owed before Phase 2 (pathfinding/FOV helpers, Zod, PixiJS, Preact, Colyseus).

## Phase 2

Library choices (CLAUDE.md §2). Data pulled from the npm registry and GitHub API on 2026-10-27: licence, last release, stars, open issues, install scripts (none in any pick).

- 2026-10-27 · **pixi.js 8.22** for rendering, **pixi-filters 6.1** for the glow and RGB-split filters (per-filter subpath imports). · Spec names Pixi v8. Alternatives: phaser 4.2 (a whole framework with its own loop and scenes, which fights a pure sim). MIT, 48.5k stars, pushed the day before. Approved by the director because it exceeds 100 kB gzipped; measured total client JS is about 219 kB gzipped.
- 2026-10-27 · **preact 11** for the DOM UI. · Alternatives: react 19, solid-js 1.9 (all MIT). Preact has no dependencies and is the smallest.
- 2026-10-27 · **zod 4.6** validates both content files at load; extra cross-checks (row widths, door and receiver tiles, link and camera node ids) live in `superRefine`. · Spec and CLAUDE.md name Zod. Alternative: valibot 1.5, kept as the fallback if Zod ever threatens the bundle budget (it is not in the client bundle path today beyond content parsing).
- 2026-10-27 · **vitest 5 + fast-check 4.10** for tests; **pure-rand 8.4** (in `tools/balance` only) for the bots' seeded randomness. · Alternatives for RNG: seedrandom 3.0.5 (last release 2019, fails the maintained test). The sim takes a `seed` in state but uses no randomness yet, so it has no RNG dependency; add one when a rule first needs it.
- 2026-10-27 · **typescript 6.0.3**, not 7. · typescript-eslint 8.72 declares `typescript <6.1.0`; TypeScript 7 would break linting. Revisit when typescript-eslint supports it.
- 2026-10-27 · **vite 8** with `oxc.jsx` (automatic runtime, Preact) instead of `@preact/preset-vite`. · One fewer dependency (the preset needs `@babel/core`).
- 2026-10-27 · Audio is the raw Web Audio API, no library. · howler 2.2.4 last released 2023 (fails maintained); tone 15 is 5 MB unpacked. Needs are a noise bed, a hum and short blips.
- 2026-10-27 · Pathfinding and line of sight stay our own (BFS, Bresenham), now in `packages/sim/src/geometry.ts`. · CLAUDE.md §2: game rules logic is never outsourced. rot-js (BSD-3) was considered and rejected as too large for two small helpers; easystarjs is unmaintained.
- 2026-10-27 · `index.html` (Phase 1) stays at the repo root as the frozen baseline, and `tests/phase1.test.mjs` keeps testing it. · Director's call. `tools/balance/test/parity.test.ts` runs random games through both sims and requires identical state and event logs every tick.

Structure and rules:

- 2026-10-27 · `packages/content` holds the district and every balance number as JSON, parsed by Zod. The Phase 1 `CONFIG.cam.blindTicks` and `CONFIG.net.blindTicks` duplicate is merged into `net.blindTicks`; `net.bodyThreatRange` (4) is new and only drives the "body under threat" chip and PiP alert, which previously reused `burnRange`. No gameplay number changed.
- 2026-10-27 · `MatchState` carries a shared, never-cloned `rules` table (district, balance, wall and door grids, node lookups). `resolveTick` copies only what changes during a tick and returns a new state; the input is untouched (tested).
- 2026-10-27 · `viewFor(state, player)` returns the whole state in Phase 2. · Nothing is hidden in single-player. Phase 3 narrows it, and CLAUDE.md §7 requires a leak test per role at that point.
- 2026-10-27 · Bots live in `tools/balance/src/bots.ts` and only use the sim's public API. Bot randomness comes from pure-rand seeded per match.
- 2026-10-27 · `erasableSyntaxOnly` is on, so Node can run the sim, content and tools directly (`--experimental-strip-types`) with no build step. Consequence: no enums or constructor parameter properties.
- 2026-10-27 · Pixi layers: static art is retained `Graphics`; anything that depends on state, plan or view is rebuilt only when `game.version` changes; per-frame work is limited to transforms and alphas. The Net marching-ants links, target brackets and plan beam are redrawn at about 12 Hz while the Net is visible. · Keeps the render loop free of per-frame allocation as far as practical.
- 2026-10-27 · The PiP inset is a Pixi `RenderTexture` of the street layer, cropped around Kade's body, drawn only while the Net is at least half visible.
- 2026-10-27 · The Phase 1 chromatic jitter is now an RGB-split filter on the street layer for 120 ms every 4 s while overload is above 75 %. `Motion: system / reduced / full` is a user preference that overrides `prefers-reduced-motion`.
- 2026-10-27 · Rain is a scrolling tiling sprite of one small pre-generated streak texture, not 140 individual particles.
