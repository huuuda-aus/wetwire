import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../game.ts';

/** Re-render the calling component whenever the game store changes. */
export function useGame(game: Game): number {
  const [, setTick] = useState(0);
  useEffect(() => game.subscribe(() => setTick((n) => n + 1)), [game]);
  return game.version;
}
