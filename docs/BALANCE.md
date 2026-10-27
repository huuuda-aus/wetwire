# Balance log

Every change to a number in `packages/content/data/balance.json` gets an entry: before, after, reason. Change one number per patch.

## 2026-10-27 · Phase 2 baseline (no numbers changed)

All numbers were moved from the Phase 1 `CONFIG` into `packages/content/data/balance.json` unchanged. One number was added, `net.bodyThreatRange = 4`, which only drives a UI warning (see DECISIONS.md).

### Balance runner baseline

`pnpm balance` (2000 matches per payload) with the §5.4 scripted bot and its default noise (`wrenMistake 0.08`, `kadeLapse 0.10`, `wrenDawdle 0`):

| Payload  | Delivered | Phase 1 target | Verdict     | Avg ticks | Taken | Flatlined |
| -------- | --------- | -------------- | ----------- | --------- | ----- | --------- |
| Light    | 86.0 %    | ≥ 85 %         | in band     | 20.7      | 12.8% | 1.3%      |
| Standard | 84.1 %    | 55–75 %        | OUT OF BAND | 20.3      | 11.3% | 4.6%      |
| Heavy    | 77.2 %    | 25–45 %        | OUT OF BAND | 19.7      | 9.4%  | 13.4%     |

**Not recorded as intended.** The runner exits non-zero while a band is missed, so a CI step wired to it would fail until this is resolved.

### What I tried, and why I stopped

The §5.4 bands were measured with the original Phase 1 greedy bot, which the spec does not define. The bot here follows the §5.4 description (scripted Kade, greedy Wren avoiding tiles next to a hunter's telegraphed step). Its skill is a free parameter, not a game number, so I swept it rather than touch the sim:

- Wren mistake rate 0.03 to 0.35 with Kade lapse 0.1 to 0.5: Light and Standard stay within about 5 points of each other at every setting, so Light ≥ 85 % and Standard ≤ 75 % cannot both hold.
- Added a "dawdle" knob (Wren waits instead of stepping). Delivery drops for every payload together, again without separating Light from Standard.

Why: with the scripted run, hunters decide most matches (Taken), not overload, so payload size barely matters. The original bot must have spent many more ticks on the board, probably sometimes taking the long route, which is where overload bites. I did not fit the bot to the bands, because that would hide the question rather than answer it.

**Needs a director decision:** either describe the original bot's behaviour so I can reproduce it, or accept that these bands apply to a bot we no longer have and set new ones from this runner.

## 2026-10-27 · Phase 4: Razor's kit completed (Sprint, Heavy strike, Guard) — a measured side-effect, not a tuned number

No `balance.json` number was changed to tune this; recording it because CLAUDE.md requires any run that moves a rate out of band to be logged, intended or not, and this one **was not** intended.

| Payload  | Delivered (before) | Delivered (after) | Target  | Verdict (after) |
| -------- | ------------------ | ----------------- | ------- | --------------- |
| Light    | 86.0 %             | 80.0 %            | ≥ 85 %  | OUT OF BAND     |
| Standard | 84.1 %             | 75.4 %            | 55–75 % | OUT OF BAND     |
| Heavy    | 77.2 %             | 67.7 %            | 25–45 % | OUT OF BAND     |

(2000 matches/payload, same bot skill as the baseline row above: `wrenMistake 0.08`, `kadeLapse 0.10`.)

**Root cause, found before writing this down, not guessed:** `legalCourierActions` now also returns `sprint` entries. The balance bot's deliberate pathing (`greedyWren` in `tools/balance/src/bots.ts`) explicitly filters to `a.type === 'move'` and is unaffected — but the bot's **random-mistake** roll (`wrenMistake`, an 8 %-per-tick chance of picking uniformly at random from Wren's _entire_ legal action list) now sometimes picks a random Sprint instead of a random move. A random Sprint costs more overload (+8, on top of the payload rate) and can carry her two tiles into a worse square than a random single-tile move would, with no danger-avoidance logic applied (that logic only runs in the deliberate path). Delivery rates dropped across all three payloads together, consistent with "mistakes got more expensive," not with any payload-specific effect.

**What this does and doesn't tell us:** it confirms Sprint's addition didn't silently break anything (no crash, no illegal state, the existing golden/parity/property tests all still pass) — but it is **not** a measurement of whether Sprint, Heavy strike or Guard are themselves well-balanced. Nothing in `tools/balance` ever _chooses_ to use them deliberately; the only way they appear in a simulated match is as one of several equally-likely random mistakes. Real balance testing for these three needs a bot that can decide to Sprint to close a gap, Heavy strike instead of Strike when it has a free tick, or Guard when an ally's about to be hit — none of which exists yet. I did not build that bot for this slice (it's a meaningfully sized tool in its own right); flagging it rather than presenting this table as proof of anything about the new kit pieces.

**Not re-tuned to restore the old numbers.** Changing the bot's mistake-weighting to exclude Sprint would hide this finding, not resolve it, so I left it as discovered.
