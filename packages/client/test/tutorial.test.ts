import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/game.ts';
import { TUTORIAL_STEPS } from '../src/tutorial.ts';

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

const stepByTargetId = (id: string) => {
  const step = TUTORIAL_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`no tutorial step ${id}`);
  return step;
};

describe('tutorial steps', () => {
  it('"move" matches only after Wren has a move queued', () => {
    const game = new Game();
    const step = stepByTargetId('move');
    expect(step.match(game)).toBe(false);
    game.moveWren(0);
    expect(step.match(game)).toBe(true);
  });

  it('"net" matches once the view switches to Net', () => {
    const game = new Game();
    const step = stepByTargetId('net');
    expect(step.match(game)).toBe(false);
    game.setView('net');
    expect(step.match(game)).toBe(true);
  });

  it('"kade" matches once a non-hold hack is queued', () => {
    const game = new Game();
    game.setView('net');
    const step = stepByTargetId('kade');
    expect(step.match(game)).toBe(false);
    const hack = game.legalKade[0];
    if (!hack) throw new Error('expected at least one legal Kade action');
    game.setKadeAction(hack);
    expect(step.match(game)).toBe(true);
  });

  it('every step has a unique id', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
