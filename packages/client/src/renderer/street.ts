import {
  camFacing,
  dirVec,
  euclid,
  inCone,
  isWall,
  lineOfSight,
  telegraphs,
  type HunterState,
  type MatchState,
} from '@wetwire/sim';
import { Container, Graphics, Text, Texture, TilingSprite } from 'pixi.js';
import type { Game } from '../game.ts';
import { COLORS, FONT, LabelPool, TAU, TILE, arcPath, arrow, centre, diamond } from './draw.ts';

/** A blinded camera gets a plain "about to expire" warning once this few ticks are left,
 * so re-blinding (or getting clear) doesn't come down to memorising the countdown number. */
const BLIND_WARN_TICKS = 2;

/** Small deterministic PRNG for static art only; the sim never sees it. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBackground(s: MatchState, w: number, h: number): Graphics {
  const g = new Graphics();
  const r = rng(17);
  g.rect(0, 0, w, h).fill(0x16171b);
  for (let y = 0; y < s.rules.rows; y++) {
    for (let x = 0; x < s.rules.cols; x++) {
      if (isWall(s.rules, x, y)) continue;
      g.rect(x * TILE, y * TILE, TILE, TILE).fill({
        color: (x + y) % 2 ? 0xffffff : 0x000000,
        alpha: (x + y) % 2 ? 0.012 : 0.05,
      });
      for (let i = 0; i < 9; i++)
        g.rect(x * TILE + r() * TILE, y * TILE + r() * TILE, 1, 1).fill({ color: 0xffffff, alpha: 0.05 });
      g.rect(x * TILE + 0.5, y * TILE + 0.5, TILE, TILE).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
    }
  }
  for (const [px, py] of [
    [2.2, 1.5],
    [7.5, 5.6],
    [11.8, 3.2],
    [5.5, 8.4],
    [13, 1.6],
  ] as const) {
    g.ellipse(px * TILE, py * TILE, 17, 7).fill({ color: 0x050608, alpha: 0.7 });
    g.moveTo(px * TILE - 9, py * TILE - 1)
      .lineTo(px * TILE + 5, py * TILE - 3)
      .stroke({ width: 1, color: COLORS.fg, alpha: 0.22 });
  }
  for (let y = 0; y < s.rules.rows; y++) {
    for (let x = 0; x < s.rules.cols; x++) {
      if (!isWall(s.rules, x, y)) continue;
      g.rect(x * TILE, y * TILE, TILE, TILE).fill(0x08090b);
      for (let i = 9; i < TILE * 2; i += 9) {
        // diagonal hatching clipped to the tile
        const x1 = Math.max(0, i - TILE);
        const x2 = Math.min(TILE, i);
        g.moveTo(x * TILE + x2, y * TILE + (i - x2)).lineTo(x * TILE + x1, y * TILE + (i - x1));
      }
      g.stroke({ width: 1.5, color: 0x17181c });
      if (!isWall(s.rules, x, y + 1)) g.rect(x * TILE, y * TILE + TILE - 2, TILE, 2).fill(0x3a3b42);
    }
  }
  for (const [lx, ly] of [
    [2, 1.5],
    [8, 3],
    [12.5, 2],
    [6, 8],
    [1.5, 8.5],
  ] as const) {
    for (let i = 5; i >= 1; i--)
      g.circle(lx * TILE, ly * TILE, i * 18).fill({ color: 0xf0d7a0, alpha: 0.018 });
  }
  for (let i = 0; i < 6; i++) {
    g.rect(i * 6, i * 6, w - i * 12, h - i * 12).stroke({ width: 12, color: 0x000000, alpha: 0.09 });
  }
  return g;
}

interface HunterView {
  root: Container;
  body: Graphics;
  zig: Graphics;
  tag: Text;
}

/** The meatspace layer: noir street, cameras, hunters, Wren and the telegraphs. */
export class StreetLayer {
  readonly root = new Container();
  private readonly overlay = new Graphics();
  private readonly unitLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly labels: LabelPool;
  private readonly wrenView = new Container();
  private readonly wrenGlow = new Graphics();
  private readonly wrenArc = new Graphics();
  private readonly wrenMask = new Graphics();
  private readonly wrenTag: Text;
  private readonly razorView = new Container();
  private readonly razorBody = new Graphics();
  private readonly razorTag: Text;
  private readonly hunters = new Map<string, HunterView>();
  private readonly beacon = [new Graphics(), new Graphics()];
  private readonly kadeRing = new Graphics();
  private readonly camWarn = new Graphics();
  private readonly rain: TilingSprite;
  private readonly effects: { g: Graphics; t0: number; dur: number; kind: string }[] = [];
  private flashUntil = new Map<string, number>();
  private flashing = false;
  private flashSet = new Set<string>();
  private readonly game: Game;
  private readonly reduce: () => boolean;

  constructor(game: Game, width: number, height: number, reduce: () => boolean, rainTexture: Texture) {
    this.game = game;
    this.reduce = reduce;
    this.root.addChild(buildBackground(game.state, width, height), this.overlay);
    for (const b of this.beacon) this.root.addChild(b);
    this.root.addChild(this.kadeRing, this.camWarn, this.unitLayer, this.fxLayer);
    this.labels = new LabelPool(this.root);
    this.wrenTag = new Text({
      text: 'WREN',
      style: { fontFamily: FONT, fontSize: 8, fontWeight: '500', fill: 0xffffff },
      resolution: 2,
    });
    this.wrenTag.anchor.set(0.5);
    this.wrenTag.tint = COLORS.amber;
    this.wrenTag.position.set(0, 31);
    this.wrenView.addChild(this.wrenGlow, this.wrenMask, this.wrenArc, this.wrenTag);
    this.unitLayer.addChild(this.wrenView);
    this.razorTag = new Text({
      text: 'RAZOR',
      style: { fontFamily: FONT, fontSize: 8, fontWeight: '500', fill: 0xffffff },
      resolution: 2,
    });
    this.razorTag.anchor.set(0.5);
    this.razorTag.tint = COLORS.razor;
    this.razorTag.position.set(0, 27);
    this.razorView.addChild(this.razorBody, this.razorTag);
    this.unitLayer.addChild(this.razorView);
    this.rain = new TilingSprite({ texture: rainTexture, width, height });
    this.rain.alpha = 0.5;
    this.root.addChild(this.rain);
  }

  flash(cam: string, until: number): void {
    this.flashUntil.set(cam, until);
  }

  addEffect(kind: string, x: number, y: number, now: number): void {
    const g = new Graphics();
    if (kind === 'hit') g.circle(0, 0, 10).stroke({ width: 3, color: COLORS.crim });
    else if (kind === 'hack') g.circle(0, 0, 10).stroke({ width: 2, color: COLORS.own });
    else if (kind === 'spot') {
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        g.moveTo(sx * 22, sy * 12)
          .lineTo(sx * 22, sy * 22)
          .lineTo(sx * 12, sy * 22);
      }
      g.stroke({ width: 2, color: 0xffffff });
    } else g.rect(-18, -18, 36, 36).stroke({ width: 2, color: COLORS.amber });
    g.position.set(centre(x), centre(y));
    this.fxLayer.addChild(g);
    this.effects.push({ g, t0: now, dur: kind === 'spot' ? 600 : 450, kind });
  }

  /** Rebuild everything that only changes with state, plan or view. */
  rebuild(now: number): void {
    const s = this.game.state;
    const g = this.overlay;
    g.clear();
    this.labels.begin();
    this.flashSet = new Set([...this.flashUntil].filter(([, until]) => until > now).map(([id]) => id));
    this.flashing = this.flashSet.size > 0;
    this.drawVision(g, s);
    this.drawCones(g, s);
    this.drawDoors(g, s);
    this.drawReceiver(g, s);
    this.drawCameras(g, s);
    this.drawKadeBody(g, s);
    this.drawTelegraphs(g, s);
    this.labels.end();
    this.syncUnits(s);
  }

  private isFlashing(now: number): boolean {
    for (const until of this.flashUntil.values()) if (until > now) return true;
    return false;
  }

  private drawVision(g: Graphics, s: MatchState): void {
    for (const h of s.hunters) {
      if (h.stun > 0) continue;
      const color = h.mode === 'hunt' ? 0.2 : 0.07;
      for (let y = 0; y < s.rules.rows; y++) {
        for (let x = 0; x < s.rules.cols; x++) {
          if (isWall(s.rules, x, y) || euclid(h, { x, y }) > s.rules.balance.hunter.sight) continue;
          if (lineOfSight(s, h, { x, y }))
            g.rect(x * TILE, y * TILE, TILE, TILE).fill({ color: COLORS.crim, alpha: color });
        }
      }
    }
  }

  private drawCones(g: Graphics, s: MatchState): void {
    s.cams.forEach((cam, i) => {
      const flash = this.flashSet.has(cam.id);
      if (cam.blind === 0) {
        for (let y = 0; y < s.rules.rows; y++) {
          for (let x = 0; x < s.rules.cols; x++) {
            if (!isWall(s.rules, x, y) && inCone(s, i, s.tick, { x, y })) {
              g.rect(x * TILE, y * TILE, TILE, TILE).fill(
                flash ? { color: COLORS.crim, alpha: 0.3 } : { color: 0xf0ebdc, alpha: 0.07 },
              );
            }
          }
        }
      }
      const now = camFacing(s, i, s.tick);
      const next = camFacing(s, i, s.tick + 1);
      if (cam.blind > 1 || now === next) return;
      const [dx, dy] = dirVec(next);
      const half = Math.acos(s.rules.balance.cam.cos);
      const ang = Math.atan2(dy, dx);
      const r = s.rules.balance.cam.range * TILE;
      const cx = centre(cam.x);
      const cy = centre(cam.y);
      const pts: [number, number][] = [[cx, cy]];
      for (let k = 0; k <= 12; k++)
        pts.push([
          cx + Math.cos(ang - half + (k / 12) * 2 * half) * r,
          cy + Math.sin(ang - half + (k / 12) * 2 * half) * r,
        ]);
      pts.push([cx, cy]);
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        if (a && b) dotted(g, a[0], a[1], b[0], b[1]);
      }
      g.stroke({ width: 1.5, color: 0xf0ebdc, alpha: 0.4 });
    });
  }

  private drawDoors(g: Graphics, s: MatchState): void {
    for (const d of s.rules.district.doors) {
      const x = d.x * TILE;
      const y = d.y * TILE;
      if (s.doors[d.id]) {
        g.rect(x + 1, y + 2, 5, TILE - 4).fill(0x3a3b42);
        g.rect(x + TILE - 6, y + 2, 5, TILE - 4).fill(0x3a3b42);
        g.rect(x + 3, y + 3, TILE - 6, TILE - 6).stroke({ width: 1.5, color: COLORS.own, alpha: 0.7 });
      } else {
        g.rect(x + 3, y + 3, TILE - 6, TILE - 6)
          .fill(0x2a2b31)
          .stroke({ width: 1.5, color: COLORS.fg });
        g.rect(x + TILE / 2 - 6, y + TILE / 2 - 1, 12, 9).fill(COLORS.fg);
        arcPath(g, x + TILE / 2, y + TILE / 2 - 1, 5, Math.PI, TAU).stroke({ width: 2, color: COLORS.fg });
      }
    }
  }

  private drawReceiver(g: Graphics, s: MatchState): void {
    const r = s.rules.district.receiver;
    const x = centre(r.x);
    const y = centre(r.y);
    diamond(g, x, y, 5).fill(COLORS.amber);
    const progress = Math.min(1, s.download / s.rules.balance.downloadTicks);
    if (progress > 0)
      arcPath(g, x, y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * progress).stroke({
        width: 3,
        color: COLORS.amber,
      });
    this.labels.put('RECEIVER', x, y + 30, COLORS.mute, 8);
    for (const b of this.beacon) b.position.set(x, y);
  }

  private drawCameras(g: Graphics, s: MatchState): void {
    s.cams.forEach((cam, i) => {
      const [dx, dy] = dirVec(camFacing(s, i, s.tick));
      const x = centre(cam.x);
      const y = centre(cam.y);
      const c = Math.cos(Math.atan2(dy, dx));
      const sn = Math.sin(Math.atan2(dy, dx));
      const corner = (px: number, py: number): [number, number] => [
        x + px * c - py * sn,
        y + px * sn + py * c,
      ];
      g.poly([...corner(-8, -5), ...corner(8, -5), ...corner(8, 5), ...corner(-8, 5)]).fill(
        cam.blind ? 0x2a2b31 : 0xd8d4cb,
      );
      g.poly([...corner(4, -3), ...corner(9, -3), ...corner(9, 3), ...corner(4, 3)]).fill(
        cam.blind ? 0x444444 : COLORS.ink,
      );
      if (cam.blind) {
        const expiring = cam.blind <= BLIND_WARN_TICKS;
        const color = expiring ? COLORS.amber : COLORS.own;
        g.moveTo(x - 7, y - 7)
          .lineTo(x + 7, y + 7)
          .moveTo(x + 7, y - 7)
          .lineTo(x - 7, y + 7)
          .stroke({ width: 2, color });
        this.labels.put(`BLIND ${cam.blind}`, x, y - 13, color, 8);
      }
    });
  }

  private drawKadeBody(g: Graphics, s: MatchState): void {
    const t = s.rules.district.terminal;
    const x = centre(t.x);
    const y = centre(t.y);
    g.rect(x - 8, y - 8, 16, 16).fill(s.kade.flat ? 0x555555 : COLORS.amber);
    g.moveTo(x + 8, y)
      .bezierCurveTo(x + 14, y + 8, x + 8, y + 14, x + 15, y + 15)
      .stroke({ width: 2, color: COLORS.net });
    if (s.kade.flat)
      g.moveTo(x - 6, y - 6)
        .lineTo(x + 6, y + 6)
        .moveTo(x + 6, y - 6)
        .lineTo(x - 6, y + 6)
        .stroke({ width: 2, color: COLORS.ink });
    this.labels.put('KADE', x, y - 15, COLORS.mute, 8);
    this.kadeRing.clear();
    this.kadeRing.circle(0, 0, 20).stroke({ width: 2, color: COLORS.crim });
    this.kadeRing.position.set(x, y);
  }

  private drawTelegraphs(g: Graphics, s: MatchState): void {
    if (s.status !== 'play') return;
    const a = this.game.plan.wren;
    if (a.type === 'move') {
      const [dx, dy] = dirVec(a.dir);
      const x = centre(s.wren.x);
      const y = centre(s.wren.y);
      arrow(g, x + dx * 12, y + dy * 12, x + dx * (TILE - 8), y + dy * (TILE - 8), COLORS.amber, true);
      diamond(g, x + dx * TILE, y + dy * TILE, 9).fill({ color: COLORS.amber, alpha: 0.45 });
    }
    for (const t of telegraphs(s)) {
      if (t.kind !== 'hunterStep') continue;
      const dx = t.to.x - t.from.x;
      const dy = t.to.y - t.from.y;
      arrow(
        g,
        centre(t.from.x) + dx * 12,
        centre(t.from.y) + dy * 12,
        centre(t.to.x) - dx * 8,
        centre(t.to.y) - dy * 8,
        COLORS.crim,
        true,
      );
    }
  }

  private syncUnits(s: MatchState): void {
    const w = s.wren;
    const pct = Math.min(1, w.overload / s.rules.balance.overloadMax);
    this.wrenGlow.clear();
    for (const [r, a] of [
      [19, 0.08],
      [15, 0.14],
      [11, 1],
    ] as const)
      diamond(this.wrenGlow, 0, 0, r).fill({ color: COLORS.amber, alpha: a });
    diamond(this.wrenGlow, 0, 0, 3).fill(COLORS.ink);
    this.wrenArc.clear();
    if (pct > 0)
      arcPath(this.wrenArc, 0, 0, 18, -Math.PI / 2, -Math.PI / 2 + TAU * pct).stroke({
        width: 3,
        color: pct > 0.75 ? COLORS.crim : COLORS.amber,
      });
    this.wrenMask.clear();
    if (w.masked) {
      const pts: [number, number][] = [
        [0, -15],
        [15, 0],
        [0, 15],
        [-15, 0],
        [0, -15],
      ];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (a && b) dotted(this.wrenMask, a[0], a[1], b[0], b[1]);
      }
      this.wrenMask.stroke({ width: 1.5, color: COLORS.fg });
    }
    this.razorBody.clear();
    const down = s.razor.body <= 0;
    diamond(this.razorBody, 0, 0, 10).fill({
      color: down ? COLORS.stone : COLORS.razor,
      alpha: down ? 0.5 : 1,
    });
    this.razorTag.text = down ? 'RAZOR DOWN' : 'RAZOR';
    this.razorTag.tint = down ? COLORS.mute : COLORS.razor;
    for (const h of s.hunters) this.syncHunter(h);
  }

  private syncHunter(h: HunterState): void {
    let v = this.hunters.get(h.id);
    if (!v) {
      const tag = new Text({
        text: h.id,
        style: { fontFamily: FONT, fontSize: 8, fontWeight: '500', fill: 0xffffff },
        resolution: 2,
      });
      tag.anchor.set(0.5);
      tag.position.set(0, 24);
      v = { root: new Container(), body: new Graphics(), zig: new Graphics(), tag };
      v.root.addChild(v.body, v.zig, v.tag);
      this.unitLayer.addChild(v.root);
      this.hunters.set(h.id, v);
    }
    const stunned = h.stun > 0;
    v.body.clear();
    v.body
      .poly([12, 0, -8, -9, -4, 0, -8, 9])
      .fill(h.defeated ? COLORS.stone : stunned ? COLORS.stone : COLORS.crim);
    v.body.alpha = h.defeated ? 0.4 : 1;
    v.body.rotation = Math.atan2(h.fy, h.fx);
    v.zig.clear();
    if (stunned) {
      v.zig
        .moveTo(-9, -12)
        .lineTo(-3, -7)
        .lineTo(-1, -14)
        .lineTo(5, -8)
        .lineTo(9, -13)
        .stroke({ width: 2, color: COLORS.own });
    }
    const state = h.defeated
      ? ' DOWN'
      : stunned
        ? ' STUN'
        : h.mode === 'hunt'
          ? ' HUNTING'
          : h.mode === 'body'
            ? ' TRACING'
            : '';
    v.tag.text = `${h.id}${state}`;
    v.tag.tint = h.defeated || stunned ? COLORS.mute : COLORS.crim;
  }

  /** Per-frame work: only transforms and alphas, no redraws and no allocation. */
  update(now: number): void {
    const s = this.game.state;
    const k = this.game.animProgress(now, this.reduce());
    const place = (id: string, cur: { x: number; y: number }, target: Container): void => {
      const p = this.game.prev.get(id);
      const x = p ? p.x + (cur.x - p.x) * k : cur.x;
      const y = p ? p.y + (cur.y - p.y) * k : cur.y;
      target.position.set(centre(x), centre(y));
    };
    place('wren', s.wren, this.wrenView);
    place('razor', s.razor, this.razorView);
    for (const h of s.hunters) {
      const v = this.hunters.get(h.id);
      if (v) place(h.id, h, v.root);
    }
    const slow = this.reduce();
    this.beacon.forEach((b, i) => {
      const q = slow ? 0.5 : (now / 1400 + i / 2) % 1;
      b.clear();
      b.circle(0, 0, 6 + q * 20).stroke({ width: 1.5, color: COLORS.amber, alpha: (1 - q) * 0.6 });
    });
    const threat = s.hunters.some(
      (h) => h.mode === 'body' || euclid(h, s.rules.district.terminal) <= s.rules.balance.net.bodyThreatRange,
    );
    this.kadeRing.visible = threat && !s.kade.flat;
    this.kadeRing.alpha = slow ? 0.8 : 0.5 + 0.4 * Math.sin(now / 160);
    this.updateCamWarn(s, now, slow);
    this.rain.visible = !slow;
    if (!slow) {
      this.rain.tilePosition.y += 6;
      this.rain.tilePosition.x -= 1.4;
    }
    this.updateEffects(now);
    if (this.flashing && !this.isFlashing(now)) this.rebuild(now);
  }

  /** Pulsing ring around a camera about to re-arm, so an expiring blind reads at a glance
   * instead of requiring a read of the "BLIND N" countdown label. */
  private updateCamWarn(s: MatchState, now: number, slow: boolean): void {
    this.camWarn.clear();
    const alpha = slow ? 0.7 : 0.4 + 0.5 * Math.abs(Math.sin(now / 220));
    for (const cam of s.cams) {
      if (cam.blind === 0 || cam.blind > BLIND_WARN_TICKS) continue;
      this.camWarn.circle(centre(cam.x), centre(cam.y), 14).stroke({
        width: 2,
        color: COLORS.amber,
        alpha,
      });
    }
  }

  private updateEffects(now: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (!e) continue;
      const k = Math.max(0, (now - e.t0) / e.dur);
      if (k >= 1) {
        e.g.destroy();
        this.effects.splice(i, 1);
        continue;
      }
      e.g.alpha = 1 - k;
      if (e.kind === 'hit' || e.kind === 'hack') e.g.scale.set(1 + k * 2.4);
    }
  }
}

/** Adds a dotted segment to the current path. */
function dotted(g: Graphics, x1: number, y1: number, x2: number, y2: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  for (let d = 0; d < len; d += 6)
    g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * Math.min(len, d + 2), y1 + uy * Math.min(len, d + 2));
}
