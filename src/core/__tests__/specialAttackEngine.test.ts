import { beforeEach, describe, expect, it } from 'vitest';
import { selectPlayerToggles, selectSetupToggles } from '../../components/EncounterPanel.helpers';
import { selectInfoboxes } from '../../components/InfoBox/selectInfoboxes';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { SENSORY_CLOUDING_CONFIG } from '../../encounters/yamaP3/contractConfig';
import { buildYamaControls } from '../../encounters/yamaP3/controls';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { enqueueEnginePendingHit } from '../../test/helpers/pendingHits';
import {
  DEATH_CHARGE_COOLDOWN_TICKS,
  DEATH_CHARGE_DURATION_TICKS,
  DEATH_CHARGE_SPEC_RESTORE,
  LIGHTBEARER_ITEM_ID,
  SPEC_REGEN_TICKS,
  SPEC_REGEN_TICKS_LIGHTBEARER,
} from '../../types/playerState';
import { type Coordinate, mergeMechanicsConfig } from '../../types/simulation';
import { isNpcBound, type NpcActor } from '../actors/NpcActor';
import type { DamageAppliedInfo } from '../combat/CombatSystem';
import { applyOnFireSpecialAttackEffects } from '../combat/player/specialAttacks/postHitEffects';
import { SPECIAL_ATTACK_REGISTRY } from '../combat/player/specialAttacks/registry';
import { recordNpcLethalTransition } from '../npcDeath';
import { SimulationEngine } from '../SimulationEngine';
import type { WorldState } from '../WorldState';

/**
 * Engine-level cover for the special-attack economy. The pure timer functions are exercised in
 * `specialAttackEnergy.test.ts`; what is proven here is the WIRING.
 *
 * A unit test of `tickSpecialAttack`/`consumeDeathCharge` passes even when that wiring is missing, so these go
 * through `SimulationEngine.advanceTick` and the real damage callback instead.
 */

const PLAYER: Coordinate = [31, 39];
const MAGUS_RING = 28313;
const SCORCHING_BOW = 29591;
const PRESET = EQUIPMENT_PRESETS.yama_p3_sensory.mage;

interface Harness {
  engine: SimulationEngine;
  world: WorldState;
  player: ReturnType<WorldState['getPlayer']> & object;
}

function boot(options?: { ring?: number; rite?: boolean; voidFlares?: boolean }): Harness {
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(SENSORY_CLOUDING_CONFIG, 7),
    startPos: PLAYER,
  });
  engine.setMechanicsConfig({
    yamaMageRange: false,
    waves: false,
    fireballs: false,
    voidFlares: options?.voidFlares ?? false,
    infiniteHealth: true,
    doubleDeathCharge: options?.rite ?? false,
  });
  engine.setEquipment({ ...PRESET.equipment, ring: options?.ring ?? LIGHTBEARER_ITEM_ID });
  // The preset's inventory and rune pouch, not just its gear: Death Charge is gated on the runes,
  // and the pouch's aether rune is the only thing on this set that answers for a soul rune.
  engine.setInventory([...PRESET.inventory]);
  if (PRESET.supplies) engine.setCombatSupplies(PRESET.supplies);
  const world = Reflect.get(engine, 'worldState') as WorldState;
  return { engine, world, player: world.getPlayer()! };
}

/** Ticks between energy gains over `ticks` ticks, driving the real engine. */
function regenGaps(harness: Harness, ticks: number): number[] {
  const { engine, world, player } = harness;
  player.specialAttack = { ...player.specialAttack, energy: 0 };
  const gaps: number[] = [];
  let last = world.tick;
  for (let tick = 0; tick < ticks; tick++) {
    const before = player.specialAttack.energy;
    engine.advanceTick(PLAYER);
    if (player.specialAttack.energy > before) {
      gaps.push(world.tick - last);
      last = world.tick;
    }
  }
  return gaps;
}

/** Land a fatal player hit through the engine's own damage callback. */
function killNpc(harness: Harness, npcId: string): void {
  const npc = harness.world.getNpc(npcId)!;
  const info: DamageAppliedInfo = {
    tick: harness.world.tick,
    sourceId: 'player',
    targetId: npcId,
    attackType: 'range',
    baseDamage: npc.vitals.hp,
    effectiveDamage: npc.vitals.hp,
    activePrayer: null,
    prayedCorrectly: null,
    hpBefore: npc.vitals.hp,
    hpAfter: 0,
  };
  npc.vitals.hp = 0;
  // The combat system's half of a lethal hit, which the engine's damage handler then reacts to.
  recordNpcLethalTransition(npc, info.tick, 'hit-queue');
  (Reflect.get(harness.engine, 'onCombatDamageApplied') as (i: DamageAppliedInfo) => void).call(harness.engine, info);
}

/** Advance until void flares exist, then return them. */
function flares(harness: Harness): string[] {
  for (let tick = 0; tick < 120; tick++) {
    harness.engine.advanceTick(PLAYER);
    const alive = harness.world.getNpcs().filter((npc) => npc.id !== 'yama' && npc.alive);
    if (alive.length >= 2) return alive.map((npc) => npc.id);
  }
  throw new Error('no void flares spawned');
}

describe('Lightbearer, through the engine', () => {
  it('halves the regen interval when the ring is worn', () => {
    expect(regenGaps(boot({ ring: LIGHTBEARER_ITEM_ID }), 130)).toEqual(Array(5).fill(SPEC_REGEN_TICKS_LIGHTBEARER));
  });

  it('leaves the bare interval for any other ring', () => {
    expect(regenGaps(boot({ ring: MAGUS_RING }), 130)).toEqual(Array(2).fill(SPEC_REGEN_TICKS));
  });

  it('picks the ring up from the equipped slot rather than staying false', () => {
    const harness = boot({ ring: LIGHTBEARER_ITEM_ID });
    expect(harness.player.specialAttack.lightbearerEquipped).toBe(false);
    harness.engine.advanceTick(PLAYER);
    expect(harness.player.specialAttack.lightbearerEquipped).toBe(true);
  });

  it('follows a mid-fight ring switch in both directions', () => {
    const harness = boot({ ring: LIGHTBEARER_ITEM_ID });
    harness.engine.advanceTick(PLAYER);
    expect(harness.player.specialAttack.lightbearerEquipped).toBe(true);

    harness.engine.setEquipment({ ...PRESET.equipment, ring: MAGUS_RING });
    harness.engine.advanceTick(PLAYER);
    expect(harness.player.specialAttack.lightbearerEquipped).toBe(false);

    harness.engine.setEquipment({ ...PRESET.equipment, ring: LIGHTBEARER_ITEM_ID });
    harness.engine.advanceTick(PLAYER);
    expect(harness.player.specialAttack.lightbearerEquipped).toBe(true);
  });

  it('is what makes the shipped Sensory preset regenerate at the captured rate', () => {
    // The capture's regen ticks are 25 apart, and the preset that produced it wears this ring.
    expect(PRESET.equipment.ring).toBe(LIGHTBEARER_ITEM_ID);
    expect(regenGaps(boot(), 60)).toContain(SPEC_REGEN_TICKS_LIGHTBEARER);
  });
});

describe('Death Charge, through the engine', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = boot({ rite: false, voidFlares: true });
  });

  it('pays 15% on a player kill and nothing on the next without the rite', () => {
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    harness.player.specialAttack = { ...harness.player.specialAttack, energy: 40 };

    killNpc(harness, ids[0]);
    expect(harness.player.specialAttack.energy).toBe(40 + DEATH_CHARGE_SPEC_RESTORE);

    killNpc(harness, ids[1]);
    expect(harness.player.specialAttack.energy).toBe(40 + DEATH_CHARGE_SPEC_RESTORE);
  });

  it('pays on TWO kills with the rite — the double Death Charge', () => {
    const upgraded = boot({ rite: true, voidFlares: true });
    const ids = flares(upgraded);
    upgraded.engine.castDeathCharge();
    upgraded.player.specialAttack = { ...upgraded.player.specialAttack, energy: 40 };

    killNpc(upgraded, ids[0]);
    killNpc(upgraded, ids[1]);
    expect(upgraded.player.specialAttack.energy).toBe(40 + 2 * DEATH_CHARGE_SPEC_RESTORE);
    expect(upgraded.player.combatTimers.deathChargeProcsRemaining).toBe(0);
  });

  it('is a global account unlock, on by default and offered in every encounter', () => {
    // Death Charge is castable in any encounter, so the rite that upgrades it cannot live on one
    // boss's toggle list — that left every other encounter silently casting the un-upgraded spell.
    expect(mergeMechanicsConfig().doubleDeathCharge).toBe(true);
    expect(buildYamaControls(SENSORY_CLOUDING_CONFIG).mechanicsToggles).not.toContainEqual(
      expect.objectContaining({ key: 'doubleDeathCharge' }),
    );

    const yamaToggles = buildYamaControls().mechanicsToggles;
    expect(selectPlayerToggles(yamaToggles).map((toggle) => toggle.key)).toContain('doubleDeathCharge');
    expect(selectSetupToggles(yamaToggles).map((toggle) => toggle.key)).not.toContain('doubleDeathCharge');
  });

  it('offers Deadeye and Mystic Vigour on the same account-unlock terms', () => {
    expect(mergeMechanicsConfig().upgradedPrayers).toBe(true);

    const yamaToggles = buildYamaControls().mechanicsToggles;
    expect(selectPlayerToggles(yamaToggles).map((toggle) => toggle.key)).toContain('upgradedPrayers');
    expect(selectSetupToggles(yamaToggles).map((toggle) => toggle.key)).not.toContain('upgradedPrayers');
  });

  it('offers Zeal as a separate, default-off account unlock', () => {
    expect(mergeMechanicsConfig().zealPrayer).toBe(false);
    expect(mergeMechanicsConfig(undefined, { zealPrayer: true })).toMatchObject({
      zealPrayer: true,
      upgradedPrayers: true,
    });
    const yamaToggles = buildYamaControls().mechanicsToggles;
    expect(selectPlayerToggles(yamaToggles)).toContainEqual(
      expect.objectContaining({ key: 'zealPrayer', label: 'Zeal' }),
    );
    expect(selectSetupToggles(yamaToggles).map((toggle) => toggle.key)).not.toContain('zealPrayer');
  });

  it('restores nothing on a kill at full energy, but still spends the proc', () => {
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    harness.player.specialAttack = { ...harness.player.specialAttack, energy: 100 };

    killNpc(harness, ids[0]);
    expect(harness.player.specialAttack.energy).toBe(100);
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(0);
  });

  it('does nothing on a kill with no cast behind it', () => {
    const ids = flares(harness);
    harness.player.specialAttack = { ...harness.player.specialAttack, energy: 40 };
    killNpc(harness, ids[0]);
    expect(harness.player.specialAttack.energy).toBe(40);
  });

  it('refuses a recast for the whole cooldown, then allows one', () => {
    harness.engine.castDeathCharge();
    expect(harness.player.combatTimers.deathChargeCooldownTicks).toBe(DEATH_CHARGE_COOLDOWN_TICKS);

    // Burn the procs so only the cooldown, not the window, can be what blocks the recast.
    const ids = flares(harness);
    killNpc(harness, ids[0]);
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(0);

    harness.engine.castDeathCharge();
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(0);

    while (harness.player.combatTimers.deathChargeCooldownTicks > 0) {
      harness.engine.advanceTick(PLAYER);
    }
    harness.engine.castDeathCharge();
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(1);
  });

  it('expires unspent, so a late kill pays nothing', () => {
    harness.engine.castDeathCharge();
    for (let tick = 0; tick < DEATH_CHARGE_DURATION_TICKS; tick++) {
      harness.engine.advanceTick(PLAYER);
    }
    expect(harness.player.combatTimers.deathChargeActiveTicks).toBe(0);

    const ids = flares(harness);
    harness.player.specialAttack = { ...harness.player.specialAttack, energy: 40 };
    killNpc(harness, ids[0]);
    expect(harness.player.specialAttack.energy).toBe(40);
  });

  it('ignores a kill the player did not land', () => {
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    harness.player.specialAttack = { ...harness.player.specialAttack, energy: 40 };

    const npc = harness.world.getNpc(ids[0])!;
    const info: DamageAppliedInfo = {
      tick: harness.world.tick,
      sourceId: 'yama',
      targetId: ids[0],
      attackType: 'range',
      baseDamage: npc.vitals.hp,
      effectiveDamage: npc.vitals.hp,
      activePrayer: null,
      prayedCorrectly: null,
      hpBefore: npc.vitals.hp,
      hpAfter: 0,
    };
    npc.vitals.hp = 0;
    recordNpcLethalTransition(npc, info.tick, 'hit-queue');
    (Reflect.get(harness.engine, 'onCombatDamageApplied') as (i: DamageAppliedInfo) => void).call(harness.engine, info);

    expect(harness.player.specialAttack.energy).toBe(40);
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(1);
  });
});

describe('Death Charge events', () => {
  /** Events still buffered outside a tick — `killNpc` lands its hit between ticks. */
  function drain(harness: Harness): Array<Record<string, unknown>> {
    return (Reflect.get(harness.engine, 'tickEvents') as { flush(): Array<Record<string, unknown>> }).flush();
  }

  function procCount(events: ReadonlyArray<Record<string, unknown>>): number {
    return events.filter((event) => event.type === 'death_charge_proc').length;
  }

  /** Advance `ticks` ticks and return the ticks on which the charge was reported as faded. */
  function fadedTicks(harness: Harness, ticks: number): number[] {
    const faded: number[] = [];
    for (let step = 0; step < ticks; step++) {
      harness.engine.advanceTick(PLAYER);
      const events = harness.engine.getLastTickEvents();
      if (events.some((event) => event.type === 'status_effect_expired' && event.effect === 'death_charge')) {
        faded.push(harness.world.tick);
      }
    }
    return faded;
  }

  it('reports one proc per kill that pays out with the rite', () => {
    const harness = boot({ rite: true, voidFlares: true });
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    drain(harness);

    killNpc(harness, ids[0]);
    expect(procCount(drain(harness))).toBe(1);
    killNpc(harness, ids[1]);
    expect(procCount(drain(harness))).toBe(1);
  });

  it('reports no proc for a kill after the charge is spent', () => {
    const harness = boot({ rite: false, voidFlares: true });
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    drain(harness);

    killNpc(harness, ids[0]);
    expect(procCount(drain(harness))).toBe(1);
    killNpc(harness, ids[1]);
    expect(procCount(drain(harness))).toBe(0);
  });

  it('reports a proc even at full energy, because the proc is still spent', () => {
    const harness = boot({ voidFlares: true });
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    harness.player.specialAttack = { ...harness.player.specialAttack, energy: 100 };
    drain(harness);

    killNpc(harness, ids[0]);
    expect(procCount(drain(harness))).toBe(1);
  });

  it('reports no proc for a kill with no charge behind it', () => {
    const harness = boot({ voidFlares: true });
    const ids = flares(harness);
    drain(harness);

    killNpc(harness, ids[0]);
    expect(procCount(drain(harness))).toBe(0);
  });

  it('reports the charge faded once, on the tick its window runs out with procs unspent', () => {
    const harness = boot({ rite: true });
    harness.engine.castDeathCharge();
    const castTick = harness.world.tick;

    expect(fadedTicks(harness, DEATH_CHARGE_DURATION_TICKS + 5)).toEqual([castTick + DEATH_CHARGE_DURATION_TICKS]);
  });

  it('still reports the fade when only one of two procs was spent', () => {
    const harness = boot({ rite: true, voidFlares: true });
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    killNpc(harness, ids[0]);
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(1);

    expect(fadedTicks(harness, DEATH_CHARGE_DURATION_TICKS + 5)).toHaveLength(1);
  });

  it('pays a killing blow that lands on the final active tick, without also reporting a fade', () => {
    const harness = boot({ rite: false, voidFlares: true });
    flares(harness);
    harness.engine.castDeathCharge();
    while (harness.player.combatTimers.deathChargeActiveTicks > 1) harness.engine.advanceTick(PLAYER);
    const flare = harness.world.getNpcs().find((npc) => npc.id !== 'yama' && npc.alive);
    if (!flare) throw new Error('no void flare alive on the final active tick');
    flare.vitals.hp = 1;
    enqueueEnginePendingHit(harness.engine, {
      sourceId: 'player',
      targetId: flare.id,
      style: 'range',
      attackKind: 'range_arrow',
      launchTick: harness.world.tick,
      impactTick: harness.world.tick + 1,
      rolledDamage: 1,
      accuracySucceeded: true,
    });

    harness.engine.advanceTick(PLAYER);

    const events = harness.engine.getLastTickEvents();
    expect(events.filter((event) => event.type === 'death_charge_proc')).toHaveLength(1);
    expect(events.some((event) => event.type === 'status_effect_expired' && event.effect === 'death_charge')).toBe(
      false,
    );
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(0);
  });

  it('pays one proc for a kill, not one per hit, when overkill lands on the same tick', () => {
    const harness = boot({ rite: true, voidFlares: true });
    flares(harness);
    harness.engine.castDeathCharge();
    const flare = harness.world.getNpcs().find((npc) => npc.id !== 'yama' && npc.alive);
    if (!flare) throw new Error('no void flare alive');
    flare.vitals.hp = 1;
    for (const rolledDamage of [1, 6]) {
      enqueueEnginePendingHit(harness.engine, {
        sourceId: 'player',
        targetId: flare.id,
        style: 'range',
        attackKind: 'range_arrow',
        launchTick: harness.world.tick,
        impactTick: harness.world.tick + 1,
        rolledDamage,
        accuracySucceeded: true,
      });
    }

    harness.engine.advanceTick(PLAYER);

    const events = harness.engine.getLastTickEvents();
    expect(events.filter((event) => event.type === 'death_charge_proc')).toHaveLength(1);
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(1);
    expect(
      events.flatMap((event) =>
        event.type === 'hitsplat_spawned' && event.targetId === flare.id ? [event.amount] : [],
      ),
    ).toEqual([1, 0]);
  });

  it('does not report a fade when the last proc paid out', () => {
    const harness = boot({ rite: false, voidFlares: true });
    const ids = flares(harness);
    harness.engine.castDeathCharge();
    killNpc(harness, ids[0]);
    expect(harness.player.combatTimers.deathChargeProcsRemaining).toBe(0);

    expect(fadedTicks(harness, DEATH_CHARGE_DURATION_TICKS + 5)).toEqual([]);
  });
});

describe('Death Charge infoboxes', () => {
  it('shows the charge count while live, and the cooldown once it is spent', () => {
    const harness = boot({ rite: true, voidFlares: true });
    const ids = flares(harness);
    harness.engine.castDeathCharge();

    const live = selectInfoboxes(harness.engine.getState()).find((box) => box.id === 'death-charge');
    expect(live?.text).toBe('2');
    expect(live?.tooltipDetail).toContain('2 kills left');
    // The cooldown box stays hidden while the buff is live, or it would render a second countdown
    // identical to the window's — they are both 100 ticks and start together.
    expect(selectInfoboxes(harness.engine.getState()).some((box) => box.id === 'death-charge-cooldown')).toBe(false);

    killNpc(harness, ids[0]);
    expect(selectInfoboxes(harness.engine.getState()).find((box) => box.id === 'death-charge')?.text).toBe('1');

    killNpc(harness, ids[1]);
    const boxes = selectInfoboxes(harness.engine.getState());
    expect(boxes.some((box) => box.id === 'death-charge')).toBe(false);
    const cooldown = boxes.find((box) => box.id === 'death-charge-cooldown');
    expect(cooldown).toBeDefined();
    expect(cooldown?.ticksRemaining).toBeGreaterThan(0);
  });

  it('shows neither box before a cast', () => {
    const boxes = selectInfoboxes(boot().engine.getState());
    expect(boxes.some((box) => box.id.startsWith('death-charge'))).toBe(false);
  });
});

describe('Death Charge cast plumbing', () => {
  it('routes the queued action to the cast, which is what the UI and replays go through', () => {
    // `castDeathCharge()` is not what a click reaches: the panel dispatches an EngineAction, and a
    // replay replays that action. A missing switch case would leave the method perfectly correct
    // and the spell dead.
    const { engine, player } = boot({ rite: true });
    engine.applyAction({ type: 'castDeathCharge' });

    expect(player.combatTimers.deathChargeProcsRemaining).toBe(2);
    expect(player.combatTimers.deathChargeActiveTicks).toBe(DEATH_CHARGE_DURATION_TICKS);
  });

  it('emits a self-cast so the spell is visible, with the upgraded graphic when doubled', () => {
    // The capture is the source for both ids: t8905 emits `sequence id=human_cast_selfimbue (8970)`
    // beside `death_charge_upgrade_cast_spotanim (3288)`. The animation is NOT
    // `AnimationID.DEATH_CHARGE` (8983) — that id names the spell but animates its effect, and
    // casting with it renders a garbled pose on the player.
    for (const [rite, spotAnimId] of [
      [false, 1854],
      [true, 3288],
    ] as const) {
      const { engine } = boot({ rite });
      engine.applyAction({ type: 'castDeathCharge' });
      // Read before advancing: the engine drains its buffer at the end of each tick.
      const emitted = (Reflect.get(engine, 'tickEvents') as { flush(): Array<Record<string, unknown>> }).flush();
      const selfCast = emitted.find((event) => event.type === 'spell_self_cast');
      expect(selfCast, `cast event for rite=${rite}`).toBeDefined();
      expect(selfCast?.spotAnimId).toBe(spotAnimId);
      expect(selfCast?.animationId, 'human_cast_selfimbue').toBe(8970);
    }
  });
});

describe('Death Charge cast requirements', () => {
  // The panel grays an icon the player cannot pay for, but nothing that reaches the engine is
  // obliged to have consulted it: replays, the tutorial director and the context menu all arrive
  // here directly. So the requirement check has to live on this side of the boundary.
  it('is castable on the shipped Sensory preset, whose pouch supplies the soul rune as aether', () => {
    const { engine, player } = boot();
    engine.applyAction({ type: 'castDeathCharge' });

    expect(player.combatTimers.deathChargeActiveTicks).toBe(DEATH_CHARGE_DURATION_TICKS);
  });

  it('refuses the cast below the required Magic level', () => {
    const { engine, player } = boot();
    player.stats = { ...player.stats, magic: { current: 79, max: 79 } };

    engine.applyAction({ type: 'castDeathCharge' });

    expect(player.combatTimers.deathChargeActiveTicks).toBe(0);
    expect(player.combatTimers.deathChargeCooldownTicks).toBe(0);
  });

  it('casts on a boosted level the base level does not reach', () => {
    const { engine, player } = boot();
    player.stats = { ...player.stats, magic: { current: 80, max: 79 } };

    engine.applyAction({ type: 'castDeathCharge' });

    expect(player.combatTimers.deathChargeActiveTicks).toBe(DEATH_CHARGE_DURATION_TICKS);
  });

  it('refuses the cast with no source for one of its runes', () => {
    const { engine, player } = boot();
    // Death Charge needs death, blood and soul. The preset's pouch covers soul through an aether
    // rune; emptying the pouch leaves nothing carrying any of the three.
    player.combatSupplies = { ...player.combatSupplies, runePouch: null };

    engine.applyAction({ type: 'castDeathCharge' });

    expect(player.combatTimers.deathChargeActiveTicks).toBe(0);
  });
});

describe('bind windows', () => {
  const npcAt = (tick: number, from: number | undefined, until: number | undefined) =>
    isNpcBound({ debuffs: { boundFromTick: from, boundUntilTick: until } } as NpcActor, tick);

  it('is half-open: inclusive at the from tick, exclusive at the until tick', () => {
    expect(npcAt(9, 10, 13)).toBe(false);
    expect(npcAt(10, 10, 13)).toBe(true);
    expect(npcAt(12, 10, 13)).toBe(true);
    expect(npcAt(13, 10, 13)).toBe(false);
  });

  it('is unbound with no window, and treats a missing start as already begun', () => {
    expect(isNpcBound({} as NpcActor, 10)).toBe(false);
    expect(npcAt(10, undefined, undefined)).toBe(false);
    expect(npcAt(0, undefined, 13)).toBe(true);
  });

  // The guard lives in `SimulationEngine`, not in the encounter, so that every mobile NPC in every
  // encounter inherits it from the one place movement requests are applied. Deleting it leaves
  // `YamaEncounter.moveNpcs` perfectly correct and Yama walking out of a bind that pinned him for
  // 21 ticks in the capture.
  it('stops the engine applying the movement of a bound NPC, and releases it after', () => {
    const { engine, world } = boot();
    const yama = world.getNpc('yama')!;

    engine.advanceTick(PLAYER);
    const afterFreeStep: Coordinate = [...yama.position];

    yama.debuffs = { boundFromTick: world.tick + 1, boundUntilTick: world.tick + 4 };
    for (let tick = 0; tick < 3; tick++) engine.advanceTick(PLAYER);
    expect(yama.position, 'pinned for the whole window').toEqual(afterFreeStep);

    engine.advanceTick(PLAYER);
    expect(yama.position, 'moving again on the tick the window ends').not.toEqual(afterFreeStep);
  });

  // Both numbers are read off eight casts in `captureConformance.test.ts`, so a registry edit that
  // drifts from them fails here too.
  //
  // The engine moves NPCs before it resolves pending hits, so writing this same window when the
  // projectile lands would stop Yama on cast+4 instead of the captures' cast+2.
  it('blocks the 21 movement ticks from cast+2, and lets Yama step again on cast+23', () => {
    const { engine, world, player } = boot();
    const yama = world.getNpc('yama')!;

    engine.advanceTick(PLAYER);
    const castTick = world.tick;
    applyOnFireSpecialAttackEffects(player, yama, SPECIAL_ATTACK_REGISTRY[SCORCHING_BOW].onFireEffects!, castTick);

    const blocked: number[] = [];
    let resumed: number | null = null;
    for (let step = 0; step < 30; step++) {
      const before: Coordinate = [...yama.position];
      engine.advanceTick(PLAYER);
      if (world.tick <= castTick + 1) continue;
      const moved = yama.position[0] !== before[0] || yama.position[1] !== before[1];
      if (!moved) blocked.push(world.tick - castTick);
      else if (resumed === null && blocked.length > 0) resumed = world.tick - castTick;
    }

    expect(blocked.slice(0, 21)).toEqual([...Array(21).keys()].map((offset) => offset + 2));
    expect(resumed).toBe(23);
  });
});
