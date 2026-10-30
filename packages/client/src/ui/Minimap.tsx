import { useEffect, useRef } from 'preact/hooks';
import { Application } from 'pixi.js';
import type { Game } from '../game.ts';
import { TILE } from '../renderer/draw.ts';
import { Minimap as MinimapRenderer } from '../renderer/minimap.ts';
import { useGame } from './hooks.ts';

const PANEL_W = 236;
const PANEL_H = 160;

/** Always-on full-map overview, docked at the top of the right sidebar. Its own small Pixi
 * Application on a dedicated canvas — not an inset on the main stage, so it needs no expand/
 * collapse state of its own (see docs/DECISIONS.md for why it moved here). */
export function Minimap({ game }: { game: Game }) {
  useGame(game);
  const canvas = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let dead = false;
    const app = new Application();
    app
      .init({
        canvas: el,
        width: PANEL_W,
        height: PANEL_H,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: false,
        antialias: true,
        background: 0x08090b,
      })
      .then(() => {
        if (dead) {
          app.destroy(false, { children: true });
          return;
        }
        const mapW = game.state.rules.cols * TILE;
        const mapH = game.state.rules.rows * TILE;
        const mm = new MinimapRenderer(mapW, mapH, PANEL_W, PANEL_H);
        app.stage.addChild(mm.root);
        app.ticker.add(() => mm.update(game.state, game.version));
        appRef.current = app;
      })
      .catch((err: unknown) => console.error('wetwire: minimap renderer failed to start', err));
    return () => {
      dead = true;
      appRef.current?.destroy(false, { children: true });
      appRef.current = null;
    };
    // A new match can pick a different district (different map size): remount rather than
    // resize the already-scaled renderer.
  }, [game, game.state.rules.district.id]);

  return (
    <section class="card minimap">
      <h3>Overview</h3>
      <canvas ref={canvas} width={PANEL_W} height={PANEL_H} aria-label="District overview map" />
    </section>
  );
}
