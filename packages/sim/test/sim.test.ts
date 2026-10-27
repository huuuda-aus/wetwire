import { content } from '@wetwire/content';
import { describe, expect, it } from 'vitest';
import {
  KADE,
  RAZOR,
  WREN,
  createMatch,
  distField,
  legalActions,
  legalDeckerActions,
  legalRazorActions,
  loadoutSlotCost,
  resolveTick,
  telegraphs,
  validateLoadout,
  viewFor,
  fee,
  camFacing,
  type Action,
  type MatchState,
} from '../src/index.ts';

const fresh = (payload = 'standard'): MatchState => createMatch(content, { payload }, 1);
const tick = (s: MatchState, wren: Action, kade: Action) =>
  resolveTick(s, { actions: { [WREN]: wren, [KADE]: kade } });
const tickR = (s: MatchState, wren: Action, kade: Action, razor: Action) =>
  resolveTick(s, { actions: { [WREN]: wren, [KADE]: kade, [RAZOR]: razor } });
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

  it('createMatch picks a district by id, defaulting to content.district', () => {
    const named = createMatch(content, { payload: 'standard', districtId: 'harrow-yards' }, 1);
    expect(named.rules.district.id).toBe('harrow-yards');
    const unknown = createMatch(content, { payload: 'standard', districtId: 'nope' }, 1);
    expect(unknown.rules.district.id).toBe(content.district.id);
    const omitted = createMatch(content, { payload: 'standard' }, 1);
    expect(omitted.rules.district.id).toBe(content.district.id);
  });

  it('harrow-yards route is 25 moves with both doors locked and 17 with both open', () => {
    const s = createMatch(content, { payload: 'standard', districtId: 'harrow-yards' }, 1);
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

  it('loadout cost sums known implants and ignores an unknown id for the pure cost function', () => {
    expect(loadoutSlotCost(content.implants, ['razor-nails', 'mirrorshades'])).toBe(25);
    expect(loadoutSlotCost(content.implants, ['razor-nails', 'nope'])).toBe(15);
  });

  it('validateLoadout accepts exactly at capacity and rejects one over the boundary', () => {
    expect(validateLoadout(content.implants, 15, ['razor-nails']).ok).toBe(true); // cost 15, capacity 15
    expect(validateLoadout(content.implants, 14, ['razor-nails']).ok).toBe(false); // cost 15, capacity 14
    const all = content.implants.map((i) => i.id);
    expect(validateLoadout(content.implants, content.balance.neural.capacity, all).ok).toBe(false);
  });

  it('validateLoadout rejects an implant id the content does not define', () => {
    const check = validateLoadout(content.implants, content.balance.neural.capacity, ['not-a-real-implant']);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/unknown implant/);
  });

  it('createMatch throws when a starting loadout costs more than the neural budget', () => {
    const tooMuch = [
      'mono-whip',
      'dermal-plating',
      'ice-pick-deck',
      'ghost-deck',
      'quiet-heart',
      'mirrorshades',
    ]; // 105
    expect(() => createMatch(content, { payload: 'standard', kadeLoadout: tooMuch }, 1)).toThrow(
      /neural budget/,
    );
  });

  it('createMatch accepts a loadout within budget and carries it onto the unit', () => {
    const s = createMatch(content, { payload: 'standard', kadeLoadout: ['razor-nails', 'mirrorshades'] }, 1);
    expect(s.kade.loadout).toEqual(['razor-nails', 'mirrorshades']);
  });

  it('installed chrome is attack surface: a Kade with implants dumpshocks at a lower hack load (§7.2)', () => {
    // No hack this tick, so load decays by 6 (net.decay.load) before the threshold check.
    const bare = fresh();
    bare.kade.load = 87;
    const bareOut = tick(bare, { type: 'wait' }, { type: 'hold' }).state;
    expect(bareOut.kade.shock).toBe(0); // (87 - 6) = 81, nowhere near 100

    const chromed = createMatch(content, { payload: 'standard', kadeLoadout: ['mono-whip'] }, 1); // 20 slot cost
    chromed.kade.load = 87;
    const chromedOut = tick(chromed, { type: 'wait' }, { type: 'hold' }).state;
    expect(chromedOut.kade.shock).toBe(3); // (87 - 6) + 20 = 101 >= 100, same hack spend as the bare case
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

describe('Razor', () => {
  it('spawns at Wren’s start tile with the role kit’s body', () => {
    const s = fresh();
    expect(s.razor).toEqual({ x: s.wren.x, y: s.wren.y, body: content.balance.razor.body });
  });

  it('strike only offers hunters that are adjacent and not already defeated', () => {
    const s = fresh();
    expect(legalRazorActions(s).some((a) => a.type === 'strike')).toBe(false);
    const h = hunter(s, 'H-1');
    h.x = s.razor.x + 1;
    h.y = s.razor.y;
    expect(legalRazorActions(s)).toContainEqual({ type: 'strike', target: 'H-1' });
    h.defeated = true;
    expect(legalRazorActions(s).some((a) => a.type === 'strike' && a.target === 'H-1')).toBe(false);
  });

  it('a strike damages the target and is logged', () => {
    const s = fresh();
    const h = hunter(s, 'H-1');
    h.x = s.razor.x + 1;
    h.y = s.razor.y;
    h.plan = null;
    const r = tickR(s, { type: 'wait' }, { type: 'hold' }, { type: 'strike', target: 'H-1' });
    expect(hunter(r.state, 'H-1').body).toBe(content.balance.hunter.body - content.balance.razor.hitDamage);
    expect(r.events.some((e) => e.type === 'RazorStruck')).toBe(true);
  });

  it('a hunter reduced to 0 body is defeated and stops acting for the rest of the match', () => {
    let s = fresh();
    const h = hunter(s, 'H-1');
    h.x = s.razor.x + 1;
    h.y = s.razor.y;
    h.plan = null;
    h.body = content.balance.razor.hitDamage; // one strike away from 0
    const r = tickR(s, { type: 'wait' }, { type: 'hold' }, { type: 'strike', target: 'H-1' });
    s = r.state;
    expect(hunter(s, 'H-1').defeated).toBe(true);
    expect(r.events.some((e) => e.type === 'HunterDefeated')).toBe(true);
    const start = { x: hunter(s, 'H-1').x, y: hunter(s, 'H-1').y };
    s = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect({ x: hunter(s, 'H-1').x, y: hunter(s, 'H-1').y }).toEqual(start); // never moves again
    expect(legalRazorActions(s).some((a) => a.type === 'strike')).toBe(false); // can't be struck again
  });

  it('a defeated hunter does not alert, hunt, or attack', () => {
    const s = fresh();
    const h = hunter(s, 'H-1');
    h.defeated = true;
    h.x = s.wren.x;
    h.y = s.wren.y - 1; // adjacent to Wren; would normally hit her
    h.plan = null;
    const r = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(r.wren.body).toBe(s.wren.body); // untouched
  });

  it('a hunter adjacent to Razor (but not Wren) hits her and is stunned, same as the Wren rule', () => {
    const s = fresh();
    s.wren.x = 0; // move Wren out of range so the hunter's only adjacent target is Razor
    s.wren.y = 0;
    const h = hunter(s, 'H-1');
    h.x = s.razor.x + 1;
    h.y = s.razor.y;
    h.plan = null;
    const r = tick(s, { type: 'wait' }, { type: 'hold' });
    expect(r.state.razor.body).toBe(content.balance.razor.body - content.balance.hunter.hitDamage);
    // stepMeters decrements stun once in the same tick it's set, same as the Wren-hit case above.
    expect(hunter(r.state, 'H-1').stun).toBe(content.balance.hunter.stunTicks - 1);
    expect(r.events.some((e) => e.type === 'RazorHit')).toBe(true);
  });

  it('a downed Razor (body 0) can only wait, and it does not end the match', () => {
    const s = fresh();
    s.razor.body = 0;
    expect(legalRazorActions(s)).toEqual([{ type: 'wait' }]);
    const r = tick(s, { type: 'wait' }, { type: 'hold' }).state;
    expect(r.status).toBe('play');
  });

  it('Razor moves like any other street unit and bumps into walls', () => {
    const s = fresh();
    const legal = legalRazorActions(s);
    expect(legal.some((a) => a.type === 'wait')).toBe(true);
    const r = tickR(s, { type: 'wait' }, { type: 'hold' }, { type: 'move', dir: 1 }).state;
    expect([r.razor.x, r.razor.y]).toEqual([s.razor.x + 1, s.razor.y]);
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
