import { content } from '@wetwire/content';
import { createMatch, dirVec, resolveTick, stepToward, WREN, KADE, type Dir } from '@wetwire/sim';
import type { MatchState } from '@wetwire/sim';
import { describe, expect, it } from 'vitest';
import { routeInfo } from '../src/scouting.ts';

/** Finds the Dir whose unit vector matches the step `stepToward` suggests, so the test can drive
 * Wren with a real move action instead of guessing a direction index. */
function dirTowards(state: MatchState, to: { x: number; y: number }): Dir {
  const next = stepToward(state, state.wren, [to]);
  if (!next) throw new Error('no path to receiver in this fixture');
  const dx = next.x - state.wren.x;
  const dy = next.y - state.wren.y;
  for (const d of [0, 1, 2, 3] as const) {
    const [vx, vy] = dirVec(d);
    if (vx === dx && vy === dy) return d;
  }
  throw new Error('unreachable: stepToward returned a non-adjacent tile');
}

describe('routeInfo', () => {
  it("is 25 ticks away with both doors locked, matching the sim's own route test", () => {
    const state = createMatch(content, { payload: 'standard' }, 1);
    expect(routeInfo(state).distance).toBe(25);
    expect(routeInfo(state).cutOff).toBe(false);
  });

  it('shortens by exactly one tick when Wren steps toward the receiver', () => {
    const state = createMatch(content, { payload: 'standard' }, 1);
    const before = routeInfo(state).distance;
    const dir = dirTowards(state, state.rules.district.receiver);
    const stepped = resolveTick(state, {
      actions: { [WREN]: { type: 'move', dir }, [KADE]: { type: 'hold' } },
    });
    expect(routeInfo(stepped.state).distance).toBe(before - 1);
  });

  it('reports cut off when the receiver has no path under the current door state', () => {
    const state = createMatch(content, { payload: 'standard' }, 1);
    // Wall the receiver's own tile approach off by walking Wren onto an isolated 1x1 pocket:
    // simplest reliable way is to assert the real map's unreachable-from-nowhere case doesn't
    // exist by construction, so instead synthesize it directly on a clone.
    const isolated: MatchState = {
      ...state,
      rules: { ...state.rules, wall: new Uint8Array(state.rules.wall).fill(1) },
    };
    expect(routeInfo(isolated).cutOff).toBe(true);
    expect(routeInfo(isolated).distance).toBe(-1);
  });
});
