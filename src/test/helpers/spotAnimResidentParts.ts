import type { SpotAnimEmbeddedPart, SpotAnimMeshPart } from '../../render/effects/spotAnimMeshParts';
import type { ResidentMeshEmbedder } from './residentMeshDraws';

/**
 * A baked spotanim part with its arrays, whether it keeps its own or draws from a GPU-resident
 * source. Resident parts are read through `embedder`, which materializes each source once, as the
 * renderer's first upload does, so a part and the draws of it see the same arrays.
 */
export function spotAnimPartArrays(embedder: ResidentMeshEmbedder, part: SpotAnimMeshPart): SpotAnimEmbeddedPart {
  if (part.resident) {
    const { resident, ...rest } = part;
    return embedder.embedResident({
      ...rest,
      kind: 'mesh3d',
      modelMatrix: new Float32Array(16),
      meshSource: resident.source,
      meshSourcePart: resident.part,
    });
  }
  if (!part.positions) throw new Error(`${part.meshId} has neither arrays nor a resident source`);
  return { ...part, positions: part.positions };
}
