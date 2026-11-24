import { describe, expect, it } from 'vitest';
import type { EncounterSnapshot } from '../../core/encounters/snapshot';
import { lobbySnapshot, yamaSnapshot, zukSnapshot } from '../../test/helpers/encounterSnapshot';
import {
  advanceZukSetTimer,
  readActualZukSetCountdown,
  ZUK_SET_PERIOD_TICKS,
  ZUK_SET_TIMER_IDLE,
  ZUK_SET_TIMER_JAD_BONUS_TICKS,
  type ZukSetTimerState,
  zukSetTimerNextStep,
  zukSetTimerRemainingTicks,
} from '../zukSetTimer';

describe('zukSetTimerRemainingTicks', () => {
  it('reads a full 3:30 period while idle', () => {
    expect(ZUK_SET_PERIOD_TICKS).toBe(350);
    expect(zukSetTimerRemainingTicks(ZUK_SET_TIMER_IDLE, 500)).toBe(350);
  });

  it('counts down against the simulation tick while running', () => {
    const timer = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 100);
    expect(zukSetTimerRemainingTicks(timer, 100)).toBe(350);
    expect(zukSetTimerRemainingTicks(timer, 200)).toBe(250);
    expect(zukSetTimerRemainingTicks(timer, 449)).toBe(1);
  });

  it('rolls straight over into the next set instead of parking on zero', () => {
    const timer = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 100);
    expect(zukSetTimerRemainingTicks(timer, 450)).toBe(350);
    expect(zukSetTimerRemainingTicks(timer, 451)).toBe(349);
    expect(zukSetTimerRemainingTicks(timer, 1150)).toBe(350);
  });

  it('holds its remaining ticks while paused, regardless of tick drift', () => {
    const paused: ZukSetTimerState = { status: 'paused', remainingTicks: 120 };
    expect(zukSetTimerRemainingTicks(paused, 10)).toBe(120);
    expect(zukSetTimerRemainingTicks(paused, 9999)).toBe(120);
  });

  it('never reports more than one period when the tick counter rewinds', () => {
    const stale: ZukSetTimerState = { status: 'running', expiresAtTick: 5000, phase: 'set' };
    expect(zukSetTimerRemainingTicks(stale, 1)).toBe(350);
  });

  it('keeps the Jad interlude in the clamp for a rewound post-Jad clock', () => {
    const stale: ZukSetTimerState = { status: 'running', expiresAtTick: 5000, phase: 'jad' };
    expect(zukSetTimerRemainingTicks(stale, 1)).toBe(350 + 175);
  });
});

describe('advanceZukSetTimer', () => {
  it('starts a fresh period from idle', () => {
    expect(advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 42)).toEqual({
      status: 'running',
      expiresAtTick: 392,
      phase: 'set',
    });
  });

  it('freezes at the ticks left on the clock when Zuk passes 600', () => {
    const running = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 0);
    expect(advanceZukSetTimer(running, 90)).toEqual({ status: 'paused', remainingTicks: 260 });
  });

  it('resumes at Jad with the 1:45 interlude added on', () => {
    // The fight's own model: the set clock stops at 600 HP and restarts at 480
    // with 175 ticks added, which is what pushes the next set past the Jad.
    const running = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 0);
    const frozen = advanceZukSetTimer(running, 90);
    const resumed = advanceZukSetTimer(frozen, 1000);

    expect(ZUK_SET_TIMER_JAD_BONUS_TICKS).toBe(175);
    expect(resumed).toEqual({ status: 'running', expiresAtTick: 1435, phase: 'jad' });
    expect(zukSetTimerRemainingTicks(resumed, 1000)).toBe(260 + 175);
  });

  it('reproduces the captured fight timeline end to end', () => {
    // From the capture: first set t98, second t448, Zuk below 600 at t539 (clock
    // freezes), Jad at t795 resumes it +175, third set lands t1229.
    const armed = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 98);
    expect(98 + zukSetTimerRemainingTicks(armed, 98)).toBe(448);

    const frozen = advanceZukSetTimer(armed, 539);
    const resumed = advanceZukSetTimer(frozen, 795);
    expect(795 + zukSetTimerRemainingTicks(resumed, 795)).toBe(1229);

    expect(1229 + zukSetTimerRemainingTicks(resumed, 1229)).toBe(1579);
  });

  it('is terminal once the Jad interlude is behind it', () => {
    const resumed = advanceZukSetTimer(advanceZukSetTimer(advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 0), 90), 1000);
    expect(advanceZukSetTimer(resumed, 1200)).toBe(resumed);
  });

  it('freezes on the rolled-over period after the deadline passes', () => {
    const running = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 0);
    expect(advanceZukSetTimer(running, 400)).toEqual({ status: 'paused', remainingTicks: 300 });
  });
});

describe('zukSetTimerNextStep', () => {
  it('names the fight event that should trigger each press', () => {
    const running = advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 0);
    const frozen = advanceZukSetTimer(running, 90);

    expect(zukSetTimerNextStep(ZUK_SET_TIMER_IDLE)).toEqual({
      action: 'Start',
      cue: 'on the first set',
    });
    expect(zukSetTimerNextStep(running)).toEqual({ action: 'Freeze', cue: 'at 600 HP' });
    expect(zukSetTimerNextStep(frozen)).toEqual({ action: 'Jad', cue: 'at 480 HP' });
  });

  it('has nothing left to announce after Jad', () => {
    const resumed = advanceZukSetTimer(advanceZukSetTimer(advanceZukSetTimer(ZUK_SET_TIMER_IDLE, 0), 90), 1000);
    expect(zukSetTimerNextStep(resumed)).toBeUndefined();
  });
});

describe('readActualZukSetCountdown', () => {
  const zukState = (fields: Parameters<typeof zukSnapshot>[0]): EncounterSnapshot => zukSnapshot(fields);

  it('is undefined when Zuk sets are disabled', () => {
    expect(readActualZukSetCountdown(zukState({ setTimer: 214, timerPaused: false }), false)).toBeUndefined();
  });

  it('reads the encounter countdown and its freeze flag', () => {
    expect(readActualZukSetCountdown(zukState({ setTimer: 214, timerPaused: false }), true)).toEqual({
      ticksRemaining: 214,
      frozen: false,
    });
    expect(readActualZukSetCountdown(zukState({ setTimer: 259, timerPaused: true }), true)).toEqual({
      ticksRemaining: 259,
      frozen: true,
    });
  });

  it('is undefined outside a Zuk fight, or before the fight publishes one', () => {
    expect(readActualZukSetCountdown(undefined, true)).toBeUndefined();
    expect(readActualZukSetCountdown(yamaSnapshot(), true)).toBeUndefined();
    expect(readActualZukSetCountdown(lobbySnapshot(), true)).toBeUndefined();
  });

  it('reports nothing at all for a null countdown, rather than a zero the scheduler never published', () => {
    // The scheduler publishes null on unsupported paths, where
    // it has stopped admitting sets. Rendering that as 0:00 would announce a set
    // that is never coming.
    expect(readActualZukSetCountdown(zukState({ setTimer: null }), true)).toBeUndefined();
  });

  it('reads a zero countdown as the real value it is', () => {
    expect(readActualZukSetCountdown(zukState({ setTimer: 0 }), true)).toEqual({ ticksRemaining: 0, frozen: false });
  });

  it('never reports a negative countdown', () => {
    expect(readActualZukSetCountdown(zukState({ setTimer: -3 }), true)?.ticksRemaining).toBe(0);
  });
});
