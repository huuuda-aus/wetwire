import type { Sfx } from './audio.ts';
import type { Game } from './game.ts';

const MOVE_KEYS: Record<string, 0 | 1 | 2 | 3> = {
  w: 0,
  arrowup: 0,
  d: 1,
  arrowright: 1,
  s: 2,
  arrowdown: 2,
  a: 3,
  arrowleft: 3,
};

/**
 * Turns keys into plan changes. Everything goes through `Game`, which only accepts actions
 * from `legalActions`, so the UI can never offer or submit an illegal move.
 */
export function attachKeyboard(game: Game, sfx: Sfx, blocked: () => boolean): () => void {
  const onKey = (e: KeyboardEvent): void => {
    sfx.unlock();
    if (e.ctrlKey || e.metaKey || e.altKey || blocked()) return;
    const key = e.key.toLowerCase();
    const onControl = e.target instanceof HTMLElement && e.target.closest('button, input, select') !== null;
    const move = MOVE_KEYS[key];
    if (move !== undefined) {
      if (e.shiftKey) game.sprintWren(move);
      else game.moveWren(move);
      e.preventDefault();
    } else if (key === 'm') game.setWrenAction({ type: 'mask' });
    else if (key === 'x') game.setWrenAction({ type: 'wait' });
    else if (key === 'q') game.setView(game.view === 'net' ? 'street' : 'net');
    else if (key === 'v') game.setOverview(!game.overview);
    else if (/^[1-9]$/.test(key)) {
      if (game.view === 'net') game.setKadeAction(game.legalKade[Number(key) - 1]);
    } else if ((key === ' ' || key === 'enter') && !onControl) {
      game.commit(performance.now());
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  return () => window.removeEventListener('keydown', onKey);
}
