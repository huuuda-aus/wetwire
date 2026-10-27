// Bots are tools, not rules: they only call the sim's public API (legalActions, resolveTick).
import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import type { Content } from '@wetwire/content';
import {
  KADE,
  WREN,
  createMatch,
  DIRS,
  dirVec,
  distAt,
  distField,
  legalActions,
  legalCourierActions,
  legalDeckerActions,
  manhattan,
  passable,
  resolveTick,
  sameAction,
  type Action,
  type CourierAction,
  type DeckerAction,
  type GameEvent,
  type MatchState,
} from '@wetwire/sim';

/** PROMPT.md §5.4: unlock DOOR-2, route JX-1, blind CAM-C, route JX-2, break ICE twice, route ICE, unlock DOOR-1. */
export const KADE_SCRIPT: readonly DeckerAction[] = [
  { type: 'unlock', target: 'DR2' },
  { type: 'route', target: 'JX1' },
  { type: 'blind', target: 'CAMC' },
  { type: 'route', target: 'JX2' },
  { type: 'ice', target: 'ICE' },
  { type: 'ice', target: 'ICE' },
  { type: 'route', target: 'ICE' },
  { type: 'unlock', target: 'DR1' },
];

/** How human the bot is. Both zero gives the deterministic golden bot. */
export interface BotSkill {
  /** Chance per tick that Wren takes a random legal action instead of the greedy one. */
  wrenMistake: number;
  /** Chance per tick that Kade holds instead of taking his next scripted action. */
  kadeLapse: number;
  /** Chance per tick that Wren waits instead of stepping, which is what makes payload size matter. */
  wrenDawdle: number;
}
export const PERFECT: BotSkill = { wrenMistake: 0, kadeLapse: 0, wrenDawdle: 0 };

export type Rng = ReturnType<typeof xoroshiro128plus>;
export const makeRng = (seed: number): Rng => xoroshiro128plus(seed);
const chance = (rng: Rng, p: number): boolean => p > 0 && uniformInt(rng, 0, 9999) < p * 10000;

/** Greedy step along the shortest route (doors counted as open), avoiding tiles next to any hunter's telegraphed step. */
export function greedyWren(s: MatchState): CourierAction {
  const field = distField(s, [s.rules.district.receiver], true);
  const danger = new Set<string>();
  const mark = (p: { x: number; y: number }): void => {
    danger.add(`${p.x},${p.y}`);
    for (const [dx, dy] of DIRS) danger.add(`${p.x + dx},${p.y + dy}`);
  };
  for (const h of s.hunters) {
    mark(h);
    if (h.plan && h.stun === 0) mark(h.plan);
  }
  const here = distAt(s, field, s.wren.x, s.wren.y);
  if (here === 0 && !danger.has(`${s.wren.x},${s.wren.y}`)) return { type: 'wait' }; // dwell for the read-out
  let best: CourierAction = { type: 'wait' };
  let bestDist = Infinity;
  for (const a of legalCourierActions(s)) {
    if (a.type !== 'move') continue;
    const [dx, dy] = dirVec(a.dir);
    const nx = s.wren.x + dx;
    const ny = s.wren.y + dy;
    if (!passable(s, nx, ny) || danger.has(`${nx},${ny}`)) continue;
    const d = distAt(s, field, nx, ny);
    if (d >= 0 && d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best;
}

export interface BotMind {
  scriptIndex: number;
}

export function scriptedKade(s: MatchState, mind: BotMind, lapse: boolean): DeckerAction {
  const legal = legalDeckerActions(s);
  const next = KADE_SCRIPT[mind.scriptIndex];
  if (next && !lapse && legal.some((a) => sameAction(a, next))) {
    mind.scriptIndex += 1;
    return next;
  }
  const near = s.hunters.find((h) => h.stun === 0 && manhattan(h, s.wren) <= 3);
  const burn = near && legal.find((a) => a.type === 'burn' && a.target === near.id);
  return burn ?? { type: 'hold' };
}

function pickRandom<T>(rng: Rng, items: readonly T[], fallback: T): T {
  return items[uniformInt(rng, 0, items.length - 1)] ?? fallback;
}

export interface MatchRecord {
  state: MatchState;
  events: GameEvent[];
}

export function playMatch(
  content: Content,
  payload: string,
  seed: number,
  skill: BotSkill = PERFECT,
  maxTicks = 80,
): MatchRecord {
  const rng = makeRng(seed);
  let state = createMatch(content, { payload }, seed);
  const mind: BotMind = { scriptIndex: 0 };
  const events: GameEvent[] = [];
  while (state.status === 'play' && state.tick <= maxTicks) {
    const wren: Action = chance(rng, skill.wrenMistake)
      ? pickRandom(rng, legalActions(state, WREN), { type: 'wait' })
      : chance(rng, skill.wrenDawdle)
        ? { type: 'wait' }
        : greedyWren(state);
    const kade = scriptedKade(state, mind, chance(rng, skill.kadeLapse));
    const result = resolveTick(state, { actions: { [WREN]: wren, [KADE]: kade } });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
