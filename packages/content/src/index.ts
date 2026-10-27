import balanceJson from '../data/balance.json' with { type: 'json' };
import implantsJson from '../data/implants.json' with { type: 'json' };
import districtJson from '../data/ironbridge-dock-row.json' with { type: 'json' };
import rolesJson from '../data/roles.json' with { type: 'json' };
import {
  balanceSchema,
  districtSchema,
  implantsSchema,
  rolesSchema,
  type Balance,
  type District,
  type Implant,
  type Role,
} from './schema.ts';

export * from './schema.ts';

export interface Content {
  readonly district: District;
  readonly balance: Balance;
  readonly roles: readonly Role[];
  readonly implants: readonly Implant[];
}

/** Parse raw content files; throws a ZodError that names the bad field. */
export function parseContent(
  rawDistrict: unknown,
  rawBalance: unknown,
  rawRoles: unknown = rolesJson,
  rawImplants: unknown = implantsJson,
): Content {
  return {
    district: districtSchema.parse(rawDistrict),
    balance: balanceSchema.parse(rawBalance),
    roles: rolesSchema.parse(rawRoles),
    implants: implantsSchema.parse(rawImplants),
  };
}

export const content: Content = parseContent(districtJson, balanceJson, rolesJson, implantsJson);
