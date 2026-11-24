import { log } from '../../util/Logger';

/**
 * Vertex attributes for one GPU mesh, named as on the embedded mesh commands so either can feed
 * the same upload. Resident sources draw with scene-base, which reads no normals, so there are none.
 */
export interface MeshUploadData {
  readonly positions: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly uvs?: Float32Array;
  readonly perVertexTextureIds?: Float32Array;
  readonly perVertexHslColors?: Float32Array;
  readonly perVertexAlphas?: Float32Array;
  readonly perVertexFaceBias?: Float32Array;
  readonly tileCoords?: Float32Array;
}

export type MeshUploadAttribute = keyof MeshUploadData;

const UPLOAD_ATTRIBUTES: readonly MeshUploadAttribute[] = [
  'positions',
  'indices',
  'uvs',
  'perVertexTextureIds',
  'perVertexHslColors',
  'perVertexAlphas',
  'perVertexFaceBias',
  'tileCoords',
];

/** Axis-aligned bounds of a part's positions, in the space the positions are in. */
export interface MeshBounds {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** Bounds of interleaved `x, y, z` positions; null when there is no whole vertex. */
export function positionBounds(positions: Float32Array): MeshBounds | null {
  if (positions.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** What stays known about a part while its arrays are not in memory. */
export interface MeshPartDescriptor {
  readonly vertexCount: number;
  readonly attributes: readonly MeshUploadAttribute[];
  /** Null for an empty part. */
  readonly bounds: MeshBounds | null;
}

/**
 * An upper bound of the GPU bytes an instancing atlas of unindexed parts with these vertex counts
 * can take, known without building it: as the PicoGL atlas lays it out, one row per part, as wide as
 * the widest part's two RGBA32F texels (32 bytes) per vertex, plus a 4-byte index per vertex. Indexing
 * merges vertices and may pick 2-byte indices, so the atlas built is never larger.
 */
export function instanceAtlasBoundBytes(vertexCounts: readonly number[]): number {
  let widest = 0;
  let total = 0;
  for (const count of vertexCounts) {
    widest = Math.max(widest, count);
    total += count;
  }
  return 32 * widest * vertexCounts.length + 4 * total;
}

function describePart(part: MeshUploadData): MeshPartDescriptor {
  return {
    vertexCount: part.positions.length / 3,
    attributes: UPLOAD_ATTRIBUTES.filter((attribute) => part[attribute] !== undefined),
    bounds: positionBounds(part.positions),
  };
}

function sameLayout(descriptor: MeshPartDescriptor, part: MeshUploadData | undefined): boolean {
  if (!part || part.positions.length / 3 !== descriptor.vertexCount) return false;
  const attributes = UPLOAD_ATTRIBUTES.filter((attribute) => part[attribute] !== undefined);
  return (
    attributes.length === descriptor.attributes.length &&
    attributes.every((attribute, index) => attribute === descriptor.attributes[index])
  );
}

/**
 * How long a source's recipe and identity stay valid. `'scene'` sources belong to one scene and are
 * released at its boundary. `'loader'` sources are baked from a cache loader that outlives scenes and
 * are shared by every scene drawing from it, so the renderer keeps them across scene boundaries;
 * its byte budget, a lost context and `dispose` still release them.
 */
export type MeshSourceScope = 'scene' | 'loader';

export interface MeshSourceOptions {
  /** Defaults to `'scene'`. */
  readonly scope?: MeshSourceScope;
  /**
   * Who the source's recipe belongs to, typically the cache loader it bakes from:
   * `retireResidentSources(owner)` releases every source carrying the token when that owner is
   * replaced, so nothing on the GPU side keeps it, or its caches, alive.
   */
  readonly owner?: object;
  /**
   * True once the recipe's inputs have been replaced (a loader cleared its caches): the source must
   * neither upload nor rebuild again, and the renderer releases what it holds of it. Read on every
   * residency check, so keep it a cheap comparison that, like the recipe, closes over no arrays.
   */
  readonly isRetired?: () => boolean;
  /**
   * `'instanceAtlas'`: the source is a `Mesh3DCommand.instanceAtlas`, never a draw's own geometry,
   * so the renderer uploads it as an atlas when it is prepared ahead. An atlas's parts are unindexed
   * triangle soups (the renderer indexes them itself, and sizes the atlas by
   * {@link instanceAtlasBoundBytes} before building it); one with an indexed part is not drawn as
   * an atlas. Defaults to `'mesh'`.
   */
  readonly use?: 'mesh' | 'instanceAtlas';
}

/** Thrown by {@link ImmutableMeshSource.materialize} on a retired source: not a failure, an ending. */
export class RetiredMeshSourceError extends Error {
  constructor(id: string) {
    super(`Mesh source ${id} is retired`);
    this.name = 'RetiredMeshSourceError';
  }
}

/**
 * Immutable scene geometry whose GPU residency the renderer owns. The scene owner keeps the
 * source (its recipe and lifetime); the renderer uploads it on first draw, may evict it, and
 * after an eviction or a lost context calls {@link materialize} again to rebuild the arrays.
 *
 * Draw commands reference a source and one of its parts instead of carrying arrays. A source
 * replaced by a new one under the same {@link id} supersedes it: object identity, not a
 * revision number, says which recipe a draw wants, so two scenes can never alias.
 *
 * `rebuild` must recreate the arrays from compact inputs (cache loaders, configuration, the
 * scene's own retained terrain data) and must not close over the arrays themselves, or the
 * whole point is lost. Build it in a function whose scope holds only the recipe: a closure
 * keeps alive every variable of its enclosing scope that any sibling closure captures.
 */
export class ImmutableMeshSource {
  readonly parts: readonly MeshPartDescriptor[];
  readonly scope: MeshSourceScope;
  readonly owner: object | undefined;
  readonly use: 'mesh' | 'instanceAtlas';
  private initial: readonly MeshUploadData[] | null;
  private readonly isRetiredCheck: (() => boolean) | undefined;

  constructor(
    readonly id: string,
    initial: readonly MeshUploadData[],
    private readonly rebuild: () => readonly MeshUploadData[],
    options: MeshSourceOptions = {},
  ) {
    this.parts = initial.map(describePart);
    this.initial = initial;
    this.scope = options.scope ?? 'scene';
    this.owner = options.owner;
    this.use = options.use ?? 'mesh';
    this.isRetiredCheck = options.isRetired;
  }

  /** Whether the build made while loading is still on the CPU, waiting for its first upload. */
  get holdsFirstBuild(): boolean {
    return this.initial !== null;
  }

  /** See {@link MeshSourceOptions.isRetired}. A retired source drops its first build too. */
  get retired(): boolean {
    if (!this.isRetiredCheck?.()) return false;
    this.initial = null;
    return true;
  }

  /**
   * The upload arrays, one per part. The first call hands over the build the owner made while
   * loading, and drops it, so after the first upload nothing but the GPU holds the geometry;
   * every later call rebuilds from the recipe. Throws {@link RetiredMeshSourceError} once retired,
   * so a source can never upload or rebuild against replaced inputs.
   */
  materialize(): readonly MeshUploadData[] {
    if (this.retired) throw new RetiredMeshSourceError(this.id);
    const initial = this.initial;
    if (initial) {
      this.initial = null;
      return initial;
    }
    const rebuilt = this.rebuild();
    if (rebuilt.length !== this.parts.length || this.parts.some((part, index) => !sameLayout(part, rebuilt[index]))) {
      // The recipe is meant to be deterministic; a different rebuild is a bug, but drawing it
      // beats drawing nothing.
      log.error('MeshSource', `Rebuild of ${this.id} does not match its first build`);
    }
    return rebuilt;
  }
}
