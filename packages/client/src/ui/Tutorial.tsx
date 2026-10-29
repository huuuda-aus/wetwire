import { useEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../game.ts';
import { showTutorial } from '../progress.ts';
import { TUTORIAL_STEPS } from '../tutorial.ts';
import { useGame } from './hooks.ts';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Scripted, non-blocking onboarding: a highlight ring around the relevant control plus a
 * callout with instructions. Every control stays clickable underneath — this never gates input,
 * it only points at things (CLAUDE.md §3 "small steps": additive over Controls.tsx, no existing
 * behaviour changed). */
export function Tutorial({ game }: { game: Game }) {
  useGame(game);
  const [stepIndex, setStepIndex] = useState(0);
  const lastTick = useRef(game.state.tick);
  const [rect, setRect] = useState<Rect | null>(null);

  const active = game.running && showTutorial(game.progress) && stepIndex < TUTORIAL_STEPS.length;
  const step = active ? TUTORIAL_STEPS[stepIndex] : undefined;

  // Advance on either the taught action happening, or a tick resolving (the non-blocking
  // fallback — a player who ignores the hint and just plays is never stuck on a step).
  useEffect(() => {
    if (!active || !step) return;
    if (step.match(game) || game.state.tick !== lastTick.current) {
      lastTick.current = game.state.tick;
      setStepIndex((i) => i + 1);
    }
  }, [active, step, game, game.version]);

  useEffect(() => {
    if (!active || !step?.target) {
      setRect(null);
      return;
    }
    const measure = (): void => {
      const el = document.querySelector(step.target ?? '');
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, step, game.version]);

  // Persist completion the moment the last step is cleared, not only on an explicit Skip, so a
  // reload mid-first-match doesn't replay a tour the player already finished.
  useEffect(() => {
    if (game.running && showTutorial(game.progress) && stepIndex >= TUTORIAL_STEPS.length) {
      game.dismissTutorial();
    }
  }, [game, stepIndex]);

  if (!active || !step) return null;

  const skip = (): void => game.dismissTutorial();

  return (
    <div class="tutorial" aria-live="polite">
      {rect && (
        <div
          class="tutorial-ring"
          style={{
            top: `${rect.top - 6}px`,
            left: `${rect.left - 6}px`,
            width: `${rect.width + 12}px`,
            height: `${rect.height + 12}px`,
          }}
        />
      )}
      <div class={`tutorial-callout${rect ? '' : ' centre'}`}>
        <p>{step.text}</p>
        <div class="tutorial-row">
          <span class="tutorial-step">
            {stepIndex + 1} / {TUTORIAL_STEPS.length}
          </span>
          <button class="btn" onClick={() => setStepIndex((i) => i + 1)}>
            Next
          </button>
          <button class="btn" onClick={skip}>
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
