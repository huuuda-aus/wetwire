import type { Game } from '../game.ts';

const Pips = ({ n, max }: { n: number; max: number }) => (
  <span class="pips" aria-label={`${n} of ${max}`}>
    {Array.from({ length: max }, (_, i) => (
      <span key={i} class={i < n ? 'pip on' : 'pip'} />
    ))}
  </span>
);

const Meter = ({ pct, cls, label }: { pct: number; cls?: string; label: string }) => (
  <div
    class={`meter ${cls ?? ''}`}
    role="meter"
    aria-label={label}
    aria-valuenow={Math.round(Math.min(100, pct))}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <i style={{ width: `${Math.min(100, pct)}%` }} />
  </div>
);

const Chip = ({ children, cls }: { children: string; cls?: string }) => (
  <span class={`chip ${cls ?? ''}`}>{children}</span>
);

export function WrenCard({ game }: { game: Game }) {
  const { wren, payload, download, hunters } = game.state;
  const { balance } = game.state.rules;
  const pl = balance.payloads[payload];
  const rate = pl?.rate ?? 1;
  const hot = wren.overload / balance.overloadMax > 0.75;
  const headroom = Math.max(0, Math.ceil((balance.overloadMax - wren.overload) / rate) - 1);
  const motionOk = game.prefs.motion !== 'reduce';
  return (
    <section class={`card wren${hot && motionOk ? ' shake' : ''}`} aria-label="Wren, courier">
      <h2 class="disp">
        WREN <small>courier</small>
      </h2>
      <div class="row">
        Body <Pips n={wren.body} max={balance.wrenBody} />
      </div>
      <div class="row">
        Overload <b>{Math.min(100, Math.round(wren.overload))}%</b>
      </div>
      <Meter pct={wren.overload} cls={hot ? 'hot' : ''} label="Overload" />
      <div class="row">
        Payload{' '}
        <b>
          {pl?.mb} MB · +{rate}/tick
        </b>
      </div>
      <div class="row">
        {download > 0 ? 'Download' : 'Headroom'}{' '}
        <b>{download > 0 ? `${download}/${balance.downloadTicks}` : `${headroom} ticks`}</b>
      </div>
      <div class="chips">
        {wren.masked && <Chip cls="good">Masked</Chip>}
        {hunters.some((h) => h.mode === 'hunt') && <Chip cls="bad">Hunted</Chip>}
        {hot && <Chip cls="bad">Overload critical</Chip>}
      </div>
    </section>
  );
}

export function KadeCard({ game }: { game: Game }) {
  const { kade, owned, hunters, rules } = game.state;
  const { balance, district } = rules;
  const label = rules.nodes[kade.node]?.label ?? kade.node;
  const t = district.terminal;
  const threat = hunters.some(
    (h) => h.mode === 'body' || Math.hypot(h.x - t.x, h.y - t.y) <= balance.net.bodyThreatRange,
  );
  return (
    <section class="card kade" aria-label="Kade, decker">
      <h2 class="disp">
        KADE <small>decker</small>
      </h2>
      <div class="row">
        Body <Pips n={kade.body} max={balance.kadeBody} />
      </div>
      <div class="row">
        Neural load <b>{Math.round(kade.load)}</b>
      </div>
      <Meter pct={kade.load} cls={`net${kade.load >= 80 ? ' hot' : ''}`} label="Neural load" />
      <div class="row">
        Trace <b>{Math.round(kade.trace)}%</b>
      </div>
      <Meter pct={kade.trace} cls={`net${kade.trace >= 80 ? ' hot' : ''}`} label="Trace" />
      <div class="chips">
        {kade.flat ? <Chip cls="bad">Flatlined</Chip> : <Chip cls="net">{`Jacked in · ${label}`}</Chip>}
        {kade.shock > 0 && <Chip cls="bad">{`Dumpshock ${kade.shock}`}</Chip>}
        {threat && !kade.flat && <Chip cls="bad">Body under threat</Chip>}
        {owned.length > 0 && <Chip cls="own">{`${owned.length} systems owned`}</Chip>}
      </div>
    </section>
  );
}

export function LogPanel({ game }: { game: Game }) {
  return (
    <section class="card">
      <h3>Wire log</h3>
      <ul id="log" aria-live="polite">
        {game.log.map((e, i) => (
          <li key={`${e.tick}-${i}`} class={`${e.kind}${e.layer === 'NET' ? ' net' : ''}`}>
            <span class="t">{e.tick}</span>
            <span class="tag">{e.layer}</span>
            <span class="m">{e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const Legend = () => (
  <section class="card">
    <h3>Legend</h3>
    <div class="legend">
      <i style={{ background: 'var(--amber)', transform: 'rotate(45deg) scale(.7)' }} />
      <span>Wren · payload · your crew</span>
      <i style={{ background: 'var(--crim)', clipPath: 'polygon(0 0,100% 50%,0 100%)' }} />
      <span>Syndicate hunter</span>
      <i style={{ background: 'rgba(224,70,78,.35)' }} />
      <span>Hunter vision</span>
      <i style={{ background: 'rgba(240,235,220,.35)' }} />
      <span>Camera cone</span>
      <i style={{ background: 'var(--net)' }} />
      <span>Net · Kade</span>
      <i style={{ background: 'var(--own)' }} />
      <span>System you own</span>
    </div>
  </section>
);
