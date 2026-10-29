import { content as shipped, type Content } from '@wetwire/content';
import {
  KADE,
  RAZOR,
  WREN,
  createMatch,
  legalCourierActions,
  legalDeckerActions,
  legalRazorActions,
  resolveTick,
  sameAction,
  type CourierAction,
  type DeckerAction,
  type GameEvent,
  type MatchState,
  type RazorAction,
} from '@wetwire/sim';
import { clearMatch, loadMatch, restoreState, saveMatch } from './persist.ts';
import { loadPrefs, savePrefs, type Prefs } from './prefs.ts';
import { loadProgress, recordDelivery, type Progress } from './progress.ts';

export type View = 'street' | 'net';
export interface Plan {
  wren: CourierAction;
  kade: DeckerAction;
  razor: RazorAction;
}
export interface Pt {
  x: number;
  y: number;
}
export const ANIM_MS = 300;
export const TIMER_MS = 12000;
const LOG_LIMIT = 80;
const freshPlan = (): Plan => ({ wren: { type: 'wait' }, kade: { type: 'hold' }, razor: { type: 'wait' } });

/**
 * Client-side store. It owns no rules: it forwards the plan to `resolveTick` and keeps what the UI needs.
 * `version` bumps on every change so the renderer can rebuild only when something moved.
 */
export class Game {
  readonly content: Content;
  prefs: Prefs;
  progress: Progress;
  state: MatchState;
  plan: Plan = freshPlan();
  view: View = 'street';
  /** Full-map overview toggle (scouting); transient UI state, not persisted across reload. */
  overview = false;
  log: GameEvent[] = [];
  legalWren: CourierAction[] = [];
  legalKade: DeckerAction[] = [];
  legalRazor: RazorAction[] = [];
  version = 0;
  running = false;
  /** Unit positions before the last resolve, for the 300 ms interpolation. */
  prev = new Map<string, Pt>();
  animStart = -Infinity;
  tickStart = 0;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(events: readonly GameEvent[]) => void>();

  constructor(content: Content = shipped, prefs: Prefs = loadPrefs()) {
    this.content = content;
    this.prefs = prefs;
    this.progress = loadProgress();
    const saved = loadMatch(content);
    if (saved) {
      this.state = restoreState(content, saved);
      this.plan = saved.plan;
      this.view = saved.view;
      this.log = saved.log;
      this.running = true;
    } else {
      this.state = createMatch(content, { payload: prefs.payload }, 0);
    }
    this.refresh();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onEvents(fn: (events: readonly GameEvent[]) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private refresh(): void {
    this.legalWren = legalCourierActions(this.state);
    this.legalKade = this.state.status === 'play' ? legalDeckerActions(this.state) : [];
    this.legalRazor = this.state.status === 'play' ? legalRazorActions(this.state) : [];
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  start(payload: string, now: number, districtId?: string): void {
    this.prefs = { ...this.prefs, payload };
    savePrefs(this.prefs);
    this.state = createMatch(
      this.content,
      districtId === undefined ? { payload } : { payload, districtId },
      Date.now() >>> 0,
    );
    this.plan = freshPlan();
    this.log = [
      {
        tick: 1,
        type: 'KadeRouted',
        layer: 'STREET',
        kind: 'info',
        text: `Contract open. ${this.content.balance.payloads[payload]?.label ?? payload} load, ${this.state.rules.district.name}.`,
        fx: null,
      },
    ];
    this.prev.clear();
    this.animStart = -Infinity;
    this.tickStart = now;
    this.running = true;
    this.view = 'street';
    this.refresh();
    this.persist();
  }

  setPrefs(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  setView(view: View): void {
    this.view = view;
    this.version += 1;
    for (const fn of this.listeners) fn();
    if (this.running) this.persist();
  }

  setOverview(overview: boolean): void {
    this.overview = overview;
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  setWrenAction(a: CourierAction | undefined): void {
    if (!a || this.state.status !== 'play' || !this.legalWren.some((l) => sameAction(l, a))) return;
    this.plan = { ...this.plan, wren: a };
    this.refresh();
    this.persist();
  }

  setKadeAction(a: DeckerAction | undefined): void {
    if (!a || this.state.status !== 'play' || !this.legalKade.some((l) => sameAction(l, a))) return;
    this.plan = { ...this.plan, kade: a };
    this.refresh();
    this.persist();
  }

  setRazorAction(a: RazorAction | undefined): void {
    if (!a || this.state.status !== 'play' || !this.legalRazor.some((l) => sameAction(l, a))) return;
    this.plan = { ...this.plan, razor: a };
    this.refresh();
    this.persist();
  }

  moveRazor(dir: 0 | 1 | 2 | 3): void {
    this.setRazorAction(this.legalRazor.find((a) => a.type === 'move' && a.dir === dir));
  }

  moveWren(dir: 0 | 1 | 2 | 3): void {
    this.setWrenAction(this.legalWren.find((a) => a.type === 'move' && a.dir === dir));
  }

  sprintWren(dir: 0 | 1 | 2 | 3): void {
    this.setWrenAction(this.legalWren.find((a) => a.type === 'sprint' && a.dir === dir));
  }

  commit(now: number): void {
    if (!this.running || this.state.status !== 'play') return;
    this.prev.clear();
    this.prev.set(WREN, { x: this.state.wren.x, y: this.state.wren.y });
    this.prev.set(RAZOR, { x: this.state.razor.x, y: this.state.razor.y });
    for (const h of this.state.hunters) this.prev.set(h.id, { x: h.x, y: h.y });
    const result = resolveTick(this.state, {
      actions: { [WREN]: this.plan.wren, [KADE]: this.plan.kade, [RAZOR]: this.plan.razor },
    });
    this.state = result.state;
    this.log = [...result.events.toReversed(), ...this.log].slice(0, LOG_LIMIT);
    this.plan = freshPlan();
    this.animStart = now;
    this.tickStart = now;
    this.refresh();
    for (const fn of this.eventListeners) fn(result.events);
    if (this.state.status === 'over') {
      clearMatch();
      if (this.state.outcome === 'delivered') this.progress = recordDelivery(this.progress);
    } else this.persist();
  }

  /** Saves just enough to resume after a reload: the match state, the in-progress plan, the
   * view, and the log. Never called for a match that has already ended. */
  private persist(): void {
    saveMatch(this.state, this.plan, this.view, this.log);
  }

  /** Fraction of the planning timer left (1 when untimed), auto-committing when it runs out. */
  timerLeft(now: number): number {
    if (!this.prefs.timed || !this.running || this.state.status !== 'play') return 1;
    return Math.max(0, 1 - (now - this.tickStart) / TIMER_MS);
  }

  /** Eased 0..1 progress of the post-resolve animation; never negative even if `now` precedes the commit. */
  animProgress(now: number, reduce: boolean): number {
    if (reduce) return 1;
    const t = Math.min(1, Math.max(0, (now - this.animStart) / ANIM_MS));
    return 1 - Math.pow(1 - t, 3);
  }
}
