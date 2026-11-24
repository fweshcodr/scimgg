import type { ActorId } from '../../../core/actors/types';
import type { NpcModelData } from '../../../rs/model/NpcModelLoader';
import type { NpcRole, NpcSnapshot } from '../../../types/simulation';
import type { NpcMesh3DCommand } from '../../core/commands';
import { NpcVisualTracker } from '../../core/interpolation';
import type { NpcInstanceManager } from '../NpcInstanceManager';
import type { NpcRenderFacingIntent } from '../npcFacingIntent';

export const CLIENT_CYCLE_MS = 20;
export const ANGLE_FULL = 2048;
export const PRIMARY_TYPE_ID = 12191;
export const PRIMARY_SIZE = 5;
export const PRIMARY_BASE_POS: [number, number] = [29, 28];

const TYPE_REGISTRY_KEY = 'typeRegistry';
const INSTANCE_REGISTRY_KEY = 'instanceRegistry';
const FACING_CONTROLLER_KEY = 'facingController';

/** Exact OSRS south=0 bearing; mirrors `computeFacingBearing` in the manager. */
export function bearing(sx: number, sy: number, tx: number, ty: number): number {
  const dx = tx - sx;
  const dy = ty - sy;
  if (dx === 0 && dy === 0) return 0;
  const radians = Math.atan2(-dx, -dy);
  return ((Math.round(radians * (ANGLE_FULL / (2 * Math.PI))) % ANGLE_FULL) + ANGLE_FULL) % ANGLE_FULL;
}

/** Independent reference result: a fresh tracker fed the same seed/target/speed. */
export function expectedSmoothed(seed: number, target: number, turnSpeed: number, deltaMs = CLIENT_CYCLE_MS): number {
  const tracker = new NpcVisualTracker(seed, turnSpeed);
  tracker.setTarget(target);
  return tracker.advance(deltaMs).facingAngle;
}

function makeNpcModelData(npcId: number, size: number, rotationSpeed: number): NpcModelData {
  return {
    npcId,
    npcName: `Test NPC ${npcId}`,
    modelIds: [],
    models: [],
    mergedModel: null,
    litColors: null,
    lighting: { ambient: 0, contrast: 0, lightX: 0, lightY: 0, lightZ: 0 },
    size,
    widthScale: 128,
    heightScale: 128,
    rotationSpeed,
    walkSeqId: -1,
    turnLeftSeqId: -1,
    turnRightSeqId: -1,
  };
}

export function typeEntry(npcTypeId: number, size: number, rotationSpeed: number, bossDeathAnimationEnabled = false) {
  return {
    npcTypeId,
    modelData: makeNpcModelData(npcTypeId, size, rotationSpeed),
    litColors: null,
    baseMeshCommands: [],
    faceSplitMap: null,
    splitBuffers: null,
    modelBounds: null,
    animationSet: null,
    restVerticesX: null,
    restVerticesY: null,
    restVerticesZ: null,
    restFaceAlphas: null,
    size,
    widthScale: 128,
    heightScale: 128,
    transparentFaceMap: null,
    alphaAnimated: false,
    unsortedTransparentStatic: null,
    bossDeathAnimationEnabled,
    deathDurationMs: null,
  };
}

export interface MutableInstance {
  actorId: string;
  currentModelMatrix: Float32Array;
  lastRenderPosition?: [number, number];
  lastRenderSize?: number;
  lastRenderFacingAngle?: number;
  currentFacingIntent?: NpcRenderFacingIntent;
}

function makeInstance(actorId: ActorId, npcTypeId: number, opts: SeedConfig) {
  const modelMatrix = new Float32Array(16);
  const meshCommand: NpcMesh3DCommand = {
    kind: 'mesh3d',
    meshId: `npc-${npcTypeId}-body-${actorId}`,
    materialId: `npc-${npcTypeId}-material`,
    modelMatrix,
    positions: new Float32Array(),
    normals: new Float32Array(),
  };
  return {
    actorId,
    npcTypeId,
    currentModelMatrix: modelMatrix,
    instanceMeshCommands: [meshCommand],
    transparentSortDirty: false,
    animController: null,
    modelAdapter: null,
    animatedModel: null,
    originalVerticesX: null,
    originalVerticesY: null,
    originalVerticesZ: null,
    originalFaceAlphas: null,
    posedVerticesX: null,
    posedVerticesY: null,
    posedVerticesZ: null,
    instanceFaceSplitMap: null,
    instanceSplitBuffers: null,
    alphaAnimated: false,
    dynamicTransparentFaceMap: null,
    dynamicTransparentStatic: null,
    dynamicFaceAlphas: null,
    dynamicFaceColors3: null,
    lastAttackTriggerTick: -1,
    permuteSortOutputBuffers: null,
    lastRenderPosition: opts.position,
    lastRenderSize: opts.size,
    lastRenderFacingAngle: opts.facing,
    currentFacingIntent: opts.intent,
  };
}

export interface SeedConfig {
  actorId: ActorId;
  npcTypeId: number;
  position: [number, number];
  size: number;
  facing: number;
  rotationSpeed: number;
  intent?: NpcRenderFacingIntent;
  bossDeathAnimationEnabled?: boolean;
}

function typeRegistry(manager: NpcInstanceManager): Map<number, unknown> {
  return Reflect.get(manager, TYPE_REGISTRY_KEY) as Map<number, unknown>;
}

function instanceRegistry(manager: NpcInstanceManager): Map<string, MutableInstance> {
  return Reflect.get(manager, INSTANCE_REGISTRY_KEY) as Map<string, MutableInstance>;
}

/** Register the type (once) and seed a ready render instance directly. */
export function seed(manager: NpcInstanceManager, config: SeedConfig): void {
  if (!typeRegistry(manager).has(config.npcTypeId)) {
    typeRegistry(manager).set(
      config.npcTypeId,
      typeEntry(config.npcTypeId, config.size, config.rotationSpeed, config.bossDeathAnimationEnabled),
    );
  }
  instanceRegistry(manager).set(config.actorId, makeInstance(config.actorId, config.npcTypeId, config));
}

export function registerType(
  manager: NpcInstanceManager,
  npcTypeId: number,
  size: number,
  rotationSpeed: number,
): void {
  typeRegistry(manager).set(npcTypeId, typeEntry(npcTypeId, size, rotationSpeed));
}

/** The applied render facing (what `setInstanceFacingAngle` wrote this frame). */
export function appliedAngle(manager: NpcInstanceManager, actorId: ActorId): number | undefined {
  return instanceRegistry(manager).get(actorId)?.lastRenderFacingAngle;
}

export function trackerFor(manager: NpcInstanceManager, actorId: ActorId): NpcVisualTracker | undefined {
  const controller = Reflect.get(manager, FACING_CONTROLLER_KEY) as {
    get(id: ActorId): NpcVisualTracker | undefined;
  };
  return controller.get(actorId);
}

/** A live instance for direct mutation; throws (no `!`) if the id is absent. */
export function mutableInstance(manager: NpcInstanceManager, actorId: ActorId): MutableInstance {
  const instance = instanceRegistry(manager).get(actorId);
  if (!instance) {
    throw new Error(`no seeded instance for ${actorId}`);
  }
  return instance;
}

export function deleteInstance(manager: NpcInstanceManager, actorId: ActorId): void {
  instanceRegistry(manager).delete(actorId);
}

export function setPrimaryConfig(manager: NpcInstanceManager): void {
  manager.setPrimaryNpcRenderConfig({
    actorId: 'primary-npc',
    npcTypeId: PRIMARY_TYPE_ID,
    basePosition: PRIMARY_BASE_POS,
    size: PRIMARY_SIZE,
    deathSeqId: 1,
    deathRetentionTicks: 1,
  });
}

export interface SnapshotConfig {
  id: ActorId;
  npcTypeId: number;
  position: [number, number];
  size: number;
  role?: NpcRole;
  alive?: boolean;
  /**
   * Simulation facing angle. Also the `turn-to-angle` target, since the renderer
   * derives that intent from this field - vary it across snapshots to make an NPC turn.
   */
  facingAngle?: number;
  intent?: NpcRenderFacingIntent;
}

/**
 * Builds a snapshot carrying the simulation FACTS that produce `config.intent`.
 * The renderer derives intent itself (see `deriveNpcRenderFacingIntent`), so tests
 * still describe the behavior they want while the snapshot stays render-free.
 */
export function makeSnapshot(config: SnapshotConfig): NpcSnapshot {
  const intent = config.intent;
  return {
    id: config.id,
    npcTypeId: config.npcTypeId,
    archetypeId: 'test',
    role: config.role ?? 'minion',
    alive: config.alive ?? true,
    position: config.position,
    previousPosition: config.position,
    facingAngle: config.facingAngle ?? (intent?.kind === 'turn-to-angle' ? intent.angle : 0),
    size: config.size,
    hp: 10,
    maxHp: 10,
    ...(intent?.kind === 'fixed' ? { lockedFacing: intent.angle } : {}),
    combatTargetId: intent?.kind === 'track-actor' ? intent.targetId : null,
  };
}
