import { isWall, type MatchState } from '@wetwire/sim';
import { Container, Graphics } from 'pixi.js';
import { COLORS, TILE } from './draw.ts';
import { routeInfo } from '../scouting.ts';

const CORNER_MAX_W = 160;
const CORNER_MAX_H = 112;
const CORNER_MARGIN = 10;
const EXPANDED_MARGIN = 28;

/**
 * Full-map overview. No fog of war exists yet (Phase 3 — `viewFor` is still a pass-through, see
 * docs/DECISIONS.md), so showing the whole layout, hunters and cameras here leaks nothing a
 * single-player client doesn't already have. Revisit the content of this view once fog ships.
 */
export class Minimap {
  readonly root = new Container();
  private readonly tiles = new Graphics();
  private readonly markers = new Graphics();
  private readonly backdrop = new Graphics();
  private lastVersion = -1;
  private expanded = false;
  private readonly mapW: number;
  private readonly mapH: number;
  private readonly viewW: number;
  private readonly viewH: number;

  constructor(mapW: number, mapH: number, viewW: number, viewH: number) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.viewW = viewW;
    this.viewH = viewH;
    this.backdrop.visible = false;
    this.root.addChild(this.tiles, this.markers);
    this.layout();
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.backdrop.visible = expanded;
    this.layout();
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  private layout(): void {
    const marginedW = this.expanded ? this.viewW - EXPANDED_MARGIN * 2 : CORNER_MAX_W;
    const marginedH = this.expanded ? this.viewH - EXPANDED_MARGIN * 2 : CORNER_MAX_H;
    const scale = Math.min(marginedW / this.mapW, marginedH / this.mapH);
    this.root.scale.set(scale);
    if (this.expanded) {
      this.root.position.set((this.viewW - this.mapW * scale) / 2, (this.viewH - this.mapH * scale) / 2);
    } else {
      // Top-right: the PiP inset already owns the bottom-right corner.
      this.root.position.set(this.viewW - this.mapW * scale - CORNER_MARGIN, CORNER_MARGIN);
    }
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

  /** Dims the rest of the view while expanded, drawn in view space (not map space, unlike the
   * other graphics here), so it must be added to the stage separately from `root`. */
  buildBackdrop(): Graphics {
    this.backdrop.rect(0, 0, this.viewW, this.viewH).fill({ color: COLORS.ink, alpha: 0.7 });
    return this.backdrop;
  }
}
