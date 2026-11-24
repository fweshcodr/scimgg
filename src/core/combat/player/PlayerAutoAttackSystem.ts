import { DEFAULT_SPELL_ATTACK_RANGE, getSpellCastInfo, SPELL_CAST_SPEED } from '../../../data/spellCatalog';
import { resolveActiveSpell } from '../../../types/attackStyles';
import type { CombatSupplies } from '../../../types/encounterLoadout';
import type { EquipmentStats } from '../../../types/equipmentStats';
import { canInitiateAttackOnNpc, type NpcActor } from '../../actors/NpcActor';
import type { PlayerActor } from '../../actors/PlayerActor';
import type { EncounterEngineRules, EncounterPlayerAttackStartedInfo } from '../../encounters/types';
import { resolveDynamic } from '../../encounters/types';
import type { TickEvents } from '../../events/TickEvents';
import type { RicochetFlight } from '../../events/types';
import { canReceiveKillTickSpell, canReceiveNewAttack } from '../../npcDeath';
import { useSpecialAttack as spendSpecialAttackEnergy } from '../../timers';
import type { WorldState } from '../../WorldState';
import { NO_ATTACK_RESOURCES, resolveAttackResources } from '../attackResources';
import type { CombatSystem, DamageAppliedInfo } from '../CombatSystem';
import { chebyshevDistanceToRect, isInAttackRange, isUnderNpc } from '../distance';
import type { CombatFormulaStyle } from '../formulas';
import { calculateHitDelay, calculateProjectileEndTime, hitDelayFromEndTime, PROJ_ANIM_TIMINGS } from '../hitDelay';
import type { ReadyPlayerAttackPlan } from '../playerAttackTypes';
import {
  type EffectiveCombatParams,
  formulaStyleToAttackKind,
  formulaStyleToDamageType,
  getFormulaStyle,
  getHitDelayModel,
  getPlayerEffectiveCombatParams,
  getProjectileTiming,
} from '../weaponCombatData';
import { getChinchompaArea } from './chinchompa';
import { getConflictionAccuracyMode, resolveConflictionAttackIdentity } from './confliction';
import {
  type FirstPartyPlayerAttackOptions,
  planFirstPartyPlayerAttack,
  resolveFirstPartyPlayerAttack,
  type SharedAccuracy,
  sharedAccuracyOf,
} from './firstPartyPlayerAttack';
import { cancelBlockedPlayerAttack, canPlayerStartAttackOn, clearPlayerAttackIntent } from './playerAttackIntent';
import { launchPlayerAttack, type ResolvedSupplementalPlayerTarget } from './playerAttackLaunch';
import { facePlayerTowardNpc } from './playerFacing';
import {
  hasRicochet,
  RICOCHET_FLIGHT_CYCLES,
  RICOCHET_MAX_HIT_SCALE,
  ricochetOrigin,
  ricochetStartCycles,
  selectRicochetTargets,
} from './ricochet';
import { afterSoulreaperAttack, isSoulreaperAxe } from './soulreaper';
import { getSpecialAttackDef } from './specialAttacks/registry';
import type { SpecialAttackDef } from './specialAttacks/types';
import { selectSecondarySpellTargets } from './spellAreaTargets';

export interface PlayerAutoAttackDeps {
  world: WorldState;
  tickEvents: TickEvents;
  combatSystem: CombatSystem;
  infiniteHealth: boolean;
  onDamageApplied: (info: DamageAppliedInfo) => void;
  combatParamOverrides?: EffectiveCombatParams;
  encounterRules?: EncounterEngineRules;
  combatSupplies: CombatSupplies;
  onPlayerAttackStarted?: (info: EncounterPlayerAttackStartedInfo) => void;
  random?: () => number;
  lookupItemStats?: (itemId: number) => EquipmentStats | null;
}

/**
 * The speed and reach of the attack the player would make now: the weapon's (or `combatParamOverrides`),
 * replaced by a manual cast's, then the encounter's rule. Both the attack and the engine's walk to the
 * target read it, so a caster stands where the cast reaches.
 */
export function resolvePlayerAttackParams(
  player: PlayerActor,
  deps: Pick<PlayerAutoAttackDeps, 'world' | 'encounterRules' | 'combatParamOverrides'>,
): EffectiveCombatParams {
  // A manual cast works from any weapon on any attack style, so it overrides the
  // weapon's own reach with the 10-tile combat-spell range and casts at spell speed.
  const params: EffectiveCombatParams = player.manualCastSpell
    ? { attackSpeed: SPELL_CAST_SPEED, attackRange: DEFAULT_SPELL_ATTACK_RANGE }
    : (deps.combatParamOverrides ?? getPlayerEffectiveCombatParams(player));
  return (
    deps.encounterRules?.modifyPlayerCombatParams?.(params, {
      tick: deps.world.tick,
      player: player as Readonly<PlayerActor>,
      world: deps.world as Readonly<WorldState>,
    }) ?? params
  );
}

export function processPlayerAutoAttack(player: PlayerActor, deps: PlayerAutoAttackDeps): void {
  if (!player.alive || !player.attackTarget) return;
  if (cancelBlockedPlayerAttack(player, deps.world)) return;

  const target = deps.world.actors.get(player.attackTarget);
  if (!target || !canPlayerStartAttackOn(player, target) || target.kind !== 'npc') {
    player.attackTarget = null;
    return;
  }

  // OSRS interaction model: interface actions (eat/equip/drink) cancel the attack
  // interaction but preserve movement toward the NPC.
  if (!player.attackInteractionActive) return;

  const npc = target as NpcActor;

  // OSRS faceEntity: while the attack interaction is active, the player faces the NPC's
  // center every tick — even while moving toward/around it (e.g. stepping out from under
  // it). Confirmed against the rev-228 EntityEvent (process + processAfterMovement both
  // re-apply setFaceEntity(target) within 15 tiles). Movement direction only wins with
  // no live interaction (that facing is set in SimulationEngine).
  facePlayerTowardNpc(player, npc);

  const pause = player.autoAttackPause;
  if (pause && deps.world.tick >= pause.resumeTick) {
    player.autoAttackPause = null;
  } else if (pause?.targetId === npc.id) {
    return;
  }

  const styleIndex = player.selectedAttackStyleIndex;
  const manualCastSpell = player.manualCastSpell;
  const {
    attackSpeed: effectiveSpeed,
    attackRange: effectiveRange,
    meleeReach,
  } = resolvePlayerAttackParams(player, deps);

  if (!isInAttackRange(player.position, npc.position, npc.size, effectiveRange, true, meleeReach)) {
    return;
  }
  if (isUnderNpc(player.position, npc.position, npc.size)) {
    return;
  }

  // CombatSystem.canAttack() will reject the attack if cooldown isn't ready,
  // but by that point spec energy would already be spent. Check here first
  // so we don't drain energy (or clear the spec toggle) on non-attack ticks.
  const nextAttackTick = deps.combatSystem.getNextAttackTick(player.id);
  if (nextAttackTick !== undefined && deps.world.tick < nextAttackTick) {
    return;
  }

  const specialAttackRequested = player.isSpecialAttackActive;
  let specDef: SpecialAttackDef | undefined;
  let plannedSpecialAttackState: ReturnType<typeof spendSpecialAttackEnergy> = null;

  if (specialAttackRequested) {
    if (player.equipment.weapon !== undefined) {
      specDef = getSpecialAttackDef(player.equipment.weapon);
    }
    // Must stay ABOVE the spend: an ineligible target refuses the special outright rather than
    // firing an inert one, so dropping the definition here is what keeps the energy unspent and
    // leaves an ordinary attack behind. See `SpecialAttackDef.targetAttribute`.
    if (specDef?.targetAttribute !== undefined && !npc.formulaStats?.attributes?.includes(specDef.targetAttribute)) {
      specDef = undefined;
    }
    // Only the manual spell itself reaches an NPC on its kill tick; a weapon special does not.
    if (!canReceiveNewAttack(npc)) specDef = undefined;
    if (specDef !== undefined) {
      let cost = specDef.energyCost ?? 50;
      const energyCostMultiplier = resolveDynamic(deps.encounterRules?.specialAttacks?.energyCostMultiplier, {
        tick: deps.world.tick,
        player,
        world: deps.world,
      });
      if (energyCostMultiplier !== undefined) {
        cost = Math.max(0, Math.floor(cost * energyCostMultiplier));
      }
      plannedSpecialAttackState = spendSpecialAttackEnergy(player.specialAttack, cost);
    }
  }
  const isSpecAttack = plannedSpecialAttackState !== null;

  // /w/Accursed_sceptre_(a)#Special_attack: Condemn replaces autocast with the built-in spell.
  const poweredSpecial = isSpecAttack && specDef?.poweredSpellWeaponId !== undefined;
  const activeSpell = poweredSpecial
    ? null
    : resolveActiveSpell({
        weaponId: player.equipment.weapon,
        selectedStyleIndex: styleIndex,
        selectedSpell: player.combatSupplies.selectedSpell,
        spellbook: player.combatSupplies.spellbook,
      });
  const weaponFormulaStyle = getFormulaStyle(player.equipment.weapon, styleIndex);
  const formulaStyle: CombatFormulaStyle = poweredSpecial || manualCastSpell ? 'magic' : weaponFormulaStyle;
  const attackResources = poweredSpecial
    ? NO_ATTACK_RESOURCES
    : resolveAttackResources({
        weaponId: player.equipment.weapon,
        equipment: player.equipment,
        inventory: player.inventory,
        formulaStyle,
        supplies: deps.combatSupplies,
        magicLevel: player.stats.magic.current,
        manualCastSpell,
        activeSpell: activeSpell?.name ?? null,
      });
  if (attackResources.kind === 'unavailable') {
    // A manual cast without its runes does nothing: the player has turned to the target, but nothing
    // is cast or spent, no cooldown starts, and the weapon does not attack in its place.
    if (manualCastSpell) clearPlayerAttackIntent(player);
    return;
  }
  const damageType = formulaStyleToDamageType(formulaStyle);
  const attackKind = formulaStyleToAttackKind(formulaStyle);

  const spellId = attackResources.kind === 'spell' ? attackResources.spellId : activeSpell?.name;
  const conflictionAttack = resolveConflictionAttackIdentity({
    equipment: player.equipment,
    formulaStyle,
    attackResources,
    targetId: npc.id,
  });
  const conflictionAccuracyMode = getConflictionAccuracyMode(player.pendingConflictionAttack, conflictionAttack);
  const finalStyle = isSpecAttack && specDef?.styleOverride ? specDef.styleOverride : damageType;
  const finalKind = isSpecAttack && specDef?.attackKindOverride ? specDef.attackKindOverride : attackKind;
  const finalSpeed = isSpecAttack && specDef?.attackSpeedOverride ? specDef.attackSpeedOverride : effectiveSpeed;

  const distance = chebyshevDistanceToRect(
    player.position[0],
    player.position[1],
    npc.position[0],
    npc.position[1],
    npc.size,
  );
  let impactDelayTicks: number;
  let projectileEndCycles: number | undefined;
  // A manual cast uses the spell's own timing, not the weapon's.
  const timingSpell = poweredSpecial
    ? null
    : manualCastSpell
      ? (getSpellCastInfo(manualCastSpell) ?? activeSpell)
      : activeSpell;
  if (timingSpell?.fixedHitDelay != null) {
    impactDelayTicks = timingSpell.fixedHitDelay;
  } else if (timingSpell) {
    const projTiming = PROJ_ANIM_TIMINGS.magic_spell;
    impactDelayTicks = hitDelayFromEndTime(calculateProjectileEndTime(projTiming, distance));
  } else if (isSpecAttack && specDef?.hitDelayTicks !== undefined) {
    impactDelayTicks = specDef.hitDelayTicks;
  } else {
    const projTiming = getProjectileTiming(player.equipment.weapon, isSpecAttack);
    projectileEndCycles = projTiming ? calculateProjectileEndTime(projTiming, distance) : undefined;
    impactDelayTicks =
      projectileEndCycles !== undefined
        ? hitDelayFromEndTime(projectileEndCycles)
        : calculateHitDelay(getHitDelayModel(player.equipment.weapon, formulaStyle), distance);
  }

  const encounterCtx = { tick: deps.world.tick, player, world: deps.world };
  const outgoingDamageMultiplier = resolveDynamic(deps.encounterRules?.outgoingDamageMultiplier, encounterCtx) ?? 1;
  const specialAttackDamageMultiplier = isSpecAttack
    ? (resolveDynamic(deps.encounterRules?.specialAttacks?.damageMultiplier, encounterCtx) ?? 1)
    : 1;
  const multiTarget =
    isSpecAttack || spellId === undefined || deps.encounterRules?.multiCombat === false
      ? undefined
      : getSpellCastInfo(spellId)?.multiTarget;
  // A thrown chinchompa: its explosion shares the primary's one accuracy roll (see below).
  const chinchompaArea =
    isSpecAttack || manualCastSpell || formulaStyle !== 'ranged' || deps.encounterRules?.multiCombat === false
      ? undefined
      : getChinchompaArea(player.equipment.weapon);
  const area = multiTarget ?? chinchompaArea;
  const targets =
    area === undefined
      ? [npc]
      : [
          npc,
          ...selectSecondarySpellTargets(
            npc,
            deps.world.getNpcs().filter((candidate) => canInitiateAttackOnNpc(candidate, deps.world.tick)),
            area,
            // A Burst/Barrage, manual or autocast, also takes a neighbor on its kill tick; a chinchompa does not.
            multiTarget !== undefined ? canReceiveKillTickSpell : canReceiveNewAttack,
          ),
        ];
  const guaranteedMaximumForCast =
    multiTarget === undefined ? false : (deps.encounterRules?.consumePlayerGuaranteedMaxHit?.(encounterCtx) ?? false);

  const planTarget = (target: NpcActor, hitDelayTicks: number, options: FirstPartyPlayerAttackOptions) =>
    planFirstPartyPlayerAttack(
      {
        player,
        target,
        formulaStyle,
        resources: attackResources,
        attackSpeedTicks: finalSpeed,
        delivery: { style: finalStyle, attackKind: finalKind, impactDelayTicks: hitDelayTicks },
        application: { outgoingDamageMultiplier, specialAttackDamageMultiplier },
        manualCast: manualCastSpell !== null,
        isSpecialAttack: isSpecAttack,
        standardAccuracyMode: conflictionAccuracyMode,
        ...(deps.encounterRules === undefined ? {} : { encounterRules: deps.encounterRules }),
        encounterContext: encounterCtx,
        ...(deps.lookupItemStats === undefined ? {} : { lookupItemStats: deps.lookupItemStats }),
        // The primary's distance: a secondary's accuracy is the primary's (chinchompas) or ignores it.
        targetDistance: distance,
      },
      options,
    );
  const random = deps.random ?? Math.random;

  const resolvedTargets: Array<ResolvedSupplementalPlayerTarget> = [];
  let primarySelectedBranchIndex: number | null = null;
  // A chinchompa's secondaries land exactly when the primary does, each rolling its own damage up to
  // the max hit planned against it. No target-specific max-hit boost (Salve, Avarice) is modeled, so
  // that is the primary's max hit without one; one that is modeled later must stay off the
  // secondaries. A Barrage leaves this unset and rolls each target's accuracy independently.
  let sharedAccuracy: SharedAccuracy | undefined;
  for (const target of targets) {
    const isPrimary = target.id === npc.id;
    const firstPartyPlan = planTarget(
      target,
      impactDelayTicks,
      multiTarget !== undefined
        ? { consumeGuaranteedMaximum: false, guaranteedMaximum: guaranteedMaximumForCast }
        : chinchompaArea !== undefined && !isPrimary
          ? // Like a ricochet hop: the one-shot guaranteed maximum belongs to the primary hit.
            { consumeGuaranteedMaximum: false, guaranteedMaximum: false }
          : {},
    );
    if (firstPartyPlan?.kind === 'unsupported' || (firstPartyPlan === null && isSpecAttack)) {
      if (isPrimary) {
        if (specialAttackRequested) player.isSpecialAttackActive = false;
        return;
      }
      continue;
    }
    const result =
      firstPartyPlan === null
        ? {
            hits: [
              {
                damage: 0,
                accurate: false,
                style: finalStyle,
                attackKind: finalKind,
                impactDelayTicks,
              },
            ],
            maximumRolledDamages: [0],
            expectedHit: 0,
            selectedBranchIndex: null,
          }
        : resolveFirstPartyPlayerAttack(
            firstPartyPlan satisfies ReadyPlayerAttackPlan,
            random,
            isPrimary ? undefined : sharedAccuracy,
          );
    if (isPrimary) {
      primarySelectedBranchIndex = result.selectedBranchIndex;
      if (chinchompaArea !== undefined) sharedAccuracy = sharedAccuracyOf(firstPartyPlan, result);
    }
    resolvedTargets.push({ target, hits: result.hits, expectedHit: result.expectedHit });
  }

  const ricochet =
    projectileEndCycles !== undefined &&
    formulaStyle === 'ranged' &&
    !manualCastSpell &&
    !isSpecAttack &&
    deps.encounterRules?.multiCombat !== false &&
    hasRicochet(player.equipment.weapon)
      ? resolveRicochet(npc, projectileEndCycles, {
          // Only what the player could attack, in spawn order: the encounter's refusals (Sol's crystals
          // and solar flares, which have no Attack option) never take a hop; all 190 captured hops hit
          // Attack NPCs.
          candidates: deps.world
            .getNpcs()
            .filter(
              (candidate) =>
                candidate.formulaStats !== undefined &&
                canInitiateAttackOnNpc(candidate, deps.world.tick) &&
                deps.encounterRules?.validateAttack?.(finalKind, candidate.id, encounterCtx) !== false,
            ),
          primaryKilled: isLethalAtLaunch(npc, resolvedTargets[0], {
            outgoingDamageMultiplier,
            specialAttackDamageMultiplier,
            forcedMiss: deps.encounterRules?.validateAttack?.(finalKind, npc.id, encounterCtx) === false,
          }),
          random,
          planTarget,
        })
      : undefined;
  if (ricochet) {
    for (const hop of ricochet.hops) {
      const existing = resolvedTargets.find((resolved) => resolved.target.id === hop.target.id);
      if (existing) {
        // The second hop may return to the primary target: its hit joins that target's own hits.
        resolvedTargets[resolvedTargets.indexOf(existing)] = {
          target: existing.target,
          hits: [...existing.hits, ...hop.hits],
          expectedHit: existing.expectedHit + hop.expectedHit,
        };
      } else resolvedTargets.push(hop);
    }
  }

  const [primaryResult, ...supplementalTargets] = resolvedTargets;
  if (!primaryResult) return;
  if (specialAttackRequested) player.isSpecialAttackActive = false;
  if (plannedSpecialAttackState !== null) player.specialAttack = plannedSpecialAttackState;
  // Only now, with this attack's damage already rolled above, so its own stack cannot boost it.
  if (!manualCastSpell && isSoulreaperAxe(player.equipment.weapon)) {
    player.soulreaper = afterSoulreaperAttack(player.soulreaper, deps.world.tick, isSpecAttack);
  }

  const launchEffects = isSpecAttack ? specDef?.onFireEffects : undefined;

  launchPlayerAttack({
    player,
    target: npc,
    deps,
    hits: primaryResult.hits,
    expectedHit: primaryResult.expectedHit,
    supplementalTargets,
    formulaStyle,
    styleIndex,
    finalStyle,
    finalSpeed,
    resources: attackResources,
    conflictionAttack,
    spellId,
    manualCast: Boolean(manualCastSpell),
    isSpecialAttack: isSpecAttack,
    specialAttackDef: specDef,
    outgoingDamageMultiplier,
    specialAttackDamageMultiplier,
    selectedBranchIndex: primarySelectedBranchIndex,
    ...(launchEffects === undefined ? {} : { onLaunchEffects: launchEffects }),
    ...(ricochet === undefined || ricochet.flights.length === 0 ? {} : { ricochets: ricochet.flights }),
  });
}

/**
 * Plans every hop of a ricocheting shot ({@link selectRicochetTargets}). Each hop rolls its own
 * accuracy against its own target at two-thirds of the max hit there, never consuming the player's
 * one-shot guaranteed maximum (Sol's perfect parry), which belongs to the primary hit; a target that
 * always takes a player's maximum still does, at two-thirds (VERIFIED post-update on the seer:
 * 27->18 5/5, 31->20 3/3).
 * A hop whose target cannot be planned still flies, so the next hop keeps its source.
 */
function resolveRicochet(
  primary: NpcActor,
  primaryEndCycles: number,
  input: {
    readonly candidates: readonly NpcActor[];
    readonly primaryKilled: boolean;
    readonly random: () => number;
    readonly planTarget: (
      target: NpcActor,
      hitDelayTicks: number,
      options: FirstPartyPlayerAttackOptions,
    ) => ReturnType<typeof planFirstPartyPlayerAttack>;
  },
): { readonly hops: readonly ResolvedSupplementalPlayerTarget[]; readonly flights: readonly RicochetFlight[] } {
  const hops: ResolvedSupplementalPlayerTarget[] = [];
  const flights: RicochetFlight[] = [];
  let source = primary;
  for (const [hop, target] of selectRicochetTargets(primary, input.candidates, input.primaryKilled).entries()) {
    const startCycles = ricochetStartCycles(primaryEndCycles, hop);
    flights.push({
      targetId: target.id,
      sourcePosition: ricochetOrigin(source),
      targetPosition: [target.position[0], target.position[1]],
      targetSize: target.size,
      startCycles,
      endCycles: startCycles + RICOCHET_FLIGHT_CYCLES,
    });
    source = target;
    const plan = input.planTarget(target, hitDelayFromEndTime(startCycles), {
      consumeGuaranteedMaximum: false,
      guaranteedMaximum: false,
      maximumHitScale: RICOCHET_MAX_HIT_SCALE,
    });
    if (plan === null || plan.kind === 'unsupported') continue;
    const result = resolveFirstPartyPlayerAttack(plan, input.random);
    hops.push({ target, hits: result.hits, expectedHit: result.expectedHit });
  }
  return { hops, flights };
}

/**
 * Whether the hits already rolled against the primary target will kill it, scaled as they will be
 * when they land (an accurate 0 becomes 1). Every roll is made on the launch tick, so the game can
 * know this when it picks the ricochet's hops.
 */
function isLethalAtLaunch(
  target: NpcActor,
  resolved: ResolvedSupplementalPlayerTarget | undefined,
  application: {
    readonly outgoingDamageMultiplier: number;
    readonly specialAttackDamageMultiplier: number;
    readonly forcedMiss: boolean;
  },
): boolean {
  if (resolved?.target.id !== target.id || application.forcedMiss) return false;
  const damage = resolved.hits.reduce((total, hit) => {
    if (!hit.accurate) return total;
    const outgoing = Math.floor(Math.max(1, Math.floor(hit.damage)) * application.outgoingDamageMultiplier);
    return total + Math.max(0, Math.floor(outgoing * application.specialAttackDamageMultiplier));
  }, 0);
  return damage >= target.vitals.hp;
}
