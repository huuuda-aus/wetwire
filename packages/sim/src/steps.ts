// The tick, in the exact order of PROMPT.md §3.6. Later phases insert steps; they never reorder these
// without a docs/DECISIONS.md entry.
import {
  costOf,
  isHack,
  legalCourierActions,
  legalDeckerActions,
  legalRazorActions,
  sameAction,
} from './actions.ts';
import { loadoutSlotCost } from './loadout.ts';
import {
  bodyApproachTiles,
  distAt,
  distField,
  dirVec,
  hunterSees,
  inCone,
  manhattan,
  passable,
  stepToward,
} from './geometry.ts';
import type {
  Action,
  EventKind,
  Fx,
  GameEvent,
  GameEventType,
  HackAction,
  HunterState,
  Layer,
  MatchState,
} from './types.ts';
import { must } from './util.ts';

export interface TickContext {
  readonly s: MatchState;
  readonly events: GameEvent[];
  hacked: boolean;
}

function emit(
  ctx: TickContext,
  type: GameEventType,
  layer: Layer,
  kind: EventKind,
  text: string,
  fx: Fx | null = null,
): void {
  ctx.events.push({ tick: ctx.s.tick, type, layer, kind, text, fx });
}
const nodeLabel = (s: MatchState, id: string): string => must(s.rules.nodes[id], 'node').label;
const own = (s: MatchState, id: string): void => {
  if (!s.owned.includes(id)) s.owned.push(id);
};

function applyHack(ctx: TickContext, a: HackAction): void {
  const { s } = ctx;
  const net = s.rules.balance.net;
  const cost = net.costs[a.type];
  s.kade.load += cost.load;
  s.kade.trace += cost.trace;
  ctx.hacked = true;
  s.stats.hacks += 1;
  const hunter = s.hunters.find((h) => h.id === a.target);
  const at = hunter ?? must(s.rules.nodes[a.target], 'hack target');
  const fx: Fx = { kind: 'hack', x: at.x, y: at.y, cam: null };
  if (a.type === 'blind') {
    must(
      s.cams.find((c) => c.node === a.target),
      'camera',
    ).blind = net.blindTicks;
    own(s, a.target);
    emit(
      ctx,
      'HackApplied',
      'NET',
      'good',
      `Kade blinds ${nodeLabel(s, a.target)} for ${net.blindTicks} ticks`,
      fx,
    );
  } else if (a.type === 'unlock') {
    s.doors[must(must(s.rules.nodes[a.target], 'door node').ctl, 'door control')] = true;
    own(s, a.target);
    emit(ctx, 'HackApplied', 'NET', 'good', `Kade unlocks ${nodeLabel(s, a.target)}`, fx);
  } else if (a.type === 'ice') {
    s.ice -= 1;
    own(s, a.target);
    emit(
      ctx,
      'HackApplied',
      'NET',
      'good',
      s.ice > 0 ? 'Kade strips an ICE layer' : 'Kade breaks the ICE',
      fx,
    );
  } else {
    must(hunter, 'burn target').stun = net.burnStun;
    emit(ctx, 'HackApplied', 'NET', 'good', `Kade burns ${a.target}'s implants`, fx);
  }
}

/** Step 1: hacks land before anyone moves, so a door unlocked now can be walked through now. */
export function stepNet(ctx: TickContext, requested: Action | undefined): void {
  const { s } = ctx;
  const legal = legalDeckerActions(s);
  if (legal.length === 0) return;
  const a = legal.find((l) => sameAction(l, requested)) ?? { type: 'hold' as const };
  if (s.kade.shock > 0) emit(ctx, 'KadeDumpshocked', 'NET', 'bad', `Kade is in dumpshock (${s.kade.shock})`);
  if (a.type === 'route') {
    s.kade.node = a.target;
    emit(ctx, 'KadeRouted', 'NET', 'info', `Kade routes to ${nodeLabel(s, a.target)}`);
  } else if (a.type === 'lock') {
    const ctl = must(must(s.rules.nodes[a.target], 'door node').ctl, 'door control');
    s.doors[ctl] = false;
    emit(ctx, 'DoorLocked', 'NET', 'info', `Kade locks ${nodeLabel(s, a.target)}`);
  } else if (isHack(a)) applyHack(ctx, a);
}

/** Step 2. */
export function stepWren(ctx: TickContext, requested: Action | undefined): void {
  const { s } = ctx;
  const w = s.wren;
  const a = legalCourierActions(s).find((l) => sameAction(l, requested)) ?? { type: 'wait' as const };
  w.masked = false;
  if (a.type === 'mask') {
    w.masked = true;
    w.overload += s.rules.balance.maskCost;
    emit(ctx, 'CourierMasked', 'STREET', 'info', 'Wren masks her signal');
  } else if (a.type === 'move') {
    const [dx, dy] = dirVec(a.dir);
    if (passable(s, w.x + dx, w.y + dy)) {
      w.x += dx;
      w.y += dy;
    } else
      emit(ctx, 'CourierBumped', 'STREET', 'info', 'Wren bumps a locked door', {
        kind: 'bump',
        x: w.x + dx,
        y: w.y + dy,
        cam: null,
      });
  } else if (a.type === 'sprint') {
    w.overload += s.rules.balance.sprintCost;
    const [dx, dy] = dirVec(a.dir);
    let moved = 0;
    for (let step = 0; step < 2; step++) {
      if (!passable(s, w.x + dx, w.y + dy)) break;
      w.x += dx;
      w.y += dy;
      moved += 1;
    }
    emit(
      ctx,
      'CourierSprinted',
      'STREET',
      'info',
      moved === 2
        ? 'Wren sprints 2 tiles'
        : moved === 1
          ? 'Wren sprints 1 tile, blocked'
          : 'Wren sprints into a wall',
    );
  }
}

function defeatHunter(ctx: TickContext, h: HunterState): void {
  h.defeated = true;
  h.mode = 'patrol';
  h.target = null;
  h.plan = null;
  emit(ctx, 'HunterDefeated', 'STREET', 'good', `${h.id} is taken down`);
}

function strikeHunter(ctx: TickContext, h: HunterState, damage: number, heavy: boolean): void {
  h.body -= damage;
  emit(
    ctx,
    heavy ? 'HeavyStrikeLanded' : 'RazorStruck',
    'STREET',
    'good',
    `Razor ${heavy ? 'lands a heavy strike on' : 'strikes'} ${h.id} (body ${Math.max(0, h.body)})`,
    { kind: 'hit', x: h.x, y: h.y, cam: null },
  );
  if (h.body <= 0) defeatHunter(ctx, h);
}

/** Step 2.5 (new in Phase 4, documented insertion — never reorders the original §3.6 steps):
 * Razor's action, resolved before anyone moves, same as Kade's hacks land before Wren's move. */
export function stepRazor(ctx: TickContext, requested: Action | undefined): void {
  const { s } = ctx;
  const r = s.razor;
  r.guarding = null; // Guard covers one tick only; never carries over from the last one.

  // A committed heavy strike resolves on its own, ignoring whatever was requested this tick —
  // she's locked into the swing. Fizzles with no damage if the target left range or went down
  // in the meantime (avoidable by moving away, same spirit as a telegraphed hunter step).
  if (r.windup) {
    const target = r.windup.target;
    r.windup = null;
    const h = s.hunters.find((x) => x.id === target);
    if (h && !h.defeated && manhattan(h, r) <= 1) {
      strikeHunter(ctx, h, s.rules.balance.razor.heavyHitDamage, true);
    } else {
      emit(ctx, 'HeavyStrikeMissed', 'STREET', 'info', "Razor's heavy strike finds nothing there");
    }
    return;
  }

  const a = legalRazorActions(s).find((l) => sameAction(l, requested)) ?? { type: 'wait' as const };
  if (a.type === 'move') {
    const [dx, dy] = dirVec(a.dir);
    if (passable(s, r.x + dx, r.y + dy)) {
      r.x += dx;
      r.y += dy;
    }
  } else if (a.type === 'strike') {
    const h = s.hunters.find((x) => x.id === a.target);
    if (h && !h.defeated) strikeHunter(ctx, h, s.rules.balance.razor.hitDamage, false);
  } else if (a.type === 'heavy-strike') {
    r.windup = { target: a.target };
    const h = must(
      s.hunters.find((x) => x.id === a.target),
      'heavy strike target',
    );
    emit(ctx, 'HeavyStrikeWindup', 'STREET', 'info', `Razor winds up a heavy strike on ${h.id}`, {
      kind: 'hit',
      x: h.x,
      y: h.y,
      cam: null,
    });
  } else if (a.type === 'guard') {
    r.guarding = a.target;
    emit(ctx, 'RazorGuarded', 'STREET', 'info', `Razor guards ${a.target === 'wren' ? 'Wren' : 'Kade'}`);
  }
}

/** Step 3: each unstunned hunter takes exactly the step it telegraphed. */
export function stepHunters(ctx: TickContext): void {
  const { s } = ctx;
  for (const h of s.hunters) {
    if (h.defeated || h.stun > 0 || !h.plan || !passable(s, h.plan.x, h.plan.y)) continue;
    h.fx = h.plan.x - h.x;
    h.fy = h.plan.y - h.y;
    h.x = h.plan.x;
    h.y = h.plan.y;
    if (h.mode !== 'patrol') continue;
    const [gx, gy] = must(h.wps[h.wpi], 'waypoint');
    if (h.x === gx && h.y === gy) h.wpi = (h.wpi + 1) % h.wps.length;
  }
}

const alert = (s: MatchState, h: HunterState): void => {
  h.mode = 'hunt';
  h.target = { x: s.wren.x, y: s.wren.y };
  h.memory = s.rules.balance.hunter.memory;
};

/** Step 4. */
export function stepCameras(ctx: TickContext): void {
  const { s } = ctx;
  s.cams.forEach((cam, i) => {
    if (cam.blind > 0 || s.wren.masked || !inCone(s, i, s.tick, s.wren)) return;
    s.stats.alerts += 1;
    emit(ctx, 'CameraSpotted', 'STREET', 'bad', `${cam.id} spots Wren, hunters alerted`, {
      kind: 'spot',
      x: s.wren.x,
      y: s.wren.y,
      cam: cam.id,
    });
    for (const h of s.hunters) if (h.mode !== 'body' && !h.defeated) alert(s, h);
  });
}

/** Step 5. */
export function stepSight(ctx: TickContext): void {
  const { s } = ctx;
  for (const h of s.hunters) {
    if (h.defeated || h.stun > 0 || h.mode === 'body') continue;
    if (hunterSees(s, h)) {
      if (h.mode !== 'hunt') emit(ctx, 'HunterSpotted', 'STREET', 'bad', `${h.id} spots Wren`);
      alert(s, h);
    } else if (h.mode === 'hunt') {
      h.memory -= 1;
      const atTarget = h.target !== null && h.x === h.target.x && h.y === h.target.y;
      if (h.memory <= 0 || atTarget) {
        h.mode = 'patrol';
        h.target = null;
        emit(ctx, 'HunterLostTrail', 'STREET', 'good', `${h.id} loses the trail`);
      }
    }
  }
}

function hitKade(ctx: TickContext, h: HunterState): void {
  const { s } = ctx;
  const { net, hunter } = s.rules.balance;
  const k = s.kade;
  const t = s.rules.district.terminal;
  h.mode = 'patrol';
  h.target = null;
  h.stun = hunter.stunTicks;
  if (s.razor.guarding === 'kade') {
    s.razor.guarding = null; // blocks the next hit, singular -- consumed, not a tick-long shield
    emit(ctx, 'RazorBlocked', 'STREET', 'good', `Razor blocks ${h.id}'s hit on Kade`, {
      kind: 'hit',
      x: t.x,
      y: t.y,
      cam: null,
    });
    return;
  }
  k.body -= 1;
  k.shock = net.bodyHitShock;
  k.shockNew = true;
  k.trace = 0;
  k.load = Math.max(k.load, net.bodyHitLoadFloor);
  if (k.body <= 0) {
    k.flat = true;
    k.shock = 0;
  }
  const text = k.flat
    ? `${h.id} flatlines Kade`
    : `${h.id} reaches Kade's body, dumpshock ${net.bodyHitShock}`;
  emit(ctx, 'KadeHit', 'STREET', 'bad', text, { kind: 'hit', x: t.x, y: t.y, cam: null });
}

function hitRazor(ctx: TickContext, h: HunterState): void {
  const { s } = ctx;
  const { hunter } = s.rules.balance;
  s.razor.body -= hunter.hitDamage;
  h.stun = hunter.stunTicks;
  emit(ctx, 'RazorHit', 'STREET', 'bad', `${h.id} hits Razor (body ${Math.max(0, s.razor.body)})`, {
    kind: 'hit',
    x: s.razor.x,
    y: s.razor.y,
    cam: null,
  });
  if (s.razor.body <= 0) emit(ctx, 'RazorDowned', 'STREET', 'bad', 'Razor is down');
}

/** Step 6. A hunter attacks whoever it is adjacent to, preferring Wren (the original rule,
 * unchanged), then Razor, then Kade's body if it was already heading there. */
export function stepAttacks(ctx: TickContext): void {
  const { s } = ctx;
  const { hunter } = s.rules.balance;
  for (const h of s.hunters) {
    if (h.defeated || h.stun > 0) continue;
    if (manhattan(h, s.wren) <= 1) {
      h.stun = hunter.stunTicks;
      if (s.razor.guarding === 'wren') {
        s.razor.guarding = null; // blocks the next hit, singular -- consumed, not a tick-long shield
        emit(ctx, 'RazorBlocked', 'STREET', 'good', `Razor blocks ${h.id}'s hit on Wren`, {
          kind: 'hit',
          x: s.wren.x,
          y: s.wren.y,
          cam: null,
        });
      } else {
        s.wren.body -= hunter.hitDamage;
        emit(ctx, 'CourierHit', 'STREET', 'bad', `${h.id} hits Wren (body ${Math.max(0, s.wren.body)})`, {
          kind: 'hit',
          x: s.wren.x,
          y: s.wren.y,
          cam: null,
        });
      }
    } else if (s.razor.body > 0 && manhattan(h, s.razor) <= 1) {
      hitRazor(ctx, h);
    } else if (h.mode === 'body' && !s.kade.flat && manhattan(h, s.rules.district.terminal) <= 1)
      hitKade(ctx, h);
  }
}

function sendBodyHunter(ctx: TickContext): void {
  const { s } = ctx;
  if (s.hunters.some((h) => h.mode === 'body')) return;
  const field = distField(s, bodyApproachTiles(s), false);
  let best: HunterState | null = null;
  let bestDist = Infinity;
  for (const h of s.hunters) {
    if (h.defeated) continue;
    const d = distAt(s, field, h.x, h.y);
    if (d >= 0 && d < bestDist) {
      best = h;
      bestDist = d;
    }
  }
  if (!best) return;
  best.mode = 'body';
  best.target = null;
  emit(ctx, 'TraceMaxed', 'NET', 'bad', `Trace maxed, ${best.id} heads for Kade's body`);
}

/** Step 7. Dumpshock decays before a new overload shock is applied, as the spec orders it. */
export function stepMeters(ctx: TickContext): void {
  const { s } = ctx;
  const { net, payloads } = s.rules.balance;
  const k = s.kade;
  s.wren.overload += must(payloads[s.payload], 'payload').rate;
  if (!ctx.hacked) {
    k.load = Math.max(0, k.load - net.decay.load);
    k.trace = Math.max(0, k.trace - net.decay.trace);
  }
  if (k.shock > 0 && !k.shockNew) k.shock -= 1;
  // §7.2: installed chrome is a permanent tax on the same neural budget hacking spends from,
  // so a Kade carrying implants dumpshocks sooner for the same amount of hacking.
  const neuralUsed = k.load + loadoutSlotCost(s.rules.implants, k.loadout);
  if (neuralUsed >= net.loadMax && !k.flat) {
    k.shock = net.overloadShock;
    k.load = net.loadAfterShock;
    emit(ctx, 'KadeDumpshocked', 'NET', 'bad', `Kade overloads, dumpshock ${net.overloadShock}`);
  }
  if (k.trace >= net.traceMax) {
    k.trace = net.traceMax;
    if (!k.flat) sendBodyHunter(ctx);
  }
  if (k.flat) for (const h of s.hunters) if (h.mode === 'body') h.mode = 'patrol';
  for (const c of s.cams) c.blind = Math.max(0, c.blind - 1);
  for (const h of s.hunters) h.stun = Math.max(0, h.stun - 1);
  k.shockNew = false;
}

/** Step 8. Delivered outranks Taken and Flatlined, in the order the spec lists them. */
export function stepEnd(ctx: TickContext): void {
  const { s } = ctx;
  const { downloadTicks, overloadMax } = s.rules.balance;
  const r = s.rules.district.receiver;
  if (s.wren.x === r.x && s.wren.y === r.y) {
    s.download += 1;
    emit(
      ctx,
      'ReadOut',
      'STREET',
      'good',
      `Receiver reads out ${Math.min(s.download, downloadTicks)}/${downloadTicks}`,
    );
  } else s.download = 0;
  if (s.download >= downloadTicks) s.outcome = 'delivered';
  else if (s.wren.body <= 0) s.outcome = 'taken';
  else if (s.wren.overload >= overloadMax) s.outcome = 'flatlined';
  if (s.outcome !== null) s.status = 'over';
}

function planPatrol(s: MatchState, h: HunterState): { x: number; y: number } | null {
  for (let tries = 0; tries < h.wps.length; tries++) {
    const [gx, gy] = must(h.wps[h.wpi], 'waypoint');
    if (h.x === gx && h.y === gy) {
      h.wpi = (h.wpi + 1) % h.wps.length;
      continue;
    }
    const step = stepToward(s, h, [{ x: gx, y: gy }]);
    if (step) return step;
    h.wpi = (h.wpi + 1) % h.wps.length; // no path: skip the waypoint
  }
  return null;
}

/** The telegraph: each hunter commits to its next step now, and the UI draws it. */
export function planHunters(s: MatchState): void {
  const terminal = s.rules.district.terminal;
  for (const h of s.hunters) {
    if (h.defeated) {
      h.plan = null;
      continue;
    }
    if (h.mode === 'patrol') h.plan = planPatrol(s, h);
    else if (h.mode === 'hunt') h.plan = h.target ? stepToward(s, h, [h.target]) : null;
    else h.plan = manhattan(h, terminal) <= 1 ? null : stepToward(s, h, bodyApproachTiles(s));
  }
}

/** Step 9. */
export function stepNext(ctx: TickContext): void {
  if (ctx.s.status !== 'play') return;
  ctx.s.tick += 1;
  planHunters(ctx.s);
}

export { costOf };
