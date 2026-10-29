import { fee } from '@wetwire/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game.ts';
import { isFirstTimer } from '../progress.ts';

export function StartOverlay({
  game,
  open,
  canResume,
  onStart,
  onResume,
}: {
  game: Game;
  open: boolean;
  /** True when there's an in-progress match to go back to, so the brief acts as a pause menu
   * rather than a dead end that forces a restart. */
  canResume: boolean;
  onStart: (payload: string, districtId: string) => void;
  onResume: () => void;
}) {
  const firstTimer = isFirstTimer(game.progress);
  const [payload, setPayload] = useState(
    firstTimer ? game.content.balance.defaultPayload : game.prefs.payload,
  );
  const [districtId, setDistrictId] = useState(
    firstTimer ? game.content.district.id : game.state.rules.district.id,
  );
  const payloadEntries = firstTimer
    ? Object.entries(game.content.balance.payloads).filter(
        ([key]) => key === game.content.balance.defaultPayload,
      )
    : Object.entries(game.content.balance.payloads);
  const districts = firstTimer ? [game.content.district] : game.content.districts;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) btn.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open || !canResume) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onResume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canResume, onResume]);
  return (
    <div
      class={open ? 'ov show' : 'ov'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="startTitle"
      hidden={!open}
    >
      <div class="box">
        <div class="eyebrow">Contract 0417 · Ironbridge Sprawl</div>
        <h1 class="huge disp" id="startTitle">
          WET<b>WIRE</b>
        </h1>
        <p>
          Information is too valuable for the Net, so it rides inside people. Wren carries a payload in her
          skull and every tick it burns her out a little more. Get her from the safehouse to the receiver
          before it cooks her or the Syndicate takes it.
        </p>
        <p class="dim">
          You run two people at once: Wren on the Street and Kade, a decker, in the Net. Plan both moves, then
          run the tick. Everything resolves at the same moment, and hunters telegraph the step they will take.
        </p>
        {firstTimer && (
          <p class="dim">
            First contract: standard load, Dock Row. More payload sizes and districts unlock after your first
            delivery.
          </p>
        )}
        <fieldset class="loads" aria-label="Payload size">
          {payloadEntries.map(([key, p]) => (
            <label key={key}>
              <input
                type="radio"
                name="load"
                value={key}
                checked={payload === key}
                onChange={() => setPayload(key)}
              />
              <span class="nm disp">{p.label.toUpperCase()}</span>
              <span class="ln">
                <span>Size</span>
                <b>{p.mb} MB</b>
              </span>
              <span class="ln">
                <span>Overload</span>
                <b>+{p.rate} / tick</b>
              </span>
              <span class="ln">
                <span>Fee</span>
                <b>¥{p.fee.toLocaleString('en-US')}</b>
              </span>
              <span class="nt">{p.note}</span>
            </label>
          ))}
        </fieldset>
        <fieldset class="loads" aria-label="District">
          {districts.map((d) => (
            <label key={d.id}>
              <input
                type="radio"
                name="district"
                value={d.id}
                checked={districtId === d.id}
                onChange={() => setDistrictId(d.id)}
              />
              <span class="nm disp">{d.name.split('·').pop()?.trim() ?? d.name}</span>
              <span class="nt">{d.name}</span>
            </label>
          ))}
        </fieldset>
        <div class="howto">
          <div>
            <h4>Street</h4>
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrows move Wren · <kbd>Shift</kbd>+move
            sprints 2 tiles (+8 overload) · <kbd>X</kbd> wait · <kbd>M</kbd> mask (+10 overload, cameras
            ignore you, hunters see you only if adjacent).
            <br />
            Razor and her Strike / Heavy strike / Guard actions are buttons below the map.
            <br />
            Red dashed arrows are promises: hunters take exactly that step.
          </div>
          <div>
            <h4>Net</h4>
            <kbd>Q</kbd> switch layer · <kbd>1</kbd>–<kbd>9</kbd> or click a node or hunter to plan
            Kade&apos;s action. Hacks add neural load and trace; at 100 load he dumpshocks.
            <br />
            <kbd>Space</kbd> / <kbd>Enter</kbd> runs the tick.
          </div>
        </div>
        <div class="startRow">
          {canResume && (
            <button class="btn" onClick={onResume}>
              RESUME · ESC
            </button>
          )}
          <button
            class="go disp"
            ref={btn}
            onClick={() => {
              if (canResume && !confirm('Start a new run? Your current contract in progress will be lost.'))
                return;
              onStart(payload, districtId);
            }}
          >
            {canResume ? 'RESTART RUN' : 'START RUN'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ENDINGS = {
  delivered: (body: number) => `The receiver has the payload. Wren walks out with ${body} body left.`,
  taken: () => 'The Syndicate hunters took Wren down and pulled the payload.',
  flatlined: () => 'The payload burned Wren out before she reached the receiver.',
} as const;

export function EndOverlay({ game, onAgain }: { game: Game; onAgain: () => void }) {
  const { state } = game;
  const over = state.status === 'over' && state.outcome !== null;
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!over) {
      setOpen(false);
      return;
    }
    const id = setTimeout(() => setOpen(true), 1100); // let the last tick's animation finish first
    return () => clearTimeout(id);
  }, [over, state]);
  useEffect(() => {
    if (open) btn.current?.focus();
  }, [open]);
  const outcome = state.outcome;
  if (!over || !outcome) return <div class="ov" hidden />;
  const ok = outcome === 'delivered';
  const tile = (label: string, value: string | number) => (
    <div class="stat">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
  return (
    <div
      class={open ? 'ov show' : 'ov'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="endTitle"
      hidden={!open}
    >
      <div class="box">
        <div class="eyebrow">{ok ? 'Contract fulfilled' : 'Contract failed'}</div>
        <h1 class={`huge disp ${ok ? 'end-ok' : 'end-bad'}`} id="endTitle">
          {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
        </h1>
        <p>{ENDINGS[outcome](state.wren.body)}</p>
        <div class="stats">
          {tile('Fee', ok ? `¥${fee(state).toLocaleString('en-US')}` : '¥0')}
          {tile('Ticks', state.tick)}
          {tile('Camera alerts', state.stats.alerts)}
          {tile('Hacks', state.stats.hacks)}
        </div>
        <button
          class="go disp"
          ref={btn}
          onClick={() => {
            // This overlay stays "open" until a new match actually starts (game.state.status
            // is still 'over' right now), so it must close itself or it sits on top of the
            // start screen onAgain is about to reveal.
            setOpen(false);
            onAgain();
          }}
        >
          RUN IT AGAIN
        </button>
      </div>
    </div>
  );
}
