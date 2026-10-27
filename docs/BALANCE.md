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
