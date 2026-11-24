import type { SceneObjectLocData } from '../../render/graphics/SceneObjectRenderer';
import type {
  SceneObjectController,
  SceneObjectFrameContext,
  SceneObjectSpec,
} from '../../render/graphics/sceneObjectTypes';
import { LocModelType } from '../../rs/config/loctype/LocModelType';
import type { SimulationState } from '../../types/simulation';
import { type ZukAlcoveLoc, zukAlcoveLocs } from '../zuk/alcoveScenery';
import { PILLAR_MAX_HP } from './pillars';

const IDENTITY = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/**
 * The Inferno's runtime scenery, from the recorded snapshot alone (so a replay seek is exact):
 *
 * - Each standing Rocky support as its packet-added LOC (P:257-259, shape 10, rotation 0). A collapse
 *   drops the LOC from the snapshot, and NPC 7710 plays the collapse in its place. The LOCs
 *   (30353-30355) are transform LOCs on the damage varbits 5655-5657, which count damage up from 0;
 *   their cache transform lists pick the cracked models (30284-30287) by that count.
 * - The alcove's prison walls and static glyph, sealed through the waves and opened around wave 69's
 *   control tick (`zukAlcoveLocs`); the static scene leaves those LOCs out (`ZUK_ALCOVE_STATIC_LOCS`).
 *   A recording from when Zuk was its own encounter is always at wave 69, alcove open.
 */
export class InfernoSceneObjectController implements SceneObjectController<SimulationState, SceneObjectLocData> {
  consumeEvents(): void {}

  update(context: SceneObjectFrameContext<SimulationState>): readonly SceneObjectSpec<SceneObjectLocData>[] {
    const snapshot = context.state.encounter;
    if (snapshot.kind === 'zuk') return zukAlcoveLocs(0, Math.max(0, context.currentTick)).map(alcoveSpec);
    if (snapshot.kind !== 'inferno') return [];
    const hpByPillar = new Map(snapshot.state.pillars.map(({ key, hp }) => [key, hp]));
    const pillars = snapshot.visuals.pillarLocs.map(({ key, locId, position }) => {
      const id = `inferno-pillar-${key}`;
      return {
        id,
        meshId: id,
        materialId: 'osrs-npc',
        modelMatrix: IDENTITY(),
        lifecycle: { kind: 'sync' },
        classification: 'sceneMesh',
        data: {
          kind: 'loc',
          locId,
          modelType: LocModelType.NORMAL,
          rotation: 0,
          seqId: -1,
          localX: position[0],
          localY: position[1],
          transformValue: PILLAR_MAX_HP - (hpByPillar.get(key) ?? PILLAR_MAX_HP),
        },
      } satisfies SceneObjectSpec<SceneObjectLocData>;
    });
    return [...pillars, ...zukAlcoveLocs(snapshot.visuals.zukControlTick, context.currentTick).map(alcoveSpec)];
  }
}

function alcoveSpec(loc: ZukAlcoveLoc): SceneObjectSpec<SceneObjectLocData> {
  // One id per slot and state: a change of LOC is a new object, never a re-skinned one.
  const id = `inferno-alcove-${loc.slot}-${loc.locId}`;
  return {
    id,
    meshId: id,
    materialId: 'osrs-npc',
    modelMatrix: IDENTITY(),
    lifecycle: { kind: 'sync' },
    classification: 'sceneMesh',
    data: {
      kind: 'loc',
      locId: loc.locId,
      modelType: LocModelType.NORMAL,
      rotation: loc.rotation,
      seqId: loc.animation?.seqId ?? -1,
      localX: loc.localX,
      localY: loc.localY,
      ...(loc.animation ? { animationStartTick: loc.animation.startTick } : {}),
    },
  };
}
