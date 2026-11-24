import type { NpcActor } from '../../core/actors/NpcActor';
import type { NpcFormulaStats } from '../../core/actors/types';
import { getMonsterFormulaStats, getMonsterHp } from '../../data/monsterData';
import type { Coordinate } from '../../types/simulation';

/** Ordinary-wave species with no Zuk-wave counterpart: docs/encounters/inferno-facts-spec.md (NPCs). */
export type InfernoWaveSpecies = 'nibbler' | 'bat' | 'blob' | 'blob_mage' | 'blob_range' | 'blob_melee' | 'meleer';
export type InfernoActorKind =
  | 'zuk'
  | 'shield'
  | 'mager'
  | 'ranger'
  | 'jad'
  | 'jad_healer'
  | 'healer'
  | InfernoWaveSpecies;
/** The four species that exist as both an ordinary-wave and a wave-69 NPC type. */
export type InfernoVariantKind = 'ranger' | 'mager' | 'jad' | 'jad_healer';
export type InfernoVariant = 'zuk' | 'ordinary';

export const RANGER_PROFILES = Object.freeze({
  zuk: Object.freeze({
    identity: Object.freeze({ npcTypeId: 7702, size: 3, archetypeId: 'zuk_ranger' } as const),
    attackRange: 16,
    attackSpeed: 4,
  } as const),
  // Reach 15 from the footprint edge (P:125019, Q:91118), not wave 69's 16.
  ordinary: Object.freeze({
    identity: Object.freeze({ npcTypeId: 7698, size: 3, archetypeId: 'inferno_ranger' } as const),
    attackRange: 15,
    attackSpeed: 4,
  } as const),
});

export type RangerVariant = keyof typeof RANGER_PROFILES;

// Simulator policy for the unknown defences, not published stats: docs/encounters/zuk-policy.md (Glyph damage and destruction).
export const GLYPH_FORMULA_STATS = {
  levels: { attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 },
  offensive: { atk: 0, ranged: 0, magic: 0, str: 0, rangedStr: 0, magicStr: 0 },
  defensive: { stab: 0, slash: 0, crush: 0, rangedLight: 0, rangedStandard: 0, rangedHeavy: 0, magic: 0 },
  attributes: [],
} as const satisfies NpcFormulaStats;

type InfernoIdentity = { readonly npcTypeId: number; readonly size: number; readonly archetypeId: string };

// Wave-69 IDs: docs/encounters/zuk-facts-spec.md, section 1; sizes: the cache's NpcType records.
// Ordinary IDs: docs/encounters/inferno-facts-spec.md (NPCs); sizes from the same records.
const VARIANT_IDENTITIES: { readonly [Kind in InfernoVariantKind]: Readonly<Record<InfernoVariant, InfernoIdentity>> } =
  {
    ranger: { zuk: RANGER_PROFILES.zuk.identity, ordinary: RANGER_PROFILES.ordinary.identity },
    mager: {
      zuk: { npcTypeId: 7703, size: 4, archetypeId: 'zuk_mager' },
      ordinary: { npcTypeId: 7699, size: 4, archetypeId: 'inferno_mager' },
    },
    jad: {
      zuk: { npcTypeId: 7704, size: 5, archetypeId: 'zuk_jad' },
      ordinary: { npcTypeId: 7700, size: 5, archetypeId: 'inferno_jad' },
    },
    jad_healer: {
      zuk: { npcTypeId: 7705, size: 1, archetypeId: 'zuk_jad_healer' },
      ordinary: { npcTypeId: 7701, size: 1, archetypeId: 'inferno_jad_healer' },
    },
  };

const identities: { readonly [Kind in InfernoActorKind]: InfernoIdentity } = {
  zuk: { npcTypeId: 7706, size: 7, archetypeId: 'zuk' },
  shield: { npcTypeId: 7707, size: 3, archetypeId: 'zuk_shield' },
  mager: VARIANT_IDENTITIES.mager.zuk,
  ranger: VARIANT_IDENTITIES.ranger.zuk,
  jad: VARIANT_IDENTITIES.jad.zuk,
  jad_healer: VARIANT_IDENTITIES.jad_healer.zuk,
  healer: { npcTypeId: 7708, size: 1, archetypeId: 'zuk_healer' },
  nibbler: { npcTypeId: 7691, size: 1, archetypeId: 'inferno_nibbler' },
  bat: { npcTypeId: 7692, size: 2, archetypeId: 'inferno_bat' },
  blob: { npcTypeId: 7693, size: 3, archetypeId: 'inferno_blob' },
  blob_mage: { npcTypeId: 7694, size: 1, archetypeId: 'inferno_blob_mage' },
  blob_range: { npcTypeId: 7695, size: 1, archetypeId: 'inferno_blob_range' },
  blob_melee: { npcTypeId: 7696, size: 1, archetypeId: 'inferno_blob_melee' },
  meleer: { npcTypeId: 7697, size: 4, archetypeId: 'inferno_meleer' },
};

export type InfernoActorSelection =
  | InfernoActorKind
  | { readonly kind: InfernoVariantKind; readonly variant: InfernoVariant };

export function infernoIdentity(selection: InfernoActorSelection): InfernoIdentity {
  return typeof selection === 'string' ? identities[selection] : VARIANT_IDENTITIES[selection.kind][selection.variant];
}

export function createInfernoActor(selection: InfernoActorSelection, id: string, position: Coordinate): NpcActor {
  const kind = typeof selection === 'string' ? selection : selection.kind;
  const identity = infernoIdentity(selection);
  // Published glyph HP: docs/encounters/zuk-facts-spec.md, section 2.
  const hp = kind === 'shield' ? 600 : getMonsterHp(identity.npcTypeId);
  const formulaStats = kind === 'shield' ? GLYPH_FORMULA_STATS : getMonsterFormulaStats(identity.npcTypeId);
  if (hp === undefined || formulaStats === undefined) {
    throw new TypeError(`Missing Inferno monster data for ${identity.npcTypeId}`);
  }
  return {
    ...identity,
    id,
    kind: 'npc',
    role: kind === 'zuk' ? 'boss' : kind === 'shield' ? 'npc' : 'minion',
    alive: true,
    position: [...position],
    previousPosition: [...position],
    facing: 0,
    vitals: { hp, maxHp: hp },
    history: new Map(),
    formulaStats: structuredClone(formulaStats),
    combat: {
      attackSpeed: 1,
      attackRange: 0,
      attackStyle: 'typeless',
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
  };
}
