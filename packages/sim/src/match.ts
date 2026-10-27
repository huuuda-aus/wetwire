import { KADE, RAZOR, WREN } from './actions.ts';
import { camFacing } from './geometry.ts';
import { validateLoadout } from './loadout.ts';
import {
  planHunters,
  stepAttacks,
  stepCameras,
  stepEnd,
  stepHunters,
  stepMeters,
  stepNet,
  stepNext,
  stepRazor,
  stepSight,
  stepWren,
  type TickContext,
} from './steps.ts';
import type { Balance, Content, District, Implant } from '@wetwire/content';
import type {
  MatchSetup,
  MatchState,
  PlayerId,
  PlayerView,
  Ruleset,
  Telegraph,
  TickInput,
  TickResult,
} from './types.ts';
import { must } from './util.ts';

export function buildRuleset(district: District, balance: Balance, implants: readonly Implant[]): Ruleset {
  const cols = must(district.rows[0], 'map row').length;
  const rows = district.rows.length;
  const wall = new Uint8Array(cols * rows);
  const doorGrid: (string | null)[] = new Array<string | null>(cols * rows).fill(null);
  district.rows.forEach((row, y) => {
    for (let x = 0; x < cols; x++) wall[y * cols + x] = row[x] === '#' ? 1 : 0;
  });
  for (const d of district.doors) doorGrid[d.y * cols + d.x] = d.id;
  const nodes = Object.fromEntries(district.nodes.map((n) => [n.id, n]));
  const neighbours: Record<string, string[]> = Object.fromEntries(district.nodes.map((n) => [n.id, []]));
  for (const [a, b] of district.links) {
    must(neighbours[a], 'link node').push(b);
    must(neighbours[b], 'link node').push(a);
  }
  return { district, balance, implants, cols, rows, wall, doorGrid, nodes, neighbours };
}

/** Picks `setup.districtId` from `content.districts`; falls back to `content.district` if omitted or unknown. */
function resolveDistrict(content: Content, setup: MatchSetup): District {
  if (setup.districtId === undefined) return content.district;
  return content.districts.find((d) => d.id === setup.districtId) ?? content.district;
}

/** Throws if a starting loadout costs more than the neural budget: see MatchSetup.wrenLoadout. */
function checkedLoadout(content: Content, who: string, implantIds: readonly string[] | undefined): string[] {
  const ids = implantIds ?? [];
  const check = validateLoadout(content.implants, content.balance.neural.capacity, ids);
  if (!check.ok)
    throw new Error(`wetwire sim: ${who}'s loadout is illegal: ${check.reason ?? 'unknown reason'}`);
  return [...ids];
}

export function createMatch(content: Content, setup: MatchSetup, seed: number): MatchState {
  const district = resolveDistrict(content, setup);
  const { balance } = content;
  const rules = buildRuleset(district, balance, content.implants);
  const payload = setup.payload in balance.payloads ? setup.payload : balance.defaultPayload;
  const wrenLoadout = checkedLoadout(content, 'Wren', setup.wrenLoadout);
  const kadeLoadout = checkedLoadout(content, 'Kade', setup.kadeLoadout);
  const s: MatchState = {
    rules,
    seed,
    tick: 1,
    payload,
    status: 'play',
    outcome: null,
    wren: {
      x: district.wrenStart.x,
      y: district.wrenStart.y,
      body: balance.wrenBody,
      overload: 0,
      masked: false,
      loadout: wrenLoadout,
    },
    kade: {
      node: 'TERM',
      load: 0,
      trace: 0,
      body: balance.kadeBody,
      shock: 0,
      shockNew: false,
      flat: false,
      loadout: kadeLoadout,
    },
    // No dedicated spawn marker in district content yet (§ decisions): Razor starts at Wren's
    // own start tile.
    razor: { x: district.wrenStart.x, y: district.wrenStart.y, body: balance.razor.body },
    doors: Object.fromEntries(district.doors.map((d) => [d.id, false])),
    ice: balance.net.iceLayers,
    owned: [],
    cams: district.cams.map((c) => ({ ...c, blind: 0 })),
    hunters: district.hunters.map((h) => {
      const [fx, fy] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][h.face] ?? [0, 0];
      return {
        id: h.id,
        x: h.x,
        y: h.y,
        fx: fx ?? 0,
        fy: fy ?? 0,
        mode: 'patrol',
        wps: h.wps,
        wpi: h.wpi,
        target: null,
        memory: 0,
        stun: 0,
        plan: null,
        body: balance.hunter.body,
        defeated: false,
      };
    }),
    download: 0,
    stats: { alerts: 0, hacks: 0 },
  };
  planHunters(s);
  return s;
}

/** Copy everything that changes during a tick. `rules` and static waypoint lists are shared. */
function cloneState(s: MatchState): MatchState {
  return {
    ...s,
    wren: { ...s.wren },
    kade: { ...s.kade },
    razor: { ...s.razor },
    doors: { ...s.doors },
    owned: [...s.owned],
    cams: s.cams.map((c) => ({ ...c })),
    hunters: s.hunters.map((h) => ({
      ...h,
      target: h.target && { ...h.target },
      plan: h.plan && { ...h.plan },
    })),
    stats: { ...s.stats },
  };
}

/** Pure: the same state and input always give the same result, and `prev` is never mutated. */
export function resolveTick(prev: MatchState, input: TickInput): TickResult {
  if (prev.status !== 'play') return { state: prev, events: [] };
  const ctx: TickContext = { s: cloneState(prev), events: [], hacked: false };
  stepNet(ctx, input.actions[KADE]);
  stepWren(ctx, input.actions[WREN]);
  stepRazor(ctx, input.actions[RAZOR]);
  stepHunters(ctx);
  stepCameras(ctx);
  stepSight(ctx);
  stepAttacks(ctx);
  stepMeters(ctx);
  stepEnd(ctx);
  stepNext(ctx);
  return { state: ctx.s, events: ctx.events };
}

/** Hunter intents and the next camera turns: everything the UI may draw as a promise. */
export function telegraphs(s: MatchState): Telegraph[] {
  const out: Telegraph[] = [];
  for (const h of s.hunters) {
    if (h.plan && h.stun === 0)
      out.push({ kind: 'hunterStep', id: h.id, from: { x: h.x, y: h.y }, to: { ...h.plan } });
  }
  s.cams.forEach((c, i) => {
    const from = camFacing(s, i, s.tick);
    const to = camFacing(s, i, s.tick + 1);
    if (from !== to) out.push({ kind: 'cameraTurn', id: c.id, from, to });
  });
  return out;
}

/** Phase 2 has no hidden information, so every player sees the whole match. Phase 3 narrows this. */
export function viewFor(s: MatchState, _player: PlayerId): PlayerView {
  return s;
}

export function fee(s: MatchState): number {
  const { fee: f, payloads } = s.rules.balance;
  const raw = must(payloads[s.payload], 'payload').fee * (f.base + f.perBody * Math.max(0, s.wren.body));
  return Math.round(raw / f.round) * f.round;
}
