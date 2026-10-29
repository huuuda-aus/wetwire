import { distAt, distField, type MatchState } from '@wetwire/sim';

export interface RouteInfo {
  /** Ticks from Wren's current tile to the receiver, respecting live door state (a locked
   * door counts as a wall, not an open passage) — not a theoretical shortest path. */
  readonly distance: number;
  /** True once no path to the receiver exists under the current door state. */
  readonly cutOff: boolean;
  /** Every tile's distance to the receiver, -1 where unreachable; drives the minimap's
   * dead-end shading so a locked-off branch is visible before Wren walks into it. */
  readonly field: Int16Array;
}

/** Pure (no DOM, no Pixi): the client's read of how exposed Wren's current route is. CLAUDE.md
 * §1 — all of this reuses the sim's own `distField`/`distAt`, never a client-side guess at the
 * sim's rules. */
export function routeInfo(state: MatchState): RouteInfo {
  const field = distField(state, [state.rules.district.receiver], false);
  const distance = distAt(state, field, state.wren.x, state.wren.y);
  return { distance, cutOff: distance === -1, field };
}
