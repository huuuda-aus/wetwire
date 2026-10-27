import { content } from '@wetwire/content';
import { describe, expect, it } from 'vitest';
import {
  KADE,
  WREN,
  createMatch,
  distField,
  legalActions,
  legalDeckerActions,
  resolveTick,
  telegraphs,
  viewFor,
  fee,
  camFacing,
  type Action,
  type MatchState,
} from '../src/index.ts';

const fresh = (payload = 'standard'): MatchState => createMatch(content, { payload }, 1);
const tick = (s: MatchState, wren: Action, kade: Action) =>
  resolveTick(s, { actions: { [WREN]: wren, [KADE]: kade } });
const route = (s: MatchState, dr1: boolean, dr2: boolean): number => {
  const copy: MatchState = { ...s, doors: { DR1: dr1, DR2: dr2 } };
  const field = distField(copy, [s.rules.district.receiver], false);
  return field[s.wren.y * s.rules.cols + s.wren.x] ?? -1;
};
const hunter = (s: MatchState, id: string) => {
  const h = s.hunters.find((x) => x.id === id);
  if (!h) throw new Error(`no hunter ${id}`);
  return h;
};

describe('district geometry', () => {
  it('route is 25 moves with both doors locked and 17 with both open', () => {
    const s = fresh();
    expect(route(s, false, false)).toBe(25);
    expect(route(s, true, true)).toBe(17);
  });

  it('camera facing turns every two ticks', () => {
    const s = fresh();
    expect([1, 2, 3, 4, 5].map((t) => camFacing(s, 0, t))).toEqual([1, 1, 2, 2, 1]);
  });
});

describe('purity', () => {
  it('does not mutate its input and is deterministic', () => {
    const s = fresh();
    const frozen = JSON.stringify({ ...s, rules: null });
    const a = tick(s, { type: 'move', dir: 0 }, { type: 'unlock', target: 'DR2' });
    const b = tick(s, { type: 'move', dir: 0 }, { type: 'unlock', target: 'DR2' });
    expect(JSON.stringify({ ...s, rules: null })).toBe(frozen);
    expect(JSON.stringify({ ...a.state, rules: null })).toBe(JSON.stringify({ ...b.state, rules: null }));
    expect(a.events).toEqual(b.events);
  });

  it('returns the same state object once the match is over', () => {
    const s = { ...fresh(), status: 'over' as const, outcome: 'taken' as const };
    expect(resolveTick(s, { actions: {} }).state).toBe(s);
  });
});

describe('Net and Street ordering', () => {
  it('a door Kade unlocks this tick can be walked through this tick', () => {
    let s = fresh();
    s.wren.x = 3;
    s.wren.y = 8;
    s = tick(s, { type: 'move', dir: 1 }, { type: 'unlock', target: 'DR2' }).state;
    expect([s.wren.x, s.wren.y]).toEqual([4, 8]);
  });

  it('bumping a locked door keeps Wren in place and logs it', () => {
    const s = fresh();
    s.wren.x = 3;
    s.wren.y = 8;
    const r = tick(s, { type: 'move', dir: 1 }, { type: 'hold' });
    expect([r.state.wren.x, r.state.wren.y]).toEqual([3, 8]);
    expect(r.events.some((e) => e.type === 'CourierBumped')).toBe(true);
  });

  it('mask costs 10 overload on top of the payload rate', () => {
    const r = tick(fresh(), { type: 'mask' }, { type: 'hold' });
    expect(r.state.wren.overload).toBe(13);
    expect(r.state.wren.masked).toBe(true);
  });

  it('an illegal requested action falls back to wait / hold', () => {
    const r = tick(fresh(), { type: 'move', dir: 3 }, { type: 'burn', target: 'H-1' });
    expect([r.state.wren.x, r.state.wren.y]).toEqual([1, 9]);
    expect(r.state.stats.hacks).toBe(0);
  });
});

describe('Kade meters', () => {
  it('hack costs and decay follow the spec table', () => {
    let s = fresh();
    s = tick(s, { type: 'wait' }, { type: 'unlock', target: 'DR2' }).state;
    expect([s.kade.load, s.kade.trace]).toEqual([20, 15]);
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect([s.kade.load, s.kade.trace]).toEqual([14, 13]);
  });

  it('load reaching 100 causes dumpshock 3 and resets load to 60', () => {
    const s = fresh();
    s.kade.load = 90;
    s.kade.node = 'JX1';
    const r = tick(s, { type: 'wait' }, { type: 'blind', target: 'CAMC' }).state;
    expect(r.kade.shock).toBe(3);
    expect(r.kade.load).toBe(60);
  });

  it('a dumpshocked Kade can only hold', () => {
    const s = fresh();
    s.kade.shock = 2;
    expect(legalDeckerActions(s)).toEqual([{ type: 'hold' }]);
  });

  it('a flatlined Kade has no actions', () => {
    const s = fresh();
    s.kade.flat = true;
    expect(legalActions(s, KADE)).toEqual([]);
  });

  it('ICE cannot be entered until both layers are broken', () => {
    const s = fresh();
    s.kade.node = 'JX2';
    expect(legalDeckerActions(s).some((a) => a.type === 'route' && a.target === 'ICE')).toBe(false);
    s.ice = 0;
    expect(legalDeckerActions(s).some((a) => a.type === 'route' && a.target === 'ICE')).toBe(true);
  });

  it('breaking ICE twice removes both layers', () => {
    let s = fresh();
    s.kade.node = 'JX2';
    s = tick(s, { type: 'wait' }, { type: 'ice', target: 'ICE' }).state;
    s = tick(s, { type: 'wait' }, { type: 'ice', target: 'ICE' }).state;
    expect(s.ice).toBe(0);
  });
});

describe('hunters', () => {
  it('burn stuns a hunter for two ticks of movement', () => {
    let s = fresh();
    s.kade.node = 'JX2';
    const start = { x: hunter(s, 'H-1').x, y: hunter(s, 'H-1').y };
    s = tick(s, { type: 'wait' }, { type: 'burn', target: 'H-1' }).state;
    expect({ x: hunter(s, 'H-1').x, y: hunter(s, 'H-1').y }).toEqual(start);
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect({ x: hunter(s, 'H-1').x, y: hunter(s, 'H-1').y }).toEqual(start);
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect({ x: hunter(s, 'H-1').x, y: hunter(s, 'H-1').y }).not.toEqual(start);
  });

  it('a hunter adjacent to Wren hits her for 1 body and is stunned', () => {
    const s = fresh();
    const h = hunter(s, 'H-1');
    h.x = 2;
    h.y = 9;
    h.plan = null;
    const r = tick(s, { type: 'wait' }, { type: 'hold' });
    expect(r.state.wren.body).toBe(2);
    expect(hunter(r.state, 'H-1').stun).toBe(1);
    expect(r.events.some((e) => e.type === 'CourierHit')).toBe(true);
  });

  it('a hunter that sees an unmasked Wren starts hunting; a mask hides her unless adjacent', () => {
    const open = fresh();
    const h = hunter(open, 'H-2');
    h.x = 5;
    h.y = 8;
    h.plan = null;
    open.doors['DR2'] = true;
    const seen = tick(open, { type: 'wait' }, { type: 'hold' }).state;
    expect(hunter(seen, 'H-2').mode).toBe('hunt');
    const masked = tick(open, { type: 'mask' }, { type: 'hold' }).state;
    expect(hunter(masked, 'H-2').mode).toBe('patrol');
  });

  it('trace at 100 sends exactly one hunter to Kade, who dumpshocks him on arrival', () => {
    let s = fresh();
    s.kade.trace = 95;
    s.kade.node = 'JX1';
    s = tick(s, { type: 'wait' }, { type: 'blind', target: 'CAMC' }).state;
    expect(s.hunters.filter((h) => h.mode === 'body')).toHaveLength(1);
    const h = s.hunters.find((x) => x.mode === 'body');
    if (!h) throw new Error('no body hunter');
    h.x = 3;
    h.y = 8;
    h.plan = null;
    h.stun = 0;
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(s.kade.body).toBe(1);
    expect(s.kade.shock).toBe(4);
    expect(s.kade.trace).toBe(0);
    expect(s.kade.load).toBe(70 - content.balance.net.decay.load);
  });

  it('a second hit flatlines Kade and releases the body hunter', () => {
    const s = fresh();
    s.kade.body = 1;
    const h = hunter(s, 'H-2');
    h.mode = 'body';
    h.x = 3;
    h.y = 8;
    h.plan = null;
    const r = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(r.kade.flat).toBe(true);
    expect(hunter(r, 'H-2').mode).toBe('patrol');
  });

  it('telegraphs list each unstunned hunter step and each camera about to turn', () => {
    const s = fresh();
    const t = telegraphs(s);
    expect(t.filter((x) => x.kind === 'hunterStep').map((x) => x.id)).toEqual(['H-1', 'H-2']);
    // At tick 2 every camera is mid-pose; at tick 2 -> 3 they all turn.
    const next = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(telegraphs(next).filter((x) => x.kind === 'cameraTurn')).toHaveLength(3);
  });
});

describe('ending the contract', () => {
  it('two ticks on the receiver delivers, and the first tick is only a read-out', () => {
    let s = fresh();
    s.wren.x = 13;
    s.wren.y = 4;
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(s.status).toBe('play');
    expect(s.download).toBe(1);
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(s.outcome).toBe('delivered');
  });

  it('leaving the receiver resets the download', () => {
    let s = fresh();
    s.wren.x = 13;
    s.wren.y = 4;
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    s = tick(s, { type: 'move', dir: 0 }, { type: 'hold' }).state;
    expect(s.download).toBe(0);
  });

  it('overload at 100 flatlines Wren and body 0 means taken', () => {
    const hot = fresh();
    hot.wren.overload = 98;
    expect(tick(hot, { type: 'wait' }, { type: 'hold' }).state.outcome).toBe('flatlined');
    const hurt = fresh();
    hurt.wren.body = 1;
    const h = hunter(hurt, 'H-1');
    h.x = 2;
    h.y = 9;
    h.plan = null;
    expect(tick(hurt, { type: 'wait' }, { type: 'hold' }).state.outcome).toBe('taken');
  });

  it('delivery wins over taken when both happen in one tick', () => {
    const s = fresh();
    s.wren.x = 13;
    s.wren.y = 4;
    s.download = 1;
    s.wren.body = 1;
    const h = hunter(s, 'H-1');
    h.x = 12;
    h.y = 4;
    h.plan = null;
    expect(tick(s, { type: 'wait' }, { type: 'hold' }).state.outcome).toBe('delivered');
  });

  it('fee is 100% at full body, scales with body and rounds to 100', () => {
    const s = fresh();
    expect(fee(s)).toBe(28000);
    s.wren.body = 1;
    expect(fee(s)).toBe(19600);
    expect(fee({ ...s, payload: 'light' })).toBe(8400);
  });

  it('falls back to the default payload for an unknown key', () => {
    expect(createMatch(content, { payload: 'enormous' }, 1).payload).toBe('standard');
  });
});

describe('viewFor', () => {
  it('Phase 2 shows every player the whole match (nothing is hidden yet)', () => {
    const s = fresh();
    expect(viewFor(s, WREN)).toBe(s);
    expect(viewFor(s, KADE)).toBe(s);
  });
});
