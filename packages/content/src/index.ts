import balanceJson from '../data/balance.json' with { type: 'json' };
import harrowYardsJson from '../data/districts/harrow-yards.json' with { type: 'json' };
import implantsJson from '../data/implants.json' with { type: 'json' };
import districtJson from '../data/ironbridge-dock-row.json' with { type: 'json' };
import rolesJson from '../data/roles.json' with { type: 'json' };
import {
  balanceSchema,
  districtsSchema,
  implantsSchema,
  rolesSchema,
  type Balance,
  type District,
  type Implant,
  type Role,
} from './schema.ts';

export * from './schema.ts';

/** Every district this build ships. Add a file to `data/districts/` (or the legacy top-level
 * path) and list it here to make it playable. */
const ALL_DISTRICTS: readonly unknown[] = [districtJson, harrowYardsJson];
const DEFAULT_DISTRICT_ID = 'ironbridge-dock-row';

export interface Content {
  /** The default district (`DEFAULT_DISTRICT_ID`), kept for callers that don't pick one. */
  readonly district: District;
  readonly districts: readonly District[];
  readonly balance: Balance;
  readonly roles: readonly Role[];
  readonly implants: readonly Implant[];
}

/** Parse raw content files; throws a ZodError that names the bad field. */
export function parseContent(
  rawDistricts: readonly unknown[],
  rawBalance: unknown,
  rawRoles: unknown = rolesJson,
  rawImplants: unknown = implantsJson,
): Content {
  const districts = districtsSchema.parse(rawDistricts);
  const district = districts.find((d) => d.id === DEFAULT_DISTRICT_ID) ?? districts[0];
  if (!district) throw new Error('wetwire content: at least one district is required');
  return {
    district,
    districts,
    balance: balanceSchema.parse(rawBalance),
    roles: rolesSchema.parse(rawRoles),
    implants: implantsSchema.parse(rawImplants),
  };
}

export const content: Content = parseContent(ALL_DISTRICTS, balanceJson, rolesJson, implantsJson);
