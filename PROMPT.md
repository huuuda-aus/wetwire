# Wetwire Master Prompt

Oct 27, 2026 · @Petr

## How to use this prompt

Paste everything below this section into your coding assistant as its first message, or save it in the repo as `PROMPT.md` (or `CLAUDE.md`) so it is read on every session. It is written to the assistant in the second person.

The prompt is split into phases. Phase 1 rebuilds the playable single-file demo exactly, so you have a known-good baseline. Phases 2 to 5 expand it into a real online PvP game. Ask the assistant to work one phase at a time and to stop for review at the end of each one.

A good first message after pasting: "Start Phase 1. Confirm your plan in five bullets, then build it."

## 1. Your role and mission

You are the lead engineer and technical game designer on **Wetwire**, a browser-based, tick-based cyberpunk PvP game. You are building it with me, the game director. Your job is to turn this spec into working, tested code, phase by phase, and to flag design problems you find along the way.

**Working rules**

- Work one phase at a time. At the start of a phase, restate the plan in five to ten bullets and list any open questions. At the end, give me a short summary: what works, what is stubbed, what you would change.
- Treat the numbers in this spec as the starting balance. Do not change a number silently. If you think one is wrong, keep it, then propose the change with your reasoning.
- Where the spec is silent, choose the simplest option that keeps the game deterministic and server-authoritative, and note the decision in `docs/DECISIONS.md` (one line each: date, decision, reason).
- Ask me before anything that is expensive to undo: adding a paid service, choosing a database, changing the tick model, or changing the netcode approach.
- Keep all game rules in one pure simulation module. The renderer, UI and network code only read state and submit actions. This rule matters more than any other technical choice in this document.
- Never use the names, characters or text of *Johnny Mnemonic*, William Gibson's Sprawl stories, or the 1995 film. The game is inspired by the premise only. All names here (Wetwire, Wren, Kade, Ironbridge Sprawl, Syndicate) are our own.
- Write in TypeScript from Phase 2 onward. Phase 1 is a single self-contained HTML file with vanilla JavaScript.

## 2. The game in one page

**Premise.** In a rain-soaked megacity, information is too valuable to send over the Net. It travels inside people. Mnemonic couriers carry payloads in wetwired brain implants, and the more they carry, the faster the overload burns them out. Corporations, a syndicate and street rebels fight over every payload.

**Core loop.** A match is a *contract* in one city district, 10 to 15 minutes long. A payload must move from a pickup to a receiver. Teams are hired to deliver it, intercept it, or steal it. Whoever has it read out at the receiver wins.

**Two layers, one map.** The *Street* (meatspace) is near-monochrome noir. The *Net* is a luminous network drawn over the same map. Every network node is tied to a physical object: a camera, a door, a terminal, a hunter's implant. Hacking a node changes the street; breaking the object removes the node.

**Design pillars**, in priority order:

1. **Balance first.** Progression gives options, never raw power. Everyone in a match has the same neural-load budget.
2. **Readable, fair combat.** Simultaneous ticks, telegraphed intent, no reflex or ping advantage.
3. **Each layer needs the other.** No team wins with only fighters or only hackers.
4. **Risk you choose.** The biggest swings come from deliberate gambles (payload size, overload, betrayal), not unequal starts.
5. **Steady progression.** Something worthwhile unlocks every one or two sessions.

**Roles** (the full set arrives in Phase 4):

| Role | Purpose | Strong at | Weak at |
| --- | --- | --- | --- |
| Courier | Carries the payload; picks its size | Stealth, masking, speed | Fighting while loaded |
| Razor | Escort or hunter, close combat | Physical damage | Hacks against their chrome |
| Decker | Fights in the Net; body stays behind | Doors, cameras, implant attacks | Defending their own body |
| Hunter | Tracks and recovers payloads | Traps, signal tracking | Burst damage |
| Fixer | Sells routes, places bounties, brokers deals | Information, leverage | Combat |
| Receiver | Holds the download key; can relocate | Ending the match | Mobility under fire |

**Factions** (persistent meta-layer): the Corp (money, drones), the Syndicate (enforcers, bounties) and the Lo-Teks (cheap gear, home turf).

## 3. Phase 1: rebuild the vertical slice (rules)

Build a single self-contained `index.html` (inline CSS and JS, Google Fonts as the only external resource, no frameworks). One player controls two characters against two AI hunters on one district. This is the baseline every later phase must stay faithful to.

### 3.1 The district

Grid of 16 × 11 tiles, 44 px per tile (canvas logical size 704 × 484). Coordinates are `(x, y)` with `(0, 0)` top-left.

```
################
#..............#
#.####...#####.#
#.###.....#....#
#.###..#..#..R.#
#.###.....D....#
#...#..#..#....#
#...#.....######
#...D.....######
#S.T#.....######
################
```

- `#` wall, `.` street, `D` locked door, `S` Wren's start (1, 9), `T` Kade's terminal (3, 9), `R` receiver (13, 4).
- Doors: DOOR-2 at (4, 8) links the safehouse to the plaza; DOOR-1 at (10, 5) links the plaza to the receiver compound. Both start locked. Closed doors block movement and line of sight for everyone.
- Route check (verify with a BFS test): Wren's shortest path to the receiver is **25 moves** with both doors locked and **17 moves** with both open.

### 3.2 Characters and starting values

- **Wren (courier)**: body 3, overload 0 %, one action per tick.
- **Kade (decker)**: body 2, neural load 0, trace 0 %, starts on the TERM node. His body sits at the terminal tile and is defenceless.
- **Hunters** (Syndicate AI):
  - H-1 starts at (8, 1), patrols the top street between (2, 1) and (13, 1).
  - H-2 starts at (9, 6), loops the plaza through (5, 3) → (9, 3) → (9, 8) → (5, 8), heading first for (9, 3).
- **Cameras** (sit on street tiles, do not block movement, range 6 tiles, cone where the cosine to the facing is at least 0.8, needs line of sight):
  - CAM-A at (1, 1), alternates facing east and south.
  - CAM-B at (14, 1), alternates facing west and south (south looks into the compound).
  - CAM-C at (9, 9), alternates facing north and west.
  - Facing for tick *t* = `dirs[floor((t − 1) / 2) % 2]`, so each camera turns every two ticks.

### 3.3 Payload choice (start screen)

| Load | Size | Overload per tick | Fee | Designer note |
| --- | --- | --- | --- | --- |
| Light | 160 MB | +2 | ¥12,000 | Plenty of time for the long way |
| Standard (default) | 320 MB | +3 | ¥28,000 | Long route works if nothing goes wrong |
| Heavy | 640 MB | +4 | ¥60,000 | Needs both doors; no margin |

Overload of 100 % ends the run (flatline).

### 3.4 The Net

Nodes (each has a map position; several sit inside walls):

| Node | Position | Type | Notes |
| --- | --- | --- | --- |
| TERM | (3, 9) | terminal | Kade's start |
| DR2 | (4, 8) | door | controls DOOR-2 |
| JX1 | (4, 6) | junction |  |
| CAMA | (1, 1) | camera | controls CAM-A |
| CAMC | (9, 9) | camera | controls CAM-C |
| JX2 | (9, 2) | junction |  |
| CAMB | (14, 1) | camera | controls CAM-B |
| ICE | (10, 3) | ICE | 2 layers; cannot be entered until broken |
| DR1 | (10, 5) | door | controls DOOR-1; reachable only through ICE |

Links: TERM–DR2, TERM–JX1, JX1–CAMA, JX1–CAMC, JX1–JX2, JX2–CAMB, JX2–ICE, ICE–DR1.

### 3.5 Actions

**Wren** picks one per tick: move one tile (north, east, south, west), **wait**, or **mask** (+10 overload; cameras ignore her and hunters only see her if adjacent, for this tick only). Moving into a still-locked door means she bumps and stays put.

**Kade** picks one per tick. He can act on his current node or any node linked to it.

| Action | Effect | Neural load | Trace |
| --- | --- | --- | --- |
| Hold | nothing | −6 | −2 |
| Route | move to a linked node (not unbroken ICE) | −6 | −2 |
| Blind camera | camera off for 4 ticks | +15 | +12 |
| Unlock door | door opens permanently | +20 | +15 |
| Break ICE | removes 1 layer | +15 | +10 |
| Burn implants | stun a hunter within 4 tiles (Manhattan) of Kade's node for 2 ticks | +30 | +25 |

Load and trace only decay on ticks with no hack. Load is floored at 0.

### 3.6 Tick resolution order

The player plans both actions, then presses **Run tick**. Everything resolves at once in this exact order:

1. **Net.** Apply Kade's action (unless he is dumpshocked or flatlined). Hacks take effect before anyone moves, so a door unlocked this tick can be walked through this tick.
2. **Wren.** Apply her move, wait or mask.
3. **Hunters.** Each unstunned hunter takes the step it telegraphed during planning. It does not react to Wren's move this tick.
4. **Cameras.** Any unblinded camera whose current cone contains an unmasked Wren raises an alert: every hunter not heading for Kade's body switches to *hunt* with her position as target and memory 6.
5. **Hunter sight.** A hunter sees Wren if adjacent, or if she is unmasked, within 4.5 tiles (Euclidean) and in line of sight. Seen → hunt, target her position, memory 6. Not seen while hunting → memory −1; at 0 or on reaching the target, return to patrol.
6. **Attacks.** An unstunned hunter adjacent to Wren (Manhattan ≤ 1) hits her for 1 body and is stunned 2 ticks (recovery). A hunter in *body* mode adjacent to the terminal hits Kade: body −1, dumpshock 4 ticks, trace reset to 0, load raised to at least 70, hunter returns to patrol and is stunned 2. Kade at 0 body is flatlined for the rest of the run.
7. **Meters.** Wren's overload += payload rate. Decay load and trace if no hack. Reduce existing dumpshock by 1 (not one applied this tick). If load ≥ 100: dumpshock 3 ticks and load set to 60. If trace ≥ 100: hold it at 100 and send the hunter with the shortest path to Kade's body (tiles (2, 9) or (3, 8)) into *body* mode, unless one already is. Decrement camera blind timers and hunter stuns.
8. **Download and end.** If Wren is on the receiver, download +1, else reset to 0. Download 2 = **Delivered**. Body 0 = **Taken**. Overload ≥ 100 = **Flatlined**.
9. **Next tick.** Tick +1, reset plans to Wait and Hold, every hunter plans its next step.

### 3.7 Hunter AI

- Pathfinding is BFS on 4-neighbour tiles; walls and closed doors block.
- *Patrol*: step toward the current waypoint; on arrival, advance to the next. If no path exists, skip the waypoint.
- *Hunt*: step toward the last known position of Wren.
- *Body*: step toward the nearest tile next to Kade's terminal.
- A hunter's next step is computed at the start of planning and drawn as a dashed red arrow. That arrow is a promise: the hunter must take exactly that step unless stunned or blocked.

### 3.8 Scoring

Fee on delivery = payload fee × (0.55 + 0.15 × Wren's remaining body), rounded to ¥100. Full body pays 100 %. The end screen shows the fee, ticks used, camera alerts and hacks.

## 4. Phase 1: visuals and UX

The art direction is **noir street, luminous Net**. The street is close to black and white; colour appears only where it carries gameplay meaning. The Net is the colour layer. The whole page is dark by design.

### 4.1 Palette and type

| Token | Hex | Meaning |
| --- | --- | --- |
| `--ink` | #0c0d0f | page background |
| `--panel` | #131418 | HUD panels |
| `--line` | #2a2b31 | hairlines, empty meters |
| `--fg` | #dcd8cf | text (warm off-white) |
| `--mute` | #8b877e | secondary text |
| `--amber` | #f0b43c | your crew and the payload |
| `--crim` | #e0464e | hostiles and danger |
| `--net` | #5ee0ff | the Net layer, Kade |
| `--own` | #b98cff | systems you have hacked |

Fonts from Google Fonts: **Big Shoulders Display** (800–900) for the logo, headings and big numbers; **Martian Mono** (300–600) for all HUD text and canvas labels. Wait for `document.fonts.ready` before the first canvas draw.

### 4.2 Street layer (canvas)

- Pre-render a static background once: street tiles with faint grit and seams, a few puddles with a highlight streak, walls in near-black with diagonal charcoal hatching and a lit bottom edge, soft radial streetlight pools, and a vignette.
- Per frame, draw: hunter vision tiles (faint red; stronger when hunting), camera cones (faint warm white; red flash on detection; next tick's cone as dotted outlines when the camera is about to turn), doors (locked slab with a padlock, or open jambs with a violet dashed outline), cameras (small box rotated to facing; violet × and "BLIND n" when hacked), the receiver beacon (pulsing rings, amber arc for download progress), Kade's body (amber square with a cyan cable; red pulse when a hunter is within 4 tiles), Wren (amber diamond with glow, overload arc around her that turns red past 75 %, dashed outline when masked), hunters (red arrowheads pointing their facing; grey with a violet zigzag when stunned; label shows HUNTING / TRACING / STUN).
- Telegraphs: Wren's planned move as an amber dashed arrow plus ghost diamond; each hunter's next step as a red dashed arrow.
- Rain: about 140 thin streaks drifting down and slightly left, drawn on the street layer only.

### 4.3 Net layer (canvas)

- Pre-render: deep navy ground, faint cyan dots on walkable tiles, and a cyan wireframe of every wall edge, so the street geometry stays readable.
- Per frame: links as animated dashed lines (brighter when touching Kade's node); node shapes by type (hexagon terminal, small circle junction, ringed circle camera, square door, spiky octagon ICE with layer pips) with glow; colours cyan by default, violet when owned, red for live ICE, grey for broken ICE. Kade is a pulsing cyan ring (red with "DUMPSHOCK n" when shocked). Hunters appear as red implant diamonds; violet corner brackets mark any hunter or node Kade can act on this tick. Wren's payload shows as an amber signal pulse, faint when masked. A dotted diamond shows Kade's 4-tile implant range.
- Kade's planned action: a cyan dashed arrow for a route, a violet animated beam plus target brackets for a hack.

### 4.4 The layer switch

Press **Q** or use the Street / Net toggle. Render both layers to offscreen canvases every frame and composite them with a horizontal wipe: the Net is drawn above a moving cut line, the street below, with a bright cyan line and soft glow at the cut. Ease toward the target view (about 16 % of the remaining distance per frame). Add faint scanlines over the Net part.

While in the Net, show a picture-in-picture inset (bottom-right, about 30 % width) cropped from the street canvas around Kade's body. Its border turns red and pulses when a hunter is within 4 tiles of the terminal or is in body mode.

### 4.5 HUD layout

- **Top bar**: logo "WETWIRE" ("wire" in amber), district name, tick counter with a countdown ring, a "Timed ticks · 12s" checkbox (off by default; when on, an expired timer auto-commits), the Street / Net toggle, and a Brief button that reopens the start screen.
- **Left rail**: Wren's card (body pips, overload meter, payload size, download status or "N ticks of headroom", status chips such as Masked, Hunted, Overload critical) and Kade's card (body pips, neural load, trace, chips such as Jacked in · node, Dumpshock n, Body under threat, N systems owned).
- **Centre**: the canvas, a hint label in the corner naming the view, then a plan bar with two slots ("Wren · this tick", "Kade · this tick") and a large **Run tick** button, then context action buttons for the current view. In the Net view these list every legal Kade action with number keys, cost, and a red warning when it would cause a dumpshock.
- **Right rail**: the wire log (newest first; tick number, a STREET or NET tag, one-line event; red for bad news, amber for good) and a short colour legend.
- Below 1100 px the layout becomes one column (stage, then cards side by side, then log). Below 620 px cards stack and an on-screen D-pad appears.
- When Wren's overload passes 75 %, her card shakes slightly and the street view occasionally jitters with a chromatic offset. Respect `prefers-reduced-motion` by turning these off and stopping the rain and dash animations.

### 4.6 Controls

| Input | Effect |
| --- | --- |
| W A S D / arrows / tap a neighbouring tile | plan Wren's move |
| M | plan mask |
| X / tap Wren | plan wait |
| Q | switch view |
| 1–9 / click a node or hunter (Net view) | plan Kade's action; clicking prefers a hack over a route |
| Space / Enter / Run tick | resolve the tick |

Animate each resolution over 300 ms with a cubic ease-out on unit positions, plus short effects: red ring on a hit, white brackets on a camera spot, violet beam and ring on a hack, amber box on a bump.

### 4.7 Overlays

- **Start screen**: eyebrow, huge logo, two short paragraphs explaining the premise and the simultaneous tick, three payload cards (radio group), a two-column how-to (Street / Net) with key caps, and a Start run button.
- **End screen**: "Delivered" in amber, or "Taken" / "Flatlined" in red, one explanatory sentence, four stat tiles (fee, ticks, camera alerts, hacks), and Run it again.

## 5. Phase 2: production architecture

Goal: the same single-player slice, rebuilt as a project that can grow into an online game. Gameplay must be identical to Phase 1; prove it with tests.

### 5.1 Stack

- Monorepo with pnpm workspaces: `packages/sim` (pure rules), `packages/client` (browser), `packages/server` (Phase 3), `packages/content` (maps, roles, implants as data), `tools/` (bots, balance runner).
- TypeScript strict mode everywhere. Vite for the client. Vitest for tests.
- Rendering: **PixiJS v8** (WebGL, WebGPU when available) for the map and both layers. Use a Pixi filter or shader for the wipe, scanlines and glitch.
- UI: a DOM layer over the canvas (Preact or React plus CSS modules), so text stays crisp, menus are accessible, and designers can work without touching the renderer.

### 5.2 The simulation core (`packages/sim`)

This package is the game. It has no DOM, no timers, no randomness except a seeded RNG passed in, and no I/O.

```ts
type PlayerId = string;
type Action = CourierAction | DeckerAction | /* later roles */ never;
interface MatchState { tick: number; seed: number; /* units, nodes, doors, cams, meters */ }
interface TickInput { actions: Record<PlayerId, Action> }
interface TickResult { state: MatchState; events: GameEvent[] }

export function createMatch(map: MapDef, setup: MatchSetup, seed: number): MatchState;
export function legalActions(state: MatchState, player: PlayerId): Action[];
export function telegraphs(state: MatchState): Telegraph[];      // hunter intents, camera turns
export function resolveTick(state: MatchState, input: TickInput): TickResult;
export function viewFor(state: MatchState, player: PlayerId): PlayerView; // fog of war (Phase 3)
```

- `resolveTick` is pure: the same state and input always produce the same result. Never mutate the input state; return a new one (structural sharing or Immer is fine).
- Events (`CameraSpotted`, `HackApplied`, `CourierHit`, `Dumpshock`, …) drive the log, sound and effects. The renderer never infers events by diffing state.
- Maps, roles, implants and payloads live in `packages/content` as JSON with a schema (Zod), so balance changes need no code changes.
- Keep the Phase 1 tick order (section 3.6) as named, ordered steps in one file, each a small function. Later phases insert steps; they never reorder existing ones without a decision entry.

### 5.3 Client

- `Renderer` subscribes to state and events; interpolates unit positions between ticks; owns the two layer containers and the wipe.
- `InputController` turns keys, clicks and taps into actions using `legalActions`, so the UI can never offer an illegal move.
- Store UI preferences (timed ticks, reduced motion override, volume) in `localStorage` with try/catch.
- Target 60 fps on a mid-range laptop, initial download under 2 MB gzipped, assets per district loaded on demand.
- Add sound: a rain bed, a low hum in the Net, short cues for tick resolve, spot, hit, hack and dumpshock. Audio starts only after the first user gesture.

### 5.4 Tests and tools

- Golden test: replay the scripted run below from a fixed seed and assert the final state and event log match a stored snapshot. Kade: unlock DOOR-2, route JX-1, blind CAM-C, route JX-2, break ICE twice, route ICE, unlock DOOR-1, then burn any hunter within 3 tiles of Wren. Wren: greedy BFS toward the receiver, avoiding tiles next to a hunter's telegraphed step. With a Standard load this run must end **Delivered** (Phase 1 reaches it on tick 21).
- Property tests: BFS route lengths (25 locked, 17 open); hunters always take their telegraphed step unless stunned or blocked; overload never decreases; no action from `legalActions` ever throws.
- `tools/balance`: a headless runner that plays thousands of bot matches per payload size and prints win rate, average ticks, alerts and hacks. Phase 1 targets with the greedy bot: Light ≥ 85 % delivered, Standard 55–75 %, Heavy 25–45 %.

## 6. Phase 3: online PvP

Goal: two human teams in one district, with AI filling empty slots. Start with **2v2**: Team Run (Courier + Decker) against Team Syndicate (Hunter + Decker). Grow to 3v3v3 later.

### 6.1 Server model

- Server-authoritative. Clients send only actions; the server runs `resolveTick` from `packages/sim` and broadcasts results. Clients never compute outcomes.
- Node.js with WebSockets. Colyseus is the default room framework; ask me before choosing something else. One room per match.
- Each tick: a planning window (default 12 s, configurable 6–20 s) → server locks inputs → resolve → broadcast each player's view and events → next window. If every player has locked in, resolve early.
- A missing action defaults to Wait / Hold. Three missed ticks in a row hands that slot to the AI until the player returns.
- Reconnect: the client sends its match token and receives a full snapshot of its current view.
- Persist a replay as the seed plus the per-tick input log; any match can then be re-simulated exactly for disputes and balance analysis.

### 6.2 Information and fog of war

In single-player, hunters telegraph every step. Against humans that would give away too much, so information becomes something you earn.

- `viewFor(state, player)` returns only what that player's team can perceive. The server never sends hidden data, so a modified client cannot reveal it.
- Street vision: your units' line of sight, plus cameras your team controls. In the Net: nodes linked to your decker's node, plus any signal you are tracking.
- **Commitment signals** replace full telegraphs. Big actions take two ticks: a visible wind-up, then the effect. A Razor's heavy strike, a door breach, a hunter's implant burn and an ICE breach all show a wind-up marker to anyone who can see the actor or the node. Small actions (a step, a mask, a short hack) resolve in one tick and are not announced.
- The courier's payload emits a signal the enemy decker can track from a linked node. Masking hides it for the tick. Carrying more payload makes the signal louder (bigger detection radius).

### 6.3 Simultaneous-action conflicts

Write these rules as tests:

- Two units moving into the same tile: both stay put ("collision"), unless one is stunned.
- Two units swapping tiles: both stay put.
- A door unlocked and re-locked in the same tick: the lock wins (defence is favoured).
- Two deckers hacking the same node: the one with the higher remaining neural headroom wins; on a tie, both fail and both pay the load.
- Attack and dodge: attacks hit the tile the target ends the tick on, so stepping away from an adjacent attacker works unless they also move adjacent.

### 6.4 Matchmaking and lobby

- Queues by mode and region; hidden skill rating (Glicko-2) per role; match on rating first, then on hours played so newcomers are not matched against veterans.
- Pre-match: pick role and loadout within the shared neural budget (Phase 4), 30-second draft, map reveal.
- Private lobbies with invite codes for testing and friends.

### 6.5 Security and fairness

- Validate every action against `legalActions` on the server; reject and log anything else.
- Rate-limit messages per connection. Authenticate with short-lived tokens.
- Do not expose other players' IDs, ratings or loadouts until the match reveals them.

## 7. Phase 4: roles, loadouts and combat

### 7.1 The combat triangle

Every action belongs to one of three channels:

- **Meat** (physical): blades, firearms, breaching. Beats **Ghost**: once you find someone, you can hurt them.
- **Net** (hacking): disable implants, doors, cameras. Beats **Meat**: a Razor with locked-out blades is just a person.
- **Ghost** (stealth and misdirection): masking, decoys, signal spoofing. Beats **Net**: you cannot hack what you cannot locate.

Each role leans on one channel but has at least one tool in each of the other two.

### 7.2 Neural budget: the single balancing resource

- Every character has the same **neural capacity of 100** in matchmade play.
- Implants cost a permanent share of it (their *slot cost*). Active hacks and abilities add temporary load. A courier's payload adds load continuously (its overload rate).
- At 100 total, the character suffers attenuation: −1 action every other tick for 3 ticks (dumpshock for deckers).
- **Chrome is attack surface.** Every installed implant is also a Net node on that character. Enemy deckers can target it from a linked node or within implant range. More chrome = stronger in Meat, more exposed in Net. A character with no implants cannot be hacked, but has nothing to boost them.

### 7.3 Role kits (starting numbers)

| Role | Body | Base move | Signature actions | Passive |
| --- | --- | --- | --- | --- |
| Courier | 3 | 1 tile | Mask (+10 load), Sprint (2 tiles, +8 load, no mask that tick), Dead drop (hand the payload to an adjacent ally, 1 tick) | Chooses payload size at pickup |
| Razor | 5 | 1 tile | Strike (1 dmg, adjacent), Heavy strike (2 dmg, 2-tick wind-up), Guard (block the next hit on an adjacent ally) | Sees masked units within 2 tiles |
| Decker | 2 | 1 tile in Street; jacked in, 1 node | Jack in / out (1 tick each), Blind, Unlock / Lock, Break ICE, Burn implant, Track signal, Plant ICE (2 ticks) | Body is defenceless while jacked in; damage while jacked in = dumpshock 3 |
| Hunter | 4 | 1 tile | Strike (1 dmg), Trap (hidden tile, roots 2 ticks), Mark (reveal target for 3 ticks, needs line of sight) | Follows signal trails up to 3 ticks old |
| Fixer | 3 | 1 tile | Sell route (reveal one enemy for your team, costs credits), Bounty, Broker (offer an in-match deal to any player) | Earns credits during the match |
| Receiver | 3 | 1 tile, can't sprint | Relocate the drop point (3-tick setup), Read out (download) | The match ends when it holds a payload for 2 ticks |

### 7.4 Implants as sidegrades

No implant is strictly better than another. Each new one is a different trade. Starting set (each also adds a Net node to its owner):

| Implant | Slot cost | Effect | Trade-off |
| --- | --- | --- | --- |
| Razor nails | 15 | Strike +1 damage | Burn disables them 3 ticks |
| Mono-whip | 20 | Strike reaches 2 tiles | Wind-up 1 tick, visible |
| Mirrorshades | 10 | +1 vision radius, see camera cones | Blinding them also blinds you 1 tick |
| Dermal plating | 20 | First hit each match blocked | −1 sprint distance |
| Quiet heart | 15 | Mask costs 5 instead of 10 | Overload rate +0.5 |
| Signal baffle | 15 | Payload signal radius −2 | Can't dead drop |
| Ice-pick deck | 20 | Break ICE removes 2 layers | Trace +5 per hack |
| Ghost deck | 20 | Hacks add half trace | Hacks cost +5 load |
| Spine relay | 15 | Jack in / out is free (0 ticks) | Dumpshock lasts +1 tick |

### 7.5 Damage, death and the payload

- No full loot. A downed character is *flatlined*: they respawn at their team's safehouse after 4 ticks with full body and no carried items.
- A downed courier drops the payload. An enemy can pick it up (1 tick) or perform an *extraction* on the body (2 ticks, interruptible by any damage) to steal it without the drop being visible to the courier's team.
- Heal only at a safehouse or a street doc node (1 body per 2 ticks), so retreating is a real decision.

### 7.6 The Fixer's betrayal

The Fixer may broker a deal with the enemy (for example: reveal our courier for 5 ticks in exchange for credits). This is on-theme and creates drama, but it can become griefing. Rules: a betrayal never directly damages teammates; it can only trade information; the betrayed team sees a log line one tick later; repeat betrayers get matched with each other. Ship this behind a mode flag and ask me before enabling it by default.

## 8. Phase 5: progression, economy and balance

### 8.1 Progression rules

- **Options, not power.** Unlocks add implants, gadgets and cosmetics. They never raise neural capacity, body or damage in matchmade play.
- **One track per role** (Courier, Razor, Decker, Hunter, Fixer, Receiver), levels 1–30. Each level takes roughly one to two matches. Rewards alternate: a new sidegrade implant or gadget every 3 levels, cosmetics in between.
- **Faction standing** (Corp, Syndicate, Lo-Teks): earned by playing contracts for that faction; unlocks faction cosmetics, safehouse decor and contract variety. Never combat stats.
- **Account level**: unlocks modes and maps for new players in a fixed order, so the first sessions teach one idea at a time (solo slice → 2v2 → full roles → territory).
- **Losing costs time, never gear.** A lost contract pays a small participation share; nothing equipped is destroyed.
- **Catch-up**: underdog contracts (lower team rating) pay +25 % reputation; first win of the day doubles role XP.

### 8.2 Territory meta-layer

- The city is a map of districts. Weekly seasons: each finished contract moves its district's influence toward the winning faction.
- A controlled district grants only convenience perks to that faction: cheaper respawn cosmetics, better contract selection, a safehouse closer to the pickup on that map. Cap any positional perk at one tile of advantage.
- Influence decays 10 % per day so control never snowballs into a permanent lock.

### 8.3 Economy and monetisation

- Two currencies: **credits** (earned only by playing, spent on unlocking sidegrades early) and a premium currency spent **only on cosmetics**. Nothing sold affects a match.
- Every sidegrade can be earned through play within its role track; credits only shorten the path.

### 8.4 Telemetry and balance targets

Log per match (anonymised): roles and loadouts, winner, ticks, time spent in each layer per player, which layer produced the deciding event, hacks by type, deaths by cause, payload size, and per-tick planning time.

Build an internal dashboard and alert when a metric leaves its band:

| Metric | Healthy band |
| --- | --- |
| Win rate per role (matchmade) | 47–53 % |
| Pick rate per implant within its role | 5–35 % |
| Matches decided by a Net event | 30–45 % |
| Delivered rate per payload size | Light 60–70 %, Standard 45–55 %, Heavy 30–40 % |
| Average match length | 10–15 min |
| Ticks auto-committed by timeout | under 8 % |

If the Net decides too many matches, raise jack-in cost or body vulnerability; too few, raise the impact of hacks. Change one number per patch, and keep a patch log in `docs/BALANCE.md` with the before, after and reason.

## 9. Quality bar and acceptance checklist

**Readability test** (run with a new player at the end of every phase): after any tick, can they say what just happened, and why, within five seconds? If not, fix the visuals before adding features.

**Accessibility**: team identity uses shape and outline as well as colour; colourblind palettes (deuteranopia, protanopia, tritanopia) selectable; text scales to 150 %; full keyboard play; touch play on phones; `prefers-reduced-motion` honoured.

**Phase 1 is done when:**

- [ ] The map, numbers and tick order match sections 3.1–3.8 exactly
- [ ] The scripted Standard run in 5.4 ends Delivered
- [ ] Both layers, the wipe, the PiP inset and all telegraphs render as in section 4
- [ ] Works at 400 px wide with no horizontal scroll, and at 1440 px
- [ ] No console errors; 60 fps on a mid-range laptop

**Phase 2 is done when:**

- [ ] `packages/sim` has no DOM or timer imports and passes the golden and property tests
- [ ] Client play is indistinguishable from Phase 1
- [ ] The balance runner prints win rates per payload within the 5.4 targets

**Phase 3 is done when:**

- [ ] Two browsers on different machines can play a full 2v2 match with AI fill
- [ ] Disconnect and reconnect mid-match restores the correct view
- [ ] A modified client cannot see hidden units or submit illegal actions
- [ ] Every match can be replayed exactly from its seed and input log
- [ ] All simultaneous-action conflict rules in 6.3 have passing tests

**Phase 4 is done when:**

- [ ] All six roles and the nine starting implants are data-driven from `packages/content`
- [ ] Loadouts are rejected above the neural budget, on the client and the server
- [ ] Bot-vs-bot role win rates sit within 45–55 % before human testing

**Phase 5 is done when:**

- [ ] Role tracks, faction standing and the territory map persist per account
- [ ] No purchasable item changes a match outcome (audit the item table)
- [ ] The telemetry dashboard shows every band in 8.4

**At the end of each phase, report back with**: what was built, screenshots of both layers, test results, the balance runner output, every entry added to `docs/DECISIONS.md`, and the three things you would do next.
