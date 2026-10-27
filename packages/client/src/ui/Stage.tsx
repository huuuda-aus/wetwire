import { useEffect, useRef } from 'preact/hooks';
import type { Sfx } from '../audio.ts';
import { dirFromOffset } from './click.ts';
import type { Game } from '../game.ts';
import { Renderer } from '../renderer/index.ts';
import { TILE } from '../renderer/draw.ts';

const FONT_WAIT_MS = 1500;

export function Stage({ game, sfx }: { game: Game; sfx: Sfx }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let dead = false;
    // Pixi bakes text into textures, so wait for the web font (but never hang offline).
    const fonts = Promise.race([
      document.fonts.load('9px "Martian Mono"'),
      new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
    ]);
    fonts
      .then(() => Renderer.create(el, game, sfx))
      .then((r) => {
        if (dead) r.destroy();
        else renderer.current = r;
      })
      .catch((err: unknown) => console.error('wetwire: renderer failed to start', err));
    return () => {
      dead = true;
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, [game, sfx]);

  const onClick = (e: MouseEvent): void => {
    const r = renderer.current;
    if (!r || game.state.status !== 'play') return;
    const p = r.toLogical(e.clientX, e.clientY);
    if (game.view === 'net') {
      game.setKadeAction(r.pickNet(p.x, p.y));
      return;
    }
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    const w = game.state.wren;
    if (tx === w.x && ty === w.y) game.setWrenAction({ type: 'wait' });
    else {
      const dir = dirFromOffset(tx - w.x, ty - w.y);
      if (dir !== null) game.moveWren(dir);
    }
  };

  return (
    <div class="stage">
      <canvas ref={canvas} id="view" aria-label="District map" onClick={onClick} />
      <div class="hint">{game.view === 'net' ? 'Net · click a node or hunter' : 'Street · meatspace'}</div>
    </div>
  );
}
