import type { Content } from '@wetwire/content';
import {
  buildRuleset,
  type CourierAction,
  type DeckerAction,
  type GameEvent,
  type MatchState,
} from '@wetwire/sim';

const KEY = 'wetwire.match';
/** Snapshot format version. Bump it when the shape changes; an old-version key is simply
 * dropped (loadMatch returns null) rather than risk restoring something the sim no longer
 * understands. */
const VERSION = 1;

export interface PersistedPlan {
  wren: CourierAction;
  kade: DeckerAction;
}
export type PersistedView = 'street' | 'net';

/** Everything needed to resume a match after a reload. `rules` is rebuilt from content on
 * restore: it holds a Uint8Array and derived lookups, not something to round-trip through JSON. */
export interface MatchSnapshot {
  districtId: string;
  match: Omit<MatchState, 'rules'>;
  plan: PersistedPlan;
  view: PersistedView;
  log: GameEvent[];
}

export function saveMatch(
  state: MatchState,
  plan: PersistedPlan,
  view: PersistedView,
  log: readonly GameEvent[],
): void {
  try {
    const { rules: _rules, ...match } = state;
    const payload = { version: VERSION, districtId: state.rules.district.id, match, plan, view, log };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('wetwire: could not save match progress', err);
  }
}

export function clearMatch(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.warn('wetwire: could not clear saved match', err);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Reads a saved match. Returns null on anything unexpected (missing, wrong version, unknown
 * district, a shape that doesn't parse, or a match that already ended) rather than risk
 * resuming into a broken state — a fresh match is always a safe fallback. */
export function loadMatch(content: Content): MatchSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed['version'] !== VERSION) return null;
    const { districtId, match, plan, view, log } = parsed;
    if (typeof districtId !== 'string' || !isRecord(match) || !isRecord(plan) || !Array.isArray(log))
      return null;
    if (view !== 'street' && view !== 'net') return null;
    if (match['status'] !== 'play') return null; // nothing to resume once the contract is settled
    if (!content.districts.some((d) => d.id === districtId)) return null;
    return {
      districtId,
      match: match as Omit<MatchState, 'rules'>,
      plan: plan as unknown as PersistedPlan,
      view,
      log: log as GameEvent[],
    };
  } catch (err) {
    console.warn('wetwire: could not read saved match, starting fresh', err);
    return null;
  }
}

export function restoreState(content: Content, saved: MatchSnapshot): MatchState {
  const district = content.districts.find((d) => d.id === saved.districtId) ?? content.district;
  const rules = buildRuleset(district, content.balance, content.implants);
  return { ...saved.match, rules };
}
