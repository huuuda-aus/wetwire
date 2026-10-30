import { costOf, sameAction } from '@wetwire/sim';
import { useEffect, useRef } from 'preact/hooks';
import type { Sfx } from '../audio.ts';
import type { Game } from '../game.ts';
import type { MotionPref } from '../prefs.ts';
import { routeInfo } from '../scouting.ts';
import { MOVE_KEYS, RAZOR_MOVE_KEYS, courierLabel, deckerLabel, razorLabel } from './labels.ts';

const RING = 62.8;

/** Updates the countdown ring straight on the DOM each frame, so the timer never re-renders Preact. */
function TickRing({ game }: { game: Game }) {
  const ref = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      ref.current?.style.setProperty(
        'stroke-dashoffset',
        String(RING * (1 - game.timerLeft(performance.now()))),
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return (
    <svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="bg" cx="12" cy="12" r="10" />
      <circle class="fg" ref={ref} cx="12" cy="12" r="10" />
    </svg>
  );
}

export function TopBar({ game, sfx, onBrief }: { game: Game; sfx: Sfx; onBrief: () => void }) {
  const muted = game.prefs.volume === 0;
  const route = routeInfo(game.state);
  return (
    <header class="top">
      <div class="logo disp">
        WET<b>WIRE</b>
      </div>
      <div class="district">{game.state.rules.district.name}</div>
      <div class="tickbox">
        <TickRing game={game} />
        <span class="num disp" aria-label="Tick">
          {game.state.tick}
        </span>
        <span class="district">tick</span>
      </div>
      <div class={`route${route.cutOff ? ' cut' : ''}`} role="status" aria-label="Route to receiver">
        {route.cutOff ? 'Route: cut off' : `Route: ${route.distance}`}
      </div>
      <label class="chk">
        <input
          type="checkbox"
          checked={game.prefs.timed}
          onChange={(e) => {
            game.setPrefs({ timed: e.currentTarget.checked });
            game.tickStart = performance.now();
          }}
        />
        Timed ticks · 12s
      </label>
      <div class="spacer" />
      <label class="chk">
        <span class="sr-only">Motion</span>
        <select
          value={game.prefs.motion}
          onChange={(e) => game.setPrefs({ motion: e.currentTarget.value as MotionPref })}
          aria-label="Motion"
        >
          <option value="system">Motion: system</option>
          <option value="reduce">Motion: reduced</option>
          <option value="full">Motion: full</option>
        </select>
      </label>
      <button
        class="btn"
        aria-pressed={!muted}
        onClick={() => {
          const volume = muted ? 0.6 : 0;
          game.setPrefs({ volume });
          sfx.unlock();
          sfx.setVolume(volume);
        }}
      >
        Sound {muted ? 'off' : 'on'}
      </button>
      <div class="seg" role="group" aria-label="View">
        <button data-v="street" aria-pressed={game.view === 'street'} onClick={() => game.setView('street')}>
          Street
        </button>
        <button data-v="net" aria-pressed={game.view === 'net'} onClick={() => game.setView('net')}>
          Net (Q)
        </button>
      </div>
      <button class="btn" aria-pressed={game.overview} onClick={() => game.setOverview(!game.overview)}>
        Overview (V)
      </button>
      <button class="btn" onClick={onBrief}>
        Brief
      </button>
    </header>
  );
}

export function PlanBar({ game }: { game: Game }) {
  const { plan, state } = game;
  return (
    <div class="planbar">
      <div class="slot w">
        <small>Wren · this tick</small>
        <b>{courierLabel(plan.wren)}</b>
      </div>
      <div class="slot k">
        <small>Kade · this tick</small>
        <b>{state.kade.flat ? 'Flatlined' : deckerLabel(state, plan.kade)}</b>
      </div>
      <div class="slot r">
        <small>Razor · this tick</small>
        <b>{state.razor.body <= 0 ? 'Down' : razorLabel(plan.razor)}</b>
      </div>
      <button
        class="run disp"
        disabled={state.status !== 'play'}
        onClick={() => game.commit(performance.now())}
      >
        RUN TICK
      </button>
    </div>
  );
}

export function Actions({ game }: { game: Game }) {
  const { state, plan } = game;
  if (game.view === 'net') {
    if (game.legalKade.length === 0) return <div class="actions netacts" />;
    return (
      <div class="actions netacts">
        {game.legalKade.map((a, i) => {
          const cost = costOf(state, a);
          const warn = cost !== null && state.kade.load + cost.load >= state.rules.balance.net.loadMax;
          const decay = state.rules.balance.net.decay;
          return (
            <button
              key={i}
              class={sameAction(a, plan.kade) ? 'sel' : ''}
              onClick={() => game.setKadeAction(a)}
            >
              <kbd>{i + 1}</kbd>
              {deckerLabel(state, a)}
              <span class="cost">
                {cost
                  ? `+${cost.load} load +${cost.trace} trace`
                  : `−${decay.load} load −${decay.trace} trace`}
              </span>
              {warn && <span class="warn">dumpshock</span>}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div class="actions">
      {game.legalWren.map((a, i) => (
        <button
          key={i}
          class={sameAction(a, plan.wren) ? 'sel' : ''}
          data-action-type={a.type}
          onClick={() => game.setWrenAction(a)}
        >
          <kbd>
            {a.type === 'move'
              ? MOVE_KEYS[a.dir]
              : a.type === 'sprint'
                ? `⇧${MOVE_KEYS[a.dir]}`
                : a.type === 'mask'
                  ? 'M'
                  : 'X'}
          </kbd>
          {courierLabel(a)}
        </button>
      ))}
    </div>
  );
}

export function Dpad({ game }: { game: Game }) {
  const btn = (cls: string, dir: 0 | 1 | 2 | 3, glyph: string, label: string) => (
    <button class={cls} aria-label={label} onClick={() => game.moveWren(dir)}>
      {glyph}
    </button>
  );
  return (
    <div class="dpad" aria-label="Move Wren">
      {btn('n', 0, '▲', 'Move north')}
      {btn('w', 3, '◀', 'Move west')}
      {btn('s', 2, '▼', 'Move south')}
      {btn('e', 1, '▶', 'Move east')}
    </div>
  );
}

/** Razor's own small action row: always visible (she shares the Street layer with Wren but has
 * no view of her own). Movement has its own keys (IJKL); everything else reuses the same
 * list-index scheme as Kade's Net-view hacks (1-9 picks the Nth currently-legal action) since
 * it's only ever offered in Street view, where those digits are otherwise unused. */
export function RazorActions({ game }: { game: Game }) {
  const { plan } = game;
  if (game.state.razor.body <= 0) return null;
  return (
    <div class="actions razoracts" aria-label="Razor's actions">
      {game.legalRazor.map((a, i) => (
        <button key={i} class={sameAction(a, plan.razor) ? 'sel' : ''} onClick={() => game.setRazorAction(a)}>
          <kbd>{a.type === 'move' ? RAZOR_MOVE_KEYS[a.dir] : i + 1}</kbd>
          {razorLabel(a)}
        </button>
      ))}
    </div>
  );
}
