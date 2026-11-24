import { describe, expect, it } from 'vitest';
import { ZUK_EXCLUDED_STATIC_LOC_IDS } from '../constants';
import { zukTargetsPlayer } from '../targeting';
import { ZUK_CAPTURE_BLASTS, ZUK_CAPTURE_GLYPH_X } from './zukCaptureFixtures';

describe('Zuk shadow targeting evidence', () => {
  it('matches every recorded target when given the captured glyph and player positions', () => {
    const targets = ZUK_CAPTURE_BLASTS.map((blast) => zukTargetsPlayer(blast.glyphX, blast.player));

    expect(targets).toEqual(ZUK_CAPTURE_BLASTS.map((blast) => blast.targetsPlayer));
    expect(targets).toHaveLength(135);
  });

  it('aligns the independent glyph track with every captured blast row', () => {
    const columns = ZUK_CAPTURE_BLASTS.map((blast) => ZUK_CAPTURE_GLYPH_X[blast.encounterTick]);

    expect(columns).toEqual(ZUK_CAPTURE_BLASTS.map((blast) => blast.glyphX));
    expect(ZUK_CAPTURE_BLASTS.map((blast) => blast.captureTick - blast.encounterTick)).toEqual(
      Array.from({ length: 135 }, () => 26),
    );
  });

  it.each([
    { position: [28, 44], exposed: true },
    { position: [29, 44], exposed: false },
    { position: [33, 44], exposed: false },
    { position: [34, 44], exposed: true },
    { position: [30, 43], exposed: true },
    { position: [30, 46], exposed: false },
  ] as const)('classifies the shadow boundary at $position', ({ position, exposed }) => {
    const targetsPlayer = zukTargetsPlayer(30, position);

    expect(targetsPlayer).toBe(exposed);
  });

  it('excludes only the static glyph from the captured arena geometry', () => {
    const excluded = [...ZUK_EXCLUDED_STATIC_LOC_IDS];

    expect(excluded).toEqual([30338]);
  });
});
