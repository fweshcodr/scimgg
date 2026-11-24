/**
 * One typed spawn path per Inferno wave species, and the encounter services their definitions use.
 *
 * The encounter owns sequencing (batches, splits, resurrections, healers, removal and completion);
 * each species owns its behavior in `src/npcs/inferno/` (surface: `waveNpcs.ts`).
 */
import type { NpcActor } from '../../core/actors/NpcActor';
import type { ActorId } from '../../core/actors/types';
import type { NpcDefinitionContext, NpcDefinitionRegistration } from '../../core/npcs';
import type { ParentHealPresentation } from '../../npcs/inferno/presentation';
import {
  createInfernoWaveNpc,
  createJad,
  createJadHealer,
  type InfernoWaveNpcSpecies,
  jadDefinition,
  jadHealerDefinition,
  LIVE_JAD_EXECUTION,
  type MagerResurrection,
  ORDINARY_JAD_EXECUTION,
  registerInfernoWaveDefinitions,
} from '../../npcs/inferno/waveNpcs';
import type { Coordinate } from '../../types/simulation';

export type InfernoWaveNpcKind = InfernoWaveNpcSpecies | 'jad' | 'jad_healer';

export const PLAYER_TARGET_ID = 'player';

const ORDINARY_JAD_OPENING_TICKS = ORDINARY_JAD_EXECUTION.initialDelayTicks ?? 4;

export type InfernoSpawnOrigin = 'wave' | 'split' | 'resurrection' | 'healer';

export interface InfernoWaveSpawnRequest {
  readonly id: ActorId;
  readonly position: Coordinate;
  readonly spawnTick: number;
  readonly origin: InfernoSpawnOrigin;
  /** Jads only: first tell at `spawnTick + openingDelayTicks`, then every `rangedMagicPeriod`. */
  readonly jad?: { readonly openingDelayTicks: number; readonly rangedMagicPeriod: 8 | 9 };
  /** Jad healers only: their Jad. */
  readonly parentId?: ActorId;
}

/** Builds one actor of a species for the encounter to register. */
export type InfernoWaveSpawner = (request: InfernoWaveSpawnRequest) => NpcActor;

const species =
  (kind: InfernoWaveNpcSpecies): InfernoWaveSpawner =>
  ({ id, position, spawnTick, origin }) =>
    createInfernoWaveNpc(kind, {
      id,
      position: [...position],
      spawnTick,
      targetId: PLAYER_TARGET_ID,
      // Healers never come through here; every other origin is the species' own.
      origin: origin === 'healer' ? 'wave' : origin,
    });

export const INFERNO_WAVE_SPAWNERS: Readonly<Record<InfernoWaveNpcKind, InfernoWaveSpawner>> = {
  nibbler: species('nibbler'),
  bat: species('bat'),
  blob: species('blob'),
  blob_range: species('blob_range'),
  blob_melee: species('blob_melee'),
  blob_mage: species('blob_mage'),
  meleer: species('meleer'),
  ranger: species('ranger'),
  mager: species('mager'),
  // Every ordinary Jad carries its own opening and period: the Inferno registers one JalTok-Jad
  // definition for waves 67-69 with wave 69's execution, which differs from the ordinary one only there.
  jad: ({ id, position, spawnTick, jad }) =>
    createJad({
      variant: 'ordinary',
      id,
      position: [...position],
      spawnTick,
      targetId: PLAYER_TARGET_ID,
      initialDelayTicks: jad?.openingDelayTicks ?? ORDINARY_JAD_OPENING_TICKS,
      rangedMagicPeriod: jad?.rangedMagicPeriod ?? ORDINARY_JAD_EXECUTION.rangedMagicPeriod ?? 8,
    }),
  jad_healer: ({ id, position, spawnTick, parentId }) => {
    if (parentId === undefined) throw new TypeError(`Jad healer ${id} needs a parent`);
    // Waves 67-68 healers first move or heal at add+1, even when added beside the Jad (P t9814, Q t4791,
    // R t703: 0/28 act on their add tick); wave 69's heal on it (W69 t877), so this is the ordinary type's.
    return createJadHealer({
      variant: 'ordinary',
      id,
      position: [...position],
      spawnTick,
      parentId,
      firstTurnTick: spawnTick + 1,
    });
  },
};

/** What the encounter offers the species definitions, handed to {@link infernoWaveRegistrations}. */
export interface InfernoWaveServices {
  /** The proxy (NPC 7709) of the pillar this wave's nibblers share, while it stands; else null. */
  readonly waveNibblerTarget: (context: NpcDefinitionContext) => NpcActor | null;
  /** The corpse ledger: this wave's unrevived eligible corpses, and the revive spawn. */
  readonly resurrection: MagerResurrection;
  /** A Jad's half-HP healers (5 on wave 67, 3 per Jad on wave 68, wave 69's recorded three). */
  readonly spawnJadHealers: (parentId: ActorId, context: NpcDefinitionContext) => void;
  readonly presentParentHeal: ParentHealPresentation;
}

/**
 * Every species definition the ordinary waves register, configured with the encounter's services.
 * Jal-Zek, Jal-Xil, JalTok-Jad and Yt-HurKot also fight on wave 69, so these registrations serve both:
 * the services dispatch on the stage or the parent (a collection holds one registration per definition).
 */
export function infernoWaveRegistrations(services: InfernoWaveServices): NpcDefinitionRegistration[] {
  return [
    ...registerInfernoWaveDefinitions({
      getWaveTarget: services.waveNibblerTarget,
      resurrection: services.resurrection,
    }),
    jadHealerDefinition.register({
      // Packet-fit amount (simulator policy), the same on waves 67-69: docs/encounters/zuk-policy.md (Healing).
      sampleHeal: () => 10,
      presentHeal: services.presentParentHeal,
      melee: { formulaStyle: 'melee_crush', attackKind: 'melee_crush', impactDelayTicks: 0, maxHit: 18 },
    }),
    jadDefinition.register({ execution: LIVE_JAD_EXECUTION, spawnHealers: services.spawnJadHealers }),
  ];
}
