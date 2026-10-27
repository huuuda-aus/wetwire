import type { Cost } from '@wetwire/content';
import { dirVec, isWall, manhattan } from './geometry.ts';
import type { Action, CourierAction, DeckerAction, Dir, HackAction, MatchState, PlayerId } from './types.ts';
import { must } from './util.ts';

export const WREN: PlayerId = 'wren';
export const KADE: PlayerId = 'kade';

const COURIER_DIRS: readonly Dir[] = [0, 1, 2, 3];

export function legalCourierActions(s: MatchState): CourierAction[] {
  const moves: CourierAction[] = COURIER_DIRS.filter((d) => {
    const [dx, dy] = dirVec(d);
    return !isWall(s.rules, s.wren.x + dx, s.wren.y + dy);
  }).map((dir) => ({ type: 'move', dir }));
  return [...moves, { type: 'wait' }, { type: 'mask' }];
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
  for (const id of [k.node, ...around]) {
    const def = must(nodes[id], 'node');
    if (def.type === 'camera' && s.cams.some((c) => c.node === id && c.blind === 0))
      hacks.push({ type: 'blind', target: id });
    if (def.type === 'door' && def.ctl !== null && s.doors[def.ctl] === false)
      hacks.push({ type: 'unlock', target: id });
    if (def.type === 'ice' && s.ice > 0) hacks.push({ type: 'ice', target: id });
  }
  for (const h of s.hunters) {
    if (h.stun === 0 && manhattan(here, h) <= s.rules.balance.net.burnRange)
      hacks.push({ type: 'burn', target: h.id });
  }
  const routes: DeckerAction[] = around
    .filter((id) => !(must(nodes[id], 'node').type === 'ice' && s.ice > 0))
    .map((target) => ({ type: 'route', target }));
  return [...hacks, ...routes, hold];
}

export function legalActions(s: MatchState, player: PlayerId): Action[] {
  if (s.status !== 'play') return [];
  if (player === WREN) return legalCourierActions(s);
  if (player === KADE) return legalDeckerActions(s);
  return [];
}

export const isHack = (a: Action): a is HackAction =>
  a.type === 'blind' || a.type === 'unlock' || a.type === 'ice' || a.type === 'burn';

/** Neural cost of a hack, or null for actions that are free. */
export function costOf(s: MatchState, a: Action): Cost | null {
  return isHack(a) ? s.rules.balance.net.costs[a.type] : null;
}

export function sameAction(a: Action | undefined, b: Action | undefined): boolean {
  if (!a || !b || a.type !== b.type) return false;
  const ta = 'target' in a ? a.target : null;
  const tb = 'target' in b ? b.target : null;
  const da = a.type === 'move' ? a.dir : null;
  const db = b.type === 'move' ? b.dir : null;
  return ta === tb && da === db;
}
