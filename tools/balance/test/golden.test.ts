import { content } from '@wetwire/content';
import { describe, expect, it } from 'vitest';
import { PERFECT, playMatch } from '../src/bots.ts';

/** Strip the shared rule tables so the snapshot holds only match state. */
const plain = (r: ReturnType<typeof playMatch>) => ({
  state: { ...r.state, rules: undefined },
  events: r.events,
});

describe('golden replay (PROMPT.md §5.4)', () => {
  it('the scripted Standard run ends Delivered', () => {
    const { state } = playMatch(content, 'standard', 1, PERFECT);
    expect(state.outcome).toBe('delivered');
    expect(state.tick).toBeLessThanOrEqual(33);
  });

  it('replays identically from the same seed and matches the stored snapshot', () => {
    const a = playMatch(content, 'standard', 1, PERFECT);
    const b = playMatch(content, 'standard', 1, PERFECT);
    expect(plain(a)).toEqual(plain(b));
    expect(plain(a)).toMatchSnapshot();
  });

  it('every payload size is deliverable by the perfect bot', () => {
    for (const key of Object.keys(content.balance.payloads)) {
      expect(playMatch(content, key, 1, PERFECT).state.outcome).toBe('delivered');
    }
  });
});
