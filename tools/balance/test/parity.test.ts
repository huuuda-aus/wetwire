// Differential test: the frozen Phase 1 sim (inside index.html) against the Phase 2 TypeScript sim.
// Same random legal inputs go to both; every tick's state and event log must match.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { content } from '@wetwire/content';
import {
  KADE,
  WREN,
  createMatch,
  legalActions,
  resolveTick,
  type Action,
  type GameEvent,
  type MatchState,
} from '@wetwire/sim';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

interface Phase1Event {
  tick: number;
  layer: string;
  kind: string;
  text: string;
}
interface Phase1State {
  tick: number;
  status: string;
  outcome: string | null;
  wren: Record<string, unknown>;
  kade: Record<string, unknown>;
  doors: Record<string, boolean>;
  ice: number;
  owned: string[];
  download: number;
  stats: Record<string, number>;
  cams: { id: string; blind: number }[];
  hunters: Record<string, unknown>[];
}
interface Phase1Sim {
  createMatch(payload: string): Phase1State;
  resolveTick(s: Phase1State, wren: Action, kade: Action): { state: Phase1State; events: Phase1Event[] };
}

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const source = /<script id="sim">([\s\S]*?)<\/script>/.exec(html)?.[1];
if (!source) throw new Error('Phase 1 sim script not found in index.html');
const phase1 = vm.runInNewContext(`${source}\nSim`, { structuredClone }) as Phase1Sim;

const pick = <T>(xs: readonly T[], i: number): T | undefined => xs[i % Math.max(1, xs.length)];

function project(s: Phase1State | MatchState) {
  const w = s.wren;
  const k = s.kade;
  return {
    tick: s.tick,
    status: s.status,
    outcome: s.outcome,
    wren: { x: w.x, y: w.y, body: w.body, overload: w.overload, masked: w.masked },
    kade: { node: k.node, load: k.load, trace: k.trace, body: k.body, shock: k.shock, flat: k.flat },
    doors: s.doors,
    ice: s.ice,
    owned: [...s.owned].sort(),
    download: s.download,
    stats: s.stats,
    cams: s.cams.map((c) => ({ id: c.id, blind: c.blind })),
    hunters: s.hunters.map((h) => ({
      id: h['id'],
      x: h['x'],
      y: h['y'],
      fx: h['fx'],
      fy: h['fy'],
      mode: h['mode'],
      wpi: h['wpi'],
      target: h['target'],
      memory: h['memory'],
      stun: h['stun'],
      plan: h['plan'],
    })),
  };
}
const plainEvents = (es: readonly (Phase1Event | GameEvent)[]) =>
  es.map((e) => ({ tick: e.tick, layer: e.layer, kind: e.kind, text: e.text }));

describe('Phase 2 sim matches the Phase 1 sim', () => {
  it('agrees tick by tick on random legal play for every payload', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('light', 'standard', 'heavy'),
        fc.array(fc.tuple(fc.nat(60), fc.nat(60)), { minLength: 1, maxLength: 70 }),
        (payload, picks) => {
          let a = phase1.createMatch(payload);
          let b = createMatch(content, { payload }, 1);
          expect(project(b)).toEqual(project(a));
          for (const [wi, ki] of picks) {
            if (b.status !== 'play') break;
            const wren = pick(legalActions(b, WREN), wi) ?? { type: 'wait' as const };
            const kade = pick(legalActions(b, KADE), ki) ?? { type: 'hold' as const };
            const ra = phase1.resolveTick(a, wren, kade);
            const rb = resolveTick(b, { actions: { [WREN]: wren, [KADE]: kade } });
            a = ra.state;
            b = rb.state;
            expect(project(b)).toEqual(project(a));
            expect(plainEvents(rb.events)).toEqual(plainEvents(ra.events));
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
