import { getEquipmentCombatBaseId } from '../../../../data/equipmentCombatFamilies';
import { SpotAnimID } from '../../../../rs/config/spotanimtype/SpotAnimID';
import type { SpecialAttackDef, SpecialAttackRegistry } from './types';

const ELDER_MAUL_SPECIAL_ATTACK = {
  energyCost: 50,
  defenceStyle: 'melee_crush',
  animationId: 11124,
  graphicId: 2804,
  postHitEffects: [{ effect: 'drain_defence', percent: 35 }],
} satisfies SpecialAttackDef;

// /w/Accursed_sceptre#Special_attack and /w/Accursed_sceptre_(a)#Special_attack.
const CONDEMN = {
  energyCost: 50,
  poweredSpellWeaponId: 27665,
  styleOverride: 'magic',
  attackKindOverride: 'magic_fire',
  animationId: 9961,
  // No graphicId: its 2338 caster graphic, at the captured height 98, is Condemn's cast graphic in
  // `weaponCombatVisuals.ts`, which a registry graphic would replace at height 0.
  postHitEffects: [{ effect: 'condemn' }],
} satisfies SpecialAttackDef;

// /w/Abyssal_tentacle#Special_attack: freeze and approximate 50% poison even on a miss.
const BINDING_TENTACLE = {
  energyCost: 50,
  animationId: 1658,
  targetGraphic: { spotAnimId: 341, delayCycles: 0, height: 96 },
  onFireEffects: [
    { effect: 'freeze', durationTicks: 8 },
    { effect: 'poison', severity: 4, chancePercent: 50 },
  ],
} satisfies SpecialAttackDef;

const VOIDWAKER_SPECIAL = {
  energyCost: 50,
  styleOverride: 'magic',
  attackKindOverride: 'magic_fire',
  guaranteedHit: true,
  animationId: 11275,
  graphicId: 2834,
  targetGraphic: { spotAnimId: 2363, delayCycles: 0, height: 0 },
} satisfies SpecialAttackDef;

// `defenceStyle` values are each special's "Defence roll" row on /w/Special_attacks (rev 15350782).
// Specials the page gives no row for, and "Selected combat style" ones such as Burning barrage,
// roll against the selected style's defence. "CAPTURE" below is
// capture weapon-soulreaper-fang-dragonwarhammer-zombieaxe-noxhalberd-tridentoftheswamps-tridentoftheseas-packet-data.txt
export const SPECIAL_ATTACK_REGISTRY: SpecialAttackRegistry = {
  // /w/Emberlight#Special_attack: ordinary damage, stab defence, base-level drains.
  29589: {
    energyCost: 50,
    defenceStyle: 'melee_stab',
    animationId: 11138,
    graphicId: 2810,
    postHitEffects: [{ effect: 'weaken' }],
  },
  27665: CONDEMN,
  27679: CONDEMN,
  27676: CONDEMN,
  // /w/Staff_of_the_dead#Special_attack: non-attacking activation, 100% energy.
  11791: { energyCost: 100, instantEffect: 'powerOfDeath' },
  12904: { energyCost: 100, instantEffect: 'powerOfDeath' },
  22296: { energyCost: 100, instantEffect: 'powerOfDeath' },
  24144: { energyCost: 100, instantEffect: 'powerOfDeath' },
  12006: BINDING_TENTACLE,
  26484: BINDING_TENTACLE,
  // DRAGON_CLAWS
  13652: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    isMultiHit: true,
    animationId: 7514,
    graphicId: 1171, // Slice and Dice spec graphic
  },
  20784: { defenceStyle: 'melee_slash', energyCost: 50, isMultiHit: true, animationId: 7514, graphicId: 1171 },

  // SARADOMIN_GODSWORD
  11806: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7640,
    graphicId: 1209, // Healing Blade spec graphic
    postHitEffects: [
      { effect: 'heal_hp', percentOfDamage: 50 },
      { effect: 'restore_prayer', percentOfDamage: 25 },
    ],
  },
  20372: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7640,
    graphicId: 1209, // Healing Blade spec graphic
    postHitEffects: [
      { effect: 'heal_hp', percentOfDamage: 50 },
      { effect: 'restore_prayer', percentOfDamage: 25 },
    ],
  },

  // BANDOS_GODSWORD
  11804: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7642,
    postHitEffects: [{ effect: 'drain_defence', flat: true }],
  },
  20370: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7642,
    postHitEffects: [{ effect: 'drain_defence', flat: true }],
  },

  // ARMADYL_GODSWORD
  11802: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7644,
    graphicId: 1211,
  },
  20368: { defenceStyle: 'melee_slash', energyCost: 50, animationId: 7644, graphicId: 1211 },

  // ZAMORAK_GODSWORD
  11808: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7638,
    graphicId: 1210,
    // /w/Zamorak_godsword#Special_attack: successful-hit freeze for 19.2 seconds.
    postHitEffects: [{ effect: 'freeze', durationTicks: 32 }],
  },
  20374: {
    defenceStyle: 'melee_slash',
    energyCost: 50,
    animationId: 7638,
    graphicId: 1210,
    postHitEffects: [{ effect: 'freeze', durationTicks: 32 }],
  },

  // DRAGON_WARHAMMER — Smash: 1378 with `dragon_warhammer_sa_spotanim` on the player (CAPTURE tick 551).
  13576: {
    defenceStyle: 'melee_crush',
    energyCost: 50,
    animationId: 1378,
    graphicId: 1292,
    postHitEffects: [{ effect: 'drain_defence', percent: 30 }],
  },

  // EYE_OF_AYAK
  31113: {
    energyCost: 50,
    // capture yama_forfeit_breath.txt:210-212, the only captured spec (a splash).
    animationId: 12394,
    graphicId: 3364,
    attackSpeedOverride: 5,
    postHitEffects: [{ effect: 'drain_magic', base: 0, percentOfDamage: 100 }],
  },

  // PURGING_STAFF
  29594: {
    energyCost: 25,
    styleOverride: 'magic',
    onKillEffect: {
      refundSpecEnergy: 25,
      reduceAttackDelayTicks: 3,
      // "Scatter ashes": `spotanim slot=5, id=vfx_ignite_staff_01_2x2 (2812)` on the killed npc,
      // plus `synth_sound 9315, delay=5` (coreAudioRules) - capture yama_divine_severance.txt
      // tick 3214. Only the 2x2 is captured (every kill is a 2x2 void flare); the 1x1/3x3 picks
      // follow the variants' RuneLite gameval names.
      targetGraphicBySize: [
        SpotAnimID.VFX_IGNITE_STAFF_01_1X1,
        SpotAnimID.VFX_IGNITE_STAFF_01_2X2,
        SpotAnimID.VFX_IGNITE_STAFF_01_3X3,
      ],
    },
  },

  // VOIDWAKER
  27690: VOIDWAKER_SPECIAL,

  // SCORCHING_BOW — "Scorching shackles"
  //
  // All four numbers below are measured off the two sensory-clouding captures and NONE of them
  // is derivable from the others. In particular `hitDelayTicks` must not be dropped in favor of
  // the bow's projectile timing, which lands the special a tick early at footprint distances 1-2,
  // and the bind delay must not become `hitDelayTicks - 1`, which would drag the bind along with
  // an unobserved long-range hit delay. Derivations, subset sizes and the distances still
  // unobserved: `docs/encounters/sensory-clouding-open-questions.md` entries 6 and 6b, redrawn
  // from the captures by `captureConformance.test.ts`.
  //
  // Both effects sit on `onFireEffects`, not `postHitEffects`, because the wiki's "regardless of
  // whether it is a successful hit or not" is visible in the captures: five of the eight casts
  // whose splat is unambiguously the player's land a `hit id=12, value=0` and still pin Yama and
  // start the burn.
  //
  // The visuals come from the same casts: `sequence id=human_weapon_bow_scorched_01_spec
  // (11133)` with `spotanim slot=1, id=vfx_human_scorching_bow_special_attack_01 (2806)` on the
  // caster. Its projectile (2807) and impact (2908) live with the other weapon visuals in
  // `weaponCombatVisuals.ts`; the second target spotanim, 2808, lands with the impact.
  29591: {
    energyCost: 25,
    targetAttribute: 'demon',
    animationId: 11133,
    graphicId: 2806,
    targetGraphic: { spotAnimId: 2808, delayCycles: 'projectile_arrival', height: 0 },
    hitDelayTicks: 3,
    onFireEffects: [
      { effect: 'bind', delayTicks: 2, durationTicks: 21 },
      // SIX, not the five /w/Burn describes as "5 hitpoints over 20 ticks (12 seconds) in the
      // case of the scorching bow's special attack". Five separate burns in the sensory-clouding
      // capture each run exactly six splats four ticks apart (ticks 8846-8866, 8902-8922,
      // 8932-8952, 9046-9066). The capture outranks the wiki.
      { effect: 'burn', firstPulseDelayTicks: 3, pulses: 6, severity: 'normal' },
    ],
  },

  // capture burning-claws-special-attack-packet-data.txt:48,56-58: 35% energy,
  // animation 11140, spotanim 2814.
  // One burn chance is rolled per hitsplat. Its first pulse stays one full period after impact.
  29577: {
    energyCost: 35,
    isMultiHit: true,
    animationId: 11140,
    graphicId: 2814,
    postHitEffects: [
      // Each stack deals 10 damage over 40 ticks (/w/Burning_claws); `pulses` is per stack.
      // The wiki's 19/29 multi-stack totals remain unresolved; reducing pulses breaks single-stack damage.
      { effect: 'burn', pulses: 10, severity: 'normal', chancePercentByBranch: [15, 30, 45] },
    ],
  },

  // Armadyl crossbow: the ordinary reload clip on the special too (weapon sweep capture, tick 1024).
  11785: { energyCost: 50, animationId: 7552 },

  12926: {
    energyCost: 50,
    animationId: 5061,
    // capture inferno-waves-69-zuk-packet-data.txt:18647,18748,18843:
    // HP 52->59 at launch tick 1088, before the 15-damage impact at tick 1091.
    launchHeal: { percentOfDamage: 50, minimumHeal: 0 },
  },

  // DRAGON_DAGGER
  1215: { defenceStyle: 'melee_slash', animationId: 1062 },
  1231: { defenceStyle: 'melee_slash', animationId: 1062 },
  5680: { defenceStyle: 'melee_slash', animationId: 1062 },
  5698: { defenceStyle: 'melee_slash', animationId: 1062 },

  // ABYSSAL_DAGGER
  13265: { defenceStyle: 'melee_slash', animationId: 3300 },
  13267: { defenceStyle: 'melee_slash', animationId: 3300 },
  13269: { defenceStyle: 'melee_slash', animationId: 3300 },
  13271: { defenceStyle: 'melee_slash', animationId: 3300 },

  // DRAGON_LONGSWORD
  1305: { defenceStyle: 'melee_slash', animationId: 1058 },

  // DRAGON_SWORD
  21009: { defenceStyle: 'melee_stab', animationId: 7515 },

  // DRAGON_SCIMITAR
  // /w/Dragon_scimitar#Special_attack: 55%, not the usual 50%.
  4587: { energyCost: 55, defenceStyle: 'melee_slash', animationId: 1872 },

  // DRAGON_MACE
  1434: { defenceStyle: 'melee_crush', animationId: 1060 },

  // ANCIENT_MACE
  11061: { defenceStyle: 'melee_crush', animationId: 6147 },

  // GRANITE_MAUL
  4153: { animationId: 1667 },
  12848: { animationId: 1667 },

  // DRAGON_BATTLEAXE
  1377: { animationId: 1056 },

  // DRAGON_HALBERD
  3204: { defenceStyle: 'melee_slash', animationId: 1203 },

  // CRYSTAL_HALBERD
  23987: { defenceStyle: 'melee_slash', animationId: 1203 },
  23986: { defenceStyle: 'melee_slash', animationId: 1203 },

  // SHOVE — dragon spear, Zamorakian spear, Zamorakian hasta.
  // Explicit 25% avoids the registry default of 50% (wiki, Zamorakian hasta § Special attack).
  1249: { energyCost: 25, animationId: 1064 },
  1263: { energyCost: 25, animationId: 1064 },
  5716: { energyCost: 25, animationId: 1064 },
  5730: { energyCost: 25, animationId: 1064 },
  11824: { energyCost: 25, animationId: 1064 },
  11889: { energyCost: 25, animationId: 1064 },

  // ABYSSAL_WHIP
  4151: {
    energyCost: 50,
    defenceStyle: 'melee_slash',
    animationId: 1658,
    targetGraphic: { spotAnimId: 341, delayCycles: 0, height: 96 },
  },
  12773: {
    energyCost: 50,
    defenceStyle: 'melee_slash',
    animationId: 1658,
    targetGraphic: { spotAnimId: 341, delayCycles: 0, height: 96 },
  },
  12774: {
    energyCost: 50,
    defenceStyle: 'melee_slash',
    animationId: 1658,
    targetGraphic: { spotAnimId: 341, delayCycles: 0, height: 96 },
  },
  26482: {
    energyCost: 50,
    defenceStyle: 'melee_slash',
    animationId: 1658,
    targetGraphic: { spotAnimId: 341, delayCycles: 0, height: 96 },
  },

  // SARADOMIN_SWORD
  11838: { animationId: 1132 },

  // SARADOMIN_BLESSED_SWORD
  12809: { animationId: 1132 },

  // ABYSSAL_BLUDGEON
  // capture abyssal-bludgeon-special-attack-packet-data.txt:15: abyssal_miasma_spotanim_bludgeon on the target.
  13263: { animationId: 3299, targetGraphic: { spotAnimId: 1284, delayCycles: 15, height: 0 } },

  // ELDER_MAUL
  21003: ELDER_MAUL_SPECIAL_ATTACK,
  27100: ELDER_MAUL_SPECIAL_ATTACK,

  // DINHS_BULWARK
  21015: { defenceStyle: 'melee_crush', animationId: 7511 },

  // DARK_BOW
  11235: { animationId: 426 },
  12765: { animationId: 426 },
  12766: { animationId: 426 },
  12767: { animationId: 426 },
  12768: { animationId: 426 },

  // MAGIC_SHORTBOW
  861: { animationId: 426 },

  // MAGIC_SHORTBOW_I
  12788: { animationId: 426 },

  // BALLISTA
  19478: { animationId: 7555 },
  19481: { animationId: 7555 },

  // DRAGON_CROSSBOW
  21902: { animationId: 4230 },

  // OSMUMTENS_FANG — Eviscerate: `weapon_sword_osmumten03_special` with
  // `spotanim_weapon_sword_osmumten_special` on the player, 25% energy (CAPTURE tick 522).
  26219: { defenceStyle: 'melee_stab', energyCost: 25, animationId: 11222, graphicId: 2833 },
  27246: { defenceStyle: 'melee_stab', energyCost: 25, animationId: 11222, graphicId: 2833 },

  // SOULREAPER_AXE — Behead: free, usable at any energy, spends the soul stacks
  // (/w/Soulreaper_axe). `ancient_axe_special` with its spotanim on the player (CAPTURE tick 473).
  28338: { energyCost: 0, animationId: 10173, graphicId: 2430 },

  // BLADE_OF_SAELDOR
  23995: { animationId: 390 },
  24551: { animationId: 390 },
  25870: { animationId: 390 },
  25872: { animationId: 390 },
  25874: { animationId: 390 },
  25876: { animationId: 390 },
  25878: { animationId: 390 },
  25880: { animationId: 390 },
  25882: { animationId: 390 },

  // VESTAS_LONGSWORD
  22613: { defenceStyle: 'melee_stab', animationId: 7515 },
  22622: { defenceStyle: 'melee_stab', animationId: 7515 },

  // STATIUS_WARHAMMER
  22616: { defenceStyle: 'melee_crush', animationId: 1378 },
  22625: { defenceStyle: 'melee_crush', animationId: 1378 },

  // VESTAS_SPEAR
  22610: { animationId: 8184 },
  22619: { animationId: 8184 },

  // MORRIGANS_THROWING_AXE
  22634: { animationId: 929 },
  22636: { animationId: 929 },

  // MORRIGANS_JAVELIN
  22631: { animationId: 929 },
  22633: { animationId: 929 },

  // DRAGON_PICKAXE
  11920: { animationId: 400 },
  12797: { animationId: 400 },
  23677: { animationId: 400 },
  25376: { animationId: 400 },

  // VERAC_FLAIL
  4755: { animationId: 2062 },
  4982: { animationId: 2062 },
} as const;

export function getSpecialAttackDef(weaponId: number): SpecialAttackDef | undefined {
  const definition = SPECIAL_ATTACK_REGISTRY[getEquipmentCombatBaseId(weaponId)];
  return definition !== undefined && weaponId === 28688 ? { ...definition, animationId: 10656 } : definition;
}

export function hasSpecialAttack(weaponId: number): boolean {
  return getSpecialAttackDef(weaponId) !== undefined;
}
