// Headless balance runner: plays many bot matches per payload and prints win rates against the targets.
import { content } from '@wetwire/content';
import { playMatch, type BotSkill } from './bots.ts';

/** PROMPT.md §5.4 Phase 1 targets, as inclusive percentage bands. */
const TARGETS: Record<string, readonly [number, number]> = {
  light: [85, 100],
  standard: [55, 75],
  heavy: [25, 45],
};

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const raw = i >= 0 ? process.argv[i + 1] : undefined;
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${name} needs a number, got "${raw}"`);
  return n;
}

const matches = arg('matches', 2000);
const skill: BotSkill = {
  wrenMistake: arg('wren-mistake', 0.08),
  kadeLapse: arg('kade-lapse', 0.1),
  wrenDawdle: arg('wren-dawdle', 0),
};
console.log(`balance: ${matches} matches per payload, bot skill ${JSON.stringify(skill)}\n`);
console.log('payload    delivered   target     avg ticks  alerts  hacks   taken  flatlined  verdict');

let failed = false;
for (const key of Object.keys(content.balance.payloads)) {
  let delivered = 0,
    taken = 0,
    flatlined = 0,
    ticks = 0,
    alerts = 0,
    hacks = 0;
  for (let seed = 1; seed <= matches; seed++) {
    const { state } = playMatch(content, key, seed, skill);
    if (state.outcome === 'delivered') delivered++;
    else if (state.outcome === 'taken') taken++;
    else flatlined++;
    ticks += state.tick;
    alerts += state.stats.alerts;
    hacks += state.stats.hacks;
  }
  const rate = (delivered / matches) * 100;
  const band = TARGETS[key];
  const ok = band ? rate >= band[0] && rate <= band[1] : true;
  failed ||= !ok;
  const pct = (n: number): string => ((n / matches) * 100).toFixed(1).padStart(5) + '%';
  console.log(
    `${key.padEnd(10)} ${rate.toFixed(1).padStart(8)}%   ${band ? `${band[0]}-${band[1]}%` : 'n/a'}`.padEnd(
      40,
    ) +
      `${(ticks / matches).toFixed(1).padStart(9)}  ${(alerts / matches).toFixed(2).padStart(6)}  ${(hacks / matches).toFixed(2).padStart(5)}  ${pct(taken)}  ${pct(flatlined)}   ${ok ? 'in band' : 'OUT OF BAND'}`,
  );
}
process.exitCode = failed ? 1 : 0;
