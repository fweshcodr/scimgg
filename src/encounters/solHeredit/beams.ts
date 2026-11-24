import type { EnvironmentalDamage } from '../../core/encounters/types';
import { type ColosseumRelentlessRank, RELENTLESS_MAX_HIT_BONUS } from '../../npcs/colosseum/constants';
import { beamLineTiles, type CrystalActor } from '../../npcs/colosseum/crystal';
import type { Coordinate } from '../../types/simulation';
import {
  BEAM_CHARGE_TICKS,
  BEAM_ENRAGE_CHARGE_TICKS,
  BEAM_ENRAGE_READY_DELAY_TICKS,
  BEAM_MAX_HIT,
  BEAM_MIN_HIT,
  BEAM_PREPARATION_LEAD_TICKS,
  BEAM_READY_DELAY_TICKS,
  CRYSTAL_ENRAGED_RESUME_AFTER_FIRE_TICKS,
  CRYSTAL_RESUME_AFTER_FIRE_TICKS,
} from './constants';
import { isEnraged, type SolPhase } from './phases';

export interface BeamRound {
  readonly chargeTick: number;
  readonly fireTick: number;
  readonly resumeAfterFireTicks: number;
  readonly lines: readonly {
    readonly actorId: string;
    readonly index: number;
    readonly tiles: readonly Coordinate[];
  }[];
}

interface PreparedRound {
  readonly chargeTick: number;
  readonly chargeTicks: number;
}

/**
 * One shared clock for every crystal. Once a round is ready, its warning goes out on the next tick
 * Sol starts an attack, so the beam charges on the tick that attack lands and fires four ticks
 * later (three enraged). Every captured warning sits on a Sol telegraph (26 in K/M/N, 57 in L,
 * one of them a grapple at L:5478; analysis section 12).
 * That one rule is also why the first crystal charges eight ticks after it spawns and why no charge
 * comes sooner than ten ticks after a transition: the taunt takes his attack slot, and his next
 * telegraph is seven ticks later.
 */
export class SolBeamRounds {
  private round: BeamRound | null = null;
  private prepared: PreparedRound | null = null;
  /** The warning may go out from this tick; null until a crystal exists. */
  private readyTick: number | null = null;
  /** The round that last fired and its fire tick, for the debug overlay. */
  private fired: { readonly tick: number; readonly round: BeamRound } | null = null;
  /** When a fire that caught the player lands its hit; null when none is owed. */
  private hitTick: number | null = null;

  /** Also drops a hit still owed, as Sol's own attacks are dropped on his death (unobserved). */
  reset(): void {
    this.round = null;
    this.prepared = null;
    this.readyTick = null;
    this.fired = null;
    this.hitTick = null;
  }

  /** Whether crystals must hold still: from the warning until the round fires. */
  isHolding(): boolean {
    return this.round !== null || this.prepared !== null;
  }

  getChargingLines(): readonly Coordinate[] {
    return this.round?.lines.flatMap((line) => [...line.tiles]) ?? [];
  }

  /** Tiles of the round that fired, and tested the player's tile, on `tick`; empty on every other tick. */
  getFiredLines(tick: number): readonly Coordinate[] {
    return this.fired?.tick === tick ? this.fired.round.lines.flatMap((line) => [...line.tiles]) : [];
  }

  /** The first crystal makes a round ready at once; later crystals join the running clock. */
  enroll(tick: number): void {
    this.readyTick ??= tick;
  }

  /** Whether a warning would go out if Sol attacked on `tick`. */
  isReady(crystals: readonly CrystalActor[], tick: number): boolean {
    return crystals.length > 0 && !this.isHolding() && this.readyTick !== null && tick >= this.readyTick;
  }

  /**
   * Stops the crystals before they move on the warning tick. Crystals move ahead of the encounter's
   * own processing, so this runs from the movement stage. PARTIAL: a crystal whose NPC index is
   * above Sol's skipped the step due on the warning tick in all 66 due cases (e.g. N 7461 step,
   * 7463 warning, no step), but the 3 crystals indexed below Sol's took it 8/8 (L beam 4 at
   * L:5640/5672/5704/5755/5797/5809; A's two), which fits server NPC order. The sim has no NPC
   * indices, so every crystal holds.
   */
  holdForWarning(crystals: readonly CrystalActor[]): void {
    for (const crystal of crystals) crystal.state.charging = true;
  }

  /** On the tick Sol attacks, sends a ready round's warning and returns the ticks until it fires. */
  prepare(crystals: readonly CrystalActor[], tick: number, enraged: boolean): number | null {
    if (!this.isReady(crystals, tick)) return null;
    const chargeTicks = enraged ? BEAM_ENRAGE_CHARGE_TICKS : BEAM_CHARGE_TICKS;
    this.prepared = { chargeTick: tick + BEAM_PREPARATION_LEAD_TICKS, chargeTicks };
    this.readyTick = null;
    // A crystal added this tick missed the movement-stage hold.
    this.holdForWarning(crystals);
    return BEAM_PREPARATION_LEAD_TICKS + chargeTicks;
  }

  /** Starts the prepared round on its charge tick. No round charges without its warning. */
  startChargeIfDue(crystals: readonly CrystalActor[], tick: number): BeamRound | null {
    const prepared = this.prepared;
    if (crystals.length === 0 || prepared === null || tick < prepared.chargeTick) return null;
    this.round = {
      chargeTick: tick,
      fireTick: tick + prepared.chargeTicks,
      // Crystals resume at fire+3, or fire+2 after an enraged round (K 4214; N 7739/7751/7763/7774).
      resumeAfterFireTicks:
        prepared.chargeTicks === BEAM_ENRAGE_CHARGE_TICKS
          ? CRYSTAL_ENRAGED_RESUME_AFTER_FIRE_TICKS
          : CRYSTAL_RESUME_AFTER_FIRE_TICKS,
      lines: crystals.map((actor) => ({
        actorId: actor.id,
        index: actor.state.index,
        tiles: beamLineTiles(actor.state.index, actor.position),
      })),
    };
    this.holdForWarning(crystals);
    this.prepared = null;
    return this.round;
  }

  /** Beams switched off: drop any round in progress or hit owed, keep it ready, and release every crystal. */
  cancelRound(crystals: readonly CrystalActor[]): void {
    const resumeFrom = this.round?.fireTick ?? null;
    if (this.round !== null) this.readyTick = this.round.fireTick;
    else if (this.prepared !== null) this.readyTick = this.prepared.chargeTick - BEAM_PREPARATION_LEAD_TICKS;
    this.round = null;
    this.prepared = null;
    this.fired = null;
    this.hitTick = null;
    for (const crystal of crystals) {
      crystal.state.charging = false;
      if (resumeFrom !== null) crystal.state.nextStepTick = resumeFrom;
    }
  }

  /**
   * Enrage makes an idle clock ready at once, so Sol's next attack after the taunt warns. VERIFIED
   * that it accelerates (K 4206, N 7731, L 5755 warn on that attack, 11-16 ticks after the last fire,
   * which a 22-29 roll cannot produce; M 8508 is consistent); MODEL that the reset is immediate.
   * A round already warned or charging is left alone and its fire rolls the enraged delay.
   */
  enrage(tick: number): void {
    if (this.isHolding() || this.readyTick === null) return;
    this.readyTick = Math.min(this.readyTick, tick);
  }

  /**
   * Fires the charged round on its fire tick. The tile tested is the one the player starts the fire
   * tick on (`playerPos` is pre-movement), and a struck player takes the hit one tick later; see
   * `takeHitIfDue`. VERIFIED from one hit and three misses: start-of-F on the line, 67 at F+1
   * (L:5583->5584, splat shown while moving off); stepping on during F is safe (L:5409, L:5446,
   * L:5744 began F+1 on the line, no hit). UNVERIFIED: A:5184 started F on the line, untouched.
   */
  fireIfDue(
    crystals: readonly CrystalActor[],
    input: {
      readonly tick: number;
      readonly playerPos: Readonly<Coordinate>;
      readonly phase: SolPhase;
      readonly random: () => number;
    },
  ): { readonly round: BeamRound } | null {
    const round = this.round;
    if (round === null || input.tick !== round.fireTick) return null;
    this.round = null;
    this.fired = { tick: input.tick, round };
    this.readyTick = input.tick + this.rollReadyDelay(input.phase, input.random);
    for (const crystal of crystals) {
      crystal.state.charging = false;
      crystal.state.nextStepTick = input.tick + round.resumeAfterFireTicks;
    }
    const struck = round.lines.some((line) =>
      line.tiles.some(([x, y]) => x === input.playerPos[0] && y === input.playerPos[1]),
    );
    if (struck) this.hitTick = input.tick + 1;
    return { round };
  }

  /**
   * Lands the hit a fire decided on the previous tick, wherever the player now is. One hit per fire,
   * however many lines covered the tile. Rolls only when a hit lands.
   */
  takeHitIfDue(
    tick: number,
    playerPos: Readonly<Coordinate>,
    damage: { readonly random: () => number; readonly relentless: ColosseumRelentlessRank },
  ): EnvironmentalDamage[] {
    if (this.hitTick === null || tick < this.hitTick) return [];
    this.hitTick = null;
    // UNVERIFIED model (BEAM_MIN_HIT): higher of two rolls over 40..75 + the Relentless bonus.
    const max = BEAM_MAX_HIT + RELENTLESS_MAX_HIT_BONUS[damage.relentless];
    const roll = () => BEAM_MIN_HIT + Math.floor(damage.random() * (max - BEAM_MIN_HIT + 1));
    return [
      {
        baseDamage: Math.max(roll(), roll()),
        attackType: 'typeless',
        source: 'SolLightBeam',
        playerPosition: [...playerPos],
      },
    ];
  }

  private rollReadyDelay(phase: SolPhase, random: () => number): number {
    // Every fire takes one draw, enraged or not, so the seeded stream does not depend on the phase.
    const roll = random();
    if (isEnraged(phase)) return BEAM_ENRAGE_READY_DELAY_TICKS;
    const [min, max] = BEAM_READY_DELAY_TICKS;
    return min + Math.floor(roll * (max - min + 1));
  }
}
