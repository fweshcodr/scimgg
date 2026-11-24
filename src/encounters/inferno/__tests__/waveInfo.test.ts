import { describe, expect, it } from 'vitest';
import { FIRST_INFERNO_WAVE, LAST_ORDINARY_WAVE, LAST_PILLAR_WAVE, ZUK_WAVE } from '../constants';
import { clampWave, WAVE_JUMPS, WAVE_MILESTONES, waveCompositionText, waveHasPillars, waveParts } from '../waveInfo';
import { WAVE_NPC_SPAWN_ORDER, waveComposition } from '../waves';

describe('inferno wave presentation facts', () => {
  it('derives the jumps the picker offers from the wave table', () => {
    // The numbers a player names a wave by. Pinned here so a table edit that moved them would
    // have to be acknowledged rather than silently relabeling every chip.
    expect(WAVE_MILESTONES.map((milestone) => [milestone.label, milestone.wave])).toEqual([
      ['Bat', 1],
      ['Blob', 4],
      ['Meleer', 9],
      ['Ranger', 18],
      ['Mager', 35],
      ['Jad', 67],
      ['3 Jads', 68],
    ]);
  });

  it('names the monster the jump introduces in its hint', () => {
    const mager = WAVE_MILESTONES.find((milestone) => milestone.label === 'Mager');
    expect(mager?.hint).toBe('Jal-Zek first appears on wave 35.');
    const triple = WAVE_MILESTONES.find((milestone) => milestone.label === '3 Jads');
    expect(triple?.hint).toBe('Wave 68 is the only wave with 3 Jads.');
  });

  it('adds practice checkpoints in wave order without changing replay milestones', () => {
    expect(WAVE_JUMPS.map((jump) => jump.wave)).toEqual([1, 4, 9, 18, 35, 50, 63, 67, 68, 69]);
    expect(new Set(WAVE_JUMPS.map((jump) => jump.id)).size).toBe(10);
    expect(WAVE_MILESTONES.some((milestone) => milestone.wave === 50 || milestone.wave === 63)).toBe(false);
    expect(WAVE_JUMPS.find((jump) => jump.wave === 50)).toMatchObject({
      label: 'Mager and ranger',
      face: 'M + R',
      hint: 'The first wave with a mager and a ranger together. A common practice start.',
    });
    expect(WAVE_JUMPS.find((jump) => jump.wave === 63)).toMatchObject({
      label: 'Hard wave',
      face: 'Hard',
      hint: 'A mager, ranger, meleer and two blobs. Often named one of the hardest waves to solve.',
    });
  });

  it('pins the checkpoint compositions and the first combined mager/ranger wave', () => {
    expect(waveCompositionText(50)).toBe('1 mager, 1 ranger, 3 nibblers');
    expect(waveCompositionText(63)).toBe('1 mager, 1 ranger, 1 meleer, 2 blobs, 3 nibblers');
    for (let wave = FIRST_INFERNO_WAVE; wave < 50; wave++) {
      const composition = waveComposition(wave);
      expect((composition.mager ?? 0) > 0 && (composition.ranger ?? 0) > 0).toBe(false);
    }
  });

  it('says what a wave spawns in the order it spawns it', () => {
    expect(waveCompositionText(1)).toBe('1 bat, 3 nibblers');
    expect(waveCompositionText(3)).toBe('6 nibblers');
    expect(waveCompositionText(47)).toBe('1 mager, 1 meleer, 1 blob, 2 bats, 3 nibblers');
    expect(waveCompositionText(62)).toBe('1 mager, 1 ranger, 1 meleer, 1 blob, 2 bats, 3 nibblers');
    expect(waveCompositionText(67)).toBe('1 Jad');
    expect(waveCompositionText(68)).toBe('3 Jads');
  });

  it('describes every wave completely, in the fight’s own spawn order', () => {
    for (let wave = FIRST_INFERNO_WAVE; wave <= LAST_ORDINARY_WAVE; wave += 1) {
      const parts = waveParts(wave);
      const composition = waveComposition(wave);
      expect(parts.map((part) => part.kind)).toEqual(
        WAVE_NPC_SPAWN_ORDER.filter((kind) => (composition[kind] ?? 0) > 0),
      );
      for (const { kind, count } of parts) expect(count).toBe(composition[kind]);
      expect(waveCompositionText(wave)).not.toBe('');
    }
  });

  it('keeps the start wave inside the range the encounter accepts', () => {
    expect(clampWave(0)).toBe(FIRST_INFERNO_WAVE);
    expect(clampWave(-5)).toBe(FIRST_INFERNO_WAVE);
    expect(clampWave(69)).toBe(ZUK_WAVE);
    expect(clampWave(70)).toBe(ZUK_WAVE);
    expect(clampWave(Number.NaN)).toBe(FIRST_INFERNO_WAVE);
    expect(clampWave(47)).toBe(47);
  });

  it('reports pillars as standing only through the last wave that has them', () => {
    expect(waveHasPillars(LAST_PILLAR_WAVE)).toBe(true);
    expect(waveHasPillars(LAST_PILLAR_WAVE + 1)).toBe(false);
    expect(waveHasPillars(LAST_ORDINARY_WAVE)).toBe(false);
  });
});
