import { describe, expect, it } from 'vitest';
import { LobbyEncounter } from '../../../encounters/lobby/LobbyEncounter';
import { encounterRegistry } from '../../../encounters/registry';
import { YAMA_SET_OPENING_MAGIC_COMMAND, YAMA_SPAWN_VOID_FLARE_COMMAND } from '../../../encounters/yamaP3/commands';
import { PLAYER_LANDING_MIN } from '../../../encounters/yamaP3/constants';
import { YamaEncounter } from '../../../encounters/yamaP3/YamaEncounter';
import { ZUK_SPAWN_SET_COMMAND } from '../../../encounters/zuk/commands';
import type { Coordinate } from '../../../types/simulation';
import { SimulationEngine } from '../../SimulationEngine';
import { WorldState } from '../../WorldState';

function requireWorld(engine: SimulationEngine): WorldState {
  const candidate: unknown = Reflect.get(engine, 'worldState');
  if (!(candidate instanceof WorldState)) throw new Error('Expected SimulationEngine world state');
  return candidate;
}

function actorIds(engine: SimulationEngine): string[] {
  return [...requireWorld(engine).actors.keys()];
}

function expectNoDuplicateIds(engine: SimulationEngine): void {
  const ids = actorIds(engine);
  expect(ids).toEqual([...new Set(ids)]);
}

function advance(engine: SimulationEngine, ticks: number, stand: Coordinate): void {
  for (let tick = 0; tick < ticks; tick += 1) engine.advanceTick([...stand]);
}

describe('encounter actor lifecycle', () => {
  it('builds the Inferno at wave 69 with its boss and glyph, and accepts its recorded set layout', () => {
    const engine = new SimulationEngine({
      encounter: encounterRegistry.create('inferno'),
      mechanics: { infernoStartWave: '69' },
    });
    expect(
      requireWorld(engine)
        .getNpcs()
        .map((npc) => npc.id)
        .sort(),
    ).toEqual(['zuk', 'zuk_shield']);

    expect(engine.executeEncounterCommand(ZUK_SPAWN_SET_COMMAND)).toBe(true);

    expect(
      requireWorld(engine)
        .getNpcs()
        .filter((npc) => npc.role === 'minion'),
    ).toHaveLength(2);
    expectNoDuplicateIds(engine);
  });

  it('refuses Inferno constructor options by name rather than as an unknown kind', () => {
    expect(() => encounterRegistry.create('inferno', { shieldDirection: 'west' })).toThrow(
      /accepts no constructor options; got: shieldDirection/,
    );
  });

  it('allocates fresh ids across interleaved Yama debug and production void flares', () => {
    const engine = new SimulationEngine({
      encounter: new YamaEncounter(undefined, 0),
      startPos: [...PLAYER_LANDING_MIN],
    });
    engine.setMechanicsConfig({ infiniteHealth: true });

    for (let index = 0; index < 8; index += 1) {
      engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
      advance(engine, 10, PLAYER_LANDING_MIN);
      expectNoDuplicateIds(engine);
    }
    const flares = actorIds(engine).filter((id) => id.startsWith('vf-'));
    expect(flares).toEqual([...new Set(flares)]);
  });

  it('recreates actors after an engine reset without duplicate ids', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(undefined, 0) });
    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    const originalBoss = requireWorld(engine).getNpc('yama');

    engine.reset([...PLAYER_LANDING_MIN]);
    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);

    expect(requireWorld(engine).getNpc('yama')).not.toBe(originalBoss);
    expectNoDuplicateIds(engine);
    expect(
      requireWorld(engine)
        .getNpcs()
        .filter((npc) => npc.archetypeId === 'voidflare'),
    ).toHaveLength(1);
  });

  it('rejects recorded Zuk commands in Yama without mutation', () => {
    const yama = new SimulationEngine({
      encounter: new YamaEncounter(undefined, 0),
      startPos: [...PLAYER_LANDING_MIN],
    });
    const before = actorIds(yama);

    const accepted = yama.executeEncounterCommand(ZUK_SPAWN_SET_COMMAND);

    expect(accepted).toBe(false);
    expect(actorIds(yama)).toEqual(before);
  });

  it('accepts Yama commands for every registered Yama variant and rejects commands in the lobby', () => {
    for (const kind of encounterRegistry.getRegisteredKinds().filter((candidate) => candidate.startsWith('yama_p3'))) {
      const engine = new SimulationEngine({ encounter: encounterRegistry.create(kind) });
      expect(engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND), kind).toBe(true);
    }

    const lobby = new SimulationEngine({ encounter: new LobbyEncounter() });
    const before = actorIds(lobby);
    expect(lobby.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND)).toBe(false);
    expect(lobby.executeEncounterCommand(ZUK_SPAWN_SET_COMMAND)).toBe(false);
    expect(actorIds(lobby)).toEqual(before);
  });
});
