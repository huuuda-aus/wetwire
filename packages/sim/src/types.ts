import type { Balance, District, NodeDef } from '@wetwire/content';

export type PlayerId = string;
export type Dir = 0 | 1 | 2 | 3;
export interface Pos {
  x: number;
  y: number;
}
export type HunterMode = 'patrol' | 'hunt' | 'body';
export type Outcome = 'delivered' | 'taken' | 'flatlined';
export type MatchStatus = 'play' | 'over';

/** Static lookup tables derived once from content; shared (never cloned) between states. */
export interface Ruleset {
  readonly district: District;
  readonly balance: Balance;
  readonly cols: number;
  readonly rows: number;
  readonly wall: Uint8Array;
  readonly doorGrid: readonly (string | null)[];
  readonly nodes: Readonly<Record<string, NodeDef>>;
  readonly neighbours: Readonly<Record<string, readonly string[]>>;
}

export interface WrenState extends Pos {
  body: number;
  overload: number;
  masked: boolean;
}
export interface KadeState {
  node: string;
  load: number;
  trace: number;
  body: number;
  shock: number;
  shockNew: boolean;
  flat: boolean;
}
export interface CamState {
  readonly id: string;
  readonly node: string;
  readonly x: number;
  readonly y: number;
  readonly dirs: readonly [Dir, Dir];
  blind: number;
}
export interface HunterState extends Pos {
  readonly id: string;
  fx: number;
  fy: number;
  mode: HunterMode;
  readonly wps: readonly (readonly [number, number])[];
  wpi: number;
  target: Pos | null;
  memory: number;
  stun: number;
  plan: Pos | null;
}

export interface MatchState {
  readonly rules: Ruleset;
  readonly seed: number;
  tick: number;
  payload: string;
  status: MatchStatus;
  outcome: Outcome | null;
  wren: WrenState;
  kade: KadeState;
  doors: Record<string, boolean>;
  ice: number;
  owned: string[];
  cams: CamState[];
  hunters: HunterState[];
  download: number;
  stats: { alerts: number; hacks: number };
}

export type CourierAction = { type: 'move'; dir: Dir } | { type: 'wait' } | { type: 'mask' };
export type HackAction =
  | { type: 'blind'; target: string }
  | { type: 'unlock'; target: string }
  | { type: 'ice'; target: string }
  | { type: 'burn'; target: string };
export type DeckerAction = { type: 'hold' } | { type: 'route'; target: string } | HackAction;
export type Action = CourierAction | DeckerAction;

export interface MatchSetup {
  payload: string;
  /** District id from `content.districts`; defaults to `content.district` when omitted or unknown. */
  districtId?: string;
}
export interface TickInput {
  actions: Record<PlayerId, Action>;
}

export type Layer = 'STREET' | 'NET';
export type EventKind = 'good' | 'bad' | 'info';
export type GameEventType =
  | 'KadeRouted'
  | 'HackApplied'
  | 'KadeDumpshocked'
  | 'CourierMasked'
  | 'CourierBumped'
  | 'CameraSpotted'
  | 'HunterSpotted'
  | 'HunterLostTrail'
  | 'CourierHit'
  | 'KadeHit'
  | 'TraceMaxed'
  | 'ReadOut';
export interface Fx {
  kind: 'hit' | 'spot' | 'bump' | 'hack';
  x: number;
  y: number;
  cam: string | null;
}
export interface GameEvent {
  tick: number;
  type: GameEventType;
  layer: Layer;
  kind: EventKind;
  text: string;
  fx: Fx | null;
}
export interface TickResult {
  state: MatchState;
  events: GameEvent[];
}

export type Telegraph =
  | { kind: 'hunterStep'; id: string; from: Pos; to: Pos }
  | { kind: 'cameraTurn'; id: string; from: Dir; to: Dir };

/** Phase 2: a single-player view with nothing hidden. Phase 3 narrows this per team. */
export type PlayerView = MatchState;
