import { getFormulaStyle } from '../../../core/combat/weaponCombatData';
import type { EncounterModifierSelection } from '../../../core/encounters/encounterFactory';
import type { EncounterEngineRules, EncounterHookEffect } from '../../../core/encounters/types';
import { CHAT_HIGHLIGHT_COLORS } from '../../../core/events/gameMessages';
import type { OverheadTextSegment } from '../../../core/events/types';
import { findWeaponCategoryKey, resolveActiveSpell } from '../../../types/attackStyles';
import type { MechanicsConfig } from '../../../types/simulation';
import { BEES_DAMAGE_SOURCE } from './bees';
import { SOLARFLARE_DAMAGE_SOURCE } from './solarflare';
import { VOLATILITY_DAMAGE_SOURCE } from './volatility';

/**
 * Sent on the stack's hit tick with the Doom varbit: `You now have @mes_hl_red@1/15 points</col> of
 * @mes_hl_red@doom!</col>` (waves capture tick 3259, Doom I); `<col=ff3045>1/5 points` in the older
 * Sol capture (Doom III). No capture reaches the lethal stack, so its line is assumed to follow suit.
 */
function doomMessage(stacks: number, lethalStacks: number): readonly OverheadTextSegment[] {
  return [
    { text: 'You now have ' },
    { text: `${stacks}/${lethalStacks} points`, color: CHAT_HIGHLIGHT_COLORS.red },
    { text: ' of ' },
    { text: 'doom!', color: CHAT_HIGHLIGHT_COLORS.red },
  ];
}

/** Per-run state, reusable by any Colosseum encounter; never reset on an individual NPC death. */
export class ColosseumModifierState {
  readonly selection: EncounterModifierSelection;
  doomStacks = 0;
  private mechanics: Readonly<Partial<MechanicsConfig>> = {};

  constructor(selection: EncounterModifierSelection = {}) {
    this.selection = Object.freeze({ ...selection });
  }

  configureRunStart(mechanics: Readonly<Partial<MechanicsConfig>>): void {
    this.mechanics = mechanics;
  }

  reset(): void {
    this.doomStacks = 0;
  }

  getEngineRules(): EncounterEngineRules {
    const { doom, blasphemy, frailty, myopia } = this.selection;
    return {
      // Wiki /w/Fortis_Colosseum/Modifiers oldid=15163385; Strategies oldid=15354864:
      // subtract floor(base * reduction), so 99 HP becomes 90/80/60, not 89/79/59.
      ...(frailty
        ? {
            playerMaxHpReduction: [0.1, 0.2, 0.4][frailty - 1],
            itemRestrictions: { blockOverheal: true },
          }
        : {}),
      ...(myopia
        ? ({
            modifyPlayerCombatParams: (params, ctx) => {
              const player = ctx.player;
              // Wiki /w/Fortis_Colosseum oldid=15352279: autocast is affected, manual casts are not.
              if (player.manualCastSpell) return params;
              const weapon = player.equipment.weapon;
              const style = getFormulaStyle(weapon, player.selectedAttackStyleIndex);
              const spell = resolveActiveSpell({
                weaponId: weapon,
                selectedStyleIndex: player.selectedAttackStyleIndex,
                selectedSpell: player.combatSupplies.selectedSpell,
                spellbook: player.combatSupplies.spellbook,
              });
              const attackRange = Math.max(1, params.attackRange - 2 * myopia);
              if (style !== 'ranged' && style !== 'magic' && !spell) {
                if (findWeaponCategoryKey(weapon) !== 'polearm') return params;
                // Wiki /w/Fortis_Colosseum/Strategies: Myopia
                // stops halberds attacking from a distance cardinally, but diagonal attacks are
                // unaffected. Range 1 everywhere, still reaching the diagonally adjacent tile.
                return { ...params, attackRange, meleeReach: 'diagonal' };
              }
              return { ...params, attackRange };
            },
          } satisfies EncounterEngineRules)
        : {}),
      ...(doom || blasphemy
        ? ({
            onPlayerDamageTaken: (info) => {
              // Simulator policy, capture UNVERIFIED: poison/venom pulses neither add Doom nor drain prayer.
              if (info.effectiveDamage <= 0 || info.damageOverTime) return null;
              const effect: EncounterHookEffect = {};
              // Wiki Modifiers oldid=15163385; no-Sol capture ticks 1542–2420, K:4067.
              // Hook routing excludes self-damage.
              if (doom) {
                this.doomStacks++;
                const lethalStacks = [15, 10, 5][doom - 1]!;
                effect.playerHitsplats = [{ amount: this.doomStacks, hitsplatType: 'doom' }];
                effect.gameMessage = doomMessage(this.doomStacks, lethalStacks);
                if (this.doomStacks >= lethalStacks && !this.mechanics.infiniteHealth) effect.fail = 'Doom';
              }
              // A:4985/5005/5030: full five-damage groups, then multiply by tier (36->21, 33->18, 44->24).
              // A:1508/2800/3487/4026: modifier hits still add Doom but never drain prayer.
              // Molten sand retains the ordinary drain; that interaction remains unverified.
              // Simulator policy: Bees are excluded; their direct hits still add Doom.
              if (
                blasphemy &&
                ![SOLARFLARE_DAMAGE_SOURCE, VOLATILITY_DAMAGE_SOURCE, BEES_DAMAGE_SOURCE].includes(info.source)
              ) {
                effect.prayerPointsDelta = -Math.floor(info.effectiveDamage / 5) * blasphemy;
              }
              return effect;
            },
          } satisfies EncounterEngineRules)
        : {}),
    };
  }
}
