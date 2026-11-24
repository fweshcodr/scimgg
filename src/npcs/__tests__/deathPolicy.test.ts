import { describe, expect, it } from 'vitest';
import type { NpcActor } from '../../core/actors/NpcActor';
import { npcDeathPolicy } from '../../core/npcDeath';
import { createBeeSwarms } from '../../encounters/colosseum/modifiers/bees';
import { createSolarflare } from '../../encounters/colosseum/modifiers/solarflare';
import { createHealingTotem } from '../../encounters/colosseum/modifiers/totemic';
import { createCrystal } from '../colosseum/crystal';
import { createSol } from '../colosseum/sol';
import { createWarbander, WARBAND_SLOT_OFFSETS, WARBANDER_ROLES } from '../colosseum/warband';
import { createGlyph } from '../inferno/glyph';
import { createHealer } from '../inferno/healer';
import { createJad } from '../inferno/jad';
import { createJadHealer } from '../inferno/jadHealer';
import { createMager, createRanger } from '../inferno/setMonsters';
import { createZuk } from '../inferno/zuk';
import { createVoidFlareActor } from '../yama/voidFlare';
import { createYamaActor } from '../yama/yama';

const set = { position: [10, 10] as [number, number], spawnTick: 0, initialTargetId: 'player', initialDelayTicks: 6 };

/**
 * `docs/architecture/npc-hit-queue-and-death.md` section 5: which production NPCs defer their death
 * processing, and which keep their own lifecycle. The ordinary-wave Inferno species are not listed here.
 */
const ACTORS: Readonly<Record<string, () => NpcActor>> = {
  ...Object.fromEntries(
    WARBANDER_ROLES.map((role) => [
      `warband ${role}`,
      () =>
        createWarbander({ id: role, role, position: [20, 20], spawnTick: 0, slotOffset: WARBAND_SLOT_OFFSETS[role] }),
    ]),
  ),
  'Jal-Zek': () => createMager({ ...set, id: 'mager', attackRange: 15 }),
  'Jal-Xil': () => createRanger({ ...set, id: 'ranger', variant: 'zuk' }),
  'JalTok-Jad': () => createJad({ id: 'jad', position: [10, 10], spawnTick: 0, targetId: 'player' }),
  'Yt-HurKot': () => createJadHealer({ id: 'jad-healer', position: [10, 10], spawnTick: 0, parentId: 'jad' }),
  'Jal-MejJak': () => createHealer({ id: 'healer', position: [10, 10], spawnTick: 0, supportTargetId: 'zuk' }),
  'void flare': () =>
    createVoidFlareActor({ id: 'flare', damageRollIndex: 0, position: [10, 10], spawnTick: 0, chargeTicks: 26 }),
  Sol: () =>
    createSol({
      id: 'sol',
      position: [10, 10],
      targetId: 'player',
      addedTick: 0,
      firstAttackTick: 5,
      holdUntilTick: 0,
    }),
  Yama: () =>
    createYamaActor({
      position: [10, 10],
      hp: 1000,
      maxHp: 1000,
      openingStyle: 'magic',
    }),
  'TzKal-Zuk': () => createZuk({ id: 'zuk', position: [10, 10], spawnTick: 0, openingDelayTicks: 0, glyphId: 'glyph' }),
  glyph: () => createGlyph({ id: 'glyph', position: [10, 10], spawnTick: 0, targetEndpoint: 0 }),
  crystal: () => createCrystal({ id: 'crystal', index: 0, tick: 0, charging: false }),
  Solarflare: () =>
    createSolarflare({
      id: 'orb',
      corners: [
        [10, 10],
        [12, 10],
      ],
      tier: 1,
      spawnTick: 0,
      firstStepTick: 1,
    }),
  Bees: () => createBeeSwarms({ tier: 1, tick: 0, idPrefix: 'bees', random: () => 0 })[0]!,
  'healing totem': () =>
    createHealingTotem({ id: 'totem', position: [10, 10], target: { id: 'sol' }, healAmount: 1, tick: 0 }),
};

describe('production NPC death policies', () => {
  it('queues the ordinary NPCs and keeps bosses and scripted adds immediate', () => {
    const policies = Object.fromEntries(
      Object.entries(ACTORS).map(([name, create]) => [name, npcDeathPolicy(create())]),
    );
    expect(policies).toEqual({
      'warband berserker': 'queued',
      'warband archer': 'queued',
      'warband seer': 'queued',
      'Jal-Zek': 'queued',
      'Jal-Xil': 'queued',
      'JalTok-Jad': 'queued',
      'Yt-HurKot': 'queued',
      'Jal-MejJak': 'queued',
      'void flare': 'queued',
      Sol: 'immediate',
      Yama: 'immediate',
      'TzKal-Zuk': 'immediate',
      glyph: 'immediate',
      crystal: 'immediate',
      Solarflare: 'immediate',
      Bees: 'immediate',
      'healing totem': 'immediate',
    });
  });
});
