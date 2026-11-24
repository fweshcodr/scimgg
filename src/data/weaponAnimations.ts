/**
 * Source: geheur/weapon-animation-replacer data.json (RuneLite plugin).
 */

import type { AttackKind } from '../core/combat/attackTypes';
import { findWeaponCategoryKey } from '../types/attackStyles';
import { getEquipmentCombatBaseId } from './equipmentCombatFamilies';
import { WEAPON_ANIMATION_SETS } from './weaponCombatVisuals.generated';

export interface WeaponAnimationSet {
  idle: number;
  walk: number;
  run: number;
  walkBack: number;
  turnLeft: number;
  turnRight: number;
  /** Also the idle turn: the player turns on the spot with the weapon's 180° turn. */
  turn180: number;
  attack?: number;
  block?: number;
}

function toWeaponAnimationSet(generatedSet: (typeof WEAPON_ANIMATION_SETS)[number]): WeaponAnimationSet {
  const attack =
    generatedSet.mainAttack >= 0
      ? generatedSet.mainAttack
      : generatedSet.attackStyle1 >= 0
        ? generatedSet.attackStyle1
        : undefined;
  const block = generatedSet.defend >= 0 ? generatedSet.defend : undefined;

  return {
    idle: generatedSet.idle,
    walk: generatedSet.walk,
    run: generatedSet.run,
    walkBack: generatedSet.walkBack,
    turnLeft: generatedSet.turnLeft,
    turnRight: generatedSet.turnRight,
    turn180: generatedSet.turn180,
    attack,
    block,
  };
}

export const DEFAULT_ANIMATION_SET: WeaponAnimationSet = {
  idle: 808,
  walk: 819,
  run: 824,
  walkBack: 820,
  turnLeft: 821,
  turnRight: 822,
  turn180: 823,
  attack: 422,
};

const STAFF_ANIMS: WeaponAnimationSet = {
  idle: 813,
  walk: 1205,
  run: 1210,
  walkBack: 1206,
  turnLeft: 1207,
  turnRight: 1208,
  turn180: 1209,
  attack: 419,
  block: 424,
};

const STAB_SWORD_ANIMS: WeaponAnimationSet = {
  ...DEFAULT_ANIMATION_SET,
  idle: 809,
  attack: 386,
  block: 388,
};

const WHIP_ANIMS: WeaponAnimationSet = {
  ...DEFAULT_ANIMATION_SET,
  walk: 1660,
  run: 1661,
  walkBack: 1660,
  turnLeft: 1660,
  turnRight: 1660,
  turn180: 823,
  attack: 1658,
  block: 1659,
};

const TWO_HAND_SWORD_ANIMS: WeaponAnimationSet = {
  idle: 7053,
  walk: 7052,
  run: 7043,
  walkBack: 7052,
  turnLeft: 7048,
  turnRight: 7047,
  turn180: 7044,
  attack: 7045,
  block: 7056,
};

const TUMEKEN_SHADOW_ANIMS: WeaponAnimationSet = {
  idle: 9494,
  walk: 1703,
  run: 1707,
  walkBack: 1704,
  turnLeft: 1706,
  turnRight: 1705,
  turn180: 1702,
  attack: 9493,
  block: 424,
};

const CROSSBOW_ANIMS: WeaponAnimationSet = {
  ...DEFAULT_ANIMATION_SET,
  idle: 4591,
  walk: 4226,
  run: 4228,
  walkBack: 4227,
  turn180: 823,
  attack: 4230,
  block: 424,
};

const SLASH_SWORD_ANIMS: WeaponAnimationSet = {
  ...DEFAULT_ANIMATION_SET,
  attack: 390,
  block: 388,
};

/**
 * RuneLite gameval AnimationID HUMAN_CHINCHOMPA_{READY,WALK,RUN} (3175, 3177, 3178), which is the
 * black chinchompa's generated set; the grey and red have no generated set of their own. The
 * attack is the captured throw (`chinchompaVisuals` in `weaponCombatVisuals.ts`).
 */
const CHINCHOMPA_ANIMS: WeaponAnimationSet = {
  idle: 3175,
  walk: 3177,
  run: 3178,
  walkBack: 3177,
  turnLeft: 3177,
  turnRight: 3177,
  turn180: 3177,
  attack: 7618,
};

const CATEGORY_ANIMATION_SETS: Record<string, WeaponAnimationSet> = {
  '2h_sword': TWO_HAND_SWORD_ANIMS,
  stab_sword: STAB_SWORD_ANIMS,
  slash_sword: SLASH_SWORD_ANIMS,
  whip: WHIP_ANIMS,
  crossbow: CROSSBOW_ANIMS,
  chinchompa: CHINCHOMPA_ANIMS,
  staff: STAFF_ANIMS,
  powered_staff: STAFF_ANIMS,
  polearm: STAFF_ANIMS,
  partisan: STAB_SWORD_ANIMS,
};

const ELDER_MAUL_ANIMATION_SET: WeaponAnimationSet = {
  ...DEFAULT_ANIMATION_SET,
  idle: 7518,
  walk: 7520,
  run: 7519,
  walkBack: 7520,
  turnLeft: 7520,
  turnRight: 7520,
  turn180: 823,
  attack: 7516,
};

// Per-item overrides (when a specific weapon differs from its category)

const ITEM_ANIMATION_OVERRIDES: Record<number, WeaponAnimationSet> = {
  29000: { ...STAFF_ANIMS, attack: 11057 },

  // Elder maul (21003) — the 'blunt' category has no attack anim and its generated
  // attackStyle1 is -1, so without this row the swing falls back to the unarmed punch.
  21003: ELDER_MAUL_ANIMATION_SET,
  27100: ELDER_MAUL_ANIMATION_SET,

  // Inquisitor's mace (24417) — same shape as the elder maul above: the generated set has
  // mainAttack -1 AND attackStyle1 -1, so `toWeaponAnimationSet` yields no attack and the
  // swing falls back to the unarmed punch (422). The crush animation (4503) sits in that
  // set's attackStyle2 and is confirmed by both glyphic captures.
  //
  // Deliberately no `block`. The captures flinch with `warguild_parry_defend (4177)`, but
  // that is the DEFENDER's animation rather than the mace's. This chain is keyed on the
  // weapon alone, so 4177 here would only be right while a defender happens to be in the
  // offhand.
  24417: { ...DEFAULT_ANIMATION_SET, attack: 4503 },

  // Their generated main attacks are absent; attackStyle2 contains the captured crush clips.
  // Do not map unconfirmed attackStyle4 values as block clips: weapon overrides outrank offhands.
  13263: { ...DEFAULT_ANIMATION_SET, attack: 3298 },
  23528: { ...DEFAULT_ANIMATION_SET, attack: 401 },

  // The generated sets have no usable attack clip (none for the axes, -1 main and style 1 for the
  // warhammer), so these fall back to the unarmed punch without a row. The clips are the captured
  // ones in STYLE_ATTACK_ANIMATIONS below. Only the attack is this row's: the warhammer's generated
  // set comes first in the fallback chain, so its own poses (which equal the defaults) still win.
  13576: { ...DEFAULT_ANIMATION_SET, attack: 401 },
  28810: { ...DEFAULT_ANIMATION_SET, attack: 7004 },
  // Soulreaper axe, held over the shoulder: RuneLite gameval AnimationID ANCIENT_AXE_IDLE (10169),
  // ANCIENT_AXE_WALK (10170) and ANCIENT_AXE_RUN (11170, the run /w/Soulreaper_axe's 7 August 2024
  // update replaced). No turn clips are named, so turns walk like the elder maul's. The (o) variant
  // shares it through its combat family.
  28338: {
    idle: 10169,
    walk: 10170,
    run: 11170,
    walkBack: 10170,
    turnLeft: 10170,
    turnRight: 10170,
    turn180: 823,
    attack: 10172,
  },

  // Scythe of vitur — categorized as 'scythe' but has unique idle
  22325: { ...DEFAULT_ANIMATION_SET, idle: 8057 },
  22486: { ...DEFAULT_ANIMATION_SET, idle: 8057 },

  27275: TUMEKEN_SHADOW_ANIMS,

  // Zamorakian spear — categorized as 'spear' but has unique set
  11824: {
    idle: 1713,
    walk: 1703,
    run: 1707,
    walkBack: 1704,
    turnLeft: 1706,
    turnRight: 1705,
    turn180: 1702,
  },

  // Dragon hunter lance — categorized as 'spear' but uses staff-like + unique run
  22978: { ...STAFF_ANIMS, run: 2563 },
};

const GODSWORD_STYLE_ANIMATIONS: Partial<Record<AttackKind, number>> = { melee_crush: 7054 };
const SLASH_SWORD_STYLE_ANIMATIONS: Partial<Record<AttackKind, number>> = { melee_stab: 386 };

/**
 * Key by attack kind because Block shares Lunge/Pound clips rather than a style index.
 * Source: capture weapon-attacks-zamorakian-hasta-abyssal-bludgeon-sarachnis-cudgel-packet-data.txt
 */
const STYLE_ATTACK_ANIMATIONS: Record<number, Partial<Record<AttackKind, number>>> = {
  // Zamorakian hasta — human_dspear_stab / human_scythe_sweep / human_stafforb_pummel
  11889: { melee_stab: 381, melee_slash: 440, melee_crush: 419 },

  // Sarachnis cudgel — human_blunt_pound / human_blunt_spike
  23528: { melee_crush: 401, melee_stab: 400 },

  // Abyssal bludgeon — abyssal_bludgeon_crush
  13263: { melee_crush: 3298 },

  // Ghrazi rapier — ghrazi_rapier_attack on Lunge (com_mode 1): capture colosseum-no-sol-packet-data.txt:9487.
  // Only the stab swing is unique (/w/Ghrazi_rapier § Changes, 21 June 2018); Slash keeps the
  // generated human_sword_slash (390).
  22324: { melee_stab: 8145 },

  // Burning claws — Chop/Slash/Block all resolve to melee_slash, Lunge to melee_stab. Observed in
  // game. The generated table's 11140 is this weapon's SPECIAL clip, not either of these:
  // capture burning-claws-special-attack-packet-data.txt:58 names it `..._02_spec`.
  29577: { melee_slash: 393, melee_stab: 1067 },

  // The rest are from the weapon sweep capture, every style of each weapon, ticks given:
  // capture weapon-attacks-sgs-elder-maul-burning-claws-tbow-emberlight-accursed-sceptre-ghrazi-rapier-dragon-claws-scythe-bowfa-whip-tentacle-dhl-zspear-hasta-dscim-ags-zgs-voidwaker-dragon-pickaxe-packet-data.txt

  // Godswords — Smash plays dh_sword_update_smash on the Saradomin (370), Armadyl (876) and Zamorak
  // (981) godswords; every godsword's cache set carries the same clip as its crush style.
  11802: GODSWORD_STYLE_ANIMATIONS,
  11804: GODSWORD_STYLE_ANIMATIONS,
  11806: GODSWORD_STYLE_ANIMATIONS,
  11808: GODSWORD_STYLE_ANIMATIONS,
  26233: GODSWORD_STYLE_ANIMATIONS,

  // Slash swords — Lunge is human_sword_stab on the Dragon scimitar (842), Emberlight (483) and
  // Voidwaker (1049); their slash styles keep the generated human_sword_slash (390).
  4587: SLASH_SWORD_STYLE_ANIMATIONS,
  29589: SLASH_SWORD_STYLE_ANIMATIONS,
  27690: SLASH_SWORD_STYLE_ANIMATIONS,

  // Dragon claws — the same swings as the Burning claws: Lunge d_claws_punch (601-609).
  13652: { melee_slash: 393, melee_stab: 1067 },

  // Dragon hunter lance — lance attack / slash / crush (703-715).
  22978: { melee_stab: 8288, melee_slash: 8289, melee_crush: 8290 },

  // Zamorakian spear — zamorakspear stab / slash / lunge, the "lunge" clip on Pound (726-738).
  11824: { melee_stab: 1711, melee_slash: 1712, melee_crush: 1710 },

  // Dragon pickaxe — human_blunt_pound on Spike, Impale and Block; human_blunt_spike on Smash (1074-1089).
  11920: { melee_stab: 401, melee_crush: 400 },

  // Every style of each, from the soulreaper/fang/warhammer/axe/halberd/trident capture, ticks given:
  // capture weapon-soulreaper-fang-dragonwarhammer-zombieaxe-noxhalberd-tridentoftheswamps-tridentoftheseas-packet-data.txt
  // Soulreaper axe — the cache's names are swapped: Chop, Hack and Block (slash) play
  // ancient_axe_crush, Smash plays ancient_axe_slash (440-467).
  28338: { melee_slash: 10172, melee_crush: 10171 },
  // Osmumten's fang — human_osmumtens_fang on Stab, Lunge and Block; human_sword_slash on Slash (497-517).
  26219: { melee_stab: 9471, melee_slash: 390 },
  // Zombie axe — godwars_godsword_zamorak_player on Chop, Hack and Block; battleaxe_crush on Smash (560-577).
  28810: { melee_slash: 7004, melee_crush: 3852 },
  // Noxious halberd — human_spear_spike on Jab and Fend, human_scythe_sweep on Swipe (596-607).
  29796: { melee_stab: 428, melee_slash: 440 },
};

export function getWeaponStyleAttackAnimation(
  weaponId: number | undefined,
  attackKind: AttackKind | undefined,
): number | undefined {
  if (weaponId === undefined || attackKind === undefined) return undefined;
  return (
    STYLE_ATTACK_ANIMATIONS[weaponId]?.[attackKind] ??
    STYLE_ATTACK_ANIMATIONS[getEquipmentCombatBaseId(weaponId)]?.[attackKind]
  );
}

/**
 * Resolve the animation set for a weapon, with fallback chain for skeletal
 * animations. Returns ordered sets (most specific → least specific) so the
 * caller can try each animation slot in order until one is frame-based.
 */
export function getWeaponAnimationSetWithFallbacks(weaponId: number | undefined): WeaponAnimationSet[] {
  const sets: WeaponAnimationSet[] = [];

  if (weaponId !== undefined) {
    weaponId = getEquipmentCombatBaseId(weaponId);
    const generatedSet = WEAPON_ANIMATION_SETS[weaponId];
    if (generatedSet) {
      sets.push(toWeaponAnimationSet(generatedSet));
    }

    const itemOverride = ITEM_ANIMATION_OVERRIDES[weaponId];
    if (itemOverride) {
      sets.push(itemOverride);
    }

    const categoryKey = findWeaponCategoryKey(weaponId);
    if (categoryKey) {
      const categorySet = CATEGORY_ANIMATION_SETS[categoryKey];
      if (categorySet) {
        sets.push(categorySet);
      }
    }
  }

  sets.push(DEFAULT_ANIMATION_SET);

  return sets;
}

// Unlike every pose above, this is NOT a weapon-only lookup. It resolves OFFHAND-FIRST off a
// per-item `defend_anim`, as in rsmod (`PlayerExtensions.kt`, api/combat/combat-commons):
//
//     lefthand defend_anim, if set and NOT human_unarmedblock -> righthand defend_anim
//     -> human_unarmedblock
//
// An offhand whose own animation IS the unarmed block does not override the weapon — that is
// the `!isType(human_unarmedblock)` half of the rsmod rule, and it is why god books flinch
// with the WEAPON's clip. Do not map books to 420; that is `human_stafforb_block`, a weapon
// animation, and no source supports it as a book rule.

// Both ids below are unsourced and unmeasured; only 4177 below is capture-confirmed.
const UNARMED_BLOCK = 424;
/** What an offhand we hold no row for blocks with; the ordinary-shield block animation. */
const GENERIC_SHIELD_BLOCK = 1156;

/**
 * Per-item block animations, standing in for the `defend_anim` param a server reads off the
 * item. A table is unavoidable here: `ObjType` decodes params but no animation fields, and
 * the generated weapon table carries no shield rows at all, so there is no per-item
 * animation data in the build to read. 4177 is confirmed by two captures.
 */
const OFFHAND_BLOCK_ANIMATIONS: Record<number, number> = {
  8844: 4177, // Bronze defender
  8845: 4177, // Iron defender
  8846: 4177, // Steel defender
  8847: 4177, // Black defender
  8848: 4177, // Mithril defender
  8849: 4177, // Adamant defender
  8850: 4177, // Rune defender
  12954: 4177, // Dragon defender
  19722: 4177, // Dragon defender (t)
  22322: 4177, // Avernic defender
};

/**
 * Offhands that decline to override, i.e. whose `defend_anim` is the unarmed block. The
 * completed god books carry exactly that, so they flinch with the weapon's clip.
 */
const OFFHANDS_WITHOUT_OWN_BLOCK: ReadonlySet<number> = new Set([
  3839, 3840, 3841, 3842, 3843, 3844, 12607, 12608, 12609, 12610, 12611, 12612, 26488, 26490, 26492, 26494, 26496,
  26498,
]);

/** Weapons carrying a block animation the generated table does not. */
const WEAPON_BLOCK_ANIMATIONS: Record<number, number> = {
  21015: 7512, // Dinh's bulwark
  4084: 1466, // Sled
};

/**
 * Ordered block-animation candidates, most specific first, mirroring
 * {@link getWeaponAnimationSetWithFallbacks} so the caller can skip any that turn out to be
 * skeletal rather than frame-based.
 */
export function getPlayerBlockAnimations(weaponId: number | undefined, shieldId: number | undefined): number[] {
  const candidates: number[] = [];
  if (weaponId !== undefined) weaponId = getEquipmentCombatBaseId(weaponId);
  if (shieldId !== undefined) shieldId = getEquipmentCombatBaseId(shieldId);

  if (shieldId !== undefined && !OFFHANDS_WITHOUT_OWN_BLOCK.has(shieldId)) {
    candidates.push(OFFHAND_BLOCK_ANIMATIONS[shieldId] ?? GENERIC_SHIELD_BLOCK);
  }

  const weaponBlock = weaponId === undefined ? undefined : WEAPON_BLOCK_ANIMATIONS[weaponId];
  if (weaponBlock !== undefined) candidates.push(weaponBlock);
  for (const set of getWeaponAnimationSetWithFallbacks(weaponId)) {
    if (set.block !== undefined) candidates.push(set.block);
  }

  candidates.push(UNARMED_BLOCK);
  return candidates;
}

/** `human_eat`. Lives here rather than in the compositor so the trim list below can see it. */
export const PLAYER_EAT_SEQ_ID = 829;

/**
 * Every sequence id this module can hand the renderer that does NOT come from
 * {@link WEAPON_ANIMATION_SETS} — the generated table is its own trace input in
 * `scripts/trim-cache.ts`. Read off the tables below so a future row is covered without a
 * second edit.
 *
 * `scripts/trim-cache.ts` warms these; an id it never traces is dropped from the shipped cache
 * and the player T-poses instead of animating, in production only. The id-pattern scan in
 * `scripts/discoverCacheUsage.ts` cannot stand in for this: the pose sets key their ids on plain
 * words (`idle`, `block`) and the block tables key theirs on item ids, so nothing here matches a
 * name pattern.
 */
export const PLAYER_ANIMATION_SEQ_IDS: readonly number[] = [
  ...new Set<number>([
    ...[DEFAULT_ANIMATION_SET, ...Object.values(CATEGORY_ANIMATION_SETS), ...Object.values(ITEM_ANIMATION_OVERRIDES)]
      .flatMap((set) => Object.values(set))
      .filter((id): id is number => typeof id === 'number' && id >= 0),
    ...Object.values(STYLE_ATTACK_ANIMATIONS).flatMap((byKind) => Object.values(byKind)),
    ...Object.values(OFFHAND_BLOCK_ANIMATIONS),
    ...Object.values(WEAPON_BLOCK_ANIMATIONS),
    UNARMED_BLOCK,
    GENERIC_SHIELD_BLOCK,
    PLAYER_EAT_SEQ_ID,
  ]),
];
