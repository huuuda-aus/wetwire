import { fee } from '@wetwire/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game.ts';

export function StartOverlay({
  game,
  open,
  onStart,
}: {
  game: Game;
  open: boolean;
  onStart: (payload: string) => void;
}) {
  const [payload, setPayload] = useState(game.prefs.payload);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) btn.current?.focus();
  }, [open]);
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
        <fieldset class="loads" aria-label="Payload size">
          {Object.entries(game.content.balance.payloads).map(([key, p]) => (
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
        <div class="howto">
          <div>
            <h4>Street</h4>
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrows move Wren · <kbd>X</kbd> wait ·{' '}
            <kbd>M</kbd> mask (+10 overload, cameras ignore you, hunters see you only if adjacent).
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
        <button class="go disp" ref={btn} onClick={() => onStart(payload)}>
          START RUN
        </button>
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
        <button class="go disp" ref={btn} onClick={onAgain}>
          RUN IT AGAIN
        </button>
      </div>
    </div>
  );
}
