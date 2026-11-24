import {
  isResidentMesh3DCommand,
  type NpcMesh3DCommand,
  type RenderCommand,
  type RenderQueue,
  type ResidentMesh3DCommand,
} from '../../render/core/commands';
import type { ImmutableMeshSource, MeshUploadData } from '../../render/core/meshSource';
import type { LocRendererLike } from '../../render/environment/__tests__/animatedLocDrawStream';

/**
 * Turns resident-source draws back into the embedded-array commands they replaced, so draw-stream
 * recorders and assertions written against arrays on commands keep working. Each source is
 * materialized once, on its first draw, as `PicoGLRenderer` uploads it; that first call hands over
 * the build the owner made while loading. Other commands pass through untouched.
 */
export class ResidentMeshEmbedder {
  private readonly uploads = new WeakMap<ImmutableMeshSource, readonly MeshUploadData[]>();

  /**
   * `expandIndexed` turns parts that come indexed back into the triangle soups they index, for
   * sources whose pinned digests were recorded from soups (merged static LOCs); terrain, whose
   * digests are indexed, should keep its indices.
   */
  constructor(private readonly expandIndexed = false) {}

  embed(command: RenderCommand): RenderCommand {
    if (command.kind !== 'mesh3d' || !isResidentMesh3DCommand(command)) return command;
    return this.embedResident(command);
  }

  embedResident(command: ResidentMesh3DCommand): NpcMesh3DCommand {
    const { meshSource, meshSourcePart, ...rest } = command;
    let parts = this.uploads.get(meshSource);
    if (!parts) {
      parts = meshSource.materialize();
      if (this.expandIndexed) parts = parts.map(expandIndexedUpload);
      this.uploads.set(meshSource, parts);
    }
    const part = parts[meshSourcePart];
    if (!part) throw new Error(`${meshSource.id} has no part ${meshSourcePart}`);
    return { ...rest, ...part } as NpcMesh3DCommand;
  }

  embedQueue(queue: RenderQueue): void {
    for (let index = 0; index < queue.commands.length; index++) {
      queue.commands[index] = this.embed(queue.commands[index]!);
    }
  }
}

const ATTRIBUTE_SIZES: Readonly<Record<Exclude<keyof MeshUploadData, 'indices'>, number>> = {
  positions: 3,
  uvs: 2,
  perVertexTextureIds: 1,
  perVertexHslColors: 1,
  perVertexAlphas: 1,
  perVertexFaceBias: 1,
  tileCoords: 2,
};

/** The soup an indexed part draws: every attribute fetched corner by corner through its indices, as raw bits. */
export function expandIndexedUpload(part: MeshUploadData): MeshUploadData {
  const { indices, ...attributes } = part;
  if (!indices) return part;
  const expanded: Record<string, Float32Array> = {};
  for (const [attribute, data] of Object.entries(attributes) as [keyof typeof ATTRIBUTE_SIZES, Float32Array][]) {
    const size = ATTRIBUTE_SIZES[attribute];
    const soup = new Float32Array(indices.length * size);
    const from = new Uint32Array(data.buffer, data.byteOffset, data.length);
    const to = new Uint32Array(soup.buffer);
    for (let corner = 0; corner < indices.length; corner++) {
      const vertex = indices[corner] as number;
      for (let component = 0; component < size; component++) {
        to[corner * size + component] = from[vertex * size + component] as number;
      }
    }
    expanded[attribute] = soup;
  }
  return expanded as unknown as MeshUploadData;
}

/** A loc renderer whose `renderLocs` queues embedded-array commands, for the draw-stream recorders. */
export function withEmbeddedResidentMeshes(renderer: LocRendererLike): LocRendererLike {
  const embedder = new ResidentMeshEmbedder(true);
  return {
    setTerrainHeights: (heights) => renderer.setTerrainHeights(heights),
    load: (loader, locs, options) => renderer.load(loader, locs, options),
    renderLocs: (queue) => {
      renderer.renderLocs(queue);
      embedder.embedQueue(queue);
    },
    dispose: () => renderer.dispose(),
  };
}
