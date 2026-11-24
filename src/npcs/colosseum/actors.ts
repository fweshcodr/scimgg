import type { NpcActor } from '../../core/actors/NpcActor';
import type { NpcFormulaStats } from '../../core/actors/types';
import { getMonsterFormulaStats, getMonsterHp } from '../../data/monsterData';
import type { Coordinate } from '../../types/simulation';
import {
  BEAM_CRYSTAL_NPC_ID,
  BEAM_CRYSTAL_SIZE,
  BEES_NPC_ID,
  COLOSSEUM_SEQS,
  HEALING_TOTEM_NPC_ID,
  SOL_NPC_ID,
  SOL_SIZE,
  SOLARFLARE_NPC_ID,
} from './constants';

export type ColosseumActorKind = 'sol' | 'beam_crystal' | 'solarflare' | 'bees' | 'healing_totem';

/**
 * Beam crystals and solar flares are not combat targets. These inert stats satisfy `NpcActor` without
 * pretending to be a fightable NPC; `SolHereditEncounter` refuses player attacks against it.
 */
const INERT_FORMULA_STATS = {
  levels: { attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 },
  offensive: { atk: 0, ranged: 0, magic: 0, str: 0, rangedStr: 0, magicStr: 0 },
  defensive: { stab: 0, slash: 0, crush: 0, rangedLight: 0, rangedStandard: 0, rangedHeavy: 0, magic: 0 },
  attributes: [],
} as const satisfies NpcFormulaStats;

const identities = {
  sol: { npcTypeId: SOL_NPC_ID, size: SOL_SIZE, archetypeId: 'sol_heredit' },
  beam_crystal: { npcTypeId: BEAM_CRYSTAL_NPC_ID, size: BEAM_CRYSTAL_SIZE, archetypeId: 'colosseum_beam_crystal' },
  solarflare: { npcTypeId: SOLARFLARE_NPC_ID, size: 1, archetypeId: 'colosseum_solarflare' },
  // Cache revision 232 size 2; B's apparent adjacent stings are inside this footprint.
  bees: { npcTypeId: BEES_NPC_ID, size: 2, archetypeId: 'colosseum_bees' },
  healing_totem: { npcTypeId: HEALING_TOTEM_NPC_ID, size: 1, archetypeId: 'colosseum_healing_totem' },
} as const;

/**
 * A 1-HP minion every player hit lands on; any landed hit already kills it. Healing totem evidence:
 * 43/43 player hits on a totem in Run A splatted 1, none 0 (including Venator primaries and
 * ricochets); the Wiki infobox (/w/Healing_totem rev 15259848) gives 1 Hitpoint,
 * and `monsters.json` 0 Defence and bonuses.
 * Its accuracy is not separately proven: that sample also fits an ordinary roll against 0 Defence.
 */
function alwaysHitByPlayer(stats: NpcFormulaStats | undefined): NpcFormulaStats | undefined {
  return stats && { ...stats, alwaysAccuratePlayerHit: true };
}

export function createColosseumActor(kind: ColosseumActorKind, id: string, position: Readonly<Coordinate>): NpcActor {
  const identity = identities[kind];
  const isSol = kind === 'sol';
  // Sol's 1500 HP is explicit in both captures (`hpbar_hud_basehp 0->1500`) and matches the dataset.
  const hp = isSol ? getMonsterHp(SOL_NPC_ID) : 1;
  const formulaStats = isSol
    ? getMonsterFormulaStats(SOL_NPC_ID)
    : kind === 'bees'
      ? {
          ...(getMonsterFormulaStats(BEES_NPC_ID) ?? {
            ...INERT_FORMULA_STATS,
            levels: { ...INERT_FORMULA_STATS.levels, defence: 0 },
          }),
          // Every player hit lands: 17/17 first hits on a swarm dealt its 1 HP in B and A (bow, Venator,
          // SGS spec, scythe), and /w/Bee_Swarm: "only having 1 hitpoint and players are guaranteed a
          // max hit". Accuracy is the part that needs forcing; any landed hit already kills.
          alwaysAccuratePlayerHit: true,
        }
      : kind === 'healing_totem'
        ? alwaysHitByPlayer(getMonsterFormulaStats(HEALING_TOTEM_NPC_ID))
        : INERT_FORMULA_STATS;
  if (hp === undefined || formulaStats === undefined) {
    throw new TypeError(`Missing Colosseum monster data for ${identity.npcTypeId}`);
  }
  return {
    ...identity,
    // UNVERIFIED whether a totem blocks NPCs; not blocking keeps Sol's verified pursuit intact.
    ...(kind === 'solarflare' || kind === 'healing_totem' ? { blocksNpcMovement: false } : {}),
    ...(kind === 'bees' ? { blocksNpcMovement: false, passThruNpcs: true, retainAfterDeath: true } : {}),
    id,
    kind: 'npc',
    // Bees and totems are attackable combat NPCs, so they get the default true-tile highlight like the boss.
    role: isSol ? 'boss' : kind === 'bees' || kind === 'healing_totem' ? 'minion' : 'npc',
    alive: true,
    position: [...position],
    previousPosition: [...position],
    facing: 0,
    vitals: { hp, maxHp: hp },
    history: new Map(),
    formulaStats: structuredClone(formulaStats),
    combat: {
      // Sol's cadence is driven by the encounter's per-style cooldowns, not this generic clock.
      attackSpeed: 1,
      attackRange: 0,
      attackStyle: 'typeless',
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: isSol
        ? {
            idle: COLOSSEUM_SEQS.sol.idle,
            walk: COLOSSEUM_SEQS.sol.walk,
            run: COLOSSEUM_SEQS.sol.walk,
            attack: COLOSSEUM_SEQS.sol.spearTelegraph,
            death: COLOSSEUM_SEQS.sol.death,
          }
        : kind === 'solarflare'
          ? {
              idle: COLOSSEUM_SEQS.solarflare.idle,
              walk: COLOSSEUM_SEQS.solarflare.idle,
              run: COLOSSEUM_SEQS.solarflare.idle,
              attack: null,
              death: null,
            }
          : kind === 'bees'
            ? {
                idle: COLOSSEUM_SEQS.bees.idle,
                walk: COLOSSEUM_SEQS.bees.idle,
                run: COLOSSEUM_SEQS.bees.idle,
                attack: COLOSSEUM_SEQS.bees.attack,
                death: COLOSSEUM_SEQS.bees.despawn,
              }
            : kind === 'healing_totem'
              ? {
                  idle: COLOSSEUM_SEQS.totem.idle,
                  walk: null,
                  run: null,
                  attack: COLOSSEUM_SEQS.totem.attack,
                  death: null,
                }
              : {
                  idle: COLOSSEUM_SEQS.crystal.idle,
                  walk: null,
                  run: null,
                  attack: COLOSSEUM_SEQS.crystal.attack,
                  death: null,
                },
    },
  };
}
