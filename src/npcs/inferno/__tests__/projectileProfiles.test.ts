import { describe, expect, it } from 'vitest';
import { calculateProjectileEndTime, PROJ_ANIM_TIMINGS } from '../../../core/combat/hitDelay';
import { INFERNO_CAPTURE_FIXTURES } from '../../../encounters/inferno/__tests__/captureFixtures';
import {
  JAL_AK_MAGIC_PROJECTILE,
  JAL_AK_RANGED_PROJECTILE,
  JAL_AKREK_MEJ_PROJECTILE,
  JAL_AKREK_XIL_PROJECTILE,
  JAL_MEJRAH_PROJECTILE,
  JAL_XIL_PROJECTILE_TIMING,
  JAL_ZEK_PROJECTILE_TIMING,
  JALTOK_JAD_PROJECTILE_TIMING,
} from '../projectileProfiles';
import {
  type CapturedSpeciesProjectiles,
  INFERNO_SPECIES_PROJECTILES,
} from './fixtures/infernoSpeciesProjectilesCapture';
import { INFERNO_WAVE_PROJECTILES } from './fixtures/infernoWaveProjectilesCapture';

const wave69 = INFERNO_SPECIES_PROJECTILES['inferno-waves-69-zuk-packet-data.txt']!;
const challenge = INFERNO_SPECIES_PROJECTILES['zuk-atlatl-dragon-hunter-wand-packet-data.txt']!;

function timingResiduals(capture: CapturedSpeciesProjectiles, id: number) {
  const species =
    id === 1376
      ? { npcId: 7703, size: 4, timing: JAL_ZEK_PROJECTILE_TIMING }
      : id === 1377
        ? { npcId: 7702, size: 3, timing: JAL_XIL_PROJECTILE_TIMING }
        : { npcId: capture === wave69 ? 7704 : 10623, size: 5, timing: JALTOK_JAD_PROJECTILE_TIMING };
  const { adds: spawns, moves } = capture.species[species.npcId]!;
  expect(spawns.length).toBeGreaterThan(0);
  expect(new Set(spawns.map((tile) => `${tile[0]},${tile[1]}`)).size).toBe(1);
  expect(moves).toBe(0);
  const source = spawns[0]!;
  const offset = Math.floor(species.size / 2);
  return capture.projectiles
    .filter((packet) => packet.id === id)
    .map((packet) => {
      if (!packet.targetTile) throw new TypeError('Missing target actor coordinate');
      // The player's tile before this tick's movement (the movement line's own `coord`).
      const target =
        packet.targetKind === 'player' && packet.playerStartTile ? packet.playerStartTile : packet.targetTile;
      const distance = Math.max(Math.abs(source[0] + offset - target[0]), Math.abs(source[1] + offset - target[1]));
      return {
        tick: packet.tick,
        residual: packet.endtime - calculateProjectileEndTime(species.timing, distance),
      };
    });
}

describe('Inferno species projectile timing ownership', () => {
  it.each([
    { timing: JAL_ZEK_PROJECTILE_TIMING, distance: 9, endCycles: 100 },
    { timing: JAL_XIL_PROJECTILE_TIMING, distance: 9, endCycles: 118 },
    { timing: JALTOK_JAD_PROJECTILE_TIMING, distance: 9, endCycles: 74 },
  ])('returns $endCycles cycles when distance is $distance', ({ timing, distance, endCycles }) => {
    const actual = calculateProjectileEndTime(timing, distance);
    expect(actual).toBe(endCycles);
  });

  it('keeps only player profiles when reading the shared timing table', () => {
    expect(PROJ_ANIM_TIMINGS).toEqual({
      magic_spell: { delay: 51, lengthAdjustment: -5, stepMultiplier: 10, progress: 64 },
      tumekens_shadow: { delay: 56, lengthAdjustment: 16, stepMultiplier: 10, progress: 40 },
      eye_of_ayak: { delay: 51, lengthAdjustment: -5, stepMultiplier: 5, progress: 64 },
      arrow: { delay: 41, lengthAdjustment: 5, stepMultiplier: 5, progress: 11 },
      thrown: { delay: 32, lengthAdjustment: 0, stepMultiplier: 5, progress: 11 },
    });
  });
});

describe('raw Inferno endtime conformance', () => {
  it.each([
    { capture: wave69, id: 1376, count: 105 },
    { capture: wave69, id: 1377, count: 120 },
    { capture: wave69, id: 448, count: 7 },
    { capture: challenge, id: 448, count: 3 },
  ])('has zero residual for all $count packets of $id', ({ capture, id, count }) => {
    const samples = timingResiduals(capture, id);
    expect(samples).toHaveLength(count);
    expect(samples.filter((sample) => sample.residual !== 0)).toEqual([]);
  });

  it('retains 120 ranger packets separately from the 60 four-tick actions', () => {
    const actions = wave69.rangerAttackTicks!;
    expect(actions).toHaveLength(60);
    const packets = wave69.projectiles.filter((packet) => packet.id === 1377);
    expect(packets).toHaveLength(120);
    expect(actions.map((tick) => packets.filter((packet) => packet.tick === tick).length)).toEqual(Array(60).fill(2));
    for (const [spawn, end, first] of [
      [98, 448, 106],
      [448, 1229, 456],
      [1229, 1323, 1237],
    ]) {
      const ticks = actions.filter((tick) => tick >= spawn && tick < end);
      expect(ticks).toEqual(Array.from({ length: ticks.length }, (_, index) => first + 4 * index));
    }
  });

  it('records mager glyph-to-player retargeting on its existing four-tick grid', () => {
    const packets = wave69.projectiles.filter((packet) => packet.id === 1376);
    for (const [spawn, end, first] of [
      [98, 448, 104],
      [448, 1229, 454],
      [1229, 1323, 1235],
    ]) {
      const ticks = packets.filter((packet) => packet.tick >= spawn && packet.tick < end).map((packet) => packet.tick);
      expect(ticks).toEqual(Array.from({ length: ticks.length }, (_, index) => first + 4 * index));
    }
    expect(packets.find((packet) => packet.tick === 120)?.targetKind).toBe('npc');
    // A Jal-Zek took a hit on tick 122, between its glyph-targeted and player-targeted casts.
    expect(wave69.magerHitTicks).toContain(122);
    expect(packets.find((packet) => packet.tick === 124)?.targetKind).toBe('player');
  });
});

describe('ordinary-wave projectile profiles', () => {
  const waveProfiles = [
    JAL_MEJRAH_PROJECTILE,
    JAL_AK_RANGED_PROJECTILE,
    JAL_AK_MAGIC_PROJECTILE,
    JAL_AKREK_XIL_PROJECTILE,
    JAL_AKREK_MEJ_PROJECTILE,
  ] as const;

  it.each([
    { profile: JAL_MEJRAH_PROJECTILE, distance: 4, endCycles: 64 },
    { profile: JAL_AK_RANGED_PROJECTILE, distance: 9, endCycles: 104 },
    { profile: JAL_AK_MAGIC_PROJECTILE, distance: 9, endCycles: 100 },
    { profile: JAL_AKREK_XIL_PROJECTILE, distance: 5, endCycles: 72 },
    { profile: JAL_AKREK_MEJ_PROJECTILE, distance: 5, endCycles: 68 },
  ])('$profile.spotAnimId ends at $endCycles cycles from distance $distance', ({ profile, distance, endCycles }) => {
    expect(calculateProjectileEndTime(profile.timing, distance)).toBe(endCycles);
  });

  // Every packet of each id in both ordinary-wave captures, grouped by identical values, with the
  // distance from the packet's own source tile to its target tile
  // (docs/encounters/inferno-facts-spec.md, Projectiles).
  it.each(
    [INFERNO_CAPTURE_FIXTURES.infernoWaves1To68, INFERNO_CAPTURE_FIXTURES.infernoWaves35To68].map(({ capture }) => ({
      capture,
      rows: INFERNO_WAVE_PROJECTILES[capture] ?? [],
    })),
  )('fits every endtime, start, slope, progress and height in $capture', ({ rows }) => {
    const byId = new Map<number, (typeof waveProfiles)[number]>(
      waveProfiles.map((profile) => [profile.spotAnimId, profile]),
    );
    const counts = new Map<number, number>();
    const mismatches: string[] = [];
    for (const [id, distance, ...rest] of rows) {
      const [starttime, endtime, angle, progress, startheight, endheight, count, stream, tick, line] = rest;
      const profile = byId.get(id);
      if (!profile) {
        mismatches.push(`s${stream} t${tick} @${line}: projectile ${id} has no ordinary-wave profile`);
        continue;
      }
      const fields = [starttime, endtime, angle, progress, startheight, endheight];
      const expected = [
        profile.timing.delay,
        calculateProjectileEndTime(profile.timing, distance),
        profile.slope,
        profile.timing.progress,
        profile.startHeight,
        profile.endHeight,
      ];
      counts.set(profile.spotAnimId, (counts.get(profile.spotAnimId) ?? 0) + count);
      if (fields.join() !== expected.join())
        mismatches.push(`s${stream} t${tick} @${line} (${count}): ${fields.join()} vs ${expected.join()}`);
    }
    expect(mismatches).toEqual([]);
    for (const profile of waveProfiles) expect(counts.get(profile.spotAnimId)).toBeGreaterThan(50);
  });
});
