import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const simSource = /<script id="sim">([\s\S]*?)<\/script>/.exec(html)[1];
const Sim = vm.runInNewContext(`${simSource}\nSim`, { structuredClone });
const { CONFIG, DIRS } = Sim;

// Tiny seeded generator for the property tests (test-only).
function lcg(seed) { let a = seed >>> 0; return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296; }

function withDoors(s, dr1, dr2) { const c = structuredClone(s); c.doors.DR1 = dr1; c.doors.DR2 = dr2; return c; }
function routeLength(s) {
  const d = Sim.distField(s, [Sim.RECEIVER], false);
  return d[s.wren.y * CONFIG.cols + s.wren.x];
}

test('route to receiver is 25 moves with both doors locked, 17 with both open', () => {
  const s = Sim.createMatch('standard');
  assert.equal(routeLength(withDoors(s, false, false)), 25);
  assert.equal(routeLength(withDoors(s, true, true)), 17);
});

test('resolveTick does not mutate its input and is deterministic', () => {
  const s = Sim.createMatch('standard');
  const frozen = JSON.stringify(s);
  const a = Sim.resolveTick(s, { type: 'move', dir: 0 }, { type: 'unlock', target: 'DR2' });
  const b = Sim.resolveTick(s, { type: 'move', dir: 0 }, { type: 'unlock', target: 'DR2' });
  assert.equal(JSON.stringify(s), frozen);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('Kade unlock opens the door in the same tick Wren walks through it', () => {
  let s = Sim.createMatch('standard');
  s.wren.x = 3; s.wren.y = 8;
  s = Sim.resolveTick(s, { type: 'move', dir: 1 }, { type: 'unlock', target: 'DR2' }).state;
  assert.deepEqual([s.wren.x, s.wren.y], [4, 8]);
});

test('bumping a locked door keeps Wren in place', () => {
  let s = Sim.createMatch('standard');
  s.wren.x = 3; s.wren.y = 8;
  s = Sim.resolveTick(s, { type: 'move', dir: 1 }, { type: 'hold' }).state;
  assert.deepEqual([s.wren.x, s.wren.y], [3, 8]);
});

test('camera facing turns every two ticks', () => {
  const cam = Sim.createMatch('standard').cams[0]; // CAM-A east, south
  assert.deepEqual([1, 2, 3, 4, 5].map((t) => Sim.camFacing(cam, t)), [1, 1, 2, 2, 1]);
});

test('hack costs and decay follow the spec table', () => {
  let s = Sim.createMatch('standard');
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'unlock', target: 'DR2' }).state;
  assert.deepEqual([s.kade.load, s.kade.trace], [20, 15]);
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'hold' }).state;
  assert.deepEqual([s.kade.load, s.kade.trace], [14, 13]);
});

test('load reaching 100 causes dumpshock 3 and resets load to 60', () => {
  let s = Sim.createMatch('standard');
  s.kade.load = 90; s.kade.node = 'JX1';
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'blind', target: 'CAMC' }).state;
  assert.equal(s.kade.shock, 3);
  assert.equal(s.kade.load, 60);
});

test('burn stuns a hunter for two ticks of movement', () => {
  let s = Sim.createMatch('standard');
  s.kade.node = 'JX2';
  const h2 = s.hunters.find((h) => h.id === 'H-1');
  const start = [h2.x, h2.y];
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'burn', target: 'H-1' }).state;
  assert.deepEqual([s.hunters[0].x, s.hunters[0].y], start);
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'hold' }).state;
  assert.deepEqual([s.hunters[0].x, s.hunters[0].y], start);
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'hold' }).state;
  assert.notDeepEqual([s.hunters[0].x, s.hunters[0].y], start);
});

test('ICE cannot be entered until both layers are broken', () => {
  let s = Sim.createMatch('standard');
  s.kade.node = 'JX2';
  assert.ok(!Sim.legalKade(s).some((a) => a.type === 'route' && a.target === 'ICE'));
  s.ice = 0;
  assert.ok(Sim.legalKade(s).some((a) => a.type === 'route' && a.target === 'ICE'));
});

test('trace at 100 sends exactly one hunter to Kade body, who dumpshocks him on arrival', () => {
  let s = Sim.createMatch('standard');
  s.kade.trace = 95; s.kade.node = 'JX1';
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'blind', target: 'CAMC' }).state;
  assert.equal(s.hunters.filter((h) => h.mode === 'body').length, 1);
  const h = s.hunters.find((x) => x.mode === 'body');
  h.x = 3; h.y = 8; h.plan = null; h.stun = 0;
  s = Sim.resolveTick(s, { type: 'wait' }, { type: 'hold' }).state;
  assert.equal(s.kade.body, 1);
  assert.equal(s.kade.shock, 4);
  assert.equal(s.kade.trace, 0);
  assert.equal(s.kade.load, 70 - CONFIG.net.decay.load); // raised to 70 in step 6, then decays in step 7
});

test('fee is 100% at full body and rounds to 100', () => {
  const s = Sim.createMatch('standard');
  assert.equal(Sim.fee(s), 28000);
  s.wren.body = 1;
  assert.equal(Sim.fee(s), 19600);
});

function randomPlay(seed, payload) {
  const rnd = lcg(seed);
  let s = Sim.createMatch(payload);
  const trail = [s];
  for (let i = 0; i < 80 && s.status === 'play'; i++) {
    const w = Sim.legalWren(s), k = Sim.legalKade(s);
    s = Sim.resolveTick(s, w[Math.floor(rnd() * w.length)], k[Math.floor(rnd() * k.length)] || { type: 'hold' }).state;
    trail.push(s);
  }
  return trail;
}

test('property: hunters take their telegraphed step unless stunned or blocked', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const trail = randomPlay(seed, 'light');
    for (let i = 0; i + 1 < trail.length; i++) {
      const before = trail[i], after = trail[i + 1];
      for (const h of before.hunters) {
        // A hunter that was stunned this tick, or stunned by a burn this tick, may not move.
        if (h.stun > 0 || !h.plan) continue;
        const next = after.hunters.find((x) => x.id === h.id);
        const burnedNow = next.stun > 0 && next.x === h.x && next.y === h.y;
        if (burnedNow) continue;
        assert.deepEqual([next.x, next.y], [h.plan.x, h.plan.y], `seed ${seed} tick ${before.tick} ${h.id}`);
      }
    }
  }
});

test('property: overload never decreases and legal actions never throw', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const trail = randomPlay(seed, ['light', 'standard', 'heavy'][seed % 3]);
    for (let i = 0; i + 1 < trail.length; i++) {
      assert.ok(trail[i + 1].wren.overload >= trail[i].wren.overload);
    }
  }
});

// ---- Golden run (PROMPT.md §5.4) ----
const KADE_SCRIPT = [
  { type: 'unlock', target: 'DR2' }, { type: 'route', target: 'JX1' }, { type: 'blind', target: 'CAMC' },
  { type: 'route', target: 'JX2' }, { type: 'ice', target: 'ICE' }, { type: 'ice', target: 'ICE' },
  { type: 'route', target: 'ICE' }, { type: 'unlock', target: 'DR1' },
];

function greedyWren(s) {
  const field = Sim.distField(s, [Sim.RECEIVER], true); // doors counted as passable, bump avoided below
  const danger = new Set();
  for (const h of s.hunters) {
    const spots = h.stun > 0 || !h.plan ? [h] : [h, h.plan];
    for (const p of spots) for (const [dx, dy] of [[0, 0], ...DIRS]) danger.add(`${p.x + dx},${p.y + dy}`);
  }
  const here = field[s.wren.y * CONFIG.cols + s.wren.x];
  const onReceiver = here === 0;
  if (onReceiver && !danger.has(`${s.wren.x},${s.wren.y}`)) return { type: 'wait' }; // dwell for the read-out
  let best = { type: 'wait' }, bestD = Infinity;
  for (const a of Sim.legalWren(s)) {
    if (a.type !== 'move') continue;
    const nx = s.wren.x + DIRS[a.dir][0], ny = s.wren.y + DIRS[a.dir][1];
    if (!Sim.passable(s, nx, ny) || danger.has(`${nx},${ny}`)) continue;
    const d = field[ny * CONFIG.cols + nx];
    if (d >= 0 && d < bestD) { best = a; bestD = d; }
  }
  return best;
}

function goldenKade(s, script) {
  if (script.i < KADE_SCRIPT.length) {
    const want = KADE_SCRIPT[script.i];
    if (Sim.legalKade(s).some((a) => Sim.sameAction(a, want))) { script.i++; return want; }
  }
  const near = s.hunters.find((h) => h.stun === 0 && Sim.manhattan(h, s.wren) <= 3);
  const burn = near && Sim.legalKade(s).find((a) => a.type === 'burn' && a.target === near.id);
  return burn || { type: 'hold' };
}

function goldenRun(payload) {
  let s = Sim.createMatch(payload);
  const script = { i: 0 }, events = [];
  while (s.status === 'play' && s.tick < 80) {
    const r = Sim.resolveTick(s, greedyWren(s), goldenKade(s, script));
    s = r.state; events.push(...r.events);
  }
  return { s, events };
}

test('golden: scripted Standard run ends Delivered and is replayable', () => {
  const a = goldenRun('standard'), b = goldenRun('standard');
  assert.equal(a.s.outcome, 'delivered', `ended ${a.s.outcome} at tick ${a.s.tick}`);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  console.log(`golden run: ${a.s.outcome} on tick ${a.s.tick}, body ${a.s.wren.body}, overload ${a.s.wren.overload}%, alerts ${a.s.stats.alerts}, hacks ${a.s.stats.hacks}`);
});
