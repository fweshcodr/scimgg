import { isYamaSnapshot } from '../../core/encounters/snapshot';
import { FLOOR_EFFECT_DEPTH_BIAS } from '../../render/effects/spotAnimRenderPolicy';
import type { SceneObjectLocData } from '../../render/graphics/SceneObjectRenderer';
import type {
  SceneObjectController,
  SceneObjectFrameContext,
  SceneObjectSpec,
} from '../../render/graphics/sceneObjectTypes';
import { LocModelType } from '../../rs/config/loctype/LocModelType';
import type { Coordinate, SimulationState } from '../../types/simulation';

// The floor glyphs of phases 1 and 2, which share one layout. A Glyph of Shadow is absorbed on the
// tick `full01_deactivate` replaces `full01` on that tile, and Fire with `full02`
// (capture yama-contract-of-bloodied-blows-packet-data-1.txt:401-411 and :954-966).
/** `floorkit_summoning03_full01`, a Glyph of Shadow. */
export const YAMA_SHADOW_GLYPH_LOC_ID = 56335;
/** `floorkit_summoning03_full02`, a Glyph of Fire. */
export const YAMA_FIRE_GLYPH_LOC_ID = 56336;
export const YAMA_SHADOW_GLYPH_DEACTIVATE_LOC_ID = 56338;
export const YAMA_FIRE_GLYPH_DEACTIVATE_LOC_ID = 56339;

/** Every capture adds the glyphs as `shape=10, rotation=2`. */
const GLYPH_ROTATION = 2;

/**
 * South-west corners of the 3x3 glyphs, in sim tiles. The northern pair and the southern glyph
 * share one color and the west and east glyphs have the other, in every capture's glyph batch
 * (e.g. capture yama-packet-data.txt:65-69).
 */
export const YAMA_OPENER_COLOUR_GLYPH_TILES: readonly Coordinate[] = [
  [25, 36],
  [35, 36],
  [30, 24],
];
export const YAMA_OTHER_COLOUR_GLYPH_TILES: readonly Coordinate[] = [
  [23, 29],
  [37, 29],
];

/**
 * The deactivate LOCs' own sequences (12172 Shadow, 12170 Fire) run 30 client cycles, one game
 * tick; the real-cache test in `YamaSceneObjectController.test.ts` pins this against the cache.
 */
export const YAMA_GLYPH_DEACTIVATE_TICKS = 1;

/** Faded so the hint does not read as the real arena, which is dark by phase 3. */
export const YAMA_GLYPH_HINT_OPACITY = 0.45;

type GlyphColour = 'shadow' | 'fire';

const GLYPH_LOC_IDS: Readonly<Record<GlyphColour, { readonly active: number; readonly deactivate: number }>> = {
  shadow: { active: YAMA_SHADOW_GLYPH_LOC_ID, deactivate: YAMA_SHADOW_GLYPH_DEACTIVATE_LOC_ID },
  fire: { active: YAMA_FIRE_GLYPH_LOC_ID, deactivate: YAMA_FIRE_GLYPH_DEACTIVATE_LOC_ID },
};

type Opener = 'magic' | 'range';

/** Yama opens with the northern glyphs' color: Shadow for range, Fire for magic. */
function openerColour(opener: Opener): GlyphColour {
  return opener === 'range' ? 'shadow' : 'fire';
}

type ReleaseState =
  /** No GO seen since the last hold: nothing to deactivate. */
  | { readonly kind: 'idle' }
  /** GO was seen at `at` (an interpolated tick); the deactivate plays from there. */
  | {
      readonly kind: 'deactivating';
      readonly at: number;
      readonly specs: readonly SceneObjectSpec<SceneObjectLocData>[];
    }
  /** Deactivated; stays gone until the next hold. */
  | { readonly kind: 'done' };

const IDLE: ReleaseState = { kind: 'idle' };
const DONE: ReleaseState = { kind: 'done' };

/**
 * The `yamaStartGlyphs` practice aid: the previous phases' floor glyphs, faded, while the
 * start-of-fight countdown holds the fight, so the player can read phase 3's opener as they would
 * arriving from phase 2. At GO they play their deactivate LOC and are removed once it ends.
 *
 * Presentation only. It reads the opener from the snapshot and the countdown from the frame
 * context, which is UI state, so it changes nothing the engine, snapshot or replay hold. It never
 * shows without a running countdown, which also keeps it out of replay viewing.
 */
export class YamaSceneObjectController implements SceneObjectController<SimulationState, SceneObjectLocData> {
  /** Stable spec objects per opener, so a hold re-syncs without re-baking. */
  private readonly activeSpecs: Readonly<Record<Opener, readonly SceneObjectSpec<SceneObjectLocData>[]>> = {
    range: glyphSpecs('range', 'active'),
    magic: glyphSpecs('magic', 'active'),
  };
  private release: ReleaseState = IDLE;

  consumeEvents(): void {}

  update(context: SceneObjectFrameContext<SimulationState>): readonly SceneObjectSpec<SceneObjectLocData>[] {
    const snapshot = context.state.encounter;
    if (!isYamaSnapshot(snapshot) || context.state.mechanicsConfig.yamaStartGlyphs !== true) {
      this.release = IDLE;
      return [];
    }
    // No countdown (it finished or was canceled, it's switched off, or a replay or demo frame is
    // showing): never draw. At slow speeds this cuts the deactivate short when GO's exit ends first.
    if (context.fightStartCountdown === undefined) {
      this.release = IDLE;
      return [];
    }
    const opener = snapshot.state.firstRangeMageType;
    if (context.fightStartCountdown === 'holding') {
      this.release = IDLE;
      return this.activeSpecs[opener];
    }
    if (context.fightStartCountdown === 'released' && this.release.kind === 'idle') {
      // The interpolated tick, not the integer one: GO runs the first tick in the same turn, so the
      // integer tick can step under a sequence that has only just started.
      const at = context.interpolatedTick;
      this.release = { kind: 'deactivating', at, specs: glyphSpecs(opener, 'deactivate', at) };
    }
    if (this.release.kind !== 'deactivating') return [];
    const elapsed = context.interpolatedTick - this.release.at;
    if (elapsed < 0 || elapsed >= YAMA_GLYPH_DEACTIVATE_TICKS) {
      // Finished, or the timeline moved back under it (a reset or a seek).
      this.release = DONE;
      return [];
    }
    return this.release.specs;
  }
}

function glyphSpecs(
  opener: Opener,
  stage: 'active' | 'deactivate',
  animationStartTick?: number,
): SceneObjectSpec<SceneObjectLocData>[] {
  const first = openerColour(opener);
  const second: GlyphColour = first === 'shadow' ? 'fire' : 'shadow';
  return [
    ...YAMA_OPENER_COLOUR_GLYPH_TILES.map((tile) => glyphSpec(GLYPH_LOC_IDS[first][stage], tile, animationStartTick)),
    ...YAMA_OTHER_COLOUR_GLYPH_TILES.map((tile) => glyphSpec(GLYPH_LOC_IDS[second][stage], tile, animationStartTick)),
  ];
}

function glyphSpec(
  locId: number,
  [x, y]: Coordinate,
  animationStartTick: number | undefined,
): SceneObjectSpec<SceneObjectLocData> {
  // The glyphs are terrain-contoured, so they bake under this id: it carries the loc so a changed
  // color or stage never reuses another LOC's GPU meshes.
  const id = `yama-start-glyph-${locId}-${x}-${y}`;
  return {
    id,
    meshId: id,
    materialId: 'osrs-npc',
    modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    lifecycle: { kind: 'sync' },
    classification: 'groundDecal',
    // Flat on the floor like Sol's sand pools, which flicker on the default decal bias.
    style: { depthBias: FLOOR_EFFECT_DEPTH_BIAS, opacity: YAMA_GLYPH_HINT_OPACITY },
    data: {
      kind: 'loc',
      locId,
      modelType: LocModelType.NORMAL,
      rotation: GLYPH_ROTATION,
      seqId: -1,
      localX: x,
      localY: y,
      ...(animationStartTick !== undefined ? { animationStartTick } : {}),
    },
  };
}
