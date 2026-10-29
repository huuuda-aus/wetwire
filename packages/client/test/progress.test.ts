import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isFirstTimer, loadProgress, recordDelivery } from '../src/progress.ts';

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

describe('progress', () => {
  it('is a first-timer with no saved progress', () => {
    expect(isFirstTimer(loadProgress())).toBe(true);
  });

  it('stops being a first-timer after one recorded delivery, and this persists across reload', () => {
    const after = recordDelivery(loadProgress());
    expect(isFirstTimer(after)).toBe(false);
    expect(isFirstTimer(loadProgress())).toBe(false);
  });

  it('counts multiple deliveries', () => {
    const p1 = recordDelivery(loadProgress());
    const p2 = recordDelivery(p1);
    expect(p2.deliveries).toBe(2);
  });
});
