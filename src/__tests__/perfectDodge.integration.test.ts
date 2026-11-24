import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../core/SimulationEngine';
import { RUNE } from '../data/spellRunes';
import type { FireballAngle } from '../encounters/yamaP3/constants';
import { DEFAULT_YAMA_ATTACK_PATTERN, getFireballBurstCycleTicks } from '../encounters/yamaP3/constants';
import { getFireballPerfectDodgeTiles } from '../encounters/yamaP3/fireball';
import { YamaEncounter } from '../encounters/yamaP3/YamaEncounter';
import type { CacheInfo } from '../rs/cache/CacheInfo';
import { ObjType } from '../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../rs/config/objtype/ObjTypeLoader';
import { parseInventoryFromSetup } from '../types/inventory';
import type { Coordinate, SimulationEvent } from '../types/simulation';
import { EventType } from '../types/simulation';

const PERFECT_DODGE_WEAPON_ID = 50_004;
const PLAYER_START_POS: Coordinate = [34, 32];

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2024-01-01T00:00:00Z',
  size: 0,
};

const createPerfectDodgeWeaponLoader = (): ObjTypeLoader => ({
  load(id: number): ObjType {
    if (id !== PERFECT_DODGE_WEAPON_ID) {
      throw new Error(`Unknown test item ${id}`);
    }

    const obj = new ObjType(id, MOCK_CACHE_INFO);
    obj.wearPos1 = 3;
    obj.maleModel0 = 1;
    obj.inventoryActions = ['Wield', undefined, undefined, undefined, undefined];
    obj.params = new Map([
      [13, 10],
      [14, 4],
    ]);
    return obj;
  },
  getCount: () => 1,
  clearCache: () => {},
});

const parseFireballAngle = (angle: string): FireballAngle => {
  if (angle === 'vertical' || angle === 'horizontal' || angle === 'diagonal' || angle === 'diagonal-alt') {
    return angle;
  }
  throw new Error(`Unexpected fireball angle ${angle}`);
};

const isFireballSpawnEvent = (
  event: SimulationEvent,
): event is Extract<SimulationEvent, { type: EventType.FIREBALL_SPAWN }> => event.type === EventType.FIREBALL_SPAWN;

describe('Yama perfect dodge integration', () => {
  it('speeds the next player auto-attack by exactly one tick through SimulationEngine', () => {
    type PerfectDodgeRun = {
      readonly dodgeTick: number;
      readonly nextAttackTickAfterExplosion: number;
      readonly nextAttackStartedTick: number;
      readonly perfectDodgeEventCount: number;
    };

    const runPerfectDodgeScenario = (withMarkOfDarkness: boolean): PerfectDodgeRun => {
      const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_START_POS });
      engine.setObjTypeLoader(createPerfectDodgeWeaponLoader());
      engine.setEquipment({ weapon: PERFECT_DODGE_WEAPON_ID });
      engine.setMechanicsConfig({
        yamaMageRange: false,
        yamaMelee: false,
        waves: false,
        fireballs: true,
        voidFlares: false,
        infiniteHealth: true,
      });
      if (withMarkOfDarkness) {
        // The engine gates the cast on the spell's runes; this bare harness carries none otherwise.
        engine.setInventory(parseInventoryFromSetup([{ id: RUNE.cosmic }, { id: RUNE.soul }]));
        engine.castMarkOfDarkness();
      }
      engine.setAttackTarget('yama');

      const firstFireballCaptureTick = getFireballBurstCycleTicks(DEFAULT_YAMA_ATTACK_PATTERN)[0] - 1;
      while (engine.getState().currentTick < firstFireballCaptureTick) {
        engine.advanceTick(PLAYER_START_POS);
      }

      expect(engine.getPlayerNextAttackTick('player')).toBeGreaterThan(engine.getState().currentTick);

      const spawnEvent = engine.getEventLog().find((event) => isFireballSpawnEvent(event) && event.phaseIndex === 0);
      expect(spawnEvent).toBeDefined();
      if (!spawnEvent || !isFireballSpawnEvent(spawnEvent)) {
        throw new Error('Expected first fireball spawn event');
      }
      expect(spawnEvent.centerPosition).toEqual(PLAYER_START_POS);

      const fireballAngle = parseFireballAngle(spawnEvent.angle);
      const dodgeTile = getFireballPerfectDodgeTiles(spawnEvent.centerPosition, fireballAngle)[0];
      const impactTick = spawnEvent.tick + 3;
      const dodgeTick = spawnEvent.tick + 4;

      while (engine.getState().currentTick < impactTick - 1) {
        engine.advanceTick(PLAYER_START_POS);
      }

      engine.setAttackTarget(null);
      engine.advanceTick(dodgeTile);
      expect(engine.getState().currentTick).toBe(impactTick);
      expect(engine.getState().playerPosition).toEqual(dodgeTile);

      engine.setAttackTarget('yama');
      engine.advanceTick(dodgeTile);
      expect(engine.getState().currentTick).toBe(dodgeTick);

      const perfectDodgeEvents = engine.getLastTickEvents().filter((event) => event.type === 'yama_perfect_dodge');
      const nextAttackTickAfterExplosion = engine.getPlayerNextAttackTick('player');

      let nextAttackStartedTick = -1;
      while (engine.getState().currentTick < dodgeTick + 4) {
        engine.advanceTick(dodgeTile);
        const attackEvent = engine
          .getLastTickEvents()
          .find((event) => event.type === 'attack_started' && event.sourceId === 'player');
        if (attackEvent) {
          nextAttackStartedTick = attackEvent.tick;
          break;
        }
      }

      return {
        dodgeTick,
        nextAttackTickAfterExplosion,
        nextAttackStartedTick,
        perfectDodgeEventCount: perfectDodgeEvents.length,
      };
    };

    const dodgeRun = runPerfectDodgeScenario(true);
    const controlRun = runPerfectDodgeScenario(false);

    expect(dodgeRun.perfectDodgeEventCount).toBe(1);
    expect(controlRun.perfectDodgeEventCount).toBe(0);
    expect(dodgeRun.nextAttackTickAfterExplosion).toBe(controlRun.nextAttackTickAfterExplosion - 1);
    expect(dodgeRun.nextAttackStartedTick).toBe(dodgeRun.nextAttackTickAfterExplosion);
    expect(controlRun.nextAttackStartedTick).toBe(controlRun.nextAttackTickAfterExplosion);
    expect(dodgeRun.nextAttackStartedTick).toBe(controlRun.nextAttackStartedTick - 1);
    expect(dodgeRun.dodgeTick).toBe(controlRun.dodgeTick);
  });
});
