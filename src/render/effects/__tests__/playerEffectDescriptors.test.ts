import { describe, expect, it } from 'vitest';
import { getProjectileTiming } from '../../../core/combat/weaponCombatData';
import type { ReplayEffectSourceFrame } from '../../core/replayEffectContext';
import { describePlayerEffects, projectileEndCycle } from '../playerEffectDescriptors';

function shot(weaponId: number, usingSpecialAttack: boolean): ReplayEffectSourceFrame {
  return {
    state: {
      currentTick: 10,
      playerPosition: [0, 0],
      playerPreviousPosition: [0, 0],
      playerMovementPath: [],
      primaryNpcPosition: [3, 0],
      primaryNpcSize: 1,
      playerEquipment: { weapon: weaponId },
      npcs: [],
    },
    events: [
      {
        type: 'attack_started',
        eventId: 1,
        tick: 10,
        sourceId: 'player',
        targetId: 'boss',
        style: 'range',
        attackKind: 'range_arrow',
        weaponId,
        ammoId: 11230,
        usingSpecialAttack,
      },
    ],
  };
}

describe('weapon effect timing', () => {
  it.each([12926, 28688])('carries special timing through the descriptor for blowpipe %i', (weaponId) => {
    const effects = describePlayerEffects(shot(weaponId, true));
    const projectile = effects.find((effect) => effect.kind === 'projectile');
    expect(projectile).toBeDefined();
    if (!projectile) return;
    expect(projectile.timing).toEqual(getProjectileTiming(weaponId, true));
    expect(projectileEndCycle(projectile)).toBe(353);
    expect(effects.some((effect) => effect.kind === 'graphic')).toBe(false);
  });

  it.each([
    12926, 28688, 25865, 25867, 25888,
  ])('carries ordinary timing without rewriting raw weapon %i', (weaponId) => {
    const projectile = describePlayerEffects(shot(weaponId, false)).find((effect) => effect.kind === 'projectile');
    expect(projectile).toMatchObject({ weaponId, timing: getProjectileTiming(weaponId, false) });
  });

  it('keeps the verified Trahaearn cast graphic and height', () => {
    expect(describePlayerEffects(shot(25888, false))).toContainEqual({
      kind: 'graphic',
      key: 'event-1',
      tick: 10,
      spotAnimId: 1929,
      height: 96,
    });
  });
});

describe('NPC graphics', () => {
  it('plays a blood fury proc on the target at its packet height, starting on the swing tick', () => {
    const frame: ReplayEffectSourceFrame = {
      ...shot(22325, false),
      state: {
        ...shot(22325, false).state,
        npcs: [
          {
            id: 'boss',
            npcTypeId: 12821,
            archetypeId: 'sol',
            role: 'boss',
            alive: true,
            position: [3, 0],
            previousPosition: [3, 0],
            facingAngle: 0,
            size: 5,
            hp: 1500,
            maxHp: 1500,
          },
        ],
      },
      events: [{ type: 'npc_graphic_applied', eventId: 2, tick: 10, targetId: 'boss', spotAnimId: 1542, height: 92 }],
    };
    expect(describePlayerEffects(frame)).toEqual([
      {
        kind: 'impact',
        key: 'event-2',
        tick: 10,
        startTick: 10,
        target: { position: [3, 0], size: 5, npcTypeId: 12821, actorId: 'boss' },
        spotAnimId: 1542,
        height: 92,
        heightMode: 'actor',
      },
    ]);
  });

  it('anchors a Scatter-ashes kill graphic on the npc the killing blow just marked dead', () => {
    const frame: ReplayEffectSourceFrame = {
      ...shot(29594, true),
      state: {
        ...shot(29594, true).state,
        npcs: [
          {
            id: 'vf-0',
            npcTypeId: 14179,
            archetypeId: 'voidflare',
            role: 'minion',
            alive: false,
            position: [26, 25],
            previousPosition: [26, 25],
            facingAngle: 0,
            size: 2,
            hp: 0,
            maxHp: 71,
          },
        ],
      },
      events: [{ type: 'npc_graphic_applied', eventId: 3, tick: 12, targetId: 'vf-0', spotAnimId: 2812, height: 0 }],
    };
    expect(describePlayerEffects(frame)).toContainEqual({
      kind: 'impact',
      key: 'event-3',
      tick: 12,
      startTick: 12,
      target: { position: [26, 25], size: 2, npcTypeId: 14179, actorId: 'vf-0' },
      spotAnimId: 2812,
      height: 0,
      heightMode: 'actor',
    });
  });
});

/** One player swing at a boss standing at `bossPosition`, as the simulation emits it. */
function swing(
  weaponId: number,
  playerPosition: [number, number],
  bossPosition: [number, number],
  bossSize: number,
  attack: Partial<Extract<ReplayEffectSourceFrame['events'][number], { type: 'attack_started' }>> = {},
): ReplayEffectSourceFrame {
  return {
    state: {
      ...shot(weaponId, false).state,
      playerPosition,
      npcs: [
        {
          id: 'boss',
          npcTypeId: 12817,
          archetypeId: 'boss',
          role: 'boss',
          alive: true,
          position: bossPosition,
          previousPosition: bossPosition,
          facingAngle: 0,
          size: bossSize,
          hp: 100,
          maxHp: 100,
        },
      ],
    },
    events: [
      {
        type: 'attack_started',
        eventId: 1,
        tick: 10,
        sourceId: 'player',
        targetId: 'boss',
        style: 'melee',
        attackKind: 'melee_slash',
        weaponId,
        usingSpecialAttack: false,
        ...attack,
      },
    ],
  };
}

describe('scythe sweep', () => {
  // capture colosseum-no-sol-packet-data.txt tick 1591: the player at (1835, 3108) swings south at a
  // javelin colossus at (1835, 3105), and `dragon_halberd_special_south_blue (1895), delay=20, height=92`
  // lands on (1835, 3107). Same geometry here, relative.
  it('lays the Holy scythe sweep on the tile in front of the player, pinned and unrotated', () => {
    expect(describePlayerEffects(swing(25736, [10, 13], [10, 10], 3))).toContainEqual({
      kind: 'impact',
      key: 'event-1-sweep',
      tick: 10,
      startTick: 10 + 20 / 30,
      target: { position: [10, 12], size: 1, npcTypeId: 0, actorId: undefined },
      spotAnimId: 1895,
      height: 92,
      heightMode: 'actor',
    });
  });

  it.each([
    // [weapon, player, direction's sweep id, tile]
    [22325, [11, 13], 478, [11, 12]],
    [22325, [11, 9], 506, [11, 10]],
    [22325, [9, 11], 1172, [10, 11]],
    [22325, [13, 11], 1231, [12, 11]],
    [25736, [11, 9], 1896, [11, 10]],
    [25736, [9, 11], 1897, [10, 11]],
    [25736, [13, 11], 1898, [12, 11]],
    [25739, [11, 13], 1891, [11, 12]],
    [25739, [11, 9], 1892, [11, 10]],
    [25739, [9, 11], 1893, [10, 11]],
    [25739, [13, 11], 1894, [12, 11]],
  ] as const)('sweeps with %i from %j using spotanim %i on %j', (weaponId, player, spotAnimId, tile) => {
    const sweep = describePlayerEffects(swing(weaponId, [...player], [10, 10], 3)).find(
      (effect) => effect.key === 'event-1-sweep',
    );
    expect(sweep).toMatchObject({ spotAnimId, target: { position: tile } });
  });

  it.each([
    [22324, 'a weapon without a sweep'],
    [22486, 'an uncharged scythe'],
  ])('draws no sweep for %i (%s)', (weaponId) => {
    expect(describePlayerEffects(swing(weaponId, [10, 13], [10, 10], 3))).toEqual([]);
  });
});

describe('special attack target graphics', () => {
  it("plays Penance's miasma on the target half a tick into the swing", () => {
    // capture abyssal-bludgeon-special-attack-packet-data.txt:15.
    expect(
      describePlayerEffects(
        swing(13263, [10, 11], [10, 10], 1, { attackKind: 'melee_crush', usingSpecialAttack: true }),
      ),
    ).toEqual([
      {
        kind: 'impact',
        key: 'event-1-target-graphic',
        tick: 10,
        startTick: 10.5,
        target: { position: [10, 10], size: 1, npcTypeId: 12817, actorId: 'boss' },
        spotAnimId: 1284,
        height: 0,
        heightMode: 'actor',
      },
    ]);
  });

  it('leaves the ordinary bludgeon swing without it', () => {
    expect(describePlayerEffects(swing(13263, [10, 11], [10, 10], 1, { attackKind: 'melee_crush' }))).toEqual([]);
  });
});

describe('projectile-timed target graphics', () => {
  // capture yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt tick 1564: footprint
  // distance 1, and vfx_scorching_bow_spotanim (2808) lands with the impact at delay 54.
  const spec = (spellCast?: { sourcePosition: [number, number]; targetPosition: [number, number] }) =>
    swing(29591, [10, 12], [10, 10], 1, {
      style: 'range',
      attackKind: 'range_arrow',
      usingSpecialAttack: true,
      ...(spellCast ? { spellCast: { ...spellCast, targetSize: 1, accurate: true } } : {}),
    });

  it('lands the Scorching bow special graphic on the projectile arrival', () => {
    expect(
      describePlayerEffects(spec({ sourcePosition: [10, 11], targetPosition: [10, 10] })).find(
        (effect) => effect.key === 'event-1-target-graphic',
      ),
    ).toMatchObject({ spotAnimId: 2808, startTick: 10 + 54 / 30, height: 0 });
  });

  it('skips it without a launch snapshot to time it by', () => {
    expect(describePlayerEffects(spec()).some((effect) => effect.key === 'event-1-target-graphic')).toBe(false);
  });
});

describe('magic splash', () => {
  it.each([
    [27679, true],
    [27679, false],
    [27676, true],
    [27676, false],
  ] as const)('renders Condemn from autocast sceptre %i, accurate=%s', (weaponId, accurate) => {
    const effects = describePlayerEffects(
      swing(weaponId, [10, 18], [10, 10], 1, {
        style: 'magic',
        attackKind: 'magic_shadow',
        usingSpecialAttack: true,
        spellCast: { sourcePosition: [10, 18], targetPosition: [10, 10], targetSize: 1, accurate },
      }),
    );
    const projectile = effects.find((effect) => effect.kind === 'projectile');
    expect(projectile).toMatchObject({
      weaponId,
      visuals: { projectileId: 2339, hitSpotanim: accurate ? -1 : 85 },
      timing: getProjectileTiming(27665, true),
      presentation: accurate ? {} : { impactHeightMode: 'actor' },
    });
    expect(effects).toContainEqual(expect.objectContaining({ kind: 'graphic', spotAnimId: 2338 }));
    if (!projectile) throw new Error('Expected Condemn projectile');
    expect(projectileEndCycle(projectile)).toBe(426);
    expect(describePlayerEffects(swing(weaponId, [10, 11], [10, 10], 1))).toEqual([]);
  });

  const cast = (weaponId: number, accurate: boolean, spellId?: string) =>
    swing(weaponId, [10, 18], [10, 10], 1, {
      style: 'magic',
      attackKind: 'magic_shadow',
      impactDelayTicks: 4,
      ...(spellId === undefined ? {} : { spellId }),
      spellCast: { sourcePosition: [10, 18], targetPosition: [10, 10], targetSize: 1, accurate },
    });
  const projectileOf = (frame: ReplayEffectSourceFrame) =>
    describePlayerEffects(frame).find((effect) => effect.kind === 'projectile');

  it("keeps Tumeken's shadow impact on a cast that lands", () => {
    expect(projectileOf(cast(27275, true))).toMatchObject({ visuals: { hitSpotanim: 2127 }, presentation: {} });
  });

  it.each([
    ['a powered staff', 27275, undefined],
    ['a spell with a projectile', 0, 'Fire Wave'],
  ])('lands failedspell_impact at its packet height when %s splashes', (_what, weaponId, spellId) => {
    expect(projectileOf(cast(weaponId, false, spellId))).toMatchObject({
      visuals: { hitSpotanim: 85, hitSpotanimHeight: 124 },
      presentation: { impactHeightMode: 'actor' },
    });
  });

  it('replaces the impact of a spell without a projectile with the splash', () => {
    expect(describePlayerEffects(cast(0, false, 'Shadow Barrage'))).toContainEqual(
      expect.objectContaining({ kind: 'impact', spotAnimId: 85, height: 124, heightMode: 'actor' }),
    );
  });
});
