import { describe, expect, it } from 'vitest';
import { EQUIPMENT_COMBAT_FAMILIES } from './equipmentCombatFamilies';
import {
  DEFAULT_ANIMATION_SET,
  getPlayerBlockAnimations,
  getWeaponAnimationSetWithFallbacks,
  getWeaponStyleAttackAnimation,
} from './weaponAnimations';

describe('style attack animations from the weapon sweep capture', () => {
  // capture weapon-attacks-sgs-…-dragon-pickaxe-packet-data.txt, by tick.
  it.each([
    [11806, 'melee_crush', 7054], // Saradomin godsword Smash, 370
    [11802, 'melee_crush', 7054], // Armadyl godsword Smash, 876
    [20374, 'melee_crush', 7054], // Zamorak godsword (or), same family, 981
    [4587, 'melee_stab', 386], // Dragon scimitar Lunge, 842
    [27690, 'melee_stab', 386], // Voidwaker Lunge, 1049
    [13652, 'melee_stab', 1067], // Dragon claws Lunge, 601
    [22978, 'melee_crush', 8290], // Dragon hunter lance Pound, 711
    [11824, 'melee_crush', 1710], // Zamorakian spear Pound, 734
    [11920, 'melee_crush', 400], // Dragon pickaxe Smash, 1084
    [11920, 'melee_stab', 401], // Dragon pickaxe Spike, 1074
  ] as const)('animates %i %s with %i', (weaponId, attackKind, expected) => {
    expect(getWeaponStyleAttackAnimation(weaponId, attackKind)).toBe(expected);
  });
});

describe('style attack animations from the soulreaper/fang/warhammer/axe/halberd capture', () => {
  // capture weapon-soulreaper-fang-dragonwarhammer-zombieaxe-noxhalberd-tridentoftheswamps-tridentoftheseas-packet-data.txt, by tick.
  it.each([
    [28338, 'melee_slash', 10172], // Soulreaper axe Chop/Hack/Block, ancient_axe_crush, 440
    [28338, 'melee_crush', 10171], // Soulreaper axe Smash, ancient_axe_slash, 454
    [26219, 'melee_stab', 9471], // Osmumten's fang Stab/Lunge/Block, 497
    [27246, 'melee_slash', 390], // Osmumten's fang (or) Slash, 511
    [28810, 'melee_slash', 7004], // Zombie axe Chop/Hack/Block, 560
    [28810, 'melee_crush', 3852], // Zombie axe Smash, 572
    [29796, 'melee_stab', 428], // Noxious halberd Jab/Fend, 596
    [29796, 'melee_slash', 440], // Noxious halberd Swipe, 602
  ] as const)('animates %i %s with %i', (weaponId, attackKind, expected) => {
    expect(getWeaponStyleAttackAnimation(weaponId, attackKind)).toBe(expected);
  });

  // No usable attack clip in their generated sets: without a row these punched.
  it.each([
    [13576, 401], // Dragon warhammer, every style human_blunt_pound, 532-545
    [28338, 10172],
    [28810, 7004],
  ])('gives %i its own swing (%i) rather than the unarmed punch', (weaponId, expected) => {
    expect(getWeaponAnimationSetWithFallbacks(weaponId).find((set) => set.attack !== undefined)?.attack).toBe(expected);
  });
});

describe('Soulreaper axe stance', () => {
  // RuneLite gameval AnimationID ANCIENT_AXE_IDLE / _WALK / _RUN: the axe is carried over the shoulder.
  it.each([28338, 33335])('carries item %i on its own idle, walk and run', (weaponId) => {
    expect(getWeaponAnimationSetWithFallbacks(weaponId)[0]).toMatchObject({ idle: 10169, walk: 10170, run: 11170 });
  });
});

describe('attack-only rows keep the generated poses', () => {
  it('leaves the Dragon warhammer on its generated set, ahead of the row that adds its swing', () => {
    const [generated, override] = getWeaponAnimationSetWithFallbacks(13576);
    expect(generated).toMatchObject({ idle: 808, walk: 819, run: 824, attack: undefined });
    expect(override?.attack).toBe(401);
  });
});

describe('Ghrazi rapier attack animation', () => {
  it.each([22324, 25734])('stabs item %i with ghrazi_rapier_attack, as every captured Lunge does', (itemId) => {
    expect(getWeaponStyleAttackAnimation(itemId, 'melee_stab')).toBe(8145);
  });

  it('slashes with the standard sword swing, the only style the unique clip did not replace', () => {
    expect(getWeaponStyleAttackAnimation(22324, 'melee_slash')).toBeUndefined();
    expect(getWeaponAnimationSetWithFallbacks(22324).find((set) => set.attack !== undefined)?.attack).toBe(390);
  });
});

describe('cosmetic animation inheritance', () => {
  it.each(EQUIPMENT_COMBAT_FAMILIES)('uses state-base animation candidates for family $baseId', ({
    baseId,
    variantIds,
  }) => {
    for (const variantId of variantIds) {
      expect(getWeaponAnimationSetWithFallbacks(variantId), String(variantId)).toEqual(
        getWeaponAnimationSetWithFallbacks(baseId),
      );
      expect(getPlayerBlockAnimations(undefined, variantId), String(variantId)).toEqual(
        getPlayerBlockAnimations(undefined, baseId),
      );
    }
  });
});

describe('weapon animation turn mappings', () => {
  it('uses the OSRS 180-degree turn for the default unarmed set, distinct from walking back', () => {
    expect(DEFAULT_ANIMATION_SET.turn180).toBe(823);
    expect(DEFAULT_ANIMATION_SET.turn180).not.toBe(DEFAULT_ANIMATION_SET.walkBack);
  });
});

describe('Elder maul attack animation', () => {
  it.each([21003, 27100])('resolves the crush swing for item %i, not the unarmed punch', (itemId) => {
    // 21003's generated attackStyle1 is -1, so without the item override the
    // swing would fall through the 'blunt' category to the unarmed punch.
    const attack = getWeaponAnimationSetWithFallbacks(itemId)
      .map((set) => set.attack)
      .find((seq) => seq !== undefined);
    expect(attack).toBe(7516);
    expect(attack).not.toBe(DEFAULT_ANIMATION_SET.attack);
  });
});

describe("Inquisitor's mace attack animation", () => {
  it('resolves the crush swing, not the unarmed punch', () => {
    // Same shape as the elder maul above: 24417's generated set carries the crush
    // animation in attackStyle2 while mainAttack and attackStyle1 are both -1, so the swing
    // would fall through to the unarmed punch. Both glyphic captures play
    // `human_inquisitors_mace_crush (4503)` on every attack tick.
    const attack = getWeaponAnimationSetWithFallbacks(24417)
      .map((set) => set.attack)
      .find((seq) => seq !== undefined);
    expect(attack).toBe(4503);
    expect(attack).not.toBe(DEFAULT_ANIMATION_SET.attack);
  });
});

describe('player block animation', () => {
  /**
   * The offhand decides the flinch, and the weapon only gets a say when it declines. Each row
   * is a real setup out of the Yama captures paired with the animation that capture actually
   * plays, so the suite fails if the ordering drifts back to being weapon-only.
   */
  it.each([
    { what: 'Emberlight + avernic defender', weapon: 29796, shield: 22322, expected: 4177 },
    { what: "Inquisitor's mace + avernic defender", weapon: 24417, shield: 22322, expected: 4177 },
    { what: 'rune defender is a defender too', weapon: 24417, shield: 8850, expected: 4177 },
    { what: 'ordinary shield blocks as a shield', weapon: 24417, shield: 27251, expected: 1156 },
  ])('$what', ({ weapon, shield, expected }) => {
    expect(getPlayerBlockAnimations(weapon, shield)[0]).toBe(expected);
  });

  it('lets a god book decline, so the weapon flinches instead', () => {
    // rsmod skips an offhand whose defend_anim IS the unarmed block, and the completed god
    // books carry exactly that — so a book must NOT contribute a clip of its own. 420 here
    // would be `human_stafforb_block`, a weapon animation no source ties to books.
    expect(getPlayerBlockAnimations(24417, 3840)).toEqual(getPlayerBlockAnimations(24417, undefined));
    expect(getPlayerBlockAnimations(24417, 3840)).not.toContain(420);
  });

  it('ends every chain at the unarmed block so a flinch always resolves', () => {
    // The Inquisitor's mace has no block of its own, so without the unarmed tail the
    // chain resolves to nothing and the player never flinches.
    const chain = getPlayerBlockAnimations(24417, undefined);
    expect(chain[chain.length - 1]).toBe(424);
    expect(getPlayerBlockAnimations(undefined, undefined)).toEqual([424]);
  });

  it("gives Dinh's bulwark its own flinch", () => {
    // Two-handed, so it never competes with an offhand; the row exists because the generated table has none.
    expect(getPlayerBlockAnimations(21015, undefined)[0]).toBe(7512);
  });
});
