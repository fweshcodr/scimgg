import {
  ZUK_GROUND_NPC_DEPTH_BIAS,
  ZUK_HEALER_NPC_ID,
  ZUK_JAD_HEALER_NPC_ID,
  ZUK_JAD_NPC_ID,
  ZUK_MAGER_NPC_ID,
  ZUK_NPC_ID,
  ZUK_RANGER_NPC_ID,
  ZUK_SEQS,
  ZUK_SHIELD_NPC_ID,
} from '../../npcs/inferno/constants';
import type { EncounterNpcTypeRenderConfig } from '../../render/scene/encounterRenderConfig';
import { ZUK_INTRO_RISE_CLIP } from './constants';

// RuneLite cache gameval: LIZARD_CLERIC_DEATH = 2638; asset metadata, not an observed healer death.
// capture inferno-waves-69-zuk-packet-data.txt, t990: Jad and his healers are removed together.
const ZUK_YT_HURKOT_DEATH_SEQ = 2638;

/**
 * Wave 69's NPC types, preloaded with the Inferno's scene (`INFERNO_RENDER_CONFIG`).
 * Cache clip availability is not evidence that every clip was captured or its combat AI implemented.
 * Recorded actor identities: docs/encounters/zuk-facts-spec.md, section 1; sequences: ZUK_SEQS.
 */
export const ZUK_WAVE_NPC_TYPES: readonly EncounterNpcTypeRenderConfig[] = [
  {
    npcTypeId: ZUK_NPC_ID,
    idleSeqId: ZUK_SEQS.zuk.idle,
    // His rise is a cued clip, not `spawnSeqId`: his spawn tick is C, but wave 68's intro adds him
    // at C-8 rising (ZUK_INTRO_RISE_CLIP), and a run started on wave 69 opens with him already up.
    attackClips: {
      attack: ZUK_SEQS.zuk.attack,
      defend: ZUK_SEQS.zuk.defend,
      [ZUK_INTRO_RISE_CLIP]: ZUK_SEQS.zuk.spawn,
    },
    // An ordinary instance rather than a primary NPC, which would stand in the alcove through the
    // waves: Zuk is drawn from the snapshot, from the tick wave 69 adds him. A boss stays in the
    // snapshot when dead, so his death clip is opted in here, as a primary NPC's is.
    deathSeqId: ZUK_SEQS.zuk.death,
    bossDeathAnimationEnabled: true,
  },
  {
    npcTypeId: ZUK_SHIELD_NPC_ID,
    idleSeqId: ZUK_SEQS.shield.idle,
    attackClips: { hit: ZUK_SEQS.shield.hit },
    deathSeqId: ZUK_SEQS.shield.death,
  },
  {
    npcTypeId: ZUK_MAGER_NPC_ID,
    idleSeqId: ZUK_SEQS.mager.idle,
    attackClips: { magic: ZUK_SEQS.mager.magic, melee: ZUK_SEQS.mager.melee },
    deathSeqId: ZUK_SEQS.mager.death,
    depthBias: ZUK_GROUND_NPC_DEPTH_BIAS,
  },
  {
    npcTypeId: ZUK_RANGER_NPC_ID,
    idleSeqId: ZUK_SEQS.ranger.idle,
    attackClips: { range: ZUK_SEQS.ranger.range, melee: ZUK_SEQS.ranger.melee, defend: ZUK_SEQS.ranger.defend },
    deathSeqId: ZUK_SEQS.ranger.death,
    depthBias: ZUK_GROUND_NPC_DEPTH_BIAS,
  },
  {
    npcTypeId: ZUK_JAD_NPC_ID,
    idleSeqId: ZUK_SEQS.jad.idle,
    attackClips: {
      magic: ZUK_SEQS.jad.magic,
      range: ZUK_SEQS.jad.range,
      melee: ZUK_SEQS.jad.melee,
      defend: ZUK_SEQS.jad.defend,
    },
    deathSeqId: ZUK_SEQS.jad.death,
    // Removed at death +6 ticks (jad.ts), after the death seq ends: hold the last frame until then.
    holdDeathUntilRemoved: true,
    depthBias: ZUK_GROUND_NPC_DEPTH_BIAS,
  },
  {
    npcTypeId: ZUK_JAD_HEALER_NPC_ID,
    idleSeqId: ZUK_SEQS.ytHurKot.idle,
    attackClips: {
      heal: ZUK_SEQS.ytHurKot.heal,
      melee: ZUK_SEQS.ytHurKot.attack,
      defend: ZUK_SEQS.ytHurKot.defend,
    },
    deathSeqId: ZUK_YT_HURKOT_DEATH_SEQ,
    // Seq 2638's 22 frame lengths sum to 20090 cycles, but the last frame alone holds
    // 20000 of them (docs/encounters/zuk-facts-spec.md section 9). Retain the
    // true 90-cycle animation (90 x 20 ms) so corpses clear after it like other NPCs.
    deathDurationMs: 1800,
    depthBias: ZUK_GROUND_NPC_DEPTH_BIAS,
  },
  {
    npcTypeId: ZUK_HEALER_NPC_ID,
    idleSeqId: ZUK_SEQS.jalMejJak.idle,
    attackClips: {
      heal: ZUK_SEQS.jalMejJak.attack,
      attack: ZUK_SEQS.jalMejJak.attack,
      defend: ZUK_SEQS.jalMejJak.defend,
    },
    spawnSeqId: ZUK_SEQS.jalMejJak.spawn,
    deathSeqId: ZUK_SEQS.jalMejJak.death,
    depthBias: ZUK_GROUND_NPC_DEPTH_BIAS,
  },
];
