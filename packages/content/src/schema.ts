import { z } from 'zod';

const coord = z.number().int().min(0);
const posSchema = z.object({ x: coord, y: coord });
const dirSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const cost = z.object({ load: z.number().min(0), trace: z.number().min(0) });
const positive = z.number().positive();

const nodeSchema = z.object({
  id: z.string().min(1),
  x: coord,
  y: coord,
  type: z.enum(['terminal', 'junction', 'camera', 'door', 'ice']),
  label: z.string().min(1),
  ctl: z.string().nullable(),
});

const doorSchema = z.object({ id: z.string().min(1), name: z.string().min(1), x: coord, y: coord });

const camSchema = z.object({
  id: z.string().min(1),
  node: z.string().min(1),
  x: coord,
  y: coord,
  dirs: z.tuple([dirSchema, dirSchema]),
});

const hunterSchema = z.object({
  id: z.string().min(1),
  x: coord,
  y: coord,
  face: dirSchema,
  wps: z.array(z.tuple([coord, coord])).min(1),
  wpi: coord,
});

const districtShape = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rows: z.array(z.string().regex(/^[#.DRST]+$/, 'map rows may only use # . D R S T')).min(3),
  wrenStart: posSchema,
  terminal: posSchema,
  receiver: posSchema,
  doors: z.array(doorSchema),
  nodes: z.array(nodeSchema).min(1),
  links: z.array(z.tuple([z.string(), z.string()])),
  cams: z.array(camSchema),
  hunters: z.array(hunterSchema),
});

type DistrictShape = z.infer<typeof districtShape>;

function checkDistrict(d: DistrictShape, ctx: z.RefinementCtx): void {
  const fail = (message: string): void => {
    ctx.addIssue({ code: 'custom', message });
  };
  const width = d.rows[0]?.length ?? 0;
  if (d.rows.some((r) => r.length !== width)) fail('all map rows must have the same width');
  const tile = (x: number, y: number): string | undefined => d.rows[y]?.[x];
  if (tile(d.wrenStart.x, d.wrenStart.y) !== 'S') fail('wrenStart must sit on an S tile');
  if (tile(d.terminal.x, d.terminal.y) !== 'T') fail('terminal must sit on a T tile');
  if (tile(d.receiver.x, d.receiver.y) !== 'R') fail('receiver must sit on an R tile');
  for (const door of d.doors) if (tile(door.x, door.y) !== 'D') fail(`door ${door.id} must sit on a D tile`);
  const ids = new Set(d.nodes.map((n) => n.id));
  for (const [a, b] of d.links) if (!ids.has(a) || !ids.has(b)) fail(`link ${a}-${b} names an unknown node`);
  for (const cam of d.cams) if (!ids.has(cam.node)) fail(`camera ${cam.id} names an unknown node`);
  for (const h of d.hunters) if (h.wpi >= h.wps.length) fail(`hunter ${h.id} waypoint index is out of range`);
}

export const districtSchema = districtShape.superRefine(checkDistrict);
export type District = z.infer<typeof districtSchema>;
export type NodeDef = z.infer<typeof nodeSchema>;

const payloadSchema = z.object({
  label: z.string().min(1),
  mb: positive,
  rate: positive,
  fee: positive,
  note: z.string(),
});

export const balanceSchema = z
  .object({
    overloadMax: positive,
    maskCost: z.number().min(0),
    wrenBody: z.number().int().positive(),
    kadeBody: z.number().int().positive(),
    cam: z.object({
      range: positive,
      cos: z.number().min(-1).max(1),
      turnEvery: z.number().int().positive(),
    }),
    hunter: z.object({
      sight: positive,
      memory: z.number().int().positive(),
      stunTicks: z.number().int().min(0),
      hitDamage: z.number().int().positive(),
    }),
    net: z.object({
      decay: cost,
      costs: z.object({ blind: cost, unlock: cost, ice: cost, burn: cost }),
      burnRange: positive,
      bodyThreatRange: positive,
      blindTicks: z.number().int().positive(),
      burnStun: z.number().int().positive(),
      iceLayers: z.number().int().positive(),
      loadMax: positive,
      traceMax: positive,
      overloadShock: z.number().int().positive(),
      loadAfterShock: z.number().min(0),
      bodyHitShock: z.number().int().positive(),
      bodyHitLoadFloor: z.number().min(0),
    }),
    downloadTicks: z.number().int().positive(),
    fee: z.object({ base: z.number().min(0), perBody: z.number().min(0), round: positive }),
    defaultPayload: z.string(),
    payloads: z.record(z.string(), payloadSchema),
  })
  .refine((b) => b.defaultPayload in b.payloads, { message: 'defaultPayload must name a payload' });
export type Balance = z.infer<typeof balanceSchema>;
export type Payload = z.infer<typeof payloadSchema>;
export type Cost = z.infer<typeof cost>;
