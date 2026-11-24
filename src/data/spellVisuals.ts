import { PROJ_ANIM_TIMINGS, type ProjAnimTiming } from '../core/combat/hitDelay';

export interface SpellVisuals {
  /** SeqType ID for the player casting animation (overrides weapon attack anim) */
  castAnimationId: number;
  /**
   * Optional frame-based fallback animation. Used when {@link castAnimationId}
   * resolves to a skeletal-only SeqType that the renderer can't play (returns
   * null from `loadFrameBasedSeqById`). Pick a frame-based equivalent that
   * matches the spell category (e.g. HUMAN_CASTSTRIKE_STAFF for staff casts).
   */
  fallbackAnimationId?: number;
  /** SpotAnim on the caster at cast time. -1 = none */
  castSpotanimId: number;
  readonly castSpotanimHeight?: number;
  /** SpotAnim on the target at impact. -1 = none */
  hitSpotanimId: number;
  /** Height for hit spotanim in OSRS units (128 = 1 tile) */
  hitSpotanimHeight: number;
  readonly hitSpotanimHeightMode?: 'sequence' | 'actor';
  readonly impactTiming?: ProjAnimTiming;
  /** Projectile spotanim ID. -1 = no projectile (direct-hit spell) */
  projectileId: number;
  readonly projectileOrigin?: 'caster' | 'target';
  projectileStartHeight: number;
  projectileEndHeight: number;
  projectileSlope: number;
  /** Client cycles (20ms each) before projectile appears */
  projectileStartDelay: number;
}

// Geometry is a presentation model, not a packet measurement for each spell:
// rsmod (ISC, fa13b3f) ElementalSpells.kt corroborates elemental defaults 92/124.
// Water Bolt captures show cast 92 (23 casts), black-demon endpoint/impact 248,
// and Yama endpoint 124. Target adjustment and Yama impact height remain unresolved.
// docs/research/player-spell-visual-coverage.md#presentation-model
function standardSpell(
  castAnimationId: number,
  [castSpotanimId, projectileId, hitSpotanimId]: readonly [number, number, number],
): SpellVisuals {
  return {
    castAnimationId,
    castSpotanimId,
    castSpotanimHeight: 92,
    projectileId,
    hitSpotanimId,
    hitSpotanimHeight: 124,
    projectileStartHeight: 172,
    projectileEndHeight: 124,
    projectileSlope: 16,
    projectileStartDelay: 51,
  };
}

// capture ancient-spells-casts-anims-sounds-packet-data.txt:334-337,399-402,688-691,1007-1010
// Target-origin projectiles still use caster-to-target distance for their end cycle.
function ancientSpell(
  castAnimationId: number,
  [projectileId, hitSpotanimId]: readonly [number, number],
  options: { readonly origin?: 'target'; readonly height?: number } = {},
): SpellVisuals {
  return {
    castAnimationId,
    castSpotanimId: -1,
    castSpotanimHeight: 0,
    hitSpotanimId,
    hitSpotanimHeight: options.height ?? 0,
    hitSpotanimHeightMode: 'actor',
    impactTiming: PROJ_ANIM_TIMINGS.magic_spell,
    projectileId,
    projectileOrigin: options.origin ?? 'caster',
    projectileStartHeight: 172,
    projectileEndHeight: options.height ?? 0,
    projectileSlope: 16,
    projectileStartDelay: 51,
  };
}

export const SPELL_VISUALS = {
  'Wind Strike': standardSpell(1162, [90, 91, 92]),
  'Water Strike': standardSpell(1162, [93, 94, 95]),
  'Earth Strike': standardSpell(1162, [96, 97, 98]),
  'Fire Strike': standardSpell(1162, [99, 100, 101]),
  'Wind Bolt': standardSpell(1162, [117, 118, 119]),
  'Water Bolt': standardSpell(1162, [120, 121, 122]),
  'Earth Bolt': standardSpell(1162, [123, 124, 125]),
  'Fire Bolt': standardSpell(1162, [126, 127, 128]),
  'Wind Blast': standardSpell(1162, [132, 133, 134]),
  'Water Blast': standardSpell(1162, [135, 136, 137]),
  'Earth Blast': standardSpell(1162, [138, 139, 140]),
  'Fire Blast': standardSpell(1162, [129, 130, 131]),
  'Wind Wave': standardSpell(1167, [158, 159, 160]),
  'Water Wave': standardSpell(1167, [161, 162, 163]),
  'Earth Wave': standardSpell(1167, [164, 165, 166]),
  'Fire Wave': standardSpell(1167, [155, 156, 157]),
  'Wind Surge': standardSpell(7855, [1455, 1456, 1457]),
  'Water Surge': standardSpell(7855, [1458, 1459, 1460]),
  'Earth Surge': standardSpell(7855, [1461, 1462, 1463]),
  'Fire Surge': standardSpell(7855, [1464, 1465, 1466]),
  // The two non-elemental standard spells carry their own heights. Values from 2004Scape
  // (MIT, rev 647886c) `magic_combat_spells.dbrow`, converted from that revision's 1/32-tile
  // units to the modern 1/128 by x4. That table is trustworthy for these fields because its
  // 16 elemental rows reproduce our captured modern values exactly (43->172, 31->124, and the
  // delay/length/step/offset quadruple 51/-5/10/64). Heights only: their projectile *timing*
  // is deliberately left on the generic profile, since Crumble Undead's 2004 timing
  // (delay 46, step 5) would move when damage lands and has no modern capture behind it.
  'Crumble Undead': {
    ...standardSpell(1166, [145, 146, 147]),
    projectileStartHeight: 124,
  },
  'Iban Blast': {
    ...standardSpell(708, [87, 88, 89]),
    projectileStartHeight: 144,
  },

  'Smoke Rush': ancientSpell(10091, [384, 385], { height: 124 }),
  'Shadow Rush': ancientSpell(10091, [378, 379]),
  'Blood Rush': ancientSpell(10091, [-1, 373]),
  'Ice Rush': ancientSpell(10091, [360, 361]),
  'Smoke Burst': ancientSpell(10092, [388, 389], {
    origin: 'target',
    height: 124,
  }),
  'Shadow Burst': ancientSpell(10092, [-1, 382]),
  'Blood Burst': ancientSpell(10092, [-1, 376]),
  // Ice gameval names disagree with the cast: packet lines 683-690,1125-1134.
  'Ice Burst': ancientSpell(10092, [366, 363], { origin: 'target' }),
  'Smoke Blitz': ancientSpell(10091, [386, 387], { height: 124 }),
  'Shadow Blitz': ancientSpell(10091, [380, 381]),
  'Blood Blitz': ancientSpell(10091, [374, 375]),
  'Ice Blitz': {
    ...ancientSpell(10091, [-1, 367]),
    castSpotanimId: 366,
    castSpotanimHeight: 124,
  },
  'Smoke Barrage': ancientSpell(10092, [390, 391], {
    origin: 'target',
    height: 124,
  }),
  'Shadow Barrage': ancientSpell(10092, [-1, 383]),
  'Blood Barrage': ancientSpell(10092, [-1, 377]),
  'Ice Barrage': ancientSpell(10092, [368, 369], { origin: 'target' }),

  'Inferior Demonbane': {
    castAnimationId: 8977,
    fallbackAnimationId: 1162,
    castSpotanimId: 1865,
    hitSpotanimId: 1866,
    hitSpotanimHeight: 0,
    projectileId: -1,
    projectileStartHeight: 0,
    projectileEndHeight: 0,
    projectileSlope: 0,
    projectileStartDelay: 0,
  },
  'Superior Demonbane': {
    castAnimationId: 8977,
    fallbackAnimationId: 1162,
    castSpotanimId: 1867,
    hitSpotanimId: 1868,
    hitSpotanimHeight: 0,
    projectileId: -1,
    projectileStartHeight: 0,
    projectileEndHeight: 0,
    projectileSlope: 0,
    projectileStartDelay: 0,
  },
  'Dark Demonbane': {
    castAnimationId: 8977,
    fallbackAnimationId: 1162,
    castSpotanimId: 1869,
    hitSpotanimId: 1870,
    hitSpotanimHeight: 0,
    projectileId: -1,
    projectileStartHeight: 0,
    projectileEndHeight: 0,
    projectileSlope: 0,
    projectileStartDelay: 0,
  },
} as const satisfies Record<string, SpellVisuals>;

export function getSpellVisuals(spellId: string): SpellVisuals | undefined {
  return (SPELL_VISUALS as Record<string, SpellVisuals>)[spellId];
}
