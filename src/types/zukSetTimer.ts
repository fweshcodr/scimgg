import { type EncounterSnapshot, zukWaveState } from '../core/encounters/snapshot';
import { ZUK_SET_TIMER_INTERVAL, ZUK_SET_TIMER_JAD_BONUS } from '../encounters/zuk/constants';

/**
 * This is deliberately manual. The encounter runs a set clock of its own and
 * publishes a countdown, so the tempting edit is to derive this state from that
 * snapshot; that would hand the player the number the real game never gives
 * them. You start a clock on the first set and drive it through the fight
 * yourself, and practicing that is the point. The reveal key reads the
 * authoritative countdown separately (`readActualZukSetCountdown`), so it can be
 * checked against without ever feeding this state.
 *
 * Counting in simulation ticks rather than wall-clock means the countdown
 * freezes with the sim when it is paused or stepped.
 */
export type ZukSetTimerState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running';
      readonly expiresAtTick: number;
      /**
       * `set` while the routine still has the 600 HP freeze ahead of it; `jad`
       * once the freeze has been released and the +1:45 is on the clock. Only
       * the phase distinguishes the two running steps — the countdown itself
       * behaves identically.
       */
      readonly phase: 'set' | 'jad';
    }
  | { readonly status: 'paused'; readonly remainingTicks: number };

export const ZUK_SET_TIMER_IDLE: ZukSetTimerState = { status: 'idle' };

/** 350 ticks = 3:30, the interval between consecutive sets. */
export const ZUK_SET_PERIOD_TICKS = ZUK_SET_TIMER_INTERVAL;

/** 175 ticks = 1:45, added to the clock when Jad releases the freeze. */
export const ZUK_SET_TIMER_JAD_BONUS_TICKS = ZUK_SET_TIMER_JAD_BONUS;

/**
 * An idle timer reads a full period (3:30) so the
 * overlay shows what the key is about to start rather than a blank clock.
 *
 * A running timer that has passed its deadline rolls straight over into the
 * following set instead of parking on 0:00 — sets keep coming every 350 ticks,
 * so the readout stays useful for the whole fight without re-arming it.
 */
export function zukSetTimerRemainingTicks(timer: ZukSetTimerState, currentTick: number): number {
  if (timer.status === 'idle') return ZUK_SET_PERIOD_TICKS;
  if (timer.status === 'paused') return timer.remainingTicks;

  const overshoot = currentTick - timer.expiresAtTick;
  if (overshoot < 0) {
    // Guard against an anchor from an older timeline (encounter reset rewinds
    // the tick counter): never report more than the longest legitimate wait.
    // That is one period normally, but a whole period PLUS the 1:45 interlude
    // in the ticks right after Jad releases the freeze -- clamping to 350 there
    // would swallow the very interlude this routine exists to account for.
    const longestWait = ZUK_SET_PERIOD_TICKS + (timer.phase === 'jad' ? ZUK_SET_TIMER_JAD_BONUS_TICKS : 0);
    return Math.min(longestWait, -overshoot);
  }
  return ZUK_SET_PERIOD_TICKS - (overshoot % ZUK_SET_PERIOD_TICKS);
}

/**
 * The final step is terminal: once the Jad interlude is behind you the clock
 * simply rolls, and there is nothing left for the key to announce. Reset starts
 * the routine over.
 */
export function advanceZukSetTimer(timer: ZukSetTimerState, currentTick: number): ZukSetTimerState {
  switch (timer.status) {
    case 'running':
      if (timer.phase === 'jad') return timer;
      return { status: 'paused', remainingTicks: zukSetTimerRemainingTicks(timer, currentTick) };
    case 'paused':
      return {
        status: 'running',
        expiresAtTick: currentTick + timer.remainingTicks + ZUK_SET_TIMER_JAD_BONUS_TICKS,
        phase: 'jad',
      };
    default:
      return { status: 'running', expiresAtTick: currentTick + ZUK_SET_PERIOD_TICKS, phase: 'set' };
  }
}

export function zukSetTimerNextStep(timer: ZukSetTimerState): { action: string; cue: string } | undefined {
  switch (timer.status) {
    case 'running':
      return timer.phase === 'jad' ? undefined : { action: 'Freeze', cue: 'at 600 HP' };
    case 'paused':
      return { action: 'Jad', cue: 'at 480 HP' };
    default:
      return { action: 'Start', cue: 'on the first set' };
  }
}

/**
 * The encounter's own countdown, which lets the player check their manual clock.
 * Published by the Inferno's wave 69 every tick (`getSnapshot`), so this is the
 * authoritative value, freeze included.
 *
 * `undefined` when sets are disabled, for any other encounter, or when the
 * scheduler has stopped admitting sets and publishes no countdown at all — a
 * null there is an absent set, not a set landing this tick, so it must never be
 * rendered as 0:00. An actual zero IS a real countdown and reads as one.
 */
export function readActualZukSetCountdown(
  encounter: EncounterSnapshot | undefined,
  setsEnabled: boolean | undefined,
): { ticksRemaining: number; frozen: boolean } | undefined {
  const zuk = encounter ? zukWaveState(encounter) : null;
  if (setsEnabled === false || zuk === null) return undefined;
  const { setTimer, timerPaused } = zuk;
  if (setTimer === null) return undefined;
  return { ticksRemaining: Math.max(0, setTimer), frozen: timerPaused };
}
