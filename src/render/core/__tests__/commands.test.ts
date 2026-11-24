import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { skipWithoutSetup } from '../../../test/helpers/setupAssets';
import { chargeBarFillWidthPx, createQueue, healthBarFillWidthPx, resetQueue } from '../commands';

describe('healthBarFillWidthPx', () => {
  const barW = 40;

  it('returns full width at full HP', () => {
    expect(healthBarFillWidthPx(1, barW)).toBe(40);
  });

  it('scales linearly in the middle of the range', () => {
    expect(healthBarFillWidthPx(0.5, barW)).toBe(20);
  });

  it('keeps a 1px green sliver at 1/99 HP instead of rounding to invisible', () => {
    const ratio = 1 / 99;
    expect(ratio * barW).toBeLessThan(1);
    expect(healthBarFillWidthPx(ratio, barW)).toBe(2);
  });

  it('keeps a 1px green sliver at 2/99 HP', () => {
    expect(healthBarFillWidthPx(2 / 99, barW)).toBe(2);
  });

  it.skipIf(skipWithoutSetup('healthbars')).each([40, 60, 120])(
    'exposes bright green beyond the border at 1 HP in the %ipx sprite',
    async (width) => {
      const sprite = fileURLToPath(
        new URL(`../../../../public/assets/ui/healthbar/default_front_${width}px.png`, import.meta.url),
      );
      const clipWidth = healthBarFillWidthPx(1 / 1400, width);

      const { data, info } = await sharp(sprite)
        .extract({ left: 0, top: 3, width: clipWidth, height: 1 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const greenChannels = Array.from({ length: info.width }, (_, x) => data[x * info.channels + 1]);
      expect(Math.max(...greenChannels)).toBeGreaterThan(100);
    },
  );

  it('renders the bar fully red (0px green) only on death', () => {
    expect(healthBarFillWidthPx(0, barW)).toBe(0);
  });

  it('treats negative ratios as dead (0px)', () => {
    expect(healthBarFillWidthPx(-0.5, barW)).toBe(0);
  });
});

describe('chargeBarFillWidthPx', () => {
  const barW = 40;

  it('fill: empty at start, full at completion', () => {
    expect(chargeBarFillWidthPx(0, barW, 'fill')).toBe(0);
    expect(chargeBarFillWidthPx(1, barW, 'fill')).toBe(40);
  });

  it('fill: scales linearly with charge progress', () => {
    expect(chargeBarFillWidthPx(0.25, barW, 'fill')).toBe(10);
  });

  it('drain: full at start, empty at completion (mirror of fill)', () => {
    expect(chargeBarFillWidthPx(0, barW, 'drain')).toBe(40);
    expect(chargeBarFillWidthPx(0.25, barW, 'drain')).toBe(30);
    expect(chargeBarFillWidthPx(1, barW, 'drain')).toBe(0);
  });

  it('clamps out-of-range progress for both directions', () => {
    expect(chargeBarFillWidthPx(-0.5, barW, 'fill')).toBe(0);
    expect(chargeBarFillWidthPx(1.5, barW, 'fill')).toBe(40);
    expect(chargeBarFillWidthPx(1.5, barW, 'drain')).toBe(0);
  });
});

describe('resetQueue', () => {
  it('restores replay presentation readiness for every reused frame', () => {
    const queue = createQueue();
    queue.replayPresentationReady = false;

    resetQueue(queue);

    expect(queue.replayPresentationReady).toBe(true);
  });

  it('clears overhead text overlays between frames', () => {
    const queue = createQueue();
    queue.overheadTexts = [
      {
        screenX: 100,
        screenY: 80,
        text: 'Not bad.',
        textColor: '#ffff00',
        fontSize: 16,
        key: 'actor:yama',
      },
    ];

    resetQueue(queue);

    expect(queue.overheadTexts).toBeUndefined();
  });
});
