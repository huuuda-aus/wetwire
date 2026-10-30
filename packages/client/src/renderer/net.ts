import { isHack, type DeckerAction, type MatchState } from '@wetwire/sim';
import type { NodeDef } from '@wetwire/content';
import { Container, Graphics } from 'pixi.js';
import type { Game } from '../game.ts';
import {
  COLORS,
  LabelPool,
  TILE,
  arrow,
  brackets,
  centre,
  dashedLine,
  diamond,
  regularPoly,
} from './draw.ts';

const NET_NAVY = 0x050b18;

function buildBackground(s: MatchState, w: number, h: number): Graphics {
  const g = new Graphics();
  g.rect(0, 0, w, h).fill(NET_NAVY);
  for (let y = 0; y < s.rules.rows; y++) {
    for (let x = 0; x < s.rules.cols; x++) {
      if (!isWall(s, x, y))
        g.rect(x * TILE + TILE / 2 - 1, y * TILE + TILE / 2 - 1, 2, 2).fill({
          color: COLORS.net,
          alpha: 0.2,
        });
    }
  }
  for (let y = 0; y < s.rules.rows; y++) {
    for (let x = 0; x < s.rules.cols; x++) {
      if (!isWall(s, x, y)) continue;
      const X = x * TILE;
      const Y = y * TILE;
      if (y > 0 && !isWall(s, x, y - 1)) g.moveTo(X, Y).lineTo(X + TILE, Y);
      if (y < s.rules.rows - 1 && !isWall(s, x, y + 1)) g.moveTo(X, Y + TILE).lineTo(X + TILE, Y + TILE);
      if (x > 0 && !isWall(s, x - 1, y)) g.moveTo(X, Y).lineTo(X, Y + TILE);
      if (x < s.rules.cols - 1 && !isWall(s, x + 1, y)) g.moveTo(X + TILE, Y).lineTo(X + TILE, Y + TILE);
    }
  }
  g.stroke({ width: 1, color: COLORS.net, alpha: 0.32 });
  return g;
}

const isWall = (s: MatchState, x: number, y: number): boolean => s.rules.wall[y * s.rules.cols + x] === 1;

function nodeColor(s: MatchState, def: NodeDef): number {
  if (def.type === 'ice') return s.ice > 0 ? COLORS.crim : COLORS.stone;
  return s.owned.includes(def.id) ? COLORS.own : COLORS.net;
}

function drawNodeShape(g: Graphics, def: NodeDef, color: number): void {
  const x = centre(def.x);
  const y = centre(def.y);
  for (const [grow, alpha] of [
    [5, 0.08],
    [2, 0.18],
  ] as const) {
    if (def.type === 'door')
      g.rect(x - 9 - grow, y - 9 - grow, 18 + grow * 2, 18 + grow * 2).fill({ color, alpha });
    else g.circle(x, y, (def.type === 'junction' ? 6 : 12) + grow).fill({ color, alpha });
  }
  if (def.type === 'terminal')
    regularPoly(g, x, y, 12, 6, 0).fill({ color: NET_NAVY, alpha: 0.9 }).stroke({ width: 2, color });
  else if (def.type === 'junction')
    g.circle(x, y, 6).fill({ color: NET_NAVY, alpha: 0.9 }).stroke({ width: 2, color });
  else if (def.type === 'camera') {
    g.circle(x, y, 10).fill({ color: NET_NAVY, alpha: 0.9 }).stroke({ width: 2, color });
    g.circle(x, y, 3.5).fill(color);
  } else if (def.type === 'door')
    g.rect(x - 9, y - 9, 18, 18)
      .fill({ color: NET_NAVY, alpha: 0.9 })
      .stroke({ width: 2, color });
  else regularPoly(g, x, y, 13, 16, 0).fill({ color: NET_NAVY, alpha: 0.9 }).stroke({ width: 2, color });
}

/** The Net layer: the same map as a luminous network. Kade's implant range, targets and plan live here. */
export class NetLayer {
  readonly root = new Container();
  private readonly links = new Graphics();
  private readonly nodes = new Graphics();
  private readonly dynamic = new Graphics();
  private readonly kadeRing = new Graphics();
  private readonly wrenPulse = new Graphics();
  private readonly wrenDot = new Graphics();
  private readonly hunterGlyphs = new Map<string, Graphics>();
  private readonly labels: LabelPool;
  private lastLinks = -Infinity;
  private readonly game: Game;
  private readonly reduce: () => boolean;

  constructor(game: Game, width: number, height: number, reduce: () => boolean) {
    this.game = game;
    this.reduce = reduce;
    const scan = new Graphics();
    for (let y = 0; y < height; y += 3) scan.rect(0, y, width, 1);
    scan.fill({ color: 0x000000, alpha: 0.18 });
    this.root.addChild(buildBackground(game.state, width, height), this.links, this.dynamic, this.nodes);
    this.labels = new LabelPool(this.root);
    this.root.addChild(this.kadeRing, this.wrenPulse, this.wrenDot);
    for (const h of game.state.hunters) {
      const glyph = new Graphics();
      this.hunterGlyphs.set(h.id, glyph);
      this.root.addChild(glyph);
    }
    this.root.addChild(scan);
  }

  rebuild(): void {
    const s = this.game.state;
    this.nodes.clear();
    this.labels.begin();
    for (const def of s.rules.district.nodes) {
      const color = nodeColor(s, def);
      drawNodeShape(this.nodes, def, color);
      this.labels.put(def.label, centre(def.x), centre(def.y) + 25, color, 8);
      if (def.type === 'ice') {
        for (let i = 0; i < s.rules.balance.net.iceLayers; i++) {
          this.nodes
            .rect(centre(def.x) - 8 + i * 10, centre(def.y) - 25, 6, 6)
            .fill(i < s.ice ? COLORS.crim : 0x444444);
        }
        // Broken ICE doesn't open anything behind it by itself — Kade still has to route onto
        // its node before whatever it was guarding becomes reachable. Spells that out instead of
        // leaving the player to notice the missing unlock command on their own.
        if (s.ice === 0 && s.kade.node !== def.id)
          this.labels.put('CLEAR — ROUTE THROUGH', centre(def.x), centre(def.y) + 36, COLORS.own, 8);
      }
    }
    const k = s.kade;
    const at = s.rules.nodes[k.node];
    if (at) {
      this.kadeRing.clear();
      this.kadeRing.circle(0, 0, 19).stroke({ width: 2.5, color: k.shock > 0 ? COLORS.crim : COLORS.net });
      this.kadeRing.position.set(centre(at.x), centre(at.y));
      if (k.shock > 0)
        this.labels.put(`DUMPSHOCK ${k.shock}`, centre(at.x), centre(at.y) - 26, COLORS.crim, 9);
    }
    this.wrenPulse.clear();
    this.wrenPulse.circle(0, 0, 5).stroke({ width: 2, color: COLORS.amber });
    this.wrenDot.clear();
    this.wrenDot.circle(0, 0, 4).fill(COLORS.amber);
    for (const h of s.hunters) {
      const glyph = this.hunterGlyphs.get(h.id);
      if (!glyph) continue;
      glyph.clear();
      diamond(glyph, 0, 0, 8).fill({ color: h.stun > 0 ? COLORS.stone : COLORS.crim });
      this.labels.put(h.id, centre(h.x), centre(h.y) - 13, COLORS.crim, 8);
    }
    this.labels.end();
    this.lastLinks = -Infinity;
  }

  /** Marching-ants links, target brackets and the plan beam, redrawn at ~12 Hz while the Net is visible. */
  private redrawLinks(now: number): void {
    const s = this.game.state;
    const g = this.links;
    const offset = this.reduce() ? 0 : now / 50;
    g.clear();
    for (const [a, b] of s.rules.district.links) {
      const A = s.rules.nodes[a];
      const B = s.rules.nodes[b];
      if (!A || !B) continue;
      const hot = a === s.kade.node || b === s.kade.node;
      dashedLine(g, centre(A.x), centre(A.y), centre(B.x), centre(B.y), 6, 6, offset);
      g.stroke({ width: 1.5, color: COLORS.net, alpha: hot ? 0.95 : 0.35 });
    }
    const here = s.rules.nodes[s.kade.node];
    if (here) {
      const r = s.rules.balance.net.burnRange * TILE;
      const x = centre(here.x);
      const y = centre(here.y);
      for (const [x1, y1, x2, y2] of [
        [x, y - r, x + r, y],
        [x + r, y, x, y + r],
        [x, y + r, x - r, y],
        [x - r, y, x, y - r],
      ] as const) {
        dashedLine(g, x1, y1, x2, y2, 2, 5);
      }
      g.stroke({ width: 1, color: COLORS.net, alpha: 0.35 });
    }
    this.drawTargets(g, s, offset);
  }

  private drawTargets(g: Graphics, s: MatchState, offset: number): void {
    if (s.status !== 'play') return;
    const pos = (a: DeckerAction): { x: number; y: number } | null => {
      if (!('target' in a)) return null;
      return s.rules.nodes[a.target] ?? s.hunters.find((h) => h.id === a.target) ?? null;
    };
    for (const a of this.game.legalKade) {
      const clearedIce = a.type === 'route' && s.rules.nodes[a.target]?.type === 'ice' && s.ice === 0;
      const p = isHack(a) || clearedIce ? pos(a) : null;
      if (p) brackets(g, centre(p.x), centre(p.y), 17);
    }
    g.stroke({ width: 2, color: COLORS.own, alpha: 0.55 });
    const plan = this.game.plan.kade;
    const from = s.rules.nodes[s.kade.node];
    const to = pos(plan);
    if (!from || !to) return;
    const fx = centre(from.x);
    const fy = centre(from.y);
    const tx = centre(to.x);
    const ty = centre(to.y);
    if (plan.type === 'route') {
      const d = Math.hypot(tx - fx, ty - fy) || 1;
      arrow(
        g,
        fx + ((tx - fx) / d) * 20,
        fy + ((ty - fy) / d) * 20,
        tx - ((tx - fx) / d) * 20,
        ty - ((ty - fy) / d) * 20,
        COLORS.net,
        true,
      );
    } else if (isHack(plan)) {
      dashedLine(g, fx, fy, tx, ty, 10, 5, offset * 2);
      g.stroke({ width: 3, color: COLORS.own });
      brackets(g, tx, ty, 20);
      g.stroke({ width: 2, color: COLORS.own });
    }
  }

  update(now: number, visible: boolean): void {
    if (!visible) return;
    const s = this.game.state;
    const k = this.game.animProgress(now, this.reduce());
    for (const h of s.hunters) {
      const glyph = this.hunterGlyphs.get(h.id);
      const p = this.game.prev.get(h.id);
      if (!glyph) continue;
      glyph.position.set(centre(p ? p.x + (h.x - p.x) * k : h.x), centre(p ? p.y + (h.y - p.y) * k : h.y));
    }
    const wp = this.game.prev.get('wren');
    const wx = centre(wp ? wp.x + (s.wren.x - wp.x) * k : s.wren.x);
    const wy = centre(wp ? wp.y + (s.wren.y - wp.y) * k : s.wren.y);
    this.wrenPulse.position.set(wx, wy);
    this.wrenDot.position.set(wx, wy);
    this.wrenDot.alpha = s.wren.masked ? 0.35 : 1;
    const slow = this.reduce();
    const q = slow ? 0.4 : (now / 900) % 1;
    this.wrenPulse.scale.set(1 + q * 4);
    this.wrenPulse.alpha = (s.wren.masked ? 0.25 : 0.9) * (1 - q * 0.8);
    this.kadeRing.alpha = slow ? 1 : 0.7 + 0.3 * Math.sin(now / 200);
    if (now - this.lastLinks > 80) {
      this.lastLinks = now;
      this.redrawLinks(now);
    }
  }

  /** Nearest actionable thing to a logical-pixel point: a burn target first, then a node, preferring hacks over routes. */
  pick(px: number, py: number): DeckerAction | undefined {
    const s = this.game.state;
    const near = (x: number, y: number, r: number): boolean => Math.hypot(px - centre(x), py - centre(y)) < r;
    const burn = this.game.legalKade.find((a) => {
      if (a.type !== 'burn') return false;
      const h = s.hunters.find((x) => x.id === a.target);
      return h ? near(h.x, h.y, 22) : false;
    });
    if (burn) return burn;
    const hits = this.game.legalKade.filter((a) => {
      if (!('target' in a)) return false;
      const n = s.rules.nodes[a.target];
      return n ? near(n.x, n.y, 24) : false;
    });
    return hits.find(isHack) ?? hits[0];
  }
}
