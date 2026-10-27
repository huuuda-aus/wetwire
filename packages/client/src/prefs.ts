export type MotionPref = 'system' | 'reduce' | 'full';

export interface Prefs {
  timed: boolean;
  payload: string;
  volume: number;
  motion: MotionPref;
}

const KEY = 'wetwire.prefs';
const DEFAULTS: Prefs = { timed: false, payload: 'standard', volume: 0.6, motion: 'system' };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** localStorage can be missing or throw (private mode, blocked cookies); prefs are a convenience only. */
export function loadPrefs(): Prefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!isRecord(raw)) return { ...DEFAULTS };
    const motion = raw['motion'];
    return {
      timed: typeof raw['timed'] === 'boolean' ? raw['timed'] : DEFAULTS.timed,
      payload: typeof raw['payload'] === 'string' ? raw['payload'] : DEFAULTS.payload,
      volume: typeof raw['volume'] === 'number' ? Math.min(1, Math.max(0, raw['volume'])) : DEFAULTS.volume,
      motion: motion === 'reduce' || motion === 'full' ? motion : 'system',
    };
  } catch (err) {
    console.warn('wetwire: could not read saved preferences, using defaults', err);
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (err) {
    console.warn('wetwire: could not save preferences', err);
  }
}

export function reducedMotion(p: Prefs): boolean {
  if (p.motion === 'reduce') return true;
  if (p.motion === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
