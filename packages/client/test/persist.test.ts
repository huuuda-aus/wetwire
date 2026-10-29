import { content } from '@wetwire/content';
import { createMatch, KADE, resolveTick, WREN } from '@wetwire/sim';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMatch, loadMatch, restoreState, saveMatch } from '../src/persist.ts';

/** Node has no global localStorage; a tiny in-memory Storage is enough for this module's needs. */
class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

const freshPlan = () => ({
  wren: { type: 'wait' as const },
  kade: { type: 'hold' as const },
  razor: { type: 'wait' as const },
});

describe('match persistence', () => {
  it('round-trips a running match through save and load', () => {
    const state = createMatch(content, { payload: 'standard' }, 1);
    saveMatch(state, freshPlan(), 'net', []);
    const saved = loadMatch(content);
    if (!saved) throw new Error('expected a saved match');
    expect(saved.districtId).toBe(content.district.id);
    expect(saved.view).toBe('net');
    const restored = restoreState(content, saved);
    expect(restored.wren).toEqual(state.wren);
    expect(restored.kade).toEqual(state.kade);
    expect(restored.rules.district.id).toBe(state.rules.district.id);
  });

  it('restores a non-default district by id', () => {
    const state = createMatch(content, { payload: 'light', districtId: 'harrow-yards' }, 1);
    saveMatch(state, freshPlan(), 'street', []);
    const saved = loadMatch(content);
    if (!saved) throw new Error('expected a saved match');
    const restored = restoreState(content, saved);
    expect(restored.rules.district.id).toBe('harrow-yards');
  });

  it('does not restore a match that has already ended', () => {
    let state = createMatch(content, { payload: 'standard' }, 1);
    state.wren.overload = 100;
    state = resolveTick(state, { actions: { [WREN]: { type: 'wait' }, [KADE]: { type: 'hold' } } }).state;
    expect(state.status).toBe('over');
    saveMatch(state, freshPlan(), 'street', []);
    expect(loadMatch(content)).toBeNull();
  });

  it('returns null for a missing, malformed, or wrong-version save', () => {
    expect(loadMatch(content)).toBeNull();
    localStorage.setItem('wetwire.match', '{not json');
    expect(loadMatch(content)).toBeNull();
    localStorage.setItem('wetwire.match', JSON.stringify({ version: 999, districtId: 'x', match: {} }));
    expect(loadMatch(content)).toBeNull();
  });

  it('returns null for a save naming a district this build does not ship', () => {
    const state = createMatch(content, { payload: 'standard' }, 1);
    saveMatch(state, freshPlan(), 'street', []);
    const raw = JSON.parse(localStorage.getItem('wetwire.match') ?? '{}') as Record<string, unknown>;
    raw['districtId'] = 'does-not-exist';
    localStorage.setItem('wetwire.match', JSON.stringify(raw));
    expect(loadMatch(content)).toBeNull();
  });

  it('clearMatch removes the saved key', () => {
    const state = createMatch(content, { payload: 'standard' }, 1);
    saveMatch(state, freshPlan(), 'street', []);
    expect(loadMatch(content)).not.toBeNull();
    clearMatch();
    expect(loadMatch(content)).toBeNull();
  });
});
