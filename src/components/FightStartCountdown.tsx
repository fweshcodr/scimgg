import { useEffect, useRef, useState } from 'react';
import { CountdownBeats } from './CountdownBeats';
import './FightStartCountdown.css';

/**
 * Timing is owned by the caller (the fight-start gate in useSimulationWiring), on the
 * `performance.now()` clock. The fight becomes live at `releasedAtMs`: that is the
 * moment "GO" shows. Its visual confirmation and fade then run while the fight is
 * live, before `onFinished` lets the caller unmount it. It never gates the simulation.
 */
export interface FightStartCountdownProps {
  /** Start of the first beat. May be in the future (intro alignment). */
  startsAtMs: number;
  /** Planned deadline on the same performance clock. */
  endsAtMs: number;
  /** Actual release after the deadline and intro completion; null while the fight is held. */
  releasedAtMs: number | null;
  /** Armed count and wall-clock duration of each game-tick beat, captured by the caller. */
  tickCount: number;
  tickMs: number;
  /** Small restart label; entry uses the separate arrival title card. */
  encounterName?: string | null;
  /** Called once the exit has finished, after actual release. */
  onFinished: () => void;
}

/** Visual lifetime after release: the CSS animation's 200ms hold plus 400ms fade. */
export const FIGHT_COUNTDOWN_EXIT_MS = 600;

type Phase =
  | { kind: 'waiting'; nextAtMs: number }
  | { kind: 'beat'; index: number; nextAtMs: number }
  | { kind: 'held'; nextAtMs: null }
  | { kind: 'go'; nextAtMs: number }
  | { kind: 'done' };

/** Pure position on the timeline, so a throttled tab catches up instead of replaying beats. */
export function fightCountdownPhaseAt(
  nowMs: number,
  startsAtMs: number,
  endsAtMs: number,
  releasedAtMs: number | null,
  tickCount: number,
  tickMs: number,
): Phase {
  if (releasedAtMs !== null) {
    const finishedAtMs = releasedAtMs + FIGHT_COUNTDOWN_EXIT_MS;
    return nowMs >= finishedAtMs ? { kind: 'done' } : { kind: 'go', nextAtMs: finishedAtMs };
  }
  if (nowMs >= endsAtMs) return { kind: 'held', nextAtMs: null };
  if (nowMs < startsAtMs) return { kind: 'waiting', nextAtMs: startsAtMs };
  const index = Math.min(tickCount - 1, Math.floor((nowMs - startsAtMs) / tickMs));
  return { kind: 'beat', index, nextAtMs: startsAtMs + (index + 1) * tickMs };
}

export function FightStartCountdown({
  startsAtMs,
  endsAtMs,
  releasedAtMs,
  tickCount,
  tickMs,
  encounterName,
  onFinished,
}: FightStartCountdownProps) {
  const [nowMs, setNowMs] = useState(() => performance.now());
  const phase = fightCountdownPhaseAt(nowMs, startsAtMs, endsAtMs, releasedAtMs, tickCount, tickMs);
  const nextAtMs = phase.kind === 'done' ? null : phase.nextAtMs;

  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const finishedRef = useRef(false);

  // A new window (the caller reused this instance for a restart) is a new countdown.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the window is the trigger, not a value read here.
  useEffect(() => {
    finishedRef.current = false;
    setNowMs(performance.now());
  }, [startsAtMs, endsAtMs]);

  // Release can arrive long after the last numbered beat, with no timer running while held.
  // biome-ignore lint/correctness/useExhaustiveDependencies: actual release refreshes the sampled clock.
  useEffect(() => {
    setNowMs(performance.now());
  }, [releasedAtMs]);

  // One timer to the next boundary, re-armed on every tick of `nowMs` so a timer that
  // fires a hair early simply schedules again rather than stalling on the same phase.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nowMs re-arms the timer on purpose.
  useEffect(() => {
    if (nextAtMs === null) {
      if (phase.kind === 'done' && !finishedRef.current) {
        finishedRef.current = true;
        onFinishedRef.current();
      }
      return;
    }
    const timer = setTimeout(() => setNowMs(performance.now()), Math.max(0, nextAtMs - performance.now()));
    return () => clearTimeout(timer);
  }, [nextAtMs, nowMs, phase.kind]);

  if (phase.kind === 'waiting' || phase.kind === 'done') return null;

  const isGo = phase.kind === 'go';
  const activeIndex = isGo ? tickCount : phase.kind === 'beat' ? phase.index : tickCount - 1;
  const token = isGo ? 'GO' : String(tickCount - activeIndex);

  return (
    <div className="fight-start-countdown">
      <span className="fight-start-countdown-status" role="status">
        {isGo ? 'Fight started' : tickCount === 1 ? 'Fight starts in 1 tick' : `Fight starts in ${tickCount} ticks`}
      </span>
      <div
        className={`fight-start-countdown-content${isGo ? ' fight-start-countdown-content--exiting' : ''}`}
        aria-hidden="true"
      >
        {encounterName && <div className="fight-start-countdown-name">{encounterName}</div>}
        {/* Keyed per beat so each number lands with its own entrance. */}
        <div key={token} className={`fight-start-countdown-numeral${token === 'GO' ? ' is-go' : ''}`}>
          {token}
        </div>
        <div className="fight-start-countdown-beats">
          <CountdownBeats from={tickCount} activeIndex={activeIndex} />
        </div>
      </div>
    </div>
  );
}
