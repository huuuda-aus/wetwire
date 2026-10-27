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

/** BFS with every door treated as open: a sanity check that the map is not simply disconnected. */
function reachableWithDoorsOpen(rows: readonly string[], from: { x: number; y: number }): Set<string> {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue: [number, number][] = [[from.x, from.y]];
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (!point) continue;
    const [x, y] = point;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + (dx ?? 0);
      const ny = y + (dy ?? 0);
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(key)) continue;
      if (rows[ny]?.[nx] === '#') continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

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
  for (const h of d.hunters) {
    if (h.wpi >= h.wps.length) fail(`hunter ${h.id} waypoint index is out of range`);
    if (tile(h.x, h.y) === '#') fail(`hunter ${h.id} starts inside a wall`);
  }
  const reachable = reachableWithDoorsOpen(d.rows, d.wrenStart);
  if (!reachable.has(`${d.receiver.x},${d.receiver.y}`)) {
    fail('receiver is unreachable from wrenStart even with every door open');
  }
  for (const h of d.hunters) {
    if (tile(h.x, h.y) !== '#' && !reachable.has(`${h.x},${h.y}`)) {
      fail(`hunter ${h.id} starts in a pocket disconnected from wrenStart`);
    }
  }
}

export const districtSchema = districtShape.superRefine(checkDistrict);
export type District = z.infer<typeof districtSchema>;
export type NodeDef = z.infer<typeof nodeSchema>;

function checkDistrictIdsUnique(districts: District[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const d of districts) {
    if (seen.has(d.id)) ctx.addIssue({ code: 'custom', message: `duplicate district id "${d.id}"` });
    seen.add(d.id);
  }
}

export const districtsSchema = z.array(districtSchema).min(1).superRefine(checkDistrictIdsUnique);

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
    neural: z.object({
      capacity: positive,
      attenuationTicks: z.number().int().positive(),
      attenuationEvery: z.number().int().positive(),
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

// --- Phase 4: roles and implants (PROMPT.md §7.3, §7.4) ---------------------------------------
// Numbers here are the only tunables for a signature action's cost; `effect` is flavour text,
// never a number a rule depends on (CLAUDE.md: no magic numbers in logic).

const channelSchema = z.enum(['meat', 'net', 'ghost']);

const roleActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // Movement and logistics actions (Sprint, Dead drop, Relocate…) carry no channel: the
  // combat triangle (§7.1) only classifies Meat/Net/Ghost tools, not every signature action.
  channel: channelSchema.nullable(),
  effect: z.string().min(1),
  windupTicks: z.number().int().min(0).optional(),
  loadCost: z.number().min(0).optional(),
});

const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  body: z.number().int().positive(),
  baseMove: z.number().int().positive(),
  canSprint: z.boolean(),
  passive: z.string().min(1),
  actions: z.array(roleActionSchema).min(1),
});

function checkRoles(roles: Role[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.id)) ctx.addIssue({ code: 'custom', message: `duplicate role id "${role.id}"` });
    seen.add(role.id);
    const actionIds = new Set<string>();
    for (const a of role.actions) {
      if (actionIds.has(a.id)) {
        ctx.addIssue({ code: 'custom', message: `role "${role.id}" has a duplicate action id "${a.id}"` });
      }
      actionIds.add(a.id);
    }
  }
}

export const rolesSchema = z.array(roleSchema).min(1).superRefine(checkRoles);
export type Role = z.infer<typeof roleSchema>;
export type RoleAction = z.infer<typeof roleActionSchema>;
export type Channel = z.infer<typeof channelSchema>;

const implantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slotCost: z.number().int().positive(),
  effect: z.string().min(1),
  tradeoff: z.string().min(1),
});

function checkImplants(implants: Implant[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const i of implants) {
    if (seen.has(i.id)) ctx.addIssue({ code: 'custom', message: `duplicate implant id "${i.id}"` });
    seen.add(i.id);
  }
}

export const implantsSchema = z.array(implantSchema).min(1).superRefine(checkImplants);
export type Implant = z.infer<typeof implantSchema>;
