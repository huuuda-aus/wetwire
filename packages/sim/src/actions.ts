import type { Cost } from '@wetwire/content';
import { dirVec, isWall, manhattan } from './geometry.ts';
import type {
  Action,
  CourierAction,
  DeckerAction,
  Dir,
  HackAction,
  MatchState,
  PlayerId,
  RazorAction,
} from './types.ts';
import { must } from './util.ts';

export const WREN: PlayerId = 'wren';
export const KADE: PlayerId = 'kade';
export const RAZOR: PlayerId = 'razor';

const DIRS4: readonly Dir[] = [0, 1, 2, 3];

export function legalCourierActions(s: MatchState): CourierAction[] {
  const open = DIRS4.filter((d) => {
    const [dx, dy] = dirVec(d);
    return !isWall(s.rules, s.wren.x + dx, s.wren.y + dy);
  });
  const moves: CourierAction[] = open.map((dir) => ({ type: 'move', dir }));
  // Offered on the same condition as a plain move; whether the second tile also clears is
  // resolved at tick time (steps.ts), same as a move can bump a locked door.
  const sprints: CourierAction[] = open.map((dir) => ({ type: 'sprint', dir }));
  return [...moves, ...sprints, { type: 'wait' }, { type: 'mask' }];
}

export function legalRazorActions(s: MatchState): RazorAction[] {
  // body <= 0: downed, not dead — she simply can't act for the rest of the match (no respawn
  // system yet, §7.5). This never ends the match: only the payload's own outcomes do that.
  if (s.razor.body <= 0) return [{ type: 'wait' }];
  // Mid-swing on a heavy strike: locked in, same pattern as a stunned hunter or a dumpshocked
  // Kade. The strike resolves on its own in stepRazor regardless of what's requested.
  if (s.razor.windup) return [{ type: 'wait' }];
  const moves: RazorAction[] = DIRS4.filter((d) => {
    const [dx, dy] = dirVec(d);
    return !isWall(s.rules, s.razor.x + dx, s.razor.y + dy);
  }).map((dir) => ({ type: 'move', dir }));
  const targets = s.hunters.filter((h) => !h.defeated && manhattan(h, s.razor) <= 1);
  const strikes: RazorAction[] = targets.map((h) => ({ type: 'strike', target: h.id }));
  const heavyStrikes: RazorAction[] = targets.map((h) => ({ type: 'heavy-strike', target: h.id }));
  const guards: RazorAction[] = [];
  if (manhattan(s.razor, s.wren) <= 1) guards.push({ type: 'guard', target: WREN });
  if (manhattan(s.razor, s.rules.district.terminal) <= 1) guards.push({ type: 'guard', target: KADE });
  return [...moves, ...strikes, ...heavyStrikes, ...guards, { type: 'wait' }];
}

export function legalDeckerActions(s: MatchState): DeckerAction[] {
  const k = s.kade;
  if (k.flat) return [];
  const hold: DeckerAction = { type: 'hold' };
  if (k.shock > 0) return [hold];
  const { nodes, neighbours } = s.rules;
  const here = must(nodes[k.node], 'kade node');
  const around = neighbours[k.node] ?? [];
  const hacks: HackAction[] = [];
  const locks: DeckerAction[] = [];
  for (const id of [k.node, ...around]) {
    const def = must(nodes[id], 'node');
    if (def.type === 'camera' && s.cams.some((c) => c.node === id && c.blind === 0))
      hacks.push({ type: 'blind', target: id });
    if (def.type === 'door' && def.ctl !== null) {
      if (s.doors[def.ctl] === false) hacks.push({ type: 'unlock', target: id });
      else locks.push({ type: 'lock', target: id });
    }
    if (def.type === 'ice' && s.ice > 0) hacks.push({ type: 'ice', target: id });
  }
  for (const h of s.hunters) {
    if (h.stun === 0 && manhattan(here, h) <= s.rules.balance.net.burnRange)
      hacks.push({ type: 'burn', target: h.id });
  }
  const routes: DeckerAction[] = around
    .filter((id) => !(must(nodes[id], 'node').type === 'ice' && s.ice > 0))
    .map((target) => ({ type: 'route', target }));
  return [...hacks, ...locks, ...routes, hold];
}

export function legalActions(s: MatchState, player: PlayerId): Action[] {
  if (s.status !== 'play') return [];
  if (player === WREN) return legalCourierActions(s);
  if (player === KADE) return legalDeckerActions(s);
  if (player === RAZOR) return legalRazorActions(s);
  return [];
}

export const isHack = (a: Action): a is HackAction =>
  a.type === 'blind' || a.type === 'unlock' || a.type === 'ice' || a.type === 'burn';

/** Neural cost of a hack, or null for actions that are free. */
export function costOf(s: MatchState, a: Action): Cost | null {
  return isHack(a) ? s.rules.balance.net.costs[a.type] : null;
}

const dirOf = (a: Action): Dir | null => (a.type === 'move' || a.type === 'sprint' ? a.dir : null);

export function sameAction(a: Action | undefined, b: Action | undefined): boolean {
  if (!a || !b || a.type !== b.type) return false;
  const ta = 'target' in a ? a.target : null;
  const tb = 'target' in b ? b.target : null;
  return ta === tb && dirOf(a) === dirOf(b);
}
