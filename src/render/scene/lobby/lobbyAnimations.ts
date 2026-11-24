import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import type { NpcModelLoader } from '../../../rs/model/NpcModelLoader';
import { YAMA_NPC_ID } from '../../../rs/model/NpcModelLoader';
import type { NpcSnapshot, NpcState } from '../../../types/simulation';
import type { AnimationSystem } from '../../core/animation';
import type { RenderQueue } from '../../core/commands';
import { PRIMARY_NPC_ACTOR_ID } from '../../npc/NpcInstanceManager';
import { LOBBY_EFFECT_METADATA } from '../lobbyEffectConfig';
import type { RenderContext } from '../types';
import type { EmbeddedMeshCommand } from './lobbyShared';
import { LOBBY_DISPLAY_SIZE } from './lobbyShared';

export interface LobbyEffectState {
  disabledEffects: Set<string>;
  effectAlphas: Map<string, number>;
}

export interface LobbyAnimatedEffectOptions extends LobbyEffectState {
  nativeMaxAlphas: Map<string, number>;
}

export interface LobbyNpcSyncTarget {
  syncInstances(npcs: NpcSnapshot[]): void;
}

export interface LobbyNpcLoadTarget {
  loadNpcType(npcTypeId: number, npcModelLoader: NpcModelLoader, animSystem?: AnimationSystem): Promise<void>;
}

export const LOBBY_BOSS_SNAPSHOTS: NpcState[] = LOBBY_BOSS_NPCS.map((boss) => ({
  id: boss.actorId,
  npcTypeId: boss.npcTypeId,
  archetypeId: `lobby-${boss.actorId}`,
  role: 'boss' as const,
  alive: true,
  position: boss.position,
  previousPosition: boss.position,
  facingAngle: boss.facingAngle,
  size: boss.displaySize ?? LOBBY_DISPLAY_SIZE,
  hp: 1,
  maxHp: 1,
  history: new Map(),
}));

export function buildLobbyRenderContext(ctx: RenderContext): RenderContext {
  return {
    ...ctx,
    options: {
      ...ctx.options,
      encounterDebugFlags: {},
    },
    simulationState: {
      ...ctx.simulationState,
      npcs: [...ctx.simulationState.npcs, ...LOBBY_BOSS_SNAPSHOTS],
    },
  };
}

/** The render instance a lobby NPC syncs to: Yama's model is the primary NPC instance. */
export function lobbyNpcRenderId(npc: Pick<NpcSnapshot, 'id' | 'npcTypeId'>): string {
  return npc.npcTypeId === YAMA_NPC_ID ? PRIMARY_NPC_ACTOR_ID : npc.id;
}

export function syncLobbyNpcInstances(target: LobbyNpcSyncTarget, npcs: NpcSnapshot[], is2D: boolean): void {
  if (is2D) {
    return;
  }

  target.syncInstances(
    npcs.map((npc) => {
      const id = lobbyNpcRenderId(npc);
      return id === npc.id ? npc : { ...npc, id };
    }),
  );
}

export async function loadLobbyBossNpcTypes(
  target: LobbyNpcLoadTarget,
  npcModelLoader: NpcModelLoader,
  animSystem?: AnimationSystem,
): Promise<void> {
  for (const boss of LOBBY_BOSS_NPCS) {
    await target.loadNpcType(boss.npcTypeId, npcModelLoader, animSystem);
  }
}

export function parseLobbyEffectState(flags: Record<string, boolean | number>): LobbyEffectState {
  const disabledEffects = new Set<string>();
  const effectAlphas = new Map<string, number>();

  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith('lobby_') && value === false) {
      disabledEffects.add(key.slice(6));
    }

    if (key.startsWith('lobby_') && key.endsWith('_alpha') && typeof value === 'number') {
      effectAlphas.set(key.slice(6, -6), value);
    }
  }

  return { disabledEffects, effectAlphas };
}

export function pushAnimatedLobbyEffect(
  queue: RenderQueue,
  key: string,
  cmd: EmbeddedMeshCommand | null,
  options: LobbyAnimatedEffectOptions,
): void {
  if (!cmd || options.disabledEffects.has(key)) return;

  let nativeMax = options.nativeMaxAlphas.get(cmd.meshId);
  if (nativeMax === undefined) {
    nativeMax = 1.0;
    if (cmd.perVertexAlphas && cmd.perVertexAlphas.length > 0) {
      nativeMax = 0;
      for (let i = 0; i < cmd.perVertexAlphas.length; i++) {
        if (cmd.perVertexAlphas[i] > nativeMax) {
          nativeMax = cmd.perVertexAlphas[i];
        }
      }
    }
    options.nativeMaxAlphas.set(cmd.meshId, nativeMax);
  }

  const userAlpha = options.effectAlphas.get(key);
  const metadata = LOBBY_EFFECT_METADATA[key];
  let alpha: number;

  if (userAlpha !== undefined) {
    alpha = userAlpha;
  } else if (metadata?.animatedAlpha) {
    alpha = metadata.animatedAlpha();
  } else {
    queue.commands.push(cmd);
    return;
  }

  if (Math.abs(alpha - nativeMax) < 0.005) {
    queue.commands.push(cmd);
    return;
  }

  const cloned: EmbeddedMeshCommand = { ...cmd };
  if (cloned.perVertexAlphas && nativeMax > 0) {
    const scale = alpha / nativeMax;
    const alphas = new Float32Array(cloned.perVertexAlphas);
    for (let i = 0; i < alphas.length; i++) {
      alphas[i] = Math.min(1.0, alphas[i] * scale);
    }
    cloned.perVertexAlphas = alphas;
  } else if (cloned.positions) {
    const vertexCount = cloned.positions.length / 3;
    const alphas = new Float32Array(vertexCount);
    alphas.fill(alpha);
    cloned.perVertexAlphas = alphas;
  }

  cloned.blend = 'normal';
  cloned.meshId = `${cmd.meshId}-a${Math.round(alpha * 100)}`;
  queue.commands.push(cloned);
}

export function pushAnimatedLobbyEffects(
  queue: RenderQueue,
  key: string,
  commands: EmbeddedMeshCommand[],
  options: LobbyAnimatedEffectOptions,
): void {
  if (options.disabledEffects.has(key)) return;
  for (const command of commands) {
    pushAnimatedLobbyEffect(queue, key, command, options);
  }
}
