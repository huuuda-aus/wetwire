import { content } from '@wetwire/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  KADE,
  WREN,
  createMatch,
  distField,
  legalActions,
  resolveTick,
  type Action,
  type MatchState,
} from '../src/index.ts';

const PAYLOADS = ['light', 'standard', 'heavy'] as const;

/** Play up to 60 ticks choosing each action by index from the legal list, so every action is legal by construction. */
function playByIndices(payload: string, picks: readonly (readonly [number, number])[]): MatchState[] {
  let s = createMatch(content, { payload }, 1);
  const trail = [s];
  for (const [w, k] of picks) {
    if (s.status !== 'play') break;
    const wren = legalActions(s, WREN);
    const kade = legalActions(s, KADE);
    const actions: Record<string, Action> = {};
    const wa = wren[w % wren.length];
    const ka = kade[k % Math.max(1, kade.length)];
    if (wa) actions[WREN] = wa;
    if (ka) actions[KADE] = ka;
    s = resolveTick(s, { actions }).state;
    trail.push(s);
  }
  return trail;
}

const picks = fc.array(fc.tuple(fc.nat(50), fc.nat(50)), { minLength: 1, maxLength: 60 });
const payload = fc.constantFrom(...PAYLOADS);

describe('properties', () => {
  it('route length is 25 locked and 17 open for any door-order of play', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (dr1, dr2) => {
        const s = createMatch(content, { payload: 'standard' }, 1);
        const open: MatchState = { ...s, doors: { DR1: dr1, DR2: dr2 } };
        const d =
          distField(open, [s.rules.district.receiver], false)[s.wren.y * s.rules.cols + s.wren.x] ?? -1;
        expect(d).toBeGreaterThanOrEqual(17);
        expect(d).toBeLessThanOrEqual(25);
        if (dr1 && dr2) expect(d).toBe(17);
        if (!dr1 && !dr2) expect(d).toBe(25);
      }),
    );
  });

  it('hunters take their telegraphed step unless stunned (or stunned this tick)', () => {
    fc.assert(
      fc.property(payload, picks, (p, ps) => {
        const trail = playByIndices(p, ps);
        for (let i = 0; i + 1 < trail.length; i++) {
          const before = trail[i];
          const after = trail[i + 1];
          if (!before || !after) continue;
          for (const h of before.hunters) {
            if (h.stun > 0 || !h.plan) continue;
            const next = after.hunters.find((x) => x.id === h.id);
            if (!next) throw new Error('hunter vanished');
            const burnedNow = next.stun > 0 && next.x === h.x && next.y === h.y;
            if (!burnedNow) expect([next.x, next.y]).toEqual([h.plan.x, h.plan.y]);
          }
        }
      }),
    );
  });

  it('overload never decreases', () => {
    fc.assert(
      fc.property(payload, picks, (p, ps) => {
        const trail = playByIndices(p, ps);
        for (let i = 0; i + 1 < trail.length; i++) {
          expect(trail[i + 1]?.wren.overload ?? 0).toBeGreaterThanOrEqual(trail[i]?.wren.overload ?? 0);
        }
      }),
    );
  });

  it('every legal action is accepted as given and never throws', () => {
    fc.assert(
      fc.property(payload, picks, (p, ps) => {
        let s = createMatch(content, { payload: p }, 1);
        for (const [w, k] of ps) {
          if (s.status !== 'play') break;
          const wren = legalActions(s, WREN);
          const kade = legalActions(s, KADE);
          const wa = wren[w % wren.length];
          const ka = kade[k % Math.max(1, kade.length)];
          const actions: Record<string, Action> = {};
          if (wa) actions[WREN] = wa;
          if (ka) actions[KADE] = ka;
          const r = resolveTick(s, { actions });
          // Accepted-as-given: a legal hack always shows up as a hack in the stats.
          if (ka && ka.type !== 'hold' && ka.type !== 'route')
            expect(r.state.stats.hacks).toBe(s.stats.hacks + 1);
          s = r.state;
        }
      }),
    );
  });

  it('meters stay inside their bounds', () => {
    fc.assert(
      fc.property(payload, picks, (p, ps) => {
        for (const s of playByIndices(p, ps)) {
          expect(s.kade.load).toBeGreaterThanOrEqual(0);
          expect(s.kade.trace).toBeGreaterThanOrEqual(0);
          expect(s.kade.trace).toBeLessThanOrEqual(content.balance.net.traceMax);
          expect(s.ice).toBeGreaterThanOrEqual(0);
          expect(s.wren.body).toBeLessThanOrEqual(content.balance.wrenBody);
        }
      }),
    );
  });
});
