import type { DamageType } from '../../../actors/types';
import type { AttackKind } from '../../../events/types';
import type { BurnSeverity, LayBurnStackInput } from '../../burnStacks';

type SharedSpecialAttackEffect =
  | { readonly effect: 'weaken' }
  | { readonly effect: 'condemn' }
  | {
      effect: 'drain_defence';
      percent?: number; // e.g., 30 for DWH (30% of current defence)
      flat?: boolean; // true for BGS (drain by damage dealt — handled at resolution time)
    }
  | {
      effect: 'drain_magic';
      base: number;
      percentOfDamage: number;
    }
  | {
      /**
       * Percent of the target's CURRENT Attack (/w/Shadow_spells). Deliberately not folded in with
       * `drain_magic`: that one adds `base + % of the DAMAGE` and stacks on every hit, where this
       * reads the stat and is refused once the stat is already down. One shared variant would have
       * to carry both formulas and both stacking rules to say less than these two do apart.
       */
      effect: 'drain_attack';
      percent: number;
    }
  | {
      /** Ordinary poison at this severity (/w/Smoke_spells); the 1/8 roll happens before launch. */
      effect: 'poison';
      severity: number;
      readonly chancePercent?: number;
    }
  | {
      effect: 'heal_hp';
      percentOfDamage: number;
      minimumHeal?: number;
    }
  | {
      effect: 'restore_prayer';
      percentOfDamage: number;
    }
  | {
      effect: 'burn';
      /** Only honored when this stack starts a fresh cadence — see {@link LayBurnStackInput}. */
      firstPulseDelayTicks?: number;
      pulses: number;
      /** Decides which monsters resist it; NOT implied by the damage, which is `pulses` (/w/Burn). */
      severity: BurnSeverity;
      /**
       * Whole-percent chance the burn lands on a hitsplat, indexed by the swing's selected damage
       * branch. Burning barrage's chance rises the later its first accuracy roll succeeds, so the
       * chance cannot be a single number here and cannot be rolled inside the effect, which never
       * sees the branch. `launchPlayerAttack` resolves this to a landed/dropped effect per splat.
       */
      chancePercentByBranch?: readonly number[];
    };

export type SpecialAttackEffect =
  | SharedSpecialAttackEffect
  | {
      effect: 'bind';
      delayTicks?: number;
      durationTicks: number;
    }
  | {
      /**
       * Ice-spell freeze. Writes the same movement-lock window as `bind` but will NOT refresh or
       * extend a live one, so it cannot reuse `bind`'s merge: /w/Ice_spells refuses a freeze on an
       * already-frozen target outright. Freeze resistance is applied here, not in the spell data.
       * Applied at LAUNCH even when listed as a post-hit effect (see
       * `CombatSystem.applyFreezeAtLaunch`): the window opens the tick after the attack fires.
       */
      effect: 'freeze';
      durationTicks: number;
    };

/**
 * Healing applied on the tick the attack is FIRED rather than when its hitsplat lands.
 *
 * The Toxic blowpipe is the direct measurement, and the only one: HP reads 52 at tick 1082 and 59
 * at tick 1088 (capture inferno-waves-69-zuk-packet-data.txt:18647,18748) for a splat that
 * does not land until 1091 (:18843), an unambiguous level change ahead of its own damage. That
 * fixes the model for THIS interface; it does not by itself date Blood's transition, which rests
 * on the drain message and the wiki instead (see `resolveSpellLaunchHeal`). Healing that waits
 * for the hitsplat is the wrong model for both.
 */
export interface LaunchHeal {
  readonly percentOfDamage: number;
  readonly minimumHeal: number;
}

export interface SpecialAttackDef {
  /** Power of Death is activated by the toggle, not by an attack. */
  readonly instantEffect?: 'powerOfDeath';
  /** Condemn always casts the built-in spell, including the autocast variant. */
  readonly poweredSpellWeaponId?: number;
  /** Energy cost in percent (e.g., 50 for 50%). Defaults to 50 in `PlayerAutoAttackSystem`. */
  energyCost?: number;

  /**
   * `monsters.json` attribute the target must carry, or the special is REFUSED outright:
   * no energy spent, no effects, and the swing resolves as an ordinary attack. Scorching
   * shackles is the case that pins the semantics — "Against non-demonic creatures, attempting
   * to use the special attack results in the message *Scorching shackles won't work against a
   * non-demon enemy*" (wiki, Scorching bow § Special attack).
   *
   * Enforced once, before the energy is spent, rather than inside each effect. Guarding the
   * effects instead still charges the player 25% for a swing that does nothing, which is what
   * the refusal message rules out.
   */
  targetAttribute?: string;

  /** Attack speed override in ticks. */
  attackSpeedOverride?: number;

  styleOverride?: DamageType;

  /**
   * The target defence the special rolls against, when it is fixed. The attack roll still uses the
   * selected style's bonus and stance: "Special attacks almost always roll their accuracy alongside
   * whichever attack style the player has selected ... What these special attacks roll their
   * accuracy against ... is specific to the special attack" (/w/Special_attacks, rev 15350782,
   * whose per-special "Defence roll" row supplies each value). Omitted means the selected style's
   * defence, which the wiki lists as "Selected combat style" for e.g. Burning barrage.
   */
  defenceStyle?: 'melee_stab' | 'melee_slash' | 'melee_crush';

  attackKindOverride?: AttackKind;

  isMultiHit?: boolean;

  guaranteedHit?: boolean;

  /**
   * Ticks from the swing to the hitsplat, replacing the WEAPON's projectile timing — a spell's
   * still wins, because a manual cast is not this weapon's attack. Set it only where a capture
   * shows the projectile timing cannot produce the observed landing at ANY parameters, which is
   * what this exists for: Scorching shackles lands a tick after the same bow's ordinary arrow
   * does from the same tile, off a longer projectile flight.
   */
  hitDelayTicks?: number;

  /** Effects applied only when the spec deals damage. */
  postHitEffects?: SpecialAttackEffect[];

  readonly launchHeal?: LaunchHeal;

  /**
   * Effects guaranteed when the spec is fired, whether or not it hits. Every one of them is
   * SCHEDULED at launch — see {@link NpcDebuffs.boundFromTick} for why a bind cannot ride the
   * pending hit. Keeping these separate from `postHitEffects` preserves Scorching shackles on
   * a miss.
   */
  onFireEffects?: SpecialAttackEffect[];

  animationId?: number;

  /** Player spotanim/graphic played with the spec (e.g. dragon claws 1171). undefined/-1 = none. */
  graphicId?: number;

  /**
   * Graphic played on the TARGET when the spec is fired, as the capture's NPC `spotanim` line gives it:
   * `delayCycles` in client cycles (30 per tick) and `height` above the actor.
   */
  readonly targetGraphic?: {
    readonly spotAnimId: number;
    /** Or `projectile_arrival`, when the packet delay tracks the special projectile's `endtime`. */
    readonly delayCycles: number | 'projectile_arrival';
    readonly height: number;
  };

  onKillEffect?: OnKillEffect;
}

/**
 * On-kill effects triggered when a special attack's hit is the killing blow.
 * These are checked when the pending hit resolves and the target dies.
 */
export interface OnKillEffect {
  refundSpecEnergy?: number;
  /**
   * Reduce the player's next attack delay by this many ticks (e.g., 3 for Purging Staff).
   * Not the same as the gap the player observes: `CombatSystem.reduceNextAttackTick` documents
   * why 3 off a 5-tick weapon yields a 3-tick gap, not 2.
   */
  reduceAttackDelayTicks?: number;
  /**
   * Spotanim played on the killed NPC, chosen by its size: entry `size - 1`, the last entry for
   * anything larger. The cache ships one variant per footprint.
   */
  targetGraphicBySize?: readonly number[];
}

/**
 * Registry of special attack definitions, keyed by weapon item ID.
 */
export type SpecialAttackRegistry = Readonly<Record<number, SpecialAttackDef>>;
