import { describe, expect, it } from 'vitest';

import { PLAYER_LANDING_MIN } from '../../../encounters/yamaP3/constants';
import { YamaEncounter } from '../../../encounters/yamaP3/YamaEncounter';
import type { Coordinate, SimulationState } from '../../../types/simulation';
import { SimulationEngine } from '../../SimulationEngine';
import type { Encounter } from '../types';

/**
 * Framework-wide behavior lock: no refactor may change what the simulation DOES on a fixed seed.
 * NPC identity is digested as the actor id; `archetypeId` is deliberately NOT digested.
 *
 * If a digest changes, that is a real behavior change: investigate before updating. Do NOT
 * blanket `vitest -u` this file.
 */

const TICKS = 90;

/**
 * Object keys are sorted at every depth so key order can never move a digest. Long arrays collapse
 * to `len=N h=<hash>` so failures remain sensitive to element changes without unreadable diffs.
 */
function digestValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    const parts = value.map(digestValue);
    if (parts.length > 8) return `[len=${parts.length} h=${hash(parts.join(','))}]`;
    return `[${parts.join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${digestValue(v)}`).join(',')}}`;
}

/** FNV-1a, hex. Only needs to be stable and collision-resistant enough to catch a changed tile. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Namespaced so a key present in both halves cannot shadow its twin. */
function encounterPayloadDigest(state: SimulationState): string {
  return `state=${digestValue(state.encounter.state)} visuals=${digestValue(state.encounter.visuals)}`;
}

function tickDigest(state: SimulationState): string {
  const npcs = [...state.npcs]
    .filter((npc) => npc.alive)
    .map((npc) => `${npc.id}@${npc.position[0]},${npc.position[1]}#${npc.hp}`)
    .sort()
    .join(' ');
  // Only THIS tick's events: the engine's eventLog is cumulative, so digesting all of it would
  // restate every prior tick and bury the one entry that actually changed.
  const events = [...new Set(state.eventLog.filter((e) => e.tick === state.currentTick).map((e) => e.type))]
    .sort()
    .join(',');
  const player = `${state.playerPosition[0]},${state.playerPosition[1]}#${state.playerHP}${state.isAlive ? '' : ' DEAD'}`;
  const kind = state.encounter.kind;
  return [
    `t=${state.currentTick}`,
    `kind=${String(kind)}`,
    `player=${player}`,
    `npcs=[${npcs}]`,
    `outcome=${state.encounterOutcome.phase}`,
    `fail=${state.failedCondition ?? '-'}`,
    `payload=${encounterPayloadDigest(state)}`,
    `events=${events}`,
  ].join(' | ');
}

function runDigests(encounter: Encounter, startPos: Coordinate): string[] {
  const engine = new SimulationEngine({ encounter, startPos: [...startPos] as Coordinate });
  // Infinite health: a standing-still player otherwise dies within ~15 ticks and the engine
  // stops advancing, collapsing the rest of the window into identical digests.
  engine.setMechanicsConfig({ infiniteHealth: true });
  const stand: Coordinate = [...startPos] as Coordinate;
  const digests: string[] = [tickDigest(engine.getState())];
  for (let i = 0; i < TICKS; i += 1) {
    engine.advanceTick(stand);
    digests.push(tickDigest(engine.getState()));
  }
  return digests;
}

describe('encounter framework determinism (refactor lock)', () => {
  it('locks Yama P3 tick behavior', () => {
    expect(runDigests(new YamaEncounter(undefined, 0), PLAYER_LANDING_MIN)).toMatchSnapshot();
  });

  it('resetting captured seeds reproduces the constructor-seeded Yama 90-tick digest', () => {
    const constructorSeeded = new YamaEncounter(undefined, 0x1234abcd);
    const resetSeeded = new YamaEncounter(undefined, 17);
    resetSeeded.reset(constructorSeeded.getSeeds());

    expect(runDigests(resetSeeded, PLAYER_LANDING_MIN)).toEqual(runDigests(constructorSeeded, PLAYER_LANDING_MIN));
  });
});
