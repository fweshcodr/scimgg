import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import { YAMA_NPC_ID } from '../../../rs/model/NpcModelLoader';
import { packHsl } from '../../../rs/util/ColorUtil';
import type { Mesh3DCommand } from '../../core/commands';
import { PRIMARY_NPC_ACTOR_ID } from '../../npc/NpcInstanceManager';
import { getLocCenterHeight } from '../../shared/renderUtils';
import type { NpcHitTestData } from '../types';
import { LOBBY_DISPLAY_SIZE, unpackHsl, YAMA_LOBBY_ACTOR_ID } from './lobbyShared';

type LobbyMeshCommand = Mesh3DCommand & {
  /** Model-space vertex positions of the geometry being drawn, as `[x, y, z, ...]`. */
  positions?: Float32Array;
  perVertexHslColors?: Float32Array;
  perVertexAlphas?: Float32Array;
};

export interface LobbyNpcInstanceManagerLike {
  getNpcTypeSize(npcTypeId: number): number | null | undefined;
  getTerrainHeights(): Int32Array[] | null;
  setInstanceModelMatrix(actorId: string, modelMatrix: Float32Array): void;
  getInstanceMeshCommands(actorId: string): LobbyMeshCommand[] | null | undefined;
}

export type LobbyCelShadedCache = Map<string, { colors: Float32Array; alphas: Float32Array }>;

/** Per-actor plinth placement is measured once per scene; remeasuring idle animation frames makes the statue slide. */
export type LobbyFootprintCache = Map<string, PosedFootprint>;

export function forceTransparentPlayerMeshToOpaque(command: Mesh3DCommand): Mesh3DCommand {
  if (!command.meshId.startsWith('player-model-') || !command.meshId.endsWith('-transparent')) {
    return command;
  }

  const { blend: _blend, ...rest } = command;
  return {
    ...rest,
    depth: 'readwrite',
  };
}

/**
 * Share of the silhouette's height, measured up from its lowest point, treated as the
 * model's ground-contact base.
 */
const FOOTPRINT_SLAB_FRACTION = 0.15;

/** Where an instance's drawn geometry meets the floor, in OSRS model units. */
interface PosedFootprint {
  /** Mean position of the base geometry (`x` = east/west, `z` = north/south). */
  centerX: number;
  centerZ: number;
  /** Lowest point. OSRS model space is `-Y = up`, so positive means below the origin plane. */
  bottomY: number;
}

/**
 * Measure one posed frame because rest-pose bounds omit animation and NpcType resize.
 * Use a thin ground-slab mean instead of the full silhouette so limbs do not shift the plinth anchor.
 */
function measurePosedFootprint(commands: LobbyMeshCommand[] | null | undefined): PosedFootprint | null {
  if (!commands || commands.length === 0) return null;

  let topY = Infinity;
  let bottomY = -Infinity;
  for (const command of commands) {
    const positions = command.positions;
    if (!positions) continue;
    for (let i = 1; i < positions.length; i += 3) {
      const y = positions[i];
      if (y < topY) topY = y;
      if (y > bottomY) bottomY = y;
    }
  }
  if (bottomY === -Infinity) return null;

  const slabTop = bottomY - (bottomY - topY) * FOOTPRINT_SLAB_FRACTION;
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (const command of commands) {
    const positions = command.positions;
    if (!positions) continue;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] < slabTop) continue;
      sumX += positions[i];
      sumZ += positions[i + 2];
      count++;
    }
  }
  if (count === 0) return { centerX: 0, centerZ: 0, bottomY };
  return { centerX: sumX / count, centerZ: sumZ / count, bottomY };
}

export function applyLobbyBossTransforms(
  npcInstanceManager: LobbyNpcInstanceManagerLike,
  celShadedCache: LobbyCelShadedCache,
  footprintCache: LobbyFootprintCache,
): void {
  for (const boss of LOBBY_BOSS_NPCS) {
    const actorId = boss.npcTypeId === YAMA_NPC_ID ? PRIMARY_NPC_ACTOR_ID : boss.actorId;
    const naturalSize = npcInstanceManager.getNpcTypeSize(boss.npcTypeId) || 1;
    const scaleFactor = (boss.displaySize ?? LOBBY_DISPLAY_SIZE) / naturalSize;
    const scale = (1 / 128) * scaleFactor;
    const theta = (boss.facingAngle / 2048) * 2 * Math.PI;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const meshCommands = npcInstanceManager.getInstanceMeshCommands(actorId);
    let footprint = footprintCache.get(actorId);
    if (!footprint) {
      footprint = measurePosedFootprint(meshCommands) ?? undefined;
      if (footprint) footprintCache.set(actorId, footprint);
    }

    // The renderer pins authored pivots at tile centers; lobby plinths center the rotated ground-contact base instead.
    const modelLift = (footprint?.bottomY ?? 0) * scale;
    const centerOffsetX = scale * (cos * (footprint?.centerX ?? 0) + sin * (footprint?.centerZ ?? 0));
    const centerOffsetY = scale * (-sin * (footprint?.centerX ?? 0) + cos * (footprint?.centerZ ?? 0));

    const tx = boss.position[0] + LOBBY_DISPLAY_SIZE / 2 - centerOffsetX;
    const ty = boss.position[1] + LOBBY_DISPLAY_SIZE / 2 - centerOffsetY;
    const tz =
      getLocCenterHeight(
        npcInstanceManager.getTerrainHeights(),
        boss.position[0],
        boss.position[1],
        LOBBY_DISPLAY_SIZE,
        LOBBY_DISPLAY_SIZE,
      ) + modelLift;

    npcInstanceManager.setInstanceModelMatrix(
      actorId,
      new Float32Array([
        scale * cos,
        -scale * sin,
        0,
        0,
        0,
        0,
        -scale,
        0,
        scale * sin,
        scale * cos,
        0,
        0,
        tx,
        ty,
        tz,
        1,
      ]),
    );

    if ((boss as { available?: boolean }).available === true) {
      continue;
    }

    if (!meshCommands) {
      continue;
    }

    for (const command of meshCommands) {
      if (command.perVertexHslColors) {
        let cached = celShadedCache.get(command.meshId);
        if (!cached || cached.colors.length !== command.perVertexHslColors.length) {
          const colors = new Float32Array(command.perVertexHslColors);
          const sourceAlphas = command.perVertexAlphas;
          const alphas = sourceAlphas ? new Float32Array(sourceAlphas) : new Float32Array(colors.length);
          if (!sourceAlphas) {
            alphas.fill(1.0);
          }

          for (let i = 0; i < colors.length; i++) {
            const { l } = unpackHsl(colors[i]);
            const luminance = l / 254;
            const band =
              luminance >= 0.82
                ? 5
                : luminance >= 0.65
                  ? 4
                  : luminance >= 0.47
                    ? 3
                    : luminance >= 0.3
                      ? 2
                      : luminance >= 0.14
                        ? 1
                        : 0;
            let finalS = 160;
            let finalL = 64;
            let alphaValue = 0.72;

            if (band === 0) {
              finalS = 0;
              finalL = 6;
              alphaValue = 0.28;
            } else if (band === 1) {
              finalS = 0;
              finalL = 14;
              alphaValue = 0.34;
            } else if (band === 2) {
              finalS = 32;
              finalL = 22;
              alphaValue = 0.42;
            } else if (band === 3) {
              finalL = 34;
              alphaValue = 0.52;
            } else if (band === 4) {
              finalL = 48;
              alphaValue = 0.62;
            }

            colors[i] = packHsl(0, finalS, finalL);
            const originalAlpha = sourceAlphas ? sourceAlphas[i] : 1.0;
            alphas[i] = originalAlpha < 0.01 ? 0 : Math.min(1.0, alphaValue * originalAlpha);
          }

          cached = { colors, alphas };
          celShadedCache.set(command.meshId, cached);
        }

        command.perVertexHslColors = cached.colors;
        command.perVertexAlphas = cached.alphas;
      } else if (command.perVertexAlphas) {
        let cached = celShadedCache.get(command.meshId);
        if (!cached || cached.alphas.length !== command.perVertexAlphas.length) {
          const alphas = new Float32Array(command.perVertexAlphas);
          for (let i = 0; i < alphas.length; i++) {
            alphas[i] *= 0.65;
          }
          cached = { colors: new Float32Array(0), alphas };
          celShadedCache.set(command.meshId, cached);
        }
        command.perVertexAlphas = cached.alphas;
      }
    }
  }
}

export function remapLobbyHitTestData(
  entries: Array<{ actorId: string; hitTestData: NpcHitTestData }>,
): Array<{ actorId: string; hitTestData: NpcHitTestData }> {
  return entries.map(({ actorId, hitTestData }) => ({
    actorId: actorId === PRIMARY_NPC_ACTOR_ID ? YAMA_LOBBY_ACTOR_ID : actorId,
    hitTestData,
  }));
}
