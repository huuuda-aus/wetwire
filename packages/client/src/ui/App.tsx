import { useEffect, useMemo, useState } from 'preact/hooks';
import { Sfx } from '../audio.ts';
import { Game } from '../game.ts';
import { attachKeyboard } from '../input.ts';
import { Actions, Dpad, PlanBar, RazorActions, TopBar } from './Controls.tsx';
import { useGame } from './hooks.ts';
import { EndOverlay, StartOverlay } from './Overlays.tsx';
import { KadeCard, Legend, LogPanel, RazorCard, WrenCard } from './Panels.tsx';
import { Stage } from './Stage.tsx';

export function App() {
  const game = useMemo(() => new Game(), []);
  const sfx = useMemo(() => new Sfx(game.prefs.volume), [game]);
  // A restored match (game.running already true from a reload) skips the brief so play resumes
  // straight away; a fresh session still opens on it.
  const [briefOpen, setBriefOpen] = useState(!game.running);
  useGame(game);

  useEffect(
    () =>
      attachKeyboard(
        game,
        sfx,
        () => briefOpen || (game.state.status === 'over' && document.querySelector('.ov.show') !== null),
      ),
    [game, sfx, briefOpen],
  );
  useEffect(() => {
    sfx.setVolume(game.prefs.volume);
  }, [game.prefs.volume, game, sfx]);

  const canResume = game.running && game.state.status === 'play';

  const start = (payload: string, districtId: string): void => {
    sfx.unlock();
    game.start(payload, performance.now(), districtId);
    setBriefOpen(false);
  };

  return (
    <>
      <TopBar game={game} sfx={sfx} onBrief={() => setBriefOpen(true)} />
      <main class="layout">
        <aside class="left" aria-label="Crew status">
          <WrenCard game={game} />
          <KadeCard game={game} />
          <RazorCard game={game} />
        </aside>
        <section class="center">
          <Stage game={game} sfx={sfx} />
          <PlanBar game={game} />
          <Actions game={game} />
          <RazorActions game={game} />
          <Dpad game={game} />
        </section>
        <aside class="right">
          <LogPanel game={game} />
          <Legend />
        </aside>
      </main>
      <StartOverlay
        game={game}
        open={briefOpen}
        canResume={canResume}
        onStart={start}
        onResume={() => setBriefOpen(false)}
      />
      <EndOverlay game={game} onAgain={() => setBriefOpen(true)} />
    </>
  );
}
