import type { Dir, HunterState, MatchState, Pos, Ruleset } from './types.ts';
import { must } from './util.ts';

type Vec = readonly [number, number];
/** N E S W. Also the BFS tie-break order, which keeps hunter paths deterministic. */
export const DIRS: readonly [Vec, Vec, Vec, Vec] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const DIR_NAMES = ['north', 'east', 'south', 'west'] as const;

export const dirVec = (d: Dir): Vec => DIRS[d];
export const manhattan = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const euclid = (a: Pos, b: Pos): number => Math.hypot(a.x - b.x, a.y - b.y);

export const inBounds = (r: Ruleset, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < r.cols && y < r.rows;
export const isWall = (r: Ruleset, x: number, y: number): boolean =>
  !inBounds(r, x, y) || r.wall[y * r.cols + x] === 1;

export function passable(s: MatchState, x: number, y: number): boolean {
  const r = s.rules;
  if (isWall(r, x, y)) return false;
  const door = r.doorGrid[y * r.cols + x];
  return door === null || door === undefined || s.doors[door] === true;
}

/** Distance in steps from every tile to the nearest goal. -1 means unreachable. */
export function distField(s: MatchState, goals: readonly Pos[], openDoors: boolean): Int16Array {
  const r = s.rules;
  const dist = new Int16Array(r.cols * r.rows).fill(-1);
  const queue: number[] = [];
  for (const g of goals) {
    if (!inBounds(r, g.x, g.y)) continue;
    dist[g.y * r.cols + g.x] = 0;
    queue.push(g.x, g.y);
  }
  for (let i = 0; i < queue.length; i += 2) {
    const x = must(queue[i], 'queue x');
    const y = must(queue[i + 1], 'queue y');
    const d = must(dist[y * r.cols + x], 'distance');
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(r, nx, ny) || dist[ny * r.cols + nx] !== -1) continue;
      if (openDoors ? isWall(r, nx, ny) : !passable(s, nx, ny)) continue;
      dist[ny * r.cols + nx] = d + 1;
      queue.push(nx, ny);
    }
  }
  return dist;
}

export const distAt = (s: MatchState, field: Int16Array, x: number, y: number): number =>
  inBounds(s.rules, x, y) ? (field[y * s.rules.cols + x] ?? -1) : -1;

/** First step along a shortest path from `from` to the nearest goal, or null if there is none. */
export function stepToward(s: MatchState, from: Pos, goals: readonly Pos[]): Pos | null {
  const field = distField(s, goals, false);
  const here = distAt(s, field, from.x, from.y);
  if (here <= 0) return null;
  for (const [dx, dy] of DIRS) {
    const nx = from.x + dx;
    const ny = from.y + dy;
    if (distAt(s, field, nx, ny) === here - 1) return { x: nx, y: ny };
  }
  return null;
}

/** Bresenham over tile centres. Walls and closed doors block; the endpoints never do. */
export function lineOfSight(s: MatchState, a: Pos, b: Pos): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if ((x !== b.x || y !== b.y) && !passable(s, x, y)) return false;
  }
  return true;
}

export function camFacing(s: MatchState, camIndex: number, tick: number): Dir {
  const cam = must(s.cams[camIndex], 'camera');
  const turn = Math.floor((tick - 1) / s.rules.balance.cam.turnEvery) % 2;
  return must(cam.dirs[turn], 'camera facing');
}

export function inCone(s: MatchState, camIndex: number, tick: number, p: Pos): boolean {
  const cam = must(s.cams[camIndex], 'camera');
  const [fx, fy] = dirVec(camFacing(s, camIndex, tick));
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return true;
  const { range, cos } = s.rules.balance.cam;
  if (d > range || (dx * fx + dy * fy) / d < cos) return false;
  return lineOfSight(s, cam, p);
}

export function hunterSees(s: MatchState, h: HunterState): boolean {
  const w = s.wren;
  if (manhattan(h, w) <= 1) return true;
  return !w.masked && euclid(h, w) <= s.rules.balance.hunter.sight && lineOfSight(s, h, w);
}

/** Open tiles next to Kade's terminal where a hunter can reach his body. */
export function bodyApproachTiles(s: MatchState): Pos[] {
  const t = s.rules.district.terminal;
  return DIRS.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).filter((p) => passable(s, p.x, p.y));
}
