// Loadout validation (§7.2, §7.4): implants are a permanent, shared-budget tax on the 100-point
// neural capacity every character has. No gameplay effect lives here yet — applying an
// implant's effect is per-role work; this only enforces the budget.
import type { Implant } from '@wetwire/content';

export interface LoadoutCheck {
  ok: boolean;
  cost: number;
  capacity: number;
  /** Set when `ok` is false: an unknown implant id, or the total exceeds capacity. */
  reason?: string;
}

/** Sum of slot costs for a set of implant ids. Unknown ids cost 0 here; `validateLoadout`
 * is what rejects them, so callers that only want a number don't have to handle errors. */
export function loadoutSlotCost(implants: readonly Implant[], implantIds: readonly string[]): number {
  let total = 0;
  for (const id of implantIds) {
    const implant = implants.find((i) => i.id === id);
    if (implant) total += implant.slotCost;
  }
  return total;
}

export function validateLoadout(
  implants: readonly Implant[],
  capacity: number,
  implantIds: readonly string[],
): LoadoutCheck {
  for (const id of implantIds) {
    if (!implants.some((i) => i.id === id)) {
      return { ok: false, cost: 0, capacity, reason: `unknown implant "${id}"` };
    }
  }
  const cost = loadoutSlotCost(implants, implantIds);
  if (cost > capacity) {
    return { ok: false, cost, capacity, reason: `loadout costs ${cost}, over the ${capacity} neural budget` };
  }
  return { ok: true, cost, capacity };
}
