# Wetwire

A browser-based, tick-based cyberpunk PvP game. A payload must move from a pickup to a
receiver; everyone plans a move, then the tick resolves at once. The full design lives in
[`PROMPT.md`](PROMPT.md); the rules for working on this repo live in [`CLAUDE.md`](CLAUDE.md).

## What's here

- **`index.html`** — the Phase 1 vertical slice: a single self-contained file (no build step),
  one player controlling Wren (courier) and Kade (decker) against two AI hunters. This is the
  frozen baseline every later phase stays faithful to. Open it directly in a browser.
- **`packages/sim`** — the game rules, in pure TypeScript. No DOM, no timers, no randomness
  except a seeded RNG passed in. This is the only package allowed to decide outcomes.
- **`packages/content`** — maps (districts), balance numbers, roles and implants, as JSON
  validated by Zod schemas at load. Change a number here, not in code.
- **`packages/client`** — the browser game: a Pixi renderer (Street and Net layers, the wipe
  between them, the PiP inset) and a Preact HUD, built on `packages/sim`.
- **`tools/balance`** — bots and a headless runner that plays thousands of matches and prints
  win rates per payload.
- **`tests/phase1.test.mjs`** — tests `index.html`'s own sim directly, so the frozen baseline
  stays provably correct on its own.
- **`docs/DECISIONS.md`** / **`docs/BALANCE.md`** — every non-obvious call and every balance
  change, with the reasoning, in the order they were made.

## Requirements

- Node.js (current LTS or newer)
- pnpm (`corepack enable` will pick up the version pinned in `package.json`)

## Running it

```bash
pnpm install
pnpm dev      # starts the client at http://localhost:5173 (or the next free port)
```

To play the Phase 1 baseline instead, just open `index.html` in a browser — no server needed.

## Development

```bash
pnpm check        # typecheck + lint + format check + tests, in that order
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint, zero warnings allowed
pnpm format        # prettier --check
pnpm test          # vitest
pnpm test:cov      # vitest with coverage (packages/sim must stay ≥ 90% lines)
pnpm build         # production client build (packages/client/dist)
pnpm balance       # tools/balance's headless win-rate runner
```

`pnpm dev` and the Phase 1 `index.html` must both keep working at every commit.

## Project state

Phase 1 (the single-file slice) and Phase 2 (the TypeScript monorepo, same gameplay, proven
identical by a differential test against `index.html`) are complete. Phase 4 work (roles,
implants, the neural budget, multiple districts) is underway on top of the Phase 2
architecture, with the online-PvP work (Phase 3) deliberately deferred — see
`docs/DECISIONS.md` for what that means in practice and why.

## Contributing to this repo

Read `CLAUDE.md` first — it's strict on purpose: small, one-concern changes; a plan posted
before code for anything nontrivial; tests alongside every sim rule; balance numbers only
changed with a `docs/BALANCE.md` entry; no change that breaks a replay test. If a rule there
blocks you, it says to stop and ask rather than work around it.
