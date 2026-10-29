import type { Balance, District, Implant, NodeDef } from '@wetwire/content';

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
  readonly implants: readonly Implant[];
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
  /** Equipped implant ids (§7.4). Permanent slot cost; validated against neural capacity at
   * match creation, never changes mid-match. */
  loadout: readonly string[];
}
export interface KadeState {
  node: string;
  load: number;
  trace: number;
  body: number;
  shock: number;
  shockNew: boolean;
  flat: boolean;
  /** Equipped implant ids (§7.4). See WrenState.loadout. */
  loadout: readonly string[];
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
  body: number;
  /** Struck down by Razor. Stays on the map but stops patrolling, hunting, attacking and
   * alerting — there is no respawn yet (§7.5 territory); permanent for the rest of the match. */
  defeated: boolean;
}

export interface RazorState extends Pos {
  body: number;
  /** Heavy strike's 2-tick wind-up (§7.3): set when committed, resolved and cleared the next
   * tick. While set, Razor can only wait — she's locked into the swing. Fizzles with no damage
   * if the target is out of range or defeated when it resolves (avoidable by moving away). */
  windup: { target: string } | null;
  /** Guard (§7.3), reset every tick: who Razor is covering right now. Consumed the same tick
   * it's set (stepAttacks runs after stepRazor), never persists into the next one. */
  guarding: PlayerId | null;
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
  razor: RazorState;
  doors: Record<string, boolean>;
  ice: number;
  owned: string[];
  cams: CamState[];
  hunters: HunterState[];
  download: number;
  stats: { alerts: number; hacks: number };
}

export type CourierAction =
  { type: 'move'; dir: Dir } | { type: 'wait' } | { type: 'mask' } | { type: 'sprint'; dir: Dir };
export type HackAction =
  | { type: 'blind'; target: string }
  | { type: 'unlock'; target: string }
  | { type: 'ice'; target: string }
  | { type: 'burn'; target: string };
// Lock has no net.costs entry (§7.3 states a cost for Blind/Unlock/Break ICE/Burn implant but
// not for Lock) -- free, same bucket as Hold and Route, not a HackAction.
export type DeckerAction =
  { type: 'hold' } | { type: 'route'; target: string } | { type: 'lock'; target: string } | HackAction;
export type RazorAction =
  | { type: 'move'; dir: Dir }
  | { type: 'wait' }
  | { type: 'strike'; target: string }
  | { type: 'heavy-strike'; target: string }
  | { type: 'guard'; target: PlayerId };
export type Action = CourierAction | DeckerAction | RazorAction;

export interface MatchSetup {
  payload: string;
  /** District id from `content.districts`; defaults to `content.district` when omitted or unknown. */
  districtId?: string;
  /** Implant ids (§7.4). Defaults to no implants. `createMatch` throws if either loadout's
   * total slot cost exceeds `balance.neural.capacity` — the sim is the only authority there is
   * without Phase 3's server, so this is the actual rejection point, not just a client check. */
  wrenLoadout?: readonly string[];
  kadeLoadout?: readonly string[];
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
  | 'ReadOut'
  | 'RazorStruck'
  | 'HunterDefeated'
  | 'RazorHit'
  | 'RazorDowned'
  | 'CourierSprinted'
  | 'HeavyStrikeWindup'
  | 'HeavyStrikeLanded'
  | 'HeavyStrikeMissed'
  | 'RazorGuarded'
  | 'RazorBlocked'
  | 'DoorLocked';
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
