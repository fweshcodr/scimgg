import { describe, expect, it } from 'vitest';
import { InputLagBuffer, inputLagWallClockDelay } from '../inputLagBuffer';

describe('InputLagBuffer', () => {
  it('applies inputs whose arrival time has passed and keeps in-flight ones', () => {
    const buffer = new InputLagBuffer();
    const applied: string[] = [];

    buffer.push(700, () => applied.push('a'));
    buffer.push(1300, () => applied.push('b'));

    // Tick boundary at 600ms: nothing has arrived yet.
    buffer.flush(600);
    expect(applied).toEqual([]);
    expect(buffer.pending).toBe(2);

    // Boundary at 1200ms: the 700ms input has arrived, the 1300ms one has not.
    buffer.flush(1200);
    expect(applied).toEqual(['a']);
    expect(buffer.pending).toBe(1);

    // Boundary at 1800ms: the last input arrives.
    buffer.flush(1800);
    expect(applied).toEqual(['a', 'b']);
    expect(buffer.pending).toBe(0);
  });

  it('models the tick-slip example: a click 400ms into a tick with 300ms lag registers next tick', () => {
    const buffer = new InputLagBuffer();
    const applied: string[] = [];

    // Tick 1 spans [0,600). Click 400ms in, 300ms lag -> arrives at 700ms.
    const sendTime = 400;
    const lag = 300;
    buffer.push(sendTime + lag, () => applied.push('click'));

    // Tick 1 boundary (600ms): action has NOT arrived, so it does not register.
    buffer.flush(600);
    expect(applied).toEqual([]);

    // Tick 2 boundary (1200ms): action arrived at 700ms, so it registers now.
    buffer.flush(1200);
    expect(applied).toEqual(['click']);
  });

  it('leaves an input arriving exactly on the boundary for the next tick', () => {
    const buffer = new InputLagBuffer();
    const applied: string[] = [];
    buffer.push(600, () => applied.push('edge'));

    buffer.flush(600);
    expect(applied).toEqual([]);

    buffer.flush(1200);
    expect(applied).toEqual(['edge']);
  });

  it('preserves the order inputs were scheduled in', () => {
    const buffer = new InputLagBuffer();
    const applied: number[] = [];
    for (let i = 0; i < 5; i++) {
      buffer.push(100 + i, () => applied.push(i));
    }
    buffer.flush(1000);
    expect(applied).toEqual([0, 1, 2, 3, 4]);
  });

  it('does not flush an input enqueued by another input in the same flush pass', () => {
    const buffer = new InputLagBuffer();
    const applied: string[] = [];

    buffer.push(100, () => {
      applied.push('first');
      // A handler that dispatches a follow-up input at the same instant.
      buffer.push(100, () => applied.push('second'));
    });

    buffer.flush(1000);
    // Only the originally-queued input runs this pass; the follow-up waits.
    expect(applied).toEqual(['first']);
    expect(buffer.pending).toBe(1);

    buffer.flush(1000);
    expect(applied).toEqual(['first', 'second']);
  });

  it('clear() drops all in-flight inputs', () => {
    const buffer = new InputLagBuffer();
    const applied: string[] = [];
    buffer.push(100, () => applied.push('x'));
    buffer.clear();
    buffer.flush(1000);
    expect(applied).toEqual([]);
    expect(buffer.pending).toBe(0);
  });

  it('flush is a no-op on an empty buffer', () => {
    const buffer = new InputLagBuffer();
    expect(() => buffer.flush(1000)).not.toThrow();
    expect(buffer.pending).toBe(0);
  });
});

describe('inputLagWallClockDelay', () => {
  it('returns the lag unchanged at 1x speed', () => {
    expect(inputLagWallClockDelay(300, 1)).toBe(300);
  });

  it('scales the delay so the tick-slip fraction is speed-invariant', () => {
    // A 600ms tick at 2x is 300ms wall-clock; 300ms of game-lag must map to
    // 150ms wall-clock so it is still half a tick. At 0.5x the tick is 1200ms
    // wall-clock, so 300ms of game-lag maps to 600ms — still half a tick.
    expect(inputLagWallClockDelay(300, 2)).toBe(150);
    expect(inputLagWallClockDelay(300, 0.5)).toBe(600);
  });

  it('treats zero / negative lag as instant (0 delay)', () => {
    expect(inputLagWallClockDelay(0, 1)).toBe(0);
    expect(inputLagWallClockDelay(-50, 1)).toBe(0);
  });

  it('treats a non-finite lag as instant, never producing NaN', () => {
    // A NaN or Infinity arrival time would never satisfy `arrivalTime <= now`,
    // so the input would be stranded in the buffer forever. Both map to 0.
    expect(inputLagWallClockDelay(Number.NaN, 1)).toBe(0);
    expect(inputLagWallClockDelay(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });

  it('falls back to the unscaled lag when speed is non-positive', () => {
    // speed is always 0.5/1/2 in practice, but a 0 would divide to Infinity and
    // strand the input — fall back to the raw lag instead.
    expect(inputLagWallClockDelay(300, 0)).toBe(300);
    expect(inputLagWallClockDelay(300, -1)).toBe(300);
  });
});
