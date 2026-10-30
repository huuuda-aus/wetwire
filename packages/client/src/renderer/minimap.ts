import { isWall, type MatchState } from '@wetwire/sim';
import { Container, Graphics } from 'pixi.js';
import { COLORS, TILE } from './draw.ts';
import { routeInfo } from '../scouting.ts';

const MARGIN = 6;

/**
 * Full-map overview, docked at a fixed size at the top of the right sidebar (its own small Pixi
 * Application — see ui/Minimap.tsx — not an inset on the main stage). No fog of war exists yet
 * (Phase 3 — `viewFor` is still a pass-through, see docs/DECISIONS.md), so showing the whole
 * layout, hunters and cameras here leaks nothing a single-player client doesn't already have.
 * Revisit the content of this view once fog ships.
 */
export class Minimap {
  readonly root = new Container();
  private readonly tiles = new Graphics();
  private readonly markers = new Graphics();
  private lastVersion = -1;

  constructor(mapW: number, mapH: number, viewW: number, viewH: number) {
    this.root.addChild(this.tiles, this.markers);
    const scale = Math.min((viewW - MARGIN * 2) / mapW, (viewH - MARGIN * 2) / mapH);
    this.root.scale.set(scale);
    this.root.position.set((viewW - mapW * scale) / 2, (viewH - mapH * scale) / 2);
  }

  /** Rebuilds only when `game.version` changed — wall layout is fixed, but door state (and so
   * the dead-end shading) can change mid-match. */
  update(state: MatchState, version: number): void {
    if (version === this.lastVersion) return;
    this.lastVersion = version;
    this.redrawTiles(state);
    this.redrawMarkers(state);
  }

  private redrawTiles(state: MatchState): void {
    const g = this.tiles;
    g.clear();
    const { field } = routeInfo(state);
    const cols = state.rules.cols;
    for (let y = 0; y < state.rules.rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (isWall(state.rules, x, y)) continue;
        const cutOff = field[y * cols + x] === -1;
        g.rect(x * TILE, y * TILE, TILE, TILE).fill({
          color: cutOff ? COLORS.crim : COLORS.fg,
          alpha: cutOff ? 0.35 : 0.1,
        });
      }
    }
  }

  private redrawMarkers(state: MatchState): void {
    const g = this.markers;
    g.clear();
    const { district } = state.rules;
    const dot = (x: number, y: number, color: number, r = TILE * 0.3): void => {
      g.circle((x + 0.5) * TILE, (y + 0.5) * TILE, r).fill(color);
    };
    for (const door of district.doors) {
      dot(door.x, door.y, state.doors[door.id] ? COLORS.own : COLORS.crim, TILE * 0.22);
    }
    dot(district.terminal.x, district.terminal.y, COLORS.net);
    dot(district.receiver.x, district.receiver.y, COLORS.amber);
    for (const cam of state.cams) dot(cam.x, cam.y, COLORS.net, TILE * 0.18);
    for (const h of state.hunters) dot(h.x, h.y, COLORS.crim);
    dot(state.wren.x, state.wren.y, COLORS.amber, TILE * 0.35);
  }
}
