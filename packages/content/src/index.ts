import balanceJson from '../data/balance.json' with { type: 'json' };
import districtJson from '../data/ironbridge-dock-row.json' with { type: 'json' };
import { balanceSchema, districtSchema, type Balance, type District } from './schema.ts';

export * from './schema.ts';

export interface Content {
  readonly district: District;
  readonly balance: Balance;
}

/** Parse raw content files; throws a ZodError that names the bad field. */
export function parseContent(rawDistrict: unknown, rawBalance: unknown): Content {
  return { district: districtSchema.parse(rawDistrict), balance: balanceSchema.parse(rawBalance) };
}

export const content: Content = parseContent(districtJson, balanceJson);
