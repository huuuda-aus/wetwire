import type { Game } from './game.ts';

export interface TutorialStep {
  readonly id: string;
  readonly text: string;
  /** CSS selector of the control to highlight; null for the intro step, which has none. */
  readonly target: string | null;
  /** True once the player has done the taught thing, so this step auto-advances without
   * waiting for the tick-advance fallback below. */
  readonly match: (game: Game) => boolean;
}

/** Soft-hint, non-blocking scripted onboarding: every step also auto-advances the moment a tick
 * resolves (see Tutorial.tsx), so a player who ignores the hint and just plays is never stuck —
 * the tour simply catches up to wherever they actually are. Shown once, on a first-timer's very
 * first match (see `progress.ts#showTutorial`), and skippable at any point. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'welcome',
    target: null,
    text: 'You run two people at once: Wren on the Street, Kade in the Net. Plan a move for each, then run the tick — everything resolves together.',
    match: () => false,
  },
  {
    id: 'move',
    // `.dpad` only renders under the mobile breakpoint (CLAUDE.md §4 accessibility note aside,
    // it's `display: none` on desktop) — the action list is what's actually on screen there.
    target: '.actions:not(.razoracts)',
    text: 'Move Wren with the D-pad (on mobile), the action list, or WASD / the arrow keys.',
    match: (g) => g.plan.wren.type === 'move',
  },
  {
    id: 'sprint',
    target: '[data-action-type="sprint"]',
    text: 'Shift + move sprints 2 tiles for +8 overload — try it.',
    match: (g) => g.plan.wren.type === 'sprint',
  },
  {
    id: 'mask',
    target: '[data-action-type="mask"]',
    text: 'Mask (+10 overload) hides Wren from cameras; hunters only spot her if adjacent.',
    match: (g) => g.plan.wren.type === 'mask',
  },
  {
    id: 'net',
    target: '[data-v="net"]',
    text: "Switch to the Net (Q) to plan Kade's hack.",
    match: (g) => g.view === 'net',
  },
  {
    id: 'kade',
    target: '.netacts',
    text: 'Pick a hack for Kade. Hacks add neural load and trace; at 100 load he dumpshocks.',
    match: (g) => g.plan.kade.type !== 'hold',
  },
  {
    id: 'razor',
    target: '.razoracts',
    text: 'Razor fights for you on the Street — her actions (Strike, Guard…) are planned separately.',
    match: (g) => g.plan.razor.type !== 'wait',
  },
  {
    id: 'run',
    target: '.run',
    text: "Run Tick resolves every planned action at once. Hunters telegraph (dashed arrow) the exact step they'll take next — plan around it, not just around where they are now.",
    match: () => false,
  },
];
