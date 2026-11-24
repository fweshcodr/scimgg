import { LOBBY_BOSS_NPCS } from '../../../encounters/lobby/metadata';
import type { Mesh3DCommand } from '../../core/commands';

export interface EmbeddedMeshCommand extends Mesh3DCommand {
  positions: Float32Array;
  normals: Float32Array;
  perVertexHslColors: Float32Array;
  perVertexAlphas?: Float32Array;
  indices?: Uint16Array | Uint32Array;
}

export interface FallenColumnEndpoint {
  x: number;
  y: number;
}

export interface LobbyRenderContext {
  baseZ: number;
}

export interface LobbyEnvironmentBuildState extends LobbyRenderContext {
  fallenColumnEndpoints: FallenColumnEndpoint[];
}

export const LOBBY_MAP_X = 25;
export const LOBBY_MAP_Y = 73;
export const LOBBY_LEVEL = 0;
export const YAMA_LOBBY_ACTOR_ID = 'lobby-npc-1';
export const LOBBY_DISPLAY_SIZE = 3;

export const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export const ARENA_CENTER_X = 31.5;
export const ARENA_CENTER_Y = 25.5;

export const LIGHT_DIR_X = -0.4;
export const LIGHT_DIR_Y = 0.3;
export const LIGHT_DIR_Z = -0.85;

export function getLobbyBossCenter(index: number): { x: number; y: number } {
  const boss = LOBBY_BOSS_NPCS[index];
  return {
    x: boss.position[0] + LOBBY_DISPLAY_SIZE / 2,
    y: boss.position[1] + LOBBY_DISPLAY_SIZE / 2,
  };
}

export function isLobbyBossAvailable(boss: { available?: boolean }): boolean {
  return boss.available === true;
}

export function faceLuminanceShift(nx: number, ny: number, nz: number): number {
  const dot = nx * LIGHT_DIR_X + ny * LIGHT_DIR_Y + nz * LIGHT_DIR_Z;
  return Math.round(-dot * 7);
}

export function hash(x: number, y: number): number {
  let h = Math.imul(x ^ 0x5bd1e995, 0x5bd1e995);
  h ^= Math.imul(y ^ 0x5bd1e995, 0x5bd1e995);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return h >>> 0;
}
