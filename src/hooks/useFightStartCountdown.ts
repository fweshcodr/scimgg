import { useCallback, useEffect, useRef, useState } from 'react';
import type { FightStartCountdownProps } from '../components/FightStartCountdown';
import { OSRS_TICK_MS } from '../types/simulation';
import { animationFrames } from '../util/animationFrames';

/** One countdown as the overlay shows it, on the `performance.now()` clock. */
export interface FightStartCountdownDescriptor
  extends Pick<FightStartCountdownProps, 'startsAtMs' | 'endsAtMs' | 'releasedAtMs' | 'tickCount' | 'tickMs'> {
  /** New for every start and every restart, so the overlay remounts instead of jumping. */
  readonly key: number;
}

type CountdownState =
  /** Started but not timed yet: covered, or waiting for the intro animation to report what is left. */
  | {
      readonly phase: 'pending';
      readonly key: number;
      readonly tickCount: number;
      readonly tickMs: number;
      readonly covered: boolean;
    }
  /** Timed and holding until both the deadline and actual intro completion. */
  | ({ readonly phase: 'counting' } & FightStartCountdownDescriptor)
  /** Past the deadline and the actual intro completion: the overlay finishes its exit. */
  | ({ readonly phase: 'live' } & FightStartCountdownDescriptor);

export interface FightStartCountdownParams {
  /** The countdown's length, or null when there is none; turning it null ends any countdown at once. */
  readonly countdownTicks: number | null;
  readonly speedMultiplier: number;
  /** A modal or focus suspension covers the fight. A countdown never runs behind one: it starts over. */
  readonly covered: boolean;
  /** The engine is still in its landing intro. */
  readonly introActive: boolean;
  /**
   * Start the numbered count only once the intro has finished, instead of ending it with the intro.
   * Countdown movement needs the whole count after the landing; off keeps the overlapping count.
   */
  readonly waitForIntro?: boolean;
  /**
   * Wall-clock ms left in the playing intro animation: a number once it plays, null while it has
   * not started or the renderer has not built at the requested speed yet, undefined when there is
   * no viewport able to tell (then the countdown is plain). The estimate is already speed-adjusted.
   */
  readonly getIntroRemainingMs: (expectedSpeedMultiplier: number) => number | null | undefined;
}

export interface FightStartCountdown {
  /** Timed countdown data, or null while pending or inactive; see active for its full lifecycle. */
  readonly descriptor: FightStartCountdownDescriptor | null;
  /** The run's presentation is active through pending, counting and GO, until finish or cancel. */
  readonly active: boolean;
  /** Whether the fight is held: from {@link start} until the deadline and actual intro completion. */
  readonly holding: boolean;
  /** Count down for a fight run that is starting. A no-op while there is no countdown to run. */
  readonly start: () => void;
  readonly cancel: () => void;
  /** The overlay's exit for `key` has finished. */
  readonly finish: (key: number) => void;
}

/**
 * Plan the numbered window to align with the estimated intro end. Actual release still waits for
 * intro completion. An intro shorter than the countdown cannot be stretched, so the countdown
 * starts now and the fight waits for it after the intro.
 */
export function fightStartCountdownWindow(
  nowMs: number,
  countdownMs: number,
  introRemainingMs?: number,
): Pick<FightStartCountdownDescriptor, 'startsAtMs' | 'endsAtMs'> {
  const endsAtMs = nowMs + Math.max(countdownMs, introRemainingMs ?? 0);
  return { startsAtMs: endsAtMs - countdownMs, endsAtMs };
}

/**
 * The "3, 2, 1, GO" before a live fight run, and the hold it puts on the fight until GO. Owns only
 * its own timing; whoever holds the fight reads {@link FightStartCountdown.holding}.
 */
export function useFightStartCountdown({
  countdownTicks,
  speedMultiplier,
  covered,
  introActive,
  waitForIntro = false,
  getIntroRemainingMs,
}: FightStartCountdownParams): FightStartCountdown {
  const [state, setState] = useState<CountdownState | null>(null);
  const keyRef = useRef(0);
  const tickMs = OSRS_TICK_MS / speedMultiplier;
  const configRef = useRef({ tickCount: countdownTicks, tickMs, covered });
  configRef.current = { tickCount: countdownTicks, tickMs, covered };
  const getIntroRemainingMsRef = useRef(getIntroRemainingMs);
  getIntroRemainingMsRef.current = getIntroRemainingMs;

  const arm = useCallback(() => {
    const config = configRef.current;
    if (config.tickCount === null) return;
    keyRef.current += 1;
    setState({
      phase: 'pending',
      key: keyRef.current,
      tickCount: config.tickCount,
      tickMs: config.tickMs,
      covered: config.covered,
    });
  }, []);
  const start = useCallback(() => arm(), [arm]);
  const cancel = useCallback(() => setState(null), []);
  const finish = useCallback((key: number) => {
    setState((current) => (current?.key === key && current.phase === 'live' ? null : current));
  }, []);

  useEffect(() => {
    if (countdownTicks === null) {
      setState(null);
      return;
    }
    if (!state || state.phase === 'live') return;
    const tempoChanged = state.tickMs !== tickMs;
    const coverChanged = covered
      ? state.phase !== 'pending' || !state.covered
      : state.phase === 'pending' && state.covered;
    if (tempoChanged || coverChanged) {
      arm();
    }
  }, [countdownTicks, tickMs, covered, state, arm]);

  useEffect(() => {
    if (state?.phase !== 'pending' || covered || state.covered || countdownTicks === null || state.tickMs !== tickMs)
      return;
    if (waitForIntro && introActive) return;
    const { key } = state;
    let frameId: number | null = null;
    const schedule = () => {
      frameId = null;
      const introRemainingMs = introActive ? getIntroRemainingMsRef.current(speedMultiplier) : undefined;
      if (introRemainingMs === null) {
        frameId = animationFrames.request(schedule);
        return;
      }
      setState({
        phase: 'counting',
        key,
        releasedAtMs: null,
        tickCount: state.tickCount,
        tickMs: state.tickMs,
        ...fightStartCountdownWindow(performance.now(), state.tickCount * state.tickMs, introRemainingMs),
      });
    };
    // Null is the renderer's explicit acknowledgement barrier, regardless of how many RAFs it skips.
    schedule();
    return () => {
      if (frameId !== null) animationFrames.cancel(frameId);
    };
  }, [state, covered, countdownTicks, tickMs, introActive, waitForIntro, speedMultiplier]);

  useEffect(() => {
    if (state?.phase !== 'counting' || covered || countdownTicks === null || state.tickMs !== tickMs) return;
    let frameId: number | null = null;
    // Stop requesting frames after the deadline while waiting for the authoritative intro signal.
    const release = () => {
      const nowMs = performance.now();
      if (nowMs < state.endsAtMs) {
        frameId = animationFrames.request(release);
        return;
      }
      frameId = null;
      if (!introActive) setState({ ...state, phase: 'live', releasedAtMs: nowMs });
    };
    release();
    return () => {
      if (frameId !== null) animationFrames.cancel(frameId);
    };
  }, [state, introActive, covered, countdownTicks, tickMs]);

  return {
    active: state !== null,
    descriptor:
      state === null || state.phase === 'pending'
        ? null
        : {
            key: state.key,
            startsAtMs: state.startsAtMs,
            endsAtMs: state.endsAtMs,
            releasedAtMs: state.releasedAtMs,
            tickCount: state.tickCount,
            tickMs: state.tickMs,
          },
    holding: state !== null && state.phase !== 'live',
    start,
    cancel,
    finish,
  };
}
