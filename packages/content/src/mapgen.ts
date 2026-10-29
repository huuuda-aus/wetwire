import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import type { District } from './schema.ts';

type Rng = ReturnType<typeof xoroshiro128plus>;

const DEFAULT_WIDTH = 16;
const DEFAULT_HEIGHT = 11;
const DEFAULT_ROOM_COLS = 3;
const DEFAULT_ROOM_ROWS = 2;

/** Grid and room-layout size for `generateDistrict`. Defaults match the hand-authored districts'
 * footprint (16×11, a 3×2 room grid). */
export interface MapgenOptions {
  readonly width?: number;
  readonly height?: number;
  readonly roomCols?: number;
  readonly roomRows?: number;
}

interface Room {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function roomCenter(room: Room): { x: number; y: number } {
  return { x: Math.floor((room.x0 + room.x1) / 2), y: Math.floor((room.y0 + room.y1) / 2) };
}

function carveRoom(grid: string[][], room: Room): void {
  for (let y = room.y0; y <= room.y1; y++) {
    for (let x = room.x0; x <= room.x1; x++) {
      const row = grid[y];
      if (row) row[x] = '.';
    }
  }
}

function carveCorridor(grid: string[][], from: { x: number; y: number }, to: { x: number; y: number }): void {
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    const row = grid[y];
    if (row) row[x] = '.';
    x += x < to.x ? 1 : -1;
  }
  while (y !== to.y) {
    const row = grid[y];
    if (row) row[x] = '.';
    y += y < to.y ? 1 : -1;
  }
  const row = grid[y];
  if (row) row[x] = '.';
}

/** Lays out rooms on a fixed grid of blocks, one room per block, so sequential corridor
 * connection always leaves every room mutually reachable (the schema checks this again). */
function layoutRooms(
  grid: string[][],
  rng: Rng,
  width: number,
  height: number,
  roomCols: number,
  roomRows: number,
): Room[] {
  const blockW = Math.floor((width - 2) / roomCols);
  const blockH = Math.floor((height - 2) / roomRows);
  const rooms: Room[] = [];
  for (let row = 0; row < roomRows; row++) {
    for (let col = 0; col < roomCols; col++) {
      const bx = 1 + col * blockW;
      const by = 1 + row * blockH;
      const w = Math.max(2, blockW - 2);
      const h = Math.max(2, blockH - 2);
      const ox = uniformInt(rng, 0, Math.max(0, blockW - w - 1));
      const oy = uniformInt(rng, 0, Math.max(0, blockH - h - 1));
      const room: Room = { x0: bx + ox, y0: by + oy, x1: bx + ox + w - 1, y1: by + oy + h - 1 };
      carveRoom(grid, room);
      rooms.push(room);
    }
  }
  for (let i = 1; i < rooms.length; i++) {
    const prev = rooms[i - 1];
    const cur = rooms[i];
    if (prev && cur) carveCorridor(grid, roomCenter(prev), roomCenter(cur));
  }
  return rooms;
}

function openTileInRoom(grid: string[][], room: Room, rng: Rng): { x: number; y: number } {
  let x: number, y: number;
  do {
    x = uniformInt(rng, room.x0, room.x1);
    y = uniformInt(rng, room.y0, room.y1);
  } while (grid[y]?.[x] !== '.');
  return { x, y };
}

/** Pure* (seed in, District out — only mutation is the local RNG object) procedural district
 * generator. CLAUDE.md §1: no Math.random, no Date.now — randomness comes only from the
 * pure-rand generator seeded from `seed`. Caller validates the result against `districtSchema`
 * before trusting it (`districtsSchema` is the source of truth for what a legal map is). */
export function generateDistrict(seed: number, options: MapgenOptions = {}): District {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const roomCols = options.roomCols ?? DEFAULT_ROOM_COLS;
  const roomRows = options.roomRows ?? DEFAULT_ROOM_ROWS;
  const rng = xoroshiro128plus(seed);
  const grid: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => '#'));

  const rooms = layoutRooms(grid, rng, width, height, roomCols, roomRows);
  const startRoom = rooms[0];
  const receiverRoom = rooms[rooms.length - 1];
  if (!startRoom || !receiverRoom) throw new Error('mapgen: room layout produced no rooms');

  const start = openTileInRoom(grid, startRoom, rng);
  let term = openTileInRoom(grid, startRoom, rng);
  while (term.x === start.x && term.y === start.y) term = openTileInRoom(grid, startRoom, rng);
  const receiver = openTileInRoom(grid, receiverRoom, rng);

  const sRow = grid[start.y];
  if (sRow) sRow[start.x] = 'S';
  const tRow = grid[term.y];
  if (tRow) tRow[term.x] = 'T';
  const rRow = grid[receiver.y];
  if (rRow) rRow[receiver.x] = 'R';

  // Doors: one per room-to-room corridor join (up to 2), so the map always has at least one
  // lockable passage, matching the hand-authored districts' style.
  const doorCount = Math.min(2, rooms.length - 1);
  const doors: District['doors'] = [];
  for (let i = 0; i < doorCount; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    if (!a || !b) continue;
    const ca = roomCenter(a);
    const cb = roomCenter(b);
    const mid = { x: Math.round((ca.x + cb.x) / 2), y: Math.round((ca.y + cb.y) / 2) };
    const row = grid[mid.y];
    if (row && row[mid.x] !== '#' && row[mid.x] !== 'S' && row[mid.x] !== 'T' && row[mid.x] !== 'R') {
      row[mid.x] = 'D';
      doors.push({ id: `DR${i + 1}`, name: `DOOR-${i + 1}`, x: mid.x, y: mid.y });
    }
  }

  const rows = grid.map((row) => row.join(''));

  const nodes: District['nodes'] = [
    { id: 'TERM', x: term.x, y: term.y, type: 'terminal', label: 'TERM', ctl: null },
  ];
  const links: District['links'] = [];
  let prevNodeId = 'TERM';
  for (const door of doors) {
    nodes.push({ id: door.id, x: door.x, y: door.y, type: 'door', label: door.name, ctl: door.id });
    links.push([prevNodeId, door.id]);
    prevNodeId = door.id;
  }
  rooms.forEach((room, i) => {
    const c = roomCenter(room);
    const id = `JX${i + 1}`;
    nodes.push({ id, x: c.x, y: c.y, type: 'junction', label: `JX-${i + 1}`, ctl: null });
    links.push([prevNodeId, id]);
    prevNodeId = id;
  });
  // ICE and cameras are physical street objects (CLAUDE.md-adjacent: the Net node is tied to a
  // real object), so they sit on open floor tiles, unlike junctions, which are pure net
  // abstractions free to sit anywhere, including inside a wall.
  let ice = openTileInRoom(grid, receiverRoom, rng);
  while (ice.x === receiver.x && ice.y === receiver.y) ice = openTileInRoom(grid, receiverRoom, rng);
  nodes.push({ id: 'ICE', x: ice.x, y: ice.y, type: 'ice', label: 'ICE', ctl: null });
  links.push([prevNodeId, 'ICE']);

  const dirs = [0, 1, 2, 3] as const;
  const camRooms = rooms.filter((_, i) => i % 2 === 0).slice(0, 3);
  const cams: District['cams'] = camRooms.map((room, i) => {
    const spot = openTileInRoom(grid, room, rng);
    const id = `CAM-${String.fromCharCode(65 + i)}`;
    const nodeId = `CAMNODE${i + 1}`;
    nodes.push({ id: nodeId, x: spot.x, y: spot.y, type: 'camera', label: id, ctl: id });
    links.push(['ICE', nodeId]);
    const dirA = dirs[uniformInt(rng, 0, 3)] ?? 0;
    const dirB = dirs[uniformInt(rng, 0, 3)] ?? 1;
    return { id, node: nodeId, x: spot.x, y: spot.y, dirs: [dirA, dirB] };
  });

  const openTiles: { x: number; y: number }[] = [];
  grid.forEach((row, y) => row.forEach((tile, x) => tile !== '#' && openTiles.push({ x, y })));

  const hunters: District['hunters'] = [0, 1].map((i) => {
    const spot = openTiles[uniformInt(rng, 0, Math.max(0, openTiles.length - 1))] ?? start;
    const wps: [number, number][] = [0, 1].map((): [number, number] => {
      const wp = openTiles[uniformInt(rng, 0, Math.max(0, openTiles.length - 1))] ?? spot;
      return [wp.x, wp.y];
    });
    const face = dirs[uniformInt(rng, 0, 3)] ?? 0;
    return { id: `H-${i + 1}`, x: spot.x, y: spot.y, face, wps, wpi: 0 };
  });

  const isDefaultSize = width === DEFAULT_WIDTH && height === DEFAULT_HEIGHT;
  const sizeTag = isDefaultSize ? '' : `${width}x${height}-`;
  return {
    id: `generated-${sizeTag}${seed}`,
    name: `Generated Sprawl · ${isDefaultSize ? '' : `${width}×${height} · `}Seed ${seed}`,
    rows,
    wrenStart: start,
    terminal: term,
    receiver,
    doors,
    nodes,
    links,
    cams,
    hunters,
  };
}
