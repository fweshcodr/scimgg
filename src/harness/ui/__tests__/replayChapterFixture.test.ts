import { describe, expect, it } from 'vitest';
import { replayChapterFixture } from '../replayChapterFixture';

describe('replayChapterFixture', () => {
  it('covers the full Inferno through a cleared Zuk chapter', () => {
    const fixture = replayChapterFixture('full');
    expect(fixture).not.toBeNull();
    const chapters = fixture!.chapters.chapters;
    expect(chapters.map((chapter) => chapter.label)).toEqual(
      Array.from({ length: 69 }, (_, index) => `Wave ${index + 1}`),
    );
    expect(chapters.at(-1)).toMatchObject({
      label: 'Wave 69',
      detail: expect.stringContaining('Zuk'),
      cleared: true,
      endFrame: fixture!.totalFrames,
    });
    expect(chapters.every((chapter) => chapter.cleared)).toBe(true);
  });

  it('keeps practice on waves 35–37 with the last chapter unfinished', () => {
    const fixture = replayChapterFixture('practice');
    expect(fixture).not.toBeNull();
    const chapters = fixture!.chapters.chapters;
    expect(chapters.map((chapter) => chapter.label)).toEqual(['Wave 35', 'Wave 36', 'Wave 37']);
    expect(chapters.map((chapter) => chapter.cleared)).toEqual([true, true, false]);
    expect(chapters.at(-1)).toMatchObject({ label: 'Wave 37', cleared: false, endFrame: fixture!.totalFrames });
  });
});
