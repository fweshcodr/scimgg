import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../core/SimulationEngine';
import { YAMA_SET_OPENING_MAGIC_COMMAND, YAMA_SET_OPENING_RANGE_COMMAND } from '../encounters/yamaP3/commands';
import { YamaEncounter } from '../encounters/yamaP3/YamaEncounter';
import type { Coordinate } from '../types/simulation';

describe('Yama attack alternation (end-to-end via SimulationEngine)', () => {
  it('should produce strictly alternating range/mage in damage history (firstType=magic)', () => {
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate, // far from Yama = no melee
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    // Run 200 ticks (~3 full cycles)
    while (engine.getState().currentTick < 200 && engine.canAdvance()) {
      engine.advanceTick([34, 26]);
    }

    const state = engine.getState();
    const yamaAttacks = state.damageHistory
      .filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    expect(yamaAttacks.length).toBeGreaterThan(10);

    expect(yamaAttacks[0].attackType).toBe('magic');

    for (let i = 1; i < yamaAttacks.length; i++) {
      const prev = yamaAttacks[i - 1];
      const curr = yamaAttacks[i];
      expect(
        curr.attackType,
        `Damage #${i} at tick ${curr.tick} (${curr.attackType}) should differ from ` +
          `damage #${i - 1} at tick ${prev.tick} (${prev.attackType})`,
      ).not.toBe(prev.attackType);
    }
  });

  it('should produce strictly alternating range/mage in damage history (firstType=range)', () => {
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_RANGE_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    while (engine.getState().currentTick < 200 && engine.canAdvance()) {
      engine.advanceTick([34, 26]);
    }

    const state = engine.getState();
    const yamaAttacks = state.damageHistory
      .filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    expect(yamaAttacks.length).toBeGreaterThan(10);
    expect(yamaAttacks[0].attackType).toBe('range');

    for (let i = 1; i < yamaAttacks.length; i++) {
      const prev = yamaAttacks[i - 1];
      const curr = yamaAttacks[i];
      expect(
        curr.attackType,
        `Damage #${i} at tick ${curr.tick} (${curr.attackType}) should differ from ` +
          `damage #${i - 1} at tick ${prev.tick} (${prev.attackType})`,
      ).not.toBe(prev.attackType);
    }
  });

  it('should alternate even when player is in melee range sometimes', () => {
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const meleePos: Coordinate = [30, 33]; // adjacent to Yama
    const farPos: Coordinate = [34, 26]; // far from Yama

    for (let tick = 0; tick < 200; tick++) {
      if (!engine.canAdvance()) break;
      // Be in melee range every other beat
      const beatish = tick % 14 < 7;
      engine.advanceTick(beatish ? meleePos : farPos);
    }

    const state = engine.getState();
    const rangeMageAttacks = state.damageHistory
      .filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    for (let i = 1; i < rangeMageAttacks.length; i++) {
      const prev = rangeMageAttacks[i - 1];
      const curr = rangeMageAttacks[i];
      expect(
        curr.attackType,
        `Range/mage damage #${i} at tick ${curr.tick} (${curr.attackType}) should differ from ` +
          `#${i - 1} at tick ${prev.tick} (${prev.attackType})`,
      ).not.toBe(prev.attackType);
    }
  });

  it('should alternate when melee happens on exactly beat 2 (targeted worst case)', () => {
    // Beat layout: 0=fireball, 1=range/mage, 2=range/mage, 3=fireball, 4=range/mage...
    // If player is in melee at beat 2, brain does melee instead of range/mage.
    // Beat 1 ordinal=0 (magic), beat 2 skipped (melee), beat 4 ordinal=2 (magic).
    // Without proper tracking, consecutive range/mage would both be 'magic'.
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const meleePos: Coordinate = [30, 33]; // adjacent to Yama
    const farPos: Coordinate = [34, 26]; // far from Yama

    // Beats at ticks: 4(fb), 11, 18, 25(fb), 32, 39, 46, 53(fb), 60, 67
    // We want player in melee ONLY at tick 18 (beat 2)
    for (let tick = 0; tick < 100; tick++) {
      if (!engine.canAdvance()) break;
      const isMeleeTick = tick >= 17 && tick <= 19;
      engine.advanceTick(isMeleeTick ? meleePos : farPos);
    }

    const state = engine.getState();
    const rangeMageAttacks = state.damageHistory
      .filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    expect(rangeMageAttacks.length).toBeGreaterThan(5);

    for (let i = 1; i < rangeMageAttacks.length; i++) {
      const prev = rangeMageAttacks[i - 1];
      const curr = rangeMageAttacks[i];
      expect(
        curr.attackType,
        `Range/mage damage #${i} at tick ${curr.tick} (${curr.attackType}) should differ from ` +
          `#${i - 1} at tick ${prev.tick} (${prev.attackType})`,
      ).not.toBe(prev.attackType);
    }
  });

  it('should alternate when melee happens on beat 6 (single odd-ordinal melee)', () => {
    // Beat 5 ordinal=3 (range), beat 6 melee, beat 8 ordinal=5 (range) -- both odd!
    // Without fix, consecutive range/mage are both 'range'.
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const meleePos: Coordinate = [30, 33];
    const farPos: Coordinate = [34, 26];

    // Beat 6 is at tick 46
    for (let tick = 0; tick < 100; tick++) {
      if (!engine.canAdvance()) break;
      const isMeleeTick = tick >= 45 && tick <= 47;
      engine.advanceTick(isMeleeTick ? meleePos : farPos);
    }

    const state = engine.getState();
    const rangeMageAttacks = state.damageHistory
      .filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    expect(rangeMageAttacks.length).toBeGreaterThan(5);

    for (let i = 1; i < rangeMageAttacks.length; i++) {
      const prev = rangeMageAttacks[i - 1];
      const curr = rangeMageAttacks[i];
      expect(
        curr.attackType,
        `Range/mage damage #${i} at tick ${curr.tick} (${curr.attackType}) should differ from ` +
          `#${i - 1} at tick ${prev.tick} (${prev.attackType})`,
      ).not.toBe(prev.attackType);
    }
  });

  it('should keep alternation after three consecutive melee beats (4, 5, and 6)', () => {
    // If skipped melee beats advanced the alternation index,
    // beat 8 could repeat the same style as beat 2 after a long melee burst.
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const meleePos: Coordinate = [30, 33];
    const farPos: Coordinate = [34, 26];

    for (let tick = 0; tick < 100; tick++) {
      if (!engine.canAdvance()) break;
      // Enter melee one loop earlier so Yama's NPC-first turn sees us in range on ticks 32, 39, and 46.
      const isMeleeTick = (tick >= 30 && tick <= 32) || (tick >= 37 && tick <= 39) || (tick >= 44 && tick <= 46);
      engine.advanceTick(isMeleeTick ? meleePos : farPos);
    }

    const rangeMageAttacks = engine
      .getState()
      .damageHistory.filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    const attacksBeforeBurst = rangeMageAttacks.filter((d) => d.tick < 32);
    const lastBeforeBurst = attacksBeforeBurst[attacksBeforeBurst.length - 1];
    const firstAfterBurst = rangeMageAttacks.find((d) => d.tick >= 60);

    expect(lastBeforeBurst).toBeTruthy();
    expect(firstAfterBurst).toBeTruthy();
    expect(lastBeforeBurst?.attackType).toBe('range');
    expect(firstAfterBurst?.attackType).toBe('magic');
    expect(firstAfterBurst?.attackType).not.toBe(lastBeforeBurst?.attackType);
  });

  it('should strictly alternate when yamaMelee is disabled while standing in melee range', () => {
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [30, 33] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const meleePos: Coordinate = [30, 33];
    while (engine.getState().currentTick < 140 && engine.canAdvance()) {
      engine.advanceTick(meleePos);
    }

    const rangeMageAttacks = engine
      .getState()
      .damageHistory.filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    expect(rangeMageAttacks.length).toBeGreaterThan(10);
    expect(rangeMageAttacks[0].attackType).toBe('magic');
    expect(engine.getState().damageHistory.filter((d) => d.attackType === 'melee')).toHaveLength(0);

    for (let i = 1; i < rangeMageAttacks.length; i++) {
      expect(
        rangeMageAttacks[i].attackType,
        `Fallback attack #${i} at tick ${rangeMageAttacks[i].tick} should alternate with #${i - 1}`,
      ).not.toBe(rangeMageAttacks[i - 1].attackType);
    }
  });

  it('should still melee while standing in range when only yamaMageRange is disabled', () => {
    const engine = new SimulationEngine({
      encounter: new YamaEncounter(),
      startPos: [30, 33] as Coordinate,
    });
    engine.setMechanicsConfig({
      yamaMageRange: false,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const meleePos: Coordinate = [30, 33];
    while (engine.getState().currentTick < 140 && engine.canAdvance()) {
      engine.advanceTick(meleePos);
    }

    const damage = engine.getState().damageHistory.filter((d) => d.source === 'YamaAttack');
    expect(damage.filter((d) => d.attackType === 'melee').length).toBeGreaterThan(5);
    expect(damage.filter((d) => d.attackType === 'magic' || d.attackType === 'range')).toHaveLength(0);
  });

  it('should not advance the alternation across beats spent with yamaMageRange disabled', () => {
    // Skipped range/mage beats must not consume an ordinal, or re-enabling
    // the toggle mid-fight would resume on the style that just landed.
    const engine = new SimulationEngine({
      encounter: new YamaEncounter(),
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    const config = (yamaMageRange: boolean) => ({
      yamaMageRange,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });
    const farPos: Coordinate = [34, 26];
    const runTo = (tick: number) => {
      while (engine.getState().currentTick < tick && engine.canAdvance()) {
        engine.advanceTick(farPos);
      }
    };
    const rangeMage = () =>
      engine
        .getState()
        .damageHistory.filter((d) => d.source === 'YamaAttack')
        .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    engine.setMechanicsConfig(config(true));
    runTo(40);

    // A swing already launched keeps its 3-tick flight, so let the last one land before
    // counting; the toggle gates the decision, not a projectile already in the air.
    engine.setMechanicsConfig(config(false));
    runTo(50);
    const settled = rangeMage();
    const lastBeforeGap = settled[settled.length - 1];

    runTo(90);
    expect(rangeMage()).toHaveLength(settled.length);

    engine.setMechanicsConfig(config(true));
    runTo(140);
    const afterReenable = rangeMage().slice(settled.length);

    expect(lastBeforeGap).toBeTruthy();
    expect(afterReenable.length).toBeGreaterThan(3);
    expect(afterReenable[0].attackType).not.toBe(lastBeforeGap.attackType);
    for (let i = 1; i < afterReenable.length; i++) {
      expect(afterReenable[i].attackType).not.toBe(afterReenable[i - 1].attackType);
    }
  });

  it('restarts alternation from a new opening style command mid-simulation', () => {
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const farPos: Coordinate = [34, 26];

    while (engine.getState().currentTick < 50 && engine.canAdvance()) {
      engine.advanceTick(farPos);
    }

    engine.executeEncounterCommand(YAMA_SET_OPENING_RANGE_COMMAND);

    while (engine.getState().currentTick < 100 && engine.canAdvance()) {
      engine.advanceTick(farPos);
    }

    const rangeMageAttacks = engine
      .getState()
      .damageHistory.filter((d) => d.source === 'YamaAttack')
      .filter((d) => d.attackType === 'magic' || d.attackType === 'range');

    const firstAfterChange = rangeMageAttacks.find((d) => d.tick > 50);
    const postChangeAttacks = rangeMageAttacks.filter((d) => d.tick > 50);

    expect(firstAfterChange).toBeTruthy();
    expect(firstAfterChange?.attackType).toBe('range');
    expect(postChangeAttacks.length).toBeGreaterThan(3);

    for (let i = 1; i < postChangeAttacks.length; i++) {
      expect(postChangeAttacks[i].attackType).not.toBe(postChangeAttacks[i - 1].attackType);
    }
  });

  it('should produce identical alternation after reset+replay (replay compatibility)', () => {
    const encounter = new YamaEncounter();
    const engine = new SimulationEngine({
      encounter,
      startPos: [34, 26] as Coordinate,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_MAGIC_COMMAND);
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const inputs: Coordinate[] = [];
    const meleePos: Coordinate = [30, 33];
    const farPos: Coordinate = [34, 26];

    for (let tick = 0; tick < 100; tick++) {
      if (!engine.canAdvance()) break;
      const isMelee = tick >= 17 && tick <= 19;
      const pos = isMelee ? meleePos : farPos;
      inputs.push(pos);
      engine.advanceTick(pos);
    }

    const firstRunAttacks = engine
      .getState()
      .damageHistory.filter((d) => d.source === 'YamaAttack')
      .map((d) => ({ tick: d.tick, attackType: d.attackType }));

    // Reset with same seeds (simulates replay take-over)
    const seeds = encounter.getSeeds();
    engine.reset([34, 26] as Coordinate, {
      completionOwnership: 'encounter-owned',
      encounter: { kind: 'yama_p3', seeds },
    });
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    for (const input of inputs) {
      if (!engine.canAdvance()) break;
      engine.advanceTick(input);
    }

    const replayAttacks = engine
      .getState()
      .damageHistory.filter((d) => d.source === 'YamaAttack')
      .map((d) => ({ tick: d.tick, attackType: d.attackType }));

    expect(replayAttacks).toEqual(firstRunAttacks);

    const rangeMage = replayAttacks.filter((a) => a.attackType === 'magic' || a.attackType === 'range');
    for (let i = 1; i < rangeMage.length; i++) {
      expect(rangeMage[i].attackType).not.toBe(rangeMage[i - 1].attackType);
    }
  });
});
