# Decisions

One line each: date, decision, reason.

## Phase 1

- 2026-10-27 · Sim and client live in one `index.html`, split into `<script id="sim">` (pure, exposes `Sim`) and `<script id="client">`. · Phase 1 must be one file; the split lets `tests/phase1.test.mjs` load the sim in Node via `vm` with no build step, and keeps the Phase 2 extraction into `packages/sim` mechanical.
- 2026-10-27 · Tests use built-in `node:test` (`node --test tests/phase1.test.mjs`), not Vitest/fast-check. · Phase 1 has no package manager or dependencies; property tests use a seeded LCG. Switch to Vitest and fast-check in Phase 2.
- 2026-10-27 · All tunables in `CONFIG` at the top of the sim script. · CLAUDE.md "no magic numbers"; becomes `packages/content` in Phase 2.
- 2026-10-27 · Hunter first waypoints: H-1 heads for (13,1) first, then (2,1). H-2 starts with waypoint index 1, i.e. (9,3), as specified. · Spec gives H-1's endpoints but not its first target.
- 2026-10-27 · Hunters may share a tile; "blocked" means the planned tile is no longer passable. · Simplest option that keeps the telegraph promise.
- 2026-10-27 · "Adjacent" for hunter sight and attacks is Manhattan distance ≤ 1 (no diagonals). · Matches the attack rule in §3.6 step 6 and 4-neighbour movement.
- 2026-10-27 · Stunned hunters do not see Wren. Hunters in *body* mode ignore camera alerts and sight (they keep heading for Kade's body). · §3.6 step 4 exempts body-mode hunters from alerts; sight is treated the same so the two rules agree.
- 2026-10-27 · A camera that sees Wren counts one alert and logs one event per camera per tick. · "Camera alerts" stat needs a definition.
- 2026-10-27 · End-state priority when several happen in one tick: Delivered, then Taken, then Flatlined (order of §3.6 step 8). · The read-out completing is the contract being fulfilled.
- 2026-10-27 · Recovery stun and burn stun are both set to 2 and decremented in step 7 of the same tick, so a hit-recovery stun costs the hunter exactly one further move, while a burn (applied in step 1) costs two. · Literal reading of §3.6 order; flagged for review in case recovery should also be two full ticks.
- 2026-10-27 · Kade hit by a hunter: load is raised to 70 in step 6, then decays by 6 in step 7 (no hack that tick), ending at 64. · Literal reading of §3.6 order.
- 2026-10-27 · Kade's legal Burn targets only hunters with no stun left. · Avoids wasting load on a no-op.
- 2026-10-27 · Net layer is not rendered while the wipe is fully on Street. · Skips a full offscreen pass with no visible effect; both layers render whenever the wipe is moving.
- 2026-10-27 · Chromatic offset on overload > 75 % is a double-draw offset at 60 % alpha, not a true channel split. · Cheap, readable; honours `prefers-reduced-motion`.
- 2026-10-27 · Hunter vision tiles, camera cones and legal action lists are cached per state change. · CLAUDE.md: no per-frame allocation in the render loop.
- 2026-10-27 · No third-party libraries in Phase 1; the §2 GitHub/npm search was NOT done. · Phase 1 is a single dependency-free file and BFS plus a Bresenham line of sight are about 40 lines, but the search is still owed before Phase 2 (pathfinding/FOV helpers, Zod, PixiJS, Preact, Colyseus).
