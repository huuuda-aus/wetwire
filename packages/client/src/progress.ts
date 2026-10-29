const KEY = 'wetwire.progress';

export interface Progress {
  deliveries: number;
}

const DEFAULTS: Progress = { deliveries: 0 };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** localStorage can be missing or throw (private mode, blocked cookies); progress gating then
 * just falls back to "first-timer" every session, which is the safe direction to fail in. */
export function loadProgress(): Progress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!isRecord(raw)) return { ...DEFAULTS };
    const deliveries = raw['deliveries'];
    return {
      deliveries: typeof deliveries === 'number' && deliveries >= 0 ? deliveries : DEFAULTS.deliveries,
    };
  } catch (err) {
    console.warn('wetwire: could not read saved progress, starting fresh', err);
    return { ...DEFAULTS };
  }
}

export function recordDelivery(p: Progress): Progress {
  const next = { deliveries: p.deliveries + 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('wetwire: could not save progress', err);
  }
  return next;
}

/** First-session gate (CLAUDE.md §2: options, not power — this restricts choice on the start
 * screen only, never a match-affecting rule): a player who has never delivered a contract only
 * sees the default payload and district, so turn one isn't a wall of unexplained options. */
export const isFirstTimer = (p: Progress): boolean => p.deliveries === 0;
