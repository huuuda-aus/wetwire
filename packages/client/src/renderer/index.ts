import { GlitchFilter } from 'pixi-filters/glitch';
import { GlowFilter } from 'pixi-filters/glow';
import { RGBSplitFilter } from 'pixi-filters/rgb-split';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { Application, Container, Graphics, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';
import type { Sfx } from '../audio.ts';
import type { Game } from '../game.ts';
import { reducedMotion } from '../prefs.ts';
import { COLORS, TILE } from './draw.ts';
import { Minimap } from './minimap.ts';
import { NetLayer } from './net.ts';
import { StreetLayer } from './street.ts';

const PIP_ASPECT = 5 / 7;
const WIPE_EASE = 0.16;
const NET_FPS_GUARD = 0.001;
/** How long the "jacking in/out" glitch burst runs after a Street/Net switch, and how often it
 * re-slices while running (a stepped tear reads as more digital than a smoothly animated one). */
const MODE_GLITCH_MS = 150;
const MODE_GLITCH_STEP_MS = 27;

/** Pixi owns the map: both layers, the wipe between them, the glitch filter and the PiP inset. */
export class Renderer {
  private readonly app: Application;
  private readonly street: StreetLayer;
  private readonly net: NetLayer;
  private readonly minimap: Minimap;
  private readonly cutLine = new Graphics();
  private readonly mask = new Graphics();
  private readonly pip = new Container();
  private readonly pipBorder = new Graphics();
  private readonly pipRT: RenderTexture;
  private readonly glitch = new RGBSplitFilter({
    red: { x: -3, y: 0 },
    green: { x: 0, y: 0 },
    blue: { x: 3, y: 0 },
  });
  /** Whole-screen "jacking in/out" burst for a Street <-> Net switch: a stepped slice-tear plus
   * a ring expanding from screen centre. Both are pixi-filters (CLAUDE.md §2: reuse before you
   * build), applied only to app.stage so the surrounding Preact chrome is untouched. */
  private readonly modeGlitch = new GlitchFilter({
    slices: 9,
    offset: 26,
    fillMode: 1, // ORIGINAL: re-samples the image instead of punching transparent holes in it
    red: { x: -5, y: 0 },
    blue: { x: 5, y: 0 },
  });
  private readonly modeShock = new ShockwaveFilter({
    amplitude: 20,
    wavelength: 140,
    brightness: 1.25,
    speed: 1000,
  });
  private modeSwitchView: 'street' | 'net';
  private modeGlitchStart = -Infinity;
  private modeGlitchStep = -Infinity;
  private readonly width: number;
  private readonly height: number;
  private wipe = 0;
  private lastVersion = -1;
  private pipAlert: boolean | null = null;
  private readonly unsubscribe: () => void;

  private readonly game: Game;
  private readonly sfx: Sfx;

  private constructor(app: Application, game: Game, sfx: Sfx) {
    this.app = app;
    this.game = game;
    this.sfx = sfx;
    this.width = game.state.rules.cols * TILE;
    this.height = game.state.rules.rows * TILE;
    this.modeSwitchView = game.view;
    this.modeShock.center = { x: this.width / 2, y: this.height / 2 };
    const reduce = (): boolean => reducedMotion(game.prefs);
    this.street = new StreetLayer(game, this.width, this.height, reduce, this.makeRainTexture());
    this.net = new NetLayer(game, this.width, this.height, reduce);
    this.minimap = new Minimap(this.width, this.height, this.width, this.height);
    this.net.root.mask = this.mask;
    this.net.root.visible = false;
    this.cutLine.filters = [
      new GlowFilter({ color: COLORS.net, distance: 16, outerStrength: 3, innerStrength: 0 }),
    ];
    this.pipRT = RenderTexture.create({ width: this.width, height: this.height, resolution: 1 });
    this.buildPip();
    app.stage.addChild(
      this.street.root,
      this.net.root,
      this.mask,
      this.cutLine,
      this.pip,
      this.minimap.buildBackdrop(),
      this.minimap.root,
    );
    this.unsubscribe = game.onEvents((events) => {
      const now = performance.now();
      for (const e of events) {
        if (!e.fx) continue;
        this.street.addEffect(e.fx.kind, e.fx.x, e.fx.y, now);
        if (e.fx.cam) this.street.flash(e.fx.cam, now + 450);
      }
      sfx.onEvents(events);
    });
    app.ticker.add(() => {
      this.frame(performance.now());
    });
  }

  static async create(canvas: HTMLCanvasElement, game: Game, sfx: Sfx): Promise<Renderer> {
    const app = new Application();
    await app.init({
      canvas,
      width: game.state.rules.cols * TILE,
      height: game.state.rules.rows * TILE,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: false,
      antialias: true,
      background: COLORS.ink,
    });
    return new Renderer(app, game, sfx);
  }

  /** Map a pointer position to logical map pixels (704 x 484 for Dock Row). */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.app.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * this.width,
      y: ((clientY - r.top) / r.height) * this.height,
    };
  }

  pickNet(x: number, y: number) {
    return this.net.pick(x, y);
  }

  destroy(): void {
    this.unsubscribe();
    this.app.destroy(false, { children: true });
  }

  private makeRainTexture(): Texture {
    const g = new Graphics();
    let seed = 7;
    const next = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 36; i++) {
      const x = next() * 256;
      const y = next() * 256;
      const len = 8 + next() * 12;
      g.moveTo(x, y).lineTo(x - len * 0.22, y + len);
    }
    g.stroke({ width: 1, color: 0xc8d2dc, alpha: 0.2 });
    return this.app.renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, 256, 256) });
  }

  private buildPip(): void {
    const w = this.width * 0.3;
    const h = w * PIP_ASPECT;
    const t = this.game.state.rules.district.terminal;
    const cropW = TILE * 6.4;
    const cropH = cropW * PIP_ASPECT;
    const sx = Math.max(0, Math.min(this.width - cropW, (t.x + 0.5) * TILE - cropW / 2));
    const sy = Math.max(0, Math.min(this.height - cropH, (t.y + 0.5) * TILE - cropH / 2));
    const crop = new Texture({ source: this.pipRT.source, frame: new Rectangle(sx, sy, cropW, cropH) });
    const sprite = new Sprite(crop);
    sprite.width = w;
    sprite.height = h;
    this.pip.addChild(sprite, this.pipBorder);
    this.pip.position.set(this.width - w - 8, this.height - h - 8);
    this.pip.visible = false;
    this.pipBorder.rect(0, 0, w, h).stroke({ width: 2, color: COLORS.net });
  }

  private frame(now: number): void {
    const g = this.game;
    if (g.timerLeft(now) === 0) g.commit(now);
    const target = g.view === 'net' ? 1 : 0;
    const reduce = reducedMotion(g.prefs);
    const before = this.wipe;
    this.wipe = reduce ? target : this.wipe + (target - this.wipe) * WIPE_EASE;
    if (Math.abs(this.wipe - target) < 0.002) this.wipe = target;
    if (g.version !== this.lastVersion) {
      this.lastVersion = g.version;
      this.street.rebuild(now);
      this.net.rebuild();
      this.minimap.setExpanded(g.overview);
      this.minimap.update(g.state, g.version);
    }
    if (this.wipe !== before) this.applyWipe();
    this.street.update(now);
    this.net.update(now, this.wipe > NET_FPS_GUARD);
    this.updateGlitch(now, reduce);
    this.updateModeSwitch(now, reduce, g.view);
    this.updatePip();
    this.sfx.setNetMix(this.wipe);
  }

  /** Fires the glitch/shockwave burst once per Street <-> Net toggle and runs it for
   * MODE_GLITCH_MS, then clears app.stage's filters so they don't run on every idle frame. */
  private updateModeSwitch(now: number, reduce: boolean, view: 'street' | 'net'): void {
    if (view !== this.modeSwitchView) {
      this.modeSwitchView = view;
      if (!reduce) {
        this.modeGlitchStart = now;
        this.modeGlitchStep = -Infinity;
        this.modeShock.time = 0;
      }
    }
    const elapsed = now - this.modeGlitchStart;
    const active = !reduce && elapsed >= 0 && elapsed < MODE_GLITCH_MS;
    if (active) {
      if (now - this.modeGlitchStep >= MODE_GLITCH_STEP_MS) {
        this.modeGlitchStep = now;
        this.modeGlitch.refresh();
      }
      this.modeShock.time = elapsed / 1000;
    }
    this.app.stage.filters = active ? [this.modeGlitch, this.modeShock] : [];
  }

  private applyWipe(): void {
    const cut = this.wipe * this.height;
    const visible = this.wipe > NET_FPS_GUARD;
    this.net.root.visible = visible;
    this.mask.clear().rect(0, 0, this.width, cut).fill(0xffffff);
    this.cutLine.clear();
    this.cutLine.visible = visible && this.wipe < 0.999;
    if (this.cutLine.visible) {
      // A bright scan edge plus a dimmer trailing echo above it, instead of one flat bar —
      // reads as a sensor sweep rather than a wipe transition.
      this.cutLine.rect(0, cut - 1, this.width, 2).fill(COLORS.net);
      this.cutLine.rect(0, cut - 9, this.width, 1).fill({ color: COLORS.net, alpha: 0.35 });
      this.cutLine.rect(0, cut - 17, this.width, 1).fill({ color: COLORS.net, alpha: 0.15 });
    }
  }

  /** Overload past 75 % makes the street flicker with a chromatic split for a moment every few seconds. */
  private updateGlitch(now: number, reduce: boolean): void {
    const s = this.game.state;
    const hot = s.wren.overload / s.rules.balance.overloadMax > 0.75 && s.status === 'play';
    this.street.root.filters = hot && !reduce && now % 4000 < 120 ? [this.glitch] : [];
  }

  private updatePip(): void {
    const show = this.wipe > 0.5;
    this.pip.visible = show;
    if (!show) return;
    this.app.renderer.render({ container: this.street.root, target: this.pipRT, clear: true });
    const s = this.game.state;
    const t = s.rules.district.terminal;
    const range = s.rules.balance.net.bodyThreatRange;
    const alert = s.hunters.some((h) => h.mode === 'body' || Math.hypot(h.x - t.x, h.y - t.y) <= range);
    if (alert !== this.pipAlert) {
      this.pipAlert = alert;
      const w = this.width * 0.3;
      this.pipBorder
        .clear()
        .rect(0, 0, w, w * PIP_ASPECT)
        .stroke({ width: 2, color: alert ? COLORS.crim : COLORS.net });
    }
    this.pipBorder.alpha =
      alert && !reducedMotion(this.game.prefs) ? 0.6 + 0.4 * Math.sin(performance.now() / 160) : 1;
  }
}
