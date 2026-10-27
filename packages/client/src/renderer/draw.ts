import { Container, Graphics, Text } from 'pixi.js';

export const TILE = 44;
export const COLORS = {
  ink: 0x0c0d0f,
  line: 0x2a2b31,
  fg: 0xdcd8cf,
  mute: 0x8b877e,
  amber: 0xf0b43c,
  crim: 0xe0464e,
  net: 0x5ee0ff,
  own: 0xb98cff,
  stone: 0x6b6b70,
  razor: 0xff8c42,
} as const;
export const FONT = '"Martian Mono", ui-monospace, monospace';
export const TAU = Math.PI * 2;

/** Centre of a tile in pixels. */
export const centre = (t: number): number => (t + 0.5) * TILE;

/** Adds dashed segments to the current path; the caller strokes once. */
export function dashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash = 6,
  gap = 5,
  offset = 0,
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const period = dash + gap;
  for (let d = -(offset % period); d < len; d += period) {
    const a = Math.max(0, d);
    const b = Math.min(len, d + dash);
    if (b > a) g.moveTo(x1 + ux * a, y1 + uy * a).lineTo(x1 + ux * b, y1 + uy * b);
  }
}

/** `arc` continues from the current path point in Pixi, so start a fresh subpath at the arc's first point. */
export function arcPath(g: Graphics, x: number, y: number, r: number, from: number, to: number): Graphics {
  return g.moveTo(x + Math.cos(from) * r, y + Math.sin(from) * r).arc(x, y, r, from, to);
}

export function diamond(g: Graphics, x: number, y: number, r: number): Graphics {
  return g.poly([x, y - r, x + r, y, x, y + r, x - r, y]);
}

export function regularPoly(g: Graphics, x: number, y: number, r: number, n: number, rot: number): Graphics {
  const pts: number[] = [];
  for (let i = 0; i < n; i++)
    pts.push(x + Math.cos(rot + (i / n) * TAU) * r, y + Math.sin(rot + (i / n) * TAU) * r);
  return g.poly(pts);
}

export function brackets(g: Graphics, x: number, y: number, r: number): void {
  const k = r * 0.45;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    g.moveTo(x + sx * r, y + sy * (r - k))
      .lineTo(x + sx * r, y + sy * r)
      .lineTo(x + sx * (r - k), y + sy * r);
  }
}

/** Stroked line with a filled head. Draws a complete shape (stroke + fill) so it can be called repeatedly. */
export function arrow(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  dashed: boolean,
): void {
  if (dashed) dashedLine(g, x1, y1, x2, y2, 5, 4);
  else g.moveTo(x1, y1).lineTo(x2, y2);
  g.stroke({ width: 2, color });
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.poly([
    x2,
    y2,
    x2 - Math.cos(a - 0.45) * 9,
    y2 - Math.sin(a - 0.45) * 9,
    x2 - Math.cos(a + 0.45) * 9,
    y2 - Math.sin(a + 0.45) * 9,
  ]).fill({ color });
}

/** Reusable small labels so redraws never allocate new Text objects. */
export class LabelPool {
  private readonly pool: Text[] = [];
  private used = 0;
  private readonly parent: Container;

  constructor(parent: Container) {
    this.parent = parent;
  }

  begin(): void {
    this.used = 0;
  }

  put(text: string, x: number, y: number, color: number, size = 9): void {
    let t = this.pool[this.used];
    if (!t) {
      t = new Text({
        text,
        style: { fontFamily: FONT, fontSize: size, fontWeight: '500', fill: 0xffffff },
        resolution: 2,
      });
      t.anchor.set(0.5);
      this.parent.addChild(t);
      this.pool.push(t);
    }
    this.used += 1;
    t.visible = true;
    t.text = text;
    t.style.fontSize = size;
    t.tint = color;
    t.position.set(x, y);
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) {
      const t = this.pool[i];
      if (t) t.visible = false;
    }
  }
}
