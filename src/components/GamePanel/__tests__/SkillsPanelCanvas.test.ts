import { describe, expect, it } from 'vitest';
import { getBackingSize } from '../SkillsPanelCanvas';

describe('SkillsPanelCanvas geometry', () => {
  it('matches the panel backing buffer to fractional UI scale', () => {
    const deviceScale = 1.4;

    const size = getBackingSize(deviceScale);

    // Then: each dimension is rounded once to the nearest device pixel.
    expect(size).toEqual({ width: 286, height: 385 });
  });
});
