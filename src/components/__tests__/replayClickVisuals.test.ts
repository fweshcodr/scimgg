import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CLICK_ANIM_DURATION_MS, CLICK_SPRITE_SIZE } from '../../hooks/useClickAnimation';
import { getReplayClickDurationMs, type WorldClickType } from '../../input/replayClickFeedback';
import { skipWithoutSetup } from '../../test/helpers/setupAssets';
import { getReplayClickVisualState, getReplayHoldVisualState, getReplayTapVisualState } from '../replayClickVisuals';
import { REPLAY_HOLD_MARK_DURATION_MS } from '../replayCursorProjection';

describe('getReplayClickVisualState', () => {
  // The click animations are `npm run setup` output, drawn from the cache.
  it.skipIf(skipWithoutSetup('sprites')).each<WorldClickType>(['yellow', 'red'])(
    'matches the live %s animation timing and sprite pixels',
    async (type) => {
      const source = `public/${type}_click.webp`;
      const metadata = await sharp(source, { animated: true }).metadata();
      const delays = metadata.delay;
      if (!delays) throw new TypeError('Expected animated click asset');
      const size = metadata.width;
      if (!size) throw new TypeError('Expected click sprite width');

      const frames = await Promise.all(
        delays.map(async (_, page) => {
          const [live, replay] = await Promise.all([
            sharp(source, { page, pages: 1 }).ensureAlpha().raw().toBuffer(),
            sharp(`public/${type}_click_sheet.webp`)
              .extract({ left: page * size, top: 0, width: size, height: size })
              .ensureAlpha()
              .raw()
              .toBuffer(),
          ]);
          return { live, replay };
        }),
      );

      expect(getReplayClickDurationMs(type)).toBe(CLICK_ANIM_DURATION_MS);
      let elapsed = 0;
      for (const [index, frame] of frames.entries()) {
        if (elapsed >= CLICK_ANIM_DURATION_MS) break;
        const visual = getReplayClickVisualState(type, elapsed, elapsed / CLICK_ANIM_DURATION_MS);
        expect(visual.kind).toBe('world');
        if (visual.kind !== 'world') throw new TypeError('Expected world click visual');
        expect(visual.spriteFrame).toBe(index);
        expect(visual.spriteScale * size).toBe(CLICK_SPRITE_SIZE);
        expect(frame.replay.equals(frame.live)).toBe(true);
        if (frame.live.some((value, offset) => offset % 4 === 3 && value > 0)) {
          expect(visual.spriteOpacity).toBe(1);
        }
        elapsed += delays[index];
      }
    },
  );

  it.each<WorldClickType>(['yellow', 'red'])('maps %s world feedback through all five OSRS frames', (type) => {
    const start = getReplayClickVisualState(type, 0, 0);
    const middle = getReplayClickVisualState(type, 300, 0.5);
    const end = getReplayClickVisualState(type, 599, 599 / 600);

    expect(start).toMatchObject({ kind: 'world', spriteFrame: 0, spriteOpacity: 1 });
    expect(middle).toMatchObject({ kind: 'world', spriteFrame: 3, spriteOpacity: 1 });
    expect(end).toMatchObject({ kind: 'world', spriteFrame: 4 });
    if (start.kind !== 'world' || middle.kind !== 'world' || end.kind !== 'world') {
      throw new TypeError('Expected world click visual states');
    }
    expect(start.spriteScale).toBe(22 / 16);
    expect(middle.spriteScale).toBe(start.spriteScale);
    expect(end.spriteOpacity).toBeLessThan(0.01);
  });

  it('uses a compact neutral ring and acknowledgment phase for UI feedback', () => {
    const start = getReplayClickVisualState('ui', 0, 0);
    const middle = getReplayClickVisualState('ui', 210, 0.5);
    const end = getReplayClickVisualState('ui', 419, 419 / 420);

    expect(start).toMatchObject({ kind: 'ui', coreOpacity: 1, ringScale: 0.72 });
    if (start.kind !== 'ui' || middle.kind !== 'ui' || end.kind !== 'ui') {
      throw new TypeError('Expected UI click visual states');
    }
    expect(middle.ringScale).toBeGreaterThan(start.ringScale);
    expect(end.coreOpacity).toBeLessThan(0.01);
    expect(end.ringOpacity).toBeLessThan(start.ringOpacity);
  });
});

describe('getReplayTapVisualState', () => {
  it('steps contact, spread and lift on the X sprite frame clock, then is gone', () => {
    expect(getReplayTapVisualState(0)).toEqual({ frame: 0, opacity: 1 });
    expect(getReplayTapVisualState(99)).toEqual({ frame: 0, opacity: 1 });
    expect(getReplayTapVisualState(100)).toEqual({ frame: 1, opacity: 1 });
    expect(getReplayTapVisualState(250)).toEqual({ frame: 2, opacity: 0.5 });
    expect(getReplayTapVisualState(300)).toBeNull();
    // Its frames are the X's: contact under the small X, spread under the full one.
    for (const elapsedMs of [0, 150]) {
      const world = getReplayClickVisualState('yellow', elapsedMs, elapsedMs / 600);
      if (world.kind !== 'world') throw new TypeError('Expected world click visual');
      expect(getReplayTapVisualState(elapsedMs)?.frame).toBe(world.spriteFrame);
    }
  });

  it.each(['yellow', 'red', 'ui'] as const)('lifts well inside the %s click duration', (type) => {
    expect(getReplayTapVisualState(getReplayClickDurationMs(type) - 1)).toBeNull();
  });
});

describe('getReplayHoldVisualState', () => {
  it('holds steady for three of the X frames, lifts over two, and is gone with its window', () => {
    for (const elapsedMs of [0, 150, 299]) expect(getReplayHoldVisualState(elapsedMs)).toEqual({ opacity: 1 });
    expect(getReplayHoldVisualState(300)).toEqual({ opacity: 0.6 });
    expect(getReplayHoldVisualState(450)).toEqual({ opacity: 0.3 });
    expect(getReplayHoldVisualState(REPLAY_HOLD_MARK_DURATION_MS - 1)).not.toBeNull();
    expect(getReplayHoldVisualState(REPLAY_HOLD_MARK_DURATION_MS)).toBeNull();
  });
});
