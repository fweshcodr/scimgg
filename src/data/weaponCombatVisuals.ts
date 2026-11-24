import { isAmmoCompatible } from '../core/combat/ammoCompatibility';
import { findWeaponCategoryKey } from '../types/attackStyles';
import { findEquipmentCatalogItem, getCanonicalEquipmentItemId } from './equipmentCatalog';
import { getEquipmentCombatBaseId } from './equipmentCombatFamilies';
import { SEEKING_ARROWS } from './seekingArrows';
import { getWeaponAnimationSetWithFallbacks } from './weaponAnimations';
import { WEAPON_COMBAT_VISUALS, type WeaponCombatVisuals } from './weaponCombatVisuals.generated';

// The geheur/weapon-animation-replacer data reports startHeight=400 for Tumeken's shadow;
// do not restore it. rsmod's handwritten server definitions (ISC, rev fa13b3f,
// `ProjAnimBuilds`) define tumekens_shadow startHeight=250,
// which places the projectile near the staff tip during the cast animation. The same
// generated data's castSpotanimHeight=92 is also contradicted: all 69 captured casts of
// tumekens_shadow_casting send no height field at all, i.e. 0.
const VISUAL_OVERRIDES: Record<number, Partial<WeaponCombatVisuals>> = {
  // 72/72 bolt launches in capture inferno-waves-69-zuk-packet-data.txt (e.g. :2984) leave at 155 and
  // land at 146; the generic bolt row's 172/144 is not observed. The Zuk capture's crossbow is the
  // rune crossbow its preset in `playerPresets.ts` opens on.
  9185: { projectileStartHeight: 155, projectileEndHeight: 146 },
  // The weapon sweep capture (tick 1018): the crossbow reload clip and the same bolt heights.
  11785: {
    attackAnimation: 7552,
    projectileStartHeight: 155,
    projectileEndHeight: 146,
    sourceName: 'Armadyl crossbow normal shot',
  },
  // Blowpipe, not hand-thrown darts: capture inferno-waves-69-zuk-packet-data.txt:18827.
  12926: { attackAnimation: 5061, projectileStartHeight: 142, projectileEndHeight: 146 },
  28688: { attackAnimation: 10656, projectileStartHeight: 142, projectileEndHeight: 146 },
  // RuneLite gameval SpotanimID.SANGUINESTI_STAFF_{CASTING,TRAVEL,IMPACT}_JUSTICIAR.
  25731: { castSpotanim: 1900, projectileId: 1899, hitSpotanim: 1901 },
  27275: { projectileStartHeight: 250, castSpotanimHeight: 0 },

  // The generated ranged rows carry placeholder 172/144 projectile heights. Captures give
  // the real muzzle and impact heights, but only where the projectile id identifies the
  // firer unambiguously. `crossbowbolt_travel` and `black_chinchompa_grenade` (see
  // `chinchompaVisuals`) qualify; dart projanims do not, because the blowpipe fires the same
  // ids as hand-thrown darts (see `zukWeaponCombatProfiles.test.ts`, which pins hand-thrown
  // darts to 163/146). Only player-fired shots (those whose `target` is an NPC) are counted.
  26374: { projectileStartHeight: 155, projectileEndHeight: 146 },
  // Burning claws: the generated row carries the SPECIAL's 11140/2814 in the ordinary-attack
  // fields, so every auto was firing the spec's spotanim. Both are named `..._spec` in
  // capture burning-claws-special-attack-packet-data.txt:56-58. Observed in game, the
  // ordinary swing has no spotanim and animates 393 (slash) / 1067 (lunge) — that per-style pair
  // lives in `weaponAnimations.ts`, and 393 here is only the fallback for a kind that map misses.
  29577: { attackAnimation: 393, castSpotanim: -1, sourceName: 'Burning claws ordinary swing' },
};

/**
 * The powered Accursed sceptre's own attack, four casts in the weapon sweep capture (ticks 517-529):
 * capture weapon-attacks-sgs-elder-maul-burning-claws-tbow-emberlight-accursed-sceptre-ghrazi-rapier-dragon-claws-scythe-bowfa-whip-tentacle-dhl-zspear-hasta-dscim-ags-zgs-voidwaker-dragon-pickaxe-packet-data.txt
 * No impact graphic: every captured cast splashed, the cache names none for it, and a landed Condemn
 * (four Yama captures) shows none either.
 */
const ACCURSED_SCEPTRE_VISUALS: WeaponCombatVisuals = {
  attackAnimation: 1167,
  castSpotanim: -1,
  castSpotanimHeight: 0,
  projectileId: 2337,
  projectileStartHeight: 120,
  projectileEndHeight: 92,
  projectileSlope: 10,
  projectileStartDelay: 46,
  hitSpotanim: -1,
  hitSpotanimHeight: 0,
};

/** Condemn: the sweep capture's tick 545 and all four Yama captures (e.g. capture yama_forfeit_breath.txt:118). */
const CONDEMN_VISUALS: WeaponCombatVisuals = {
  attackAnimation: 9961,
  castSpotanim: 2338,
  castSpotanimHeight: 98,
  projectileId: 2339,
  projectileStartHeight: 180,
  projectileEndHeight: 92,
  projectileSlope: 10,
  projectileStartDelay: 50,
  hitSpotanim: -1,
  hitSpotanimHeight: 0,
};

/**
 * Hand-thrown ammo shares one launch profile. rsmod (ISC, rev fa13b3f) `ProjAnimBuilds`
 * defines `thrown` as startHeight 163 / endHeight 146, identical to its `arrow` profile;
 * 2004Scape (MIT, rev 647886c) `player_ranged.rs2` passes 40/36 in that revision's 1/32-tile
 * units, which is the same value at coarser resolution (x4 = 160/144).
 *
 * The generated rows carry geheur's 172/144 here, which our own generated data already
 * contradicts: every arrow the generator resolved emits 163/146. Bolts use the narrower
 * `bolt` profile (155/146) and the blowpipes keep their captured 142/146 muzzle, so neither
 * appears below.
 */
const THROWN_LAUNCH_PROFILE = { projectileStartHeight: 163, projectileEndHeight: 146 } as const;
const THROWN_LAUNCH_PROFILE_IDS: readonly number[] = [
  732, // Holy water
  800,
  801,
  802,
  803,
  804,
  805,
  20849, // thrownaxes
  806,
  807,
  808,
  809,
  810,
  811,
  3093,
  11230,
  25849, // darts
  825,
  826,
  827,
  828,
  829,
  830,
  19484,
  21318, // javelins
  863,
  864,
  865,
  866,
  867,
  868,
  869,
  22804,
  22808, // knives
  6522, // Toktz-xil-ul
];
for (const id of THROWN_LAUNCH_PROFILE_IDS) {
  // Any explicit entry above wins: this only supplies the launch heights.
  VISUAL_OVERRIDES[id] = { ...THROWN_LAUNCH_PROFILE, ...VISUAL_OVERRIDES[id] };
}

/**
 * The tridents, three casts each on every style in
 * capture weapon-soulreaper-fang-dragonwarhammer-zombieaxe-noxhalberd-tridentoftheswamps-tridentoftheseas-packet-data.txt
 * (swamp ticks 624-632, seas 641-651): cast graphic at height 92, `projanim starttime=51, angle=16,
 * startheight=92, endheight=60`, and the impact graphic at height 92, not the generated row's 60.
 * The seas' full (11905) and partly charged (11907) ids are one item; the generated table has a row
 * for 11907 only. The (e) tridents (22288, 22292) differ only in charge capacity (user-confirmed), so
 * they share their base trident's visuals.
 */
function tridentVisuals(castSpotanim: number, projectileId: number, hitSpotanim: number): WeaponCombatVisuals {
  return {
    attackAnimation: 11430,
    castSpotanim,
    castSpotanimHeight: 92,
    projectileId,
    projectileStartHeight: 92,
    projectileEndHeight: 60,
    projectileSlope: 16,
    projectileStartDelay: 51,
    hitSpotanim,
    hitSpotanimHeight: 92,
  };
}
const TRIDENT_OF_THE_SEAS_VISUALS = tridentVisuals(1251, 1252, 1253);
const TRIDENT_OF_THE_SWAMP_VISUALS = tridentVisuals(665, 1040, 1042);

/**
 * Every black chinchompa throw in capture inferno-waves-(35ish)-to-68-packet-data.txt (e.g.
 * :4665-4686) plays `human_chinchompa_attack_pvn` (7618) and fires `black_chinchompa_grenade` at
 * `starttime=21, angle=15, progress=11, startheight=163, endheight=146`; the primary target alone
 * shows `firewave_impact` (157) at `height=92`, delayed to the projectile's `endtime`.
 *
 * The grey and red throws are not captured. Their grenades are RuneLite gameval
 * `SpotanimID.CHINCHOMPA_GRENADE` (908) and `BIG_CHINCHOMPA_GRENADE` (909), the red taken to be
 * the "big" one by name alone; everything else is assumed to match the black throw.
 */
function chinchompaVisuals(projectileId: number): WeaponCombatVisuals {
  return {
    attackAnimation: 7618,
    castSpotanim: -1,
    castSpotanimHeight: 0,
    projectileId,
    projectileStartHeight: 163,
    projectileEndHeight: 146,
    projectileSlope: 15,
    projectileStartDelay: 21,
    hitSpotanim: 157,
    hitSpotanimHeight: 92,
  };
}

const PACKET_CAPTURED_VISUALS: Record<number, WeaponCombatVisuals> = {
  11905: TRIDENT_OF_THE_SEAS_VISUALS,
  11907: TRIDENT_OF_THE_SEAS_VISUALS,
  22288: TRIDENT_OF_THE_SEAS_VISUALS,
  12899: TRIDENT_OF_THE_SWAMP_VISUALS,
  22292: TRIDENT_OF_THE_SWAMP_VISUALS,
  27665: ACCURSED_SCEPTRE_VISUALS,
  10033: chinchompaVisuals(908),
  10034: chinchompaVisuals(909),
  11959: chinchompaVisuals(1272),
  29000: {
    attackAnimation: 11057,
    castSpotanim: -1,
    castSpotanimHeight: 0,
    projectileId: 2795,
    projectileStartHeight: 163,
    projectileEndHeight: 146,
    projectileSlope: 15,
    projectileStartDelay: 41,
    hitSpotanim: -1,
    hitSpotanimHeight: 0,
    sourceName: 'Eclipse atlatl',
  },
  // 124/124 Venator shots across the three Colosseum wave captures, before and after the bow's 19 August
  // 2026 update alike, play 9858 and set launch graphic 2289 on the player, then fire 2291 at starttime
  // 31, angle 255, progress 11, heights 156/146 (e.g. capture colosseum-no-sol-packet-data.txt,
  // tick 1461), whatever arrow is loaded.
  27610: {
    attackAnimation: 9858,
    castSpotanim: 2289,
    castSpotanimHeight: 0,
    projectileId: 2291,
    projectileStartHeight: 156,
    projectileEndHeight: 146,
    projectileSlope: 255,
    projectileStartDelay: 31,
    hitSpotanim: -1,
    hitSpotanimHeight: 0,
    sourceName: 'Venator bow',
  },
};

// capture blowpipe-spec-bowfa-attacks-packet-data.txt:65-75.
function bowfaVisuals(castSpotanim: number, projectileId: number): WeaponCombatVisuals {
  return {
    attackAnimation: 426,
    castSpotanim,
    castSpotanimHeight: 96,
    projectileId,
    projectileStartHeight: 163,
    projectileEndHeight: 146,
    projectileSlope: 15,
    projectileStartDelay: 41,
    hitSpotanim: -1,
    hitSpotanimHeight: 0,
  };
}

// RuneLite gameval ItemID.BOW_OF_FAERDHINEN_* and SpotanimID.SP_ATTACK_ARROW_{LAUNCH,TRAVEL}_FAERDHINEN_*.
// Match clan names, not generated sourceName or numeric offsets: the generated rows are shifted.
const BOWFA_VISUALS: Readonly<Record<number, WeaponCombatVisuals>> = {
  25865: bowfaVisuals(1888, 1887),
  25867: bowfaVisuals(1923, 1922),
  25884: bowfaVisuals(1925, 1924),
  25886: bowfaVisuals(1927, 1926),
  25888: bowfaVisuals(1929, 1928),
  25890: bowfaVisuals(1931, 1930),
  25892: bowfaVisuals(1933, 1932),
  25896: bowfaVisuals(1935, 1934),
};

// Plain: inferno-waves-69-zuk-packet-data.txt:18641; ornament: blowpipe-spec-bowfa-attacks-packet-data.txt:20-24.
function blowpipeSpecialVisuals(attackAnimation: number, projectileId: number): WeaponCombatVisuals {
  return {
    attackAnimation,
    castSpotanim: -1,
    castSpotanimHeight: 0,
    projectileId,
    projectileStartHeight: 142,
    projectileEndHeight: 146,
    projectileSlope: 15,
    projectileStartDelay: 32,
    hitSpotanim: -1,
    hitSpotanimHeight: 0,
  };
}

const BLOWPIPE_SPECIAL_VISUALS: Readonly<Record<number, WeaponCombatVisuals>> = {
  12926: blowpipeSpecialVisuals(5061, 1043),
  28688: blowpipeSpecialVisuals(10656, 2599),
};

/** What a special attack draws in place of the weapon's ordinary shot. */
const SPECIAL_ATTACK_VISUALS: Readonly<Record<number, WeaponCombatVisuals>> = {
  ...BLOWPIPE_SPECIAL_VISUALS,
  27665: CONDEMN_VISUALS,
  27679: CONDEMN_VISUALS,
  27676: CONDEMN_VISUALS,
  // 10/10 specs across capture yama-contract-of-sensory-clouding-*.txt, e.g.
  // yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt:17187-17194.
  29591: {
    attackAnimation: 11133,
    castSpotanim: 2806,
    castSpotanimHeight: 0,
    projectileId: 2807,
    projectileStartHeight: 160,
    projectileEndHeight: 146,
    projectileSlope: 255,
    projectileStartDelay: 46,
    hitSpotanim: 2908,
    hitSpotanimHeight: 0,
  },
};

export const HANDWRITTEN_WEAPON_COMBAT_VISUALS: readonly Partial<WeaponCombatVisuals>[] = [
  ...Object.values(VISUAL_OVERRIDES),
  ...Object.values(PACKET_CAPTURED_VISUALS),
  ...Object.values(BOWFA_VISUALS),
  ...Object.values(SPECIAL_ATTACK_VISUALS),
];

// Normal bolt-profile approximation for ordinary RCB/ACB shots; does not model ACB special metadata.
const GENERIC_BOLT_PROFILE_WEAPON_IDS: ReadonlySet<number> = new Set([9185, 11785]);

export function getWeaponCombatVisuals(
  weaponId: number | undefined,
  ammoId?: number,
  usingSpecialAttack = false,
): WeaponCombatVisuals | undefined {
  if (weaponId === undefined) return undefined;
  const combatBaseId = getEquipmentCombatBaseId(weaponId);
  const canonicalWeaponId = combatBaseId !== weaponId ? combatBaseId : getCanonicalEquipmentItemId(weaponId);
  if (usingSpecialAttack) {
    const special = SPECIAL_ATTACK_VISUALS[weaponId] ?? SPECIAL_ATTACK_VISUALS[canonicalWeaponId];
    if (special) return special;
  }
  const isBlowpipe =
    BLOWPIPE_SPECIAL_VISUALS[weaponId] !== undefined || BLOWPIPE_SPECIAL_VISUALS[canonicalWeaponId] !== undefined;
  const bowfa = BOWFA_VISUALS[weaponId] ?? BOWFA_VISUALS[canonicalWeaponId];
  if (bowfa) return bowfa;
  const captured = PACKET_CAPTURED_VISUALS[canonicalWeaponId];
  if (captured) return captured;
  const base =
    (combatBaseId === weaponId ? WEAPON_COMBAT_VISUALS[weaponId] : undefined) ??
    WEAPON_COMBAT_VISUALS[canonicalWeaponId] ??
    (GENERIC_BOLT_PROFILE_WEAPON_IDS.has(canonicalWeaponId) ? WEAPON_COMBAT_VISUALS[9144] : undefined);
  const override = VISUAL_OVERRIDES[weaponId] ?? VISUAL_OVERRIDES[canonicalWeaponId];
  if (ammoId !== undefined && !(usingSpecialAttack && canonicalWeaponId === 11235)) {
    const category = findWeaponCategoryKey(weaponId);
    const ammo = findEquipmentCatalogItem(ammoId);
    const usesDart = isBlowpipe && ammo?.category === 'Thrown' && / dart(?:\(|$)/i.test(ammo.name);
    const usesExternalAmmo =
      (category === 'bow' || category === 'crossbow') && isAmmoCompatible(canonicalWeaponId, ammoId);
    if (usesDart || usesExternalAmmo) {
      const visualAmmoId = SEEKING_ARROWS[ammoId]?.baseArrowId ?? ammoId;
      const ammoVisuals =
        WEAPON_COMBAT_VISUALS[ammoId] ??
        WEAPON_COMBAT_VISUALS[getCanonicalEquipmentItemId(visualAmmoId)] ??
        (category === 'crossbow' ? WEAPON_COMBAT_VISUALS[9144] : undefined);
      if (!ammoVisuals) return undefined;
      const attackAnimation =
        override?.attackAnimation ??
        base?.attackAnimation ??
        getWeaponAnimationSetWithFallbacks(weaponId).find((set) => set.attack !== undefined)?.attack ??
        ammoVisuals.attackAnimation;
      return { ...ammoVisuals, ...override, attackAnimation };
    }
  }
  if (!base) return undefined;
  return override ? { ...base, ...override } : base;
}

export type CardinalDirection = 'south' | 'north' | 'east' | 'west';

// RuneLite gameval SpotanimID.DRAGON_HALBERD_SPECIAL_{SOUTH,NORTH,EAST,WEST}_<color>, in that order.
const SCYTHE_OF_VITUR_SWEEP_SPOTANIM_IDS = [478, 506, 1172, 1231] as const;
const HOLY_SCYTHE_SWEEP_SPOTANIM_IDS = [1895, 1896, 1897, 1898] as const;
const SANGUINE_SCYTHE_SWEEP_SPOTANIM_IDS = [1891, 1892, 1893, 1894] as const;
const SWEEP_DIRECTION_INDEX: Readonly<Record<CardinalDirection, 0 | 1 | 2 | 3>> = {
  south: 0,
  north: 1,
  east: 2,
  west: 3,
};

/**
 * Keyed by exact item id: the color is the variant. Every captured swing of the "Holy Scythe of
 * Vitur" (named in capture tob-hmt-5-packet-data-3.txt:48340) lays one
 * `map_anim dragon_halberd_special_<dir>_<colour>, delay=20, height=92` on the tile in front of the
 * wielder (1363/1363 swings across the colosseum, inferno, duke, vardorvis and ToB captures), always
 * blue. A red sweep appears only in the run with a "Scythe of Vitur" equipped (capture
 * tob-normal-mage-packet-data-1.txt:15392), and dark red only in the runs with a "Sanguine Scythe of
 * Vitur" (capture tob-hmt-5-packet-data-1(no-maiden).txt:43395).
 */
const MELEE_SWEEP_SPOTANIMS_BY_WEAPON: Readonly<Record<number, readonly [number, number, number, number]>> = {
  22325: SCYTHE_OF_VITUR_SWEEP_SPOTANIM_IDS,
  25736: HOLY_SCYTHE_SWEEP_SPOTANIM_IDS,
  25739: SANGUINE_SCYTHE_SWEEP_SPOTANIM_IDS,
};

export function getMeleeSweep(
  weaponId: number | undefined,
  direction: CardinalDirection,
): { readonly spotAnimId: number; readonly delayCycles: number; readonly height: number } | undefined {
  const spotAnims = weaponId === undefined ? undefined : MELEE_SWEEP_SPOTANIMS_BY_WEAPON[weaponId];
  if (!spotAnims) return undefined;
  return { spotAnimId: spotAnims[SWEEP_DIRECTION_INDEX[direction]], delayCycles: 20, height: 92 };
}
