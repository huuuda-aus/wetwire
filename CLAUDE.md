# CLAUDE.md — Wetwire

Rules for every coding session on this repo. They are strict on purpose. If a rule blocks you, stop and ask; do not work around it.

The game design and phase plan live in `PROMPT.md` (the Wetwire Master Prompt). Read it at the start of every session. This file covers *how* to work; `PROMPT.md` covers *what* to build.

---

## 1. Non-negotiables

1. **All game rules live in `packages/sim`.** It is pure TypeScript: no DOM, no timers, no network, no `Math.random()`, no `Date.now()`. Randomness comes only from the seeded RNG passed in. The client, server and tools read state and submit actions; they never decide outcomes.
2. **The server is the authority.** Clients send actions only. Never trust a value from a client that the server can compute.
3. **Determinism is sacred.** The same seed and input log must always produce the same match. Any change that breaks a replay test is a bug until proven otherwise.
4. **Never change a balance number silently.** Numbers live in `packages/content`. To change one, add an entry to `docs/BALANCE.md` (before, after, reason) and say so in your summary.
5. **No original-IP leakage.** Never use names, characters or text from *Johnny Mnemonic*, Gibson's Sprawl stories or the 1995 film. Use only our own names.
6. **Ask before anything expensive to undo:** adding a paid service, choosing or migrating a database, changing the tick model or netcode, adding a dependency over 100 kB gzipped to the client, or deleting files you did not create in this session.

## 2. Reuse before you build

**If you encounter a new or previously unknown feature, do not create it from scratch. Search online for free GitHub repos or modules first.**

This covers anything that is a solved problem: pathfinding, field-of-view, shaders and filters, matchmaking ratings (Glicko-2), WebSocket room handling, input handling, audio, schema validation, UI components, test utilities.

How to search and choose:

1. Search GitHub and npm for at least two candidates. Note them in your plan.
2. A candidate must pass **all** of these:
   - **Licence:** MIT, Apache-2.0, BSD, ISC or MPL-2.0. Do not add GPL, AGPL, LGPL or "no licence" code without asking me first.
   - **Maintained:** a commit or release in the last 18 months, and open issues are being answered.
   - **Used:** a reasonable number of dependents or stars for its niche; not a single-author experiment with no users.
   - **Safe:** no known vulnerabilities (`pnpm audit`), no install scripts doing anything unexpected, typed (ships types or has `@types`).
   - **Fits:** works in the browser and/or Node as needed, tree-shakeable for client code, and does not pull in a framework we don't use.
3. Prefer, in this order: an existing dependency we already have → a small focused package → a larger well-known library → vendoring a small file with its licence header kept → writing it ourselves.
4. Record the choice in `docs/DECISIONS.md`: what you picked, the alternatives, and why.
5. If nothing passes, say so, then write it yourself, small and tested.

Exception: never outsource `packages/sim` rules logic to a third-party package. Libraries may help it (e.g. a pure pathfinding helper), but the game rules are ours.

## 3. Development workflow

- **Plan first.** Before writing code for a task, post a plan of 3–10 bullets: files you'll touch, approach, tests you'll add, open questions. Wait for a go-ahead on anything in section 1.6.
- **Small steps.** One concern per change. A change touches the fewest files it can. No drive-by refactors; list them as suggestions instead.
- **Branches and commits.** One branch per task (`feat/…`, `fix/…`, `chore/…`). Conventional commit messages (`feat(sim): add door collision rule`). Never commit directly to `main`. Never force-push shared branches.
- **Run before you claim.** Before saying something works, run the tests, the type checker and the linter, and report the actual output. "Should work" is not a status.
- **Keep it running.** `pnpm dev` must start the client and server with one command at every commit.
- **Update docs in the same change.** If behaviour changes, update `PROMPT.md` references, `docs/DECISIONS.md` or `docs/BALANCE.md` in the same commit.

## 4. Code quality rules

- **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). No `any`; use `unknown` and narrow. No `@ts-ignore`; `@ts-expect-error` only with a comment explaining why.
- **ESLint + Prettier** must pass with zero warnings. Do not disable a rule inline without a reason in the comment.
- **Validate at the edges.** Every message from the network and every content file is parsed with a Zod schema. Inside the sim, trust the types.
- **Immutable sim state.** `resolveTick` returns a new state; it never mutates its input.
- **Name things after the game.** `courier`, `neuralLoad`, `dumpshock`, not `obj1`, `val`, `flag2`.
- **Functions:** under ~40 lines; one job each. Tick steps are separate, named, ordered functions in one file.
- **No magic numbers** in logic. Every tunable value comes from `packages/content`.
- **Comments explain why, not what.** No commented-out code in commits.
- **Errors:** never swallow an error silently. Log it with context or rethrow. User-facing errors say what happened and what to do.
- **Performance budgets** (client): 60 fps on a mid-range laptop; initial bundle under 2 MB gzipped; no per-frame allocations in the render loop; no layout thrash in the HUD.
- **Accessibility:** every control reachable by keyboard with a visible focus state; colour is never the only signal; honour `prefers-reduced-motion`.

## 5. Testing rules

- **Every sim rule has a test.** New rule → new test in the same commit. Fixed bug → a test that failed before the fix.
- **Golden replay test** (the scripted Standard run in `PROMPT.md` §5.4) must always pass. If you must change its snapshot, explain exactly which rule changed and why.
- **Property tests** (fast-check) for: route lengths, hunters following telegraphs, overload never decreasing, `legalActions` never producing an action that throws.
- **Server tests** for every simultaneous-action conflict rule (`PROMPT.md` §6.3) and for rejecting illegal actions.
- **Balance runner** (`tools/balance`) runs in CI on any change to `packages/content` or `packages/sim` and prints win rates. A change that moves any rate outside its target band fails the build unless `docs/BALANCE.md` records it as intended.
- Coverage on `packages/sim`: 90 % lines minimum. Don't chase coverage elsewhere; test behaviour that matters.
- Never delete or skip a failing test to make CI green. Fix the code or ask.

## 6. Debugging rules

1. **Reproduce first.** Before changing code, reproduce the bug and state the exact steps, seed and tick. If it involves a match, capture the seed + input log and add it to `tests/repros/`.
2. **Write the failing test before the fix.** The repro becomes a test.
3. **Find the cause, not a symptom.** State the root cause in one or two sentences before proposing a fix. No guess-and-check edits; if you're guessing, add logging and gather evidence first.
4. **One change at a time.** Change one thing, rerun, observe. Revert anything that didn't help.
5. **Use the tools we have:** the replay viewer (step tick by tick through a recorded match), the sim's event log, `DEBUG=wetwire:*` namespaced logging, and the browser's performance panel for frame drops.
6. **Desync = top priority.** If client and server ever disagree, stop feature work, capture the seed and inputs, and find the non-determinism (usual suspects: unseeded randomness, object key ordering, floating-point accumulation, time-based logic in the sim).
7. **Clean up.** Remove temporary logging before committing. Keep useful debug tooling behind the `DEBUG` flag.
8. **Report it.** Your summary of a fix states: symptom, root cause, fix, test added, and anything similar that might have the same bug.
9. **Three strikes.** If three attempts haven't fixed it, stop, summarise what you've learned and what you've ruled out, and ask me before trying more.

## 7. Security

- No secrets in the repo. Use `.env` (git-ignored) and document variables in `.env.example`.
- Rate-limit every socket and HTTP endpoint. Authenticate with short-lived tokens.
- `viewFor()` must never leak hidden data; test it for every role.
- Run `pnpm audit` before adding or upgrading a dependency.

## 8. How to report back

End every task with:

- **Done:** what changed, in a few bullets.
- **Proof:** test, type-check and lint output (summarised), plus screenshots for anything visual.
- **Not done / stubbed:** be explicit.
- **Decisions:** new entries in `docs/DECISIONS.md` or `docs/BALANCE.md`.
- **Next:** the three most useful next steps.

Never claim something is finished, tested or working unless you have run it and seen it pass.
