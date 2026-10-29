const KEY = 'wetwire.progress';

export interface Progress {
  deliveries: number;
  /** True once the scripted onboarding has run to completion or been skipped, so it never
   * shows again — independent of `deliveries` (a first run that ends in Taken/Flatlined
   * shouldn't replay the tutorial on the next attempt either). */
  tutorialDone: boolean;
}

const DEFAULTS: Progress = { deliveries: 0, tutorialDone: false };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function save(next: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('wetwire: could not save progress', err);
  }
}

/** localStorage can be missing or throw (private mode, blocked cookies); progress gating then
 * just falls back to "first-timer" every session, which is the safe direction to fail in. */
export function loadProgress(): Progress {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!isRecord(raw)) return { ...DEFAULTS };
    const deliveries = raw['deliveries'];
    const tutorialDone = raw['tutorialDone'];
    return {
      deliveries: typeof deliveries === 'number' && deliveries >= 0 ? deliveries : DEFAULTS.deliveries,
      tutorialDone: typeof tutorialDone === 'boolean' ? tutorialDone : DEFAULTS.tutorialDone,
    };
  } catch (err) {
    console.warn('wetwire: could not read saved progress, starting fresh', err);
    return { ...DEFAULTS };
  }
}

export function recordDelivery(p: Progress): Progress {
  const next = { ...p, deliveries: p.deliveries + 1 };
  save(next);
  return next;
}

export function dismissTutorial(p: Progress): Progress {
  const next = { ...p, tutorialDone: true };
  save(next);
  return next;
}

/** First-session gate (CLAUDE.md §2: options, not power — this restricts choice on the start
 * screen only, never a match-affecting rule): a player who has never delivered a contract only
 * sees the default payload and district, so turn one isn't a wall of unexplained options. */
export const isFirstTimer = (p: Progress): boolean => p.deliveries === 0;

/** The scripted onboarding only ever runs on a first-timer's match, and only once. */
export const showTutorial = (p: Progress): boolean => isFirstTimer(p) && !p.tutorialDone;
