# Player Spell Visual Coverage

Coverage of the actual [combat catalog](../../src/data/osrs/spells.json), not a spellbook/wiki count: **48 selectable combat spells**, comprising 26 standard, 16 Ancient and 6 Arceuus. All 48 are returned by `getAutocastableSpells`; Lunar contributes zero entries. [The registry test](../../src/data/__tests__/spellVisuals.test.ts) computes this coverage and pins the exact uncovered names.

**41 profiles implemented; 7 unimplemented.** All 16 Ancient attack spells have packet-backed profiles. A missing complete profile does not mean every animation/FX ID is unknown. The remaining-field table below preserves partial evidence.

This is presentation data only. It does not change damage, accuracy, healing, binding, attack speed, AoE selection or damage scheduling. Ancient presentation includes captured projectile origins, actor-effect heights and client-cycle impact timing; standard spell geometry remains modeled.

## Evidence Rules

- `A` means the player's casting **SeqType**, not the sequence animating a spell effect. `C/T/H` mean caster/travel/successful-hit **SpotAnimType** IDs.
- `none` is an established absent effect, represented by `-1`. `?` is unresolved, never encoded as `-1` to complete a profile.
- Named standard spell assets establish presentation identity, not server geometry or timing. Some names differ from the spell's, for example `HUMAN_CAST_SURGE`, `CRUMBLEUNDEAD`, `SLAYER_MAGICDART` and the misspelled `GUNTHIX_CLAW`.
- Ancient gameval labels alone are candidates, not spell mappings: the captured Ice Burst impact is 363, despite the `ICE_BLITZ_IMPACT` label. Ancient rows rest on a captured spell selection plus the corresponding cast/FX packet.
- Sources: packet captures, RuneLite gameval metadata (BSD-2, pinned in the [Source Index](#source-index)), and the rsmod (ISC) and 2004Scape (MIT) corroboration cited below.

## Presentation Model

The 22 standard spell profiles share one generic model for slope and timing. The 20 elemental profiles use corroborated 92/124 spotanim defaults, not universal per-spell measurements. Crumble Undead and Iban Blast carry their own start heights (124 and 144) but the same 92/124 spotanim defaults:

| Field | Value | Basis |
| --- | ---: | --- |
| `projectileStartHeight` | 172 | **Corroborated.** Captured directly, and [2004Scape/Server][2004scape] (MIT, commit `647886c`) `magic_combat_spells.dbrow` stores 43 in that revision's 1/32-tile units (43x4 = 172). Crumble Undead is 124 and Iban Blast 144 |
| `projectileEndHeight` | 124 | Observed for Water Bolt on Yama; black-demon capture instead has 248. Target adjustment unresolved |
| `projectileSlope` | 16 | Generic magic arc, not a per-spell packet measurement |
| `projectileStartDelay` | 51 client cycles | Shared `PROJ_ANIM_TIMINGS.magic_spell` presentation timing |
| `castSpotanimHeight` | 92 | **Observed** in 23 Water Bolt casts across the black-demon/Yama captures; **corroborated** as an elemental default by rsmod (ISC, rev fa13b3f) `ElementalSpells.kt` |
| `hitSpotanimHeight` | 124 | **Corroborated default**, rsmod (ISC, rev fa13b3f) `ElementalSpells.kt` sets `hitSpotHeight = 124`. Black-demon Water Bolt impact is 248; Yama impact height is unresolved |
| Caster FX placement | actor origin | `PlayerGraphicController` actor height-offset mode |

The standard profiles deliberately use staff casting poses: 1162 for Strike/Bolt/Blast, 1167 for Wave, 7855 for Surge, 1166 for Crumble Undead and 708 for Iban Blast. Bolt/Blast reuse of the low-tier Strike pose is part of this presentation model, not a claim that every manual/unarmed/moving cast emits that exact sequence. Named unarmed/walk-merge variants exist; this spell-name-only API does not select weapon/movement-specific variants.

Implementation: [magic timing](../../src/core/combat/hitDelay.ts) (`PROJ_ANIM_TIMINGS.magic_spell`), [caster placement](../../src/render/effects/controllers/PlayerGraphicController.ts), [projectile/impact placement](../../src/render/effects/controllers/ProjectileController.ts). Movement-pose selection remains modeled. **Observed:** black-demon Water Bolt (`water-bolt-cast-black-demon-3x3-packet-data-1.txt`) has `startheight=172, endheight=248, angle=16, progress=64, starttime=51` and impact height 248; its endtimes match `46 + 10 x distance` at every observed distance. Yama Water Bolt (`water-bolt-cast-yama-packet-data-1.txt`) has cast height 92 and projectile endheight 124, but no `waterbolt_impact` packets.

`PROJ_ANIM_TIMINGS.magic_spell` is corroborated by the same 2004Scape table: its 16 elemental rows all carry `delay 51, length -5, step 10, offset 64`, matching our four fields exactly. Crumble Undead's row (`delay 46, length 0, step 5`) is not adopted: it would change when its damage lands, and no modern capture backs it. 124 is also not a universal impact height: Saradomin Strike is 128 and Claws of Guthix 96 in the same table, which is why these values are applied per spell family rather than globally.

[2004scape]: https://github.com/2004Scape/Server/tree/647886c42f8a22c0f18e5dbe79c2697f052f8d2e "2004Scape/Server, MIT, commit 647886c42f8a22c0f18e5dbe79c2697f052f8d2e"

**Unresolved:** the target-dependent endpoint/impact adjustment and Yama's impact height. A black demon defines opcode 124 (`height=459`) and has captured endpoint/impact 248, while Yama/guard endpoints are 124 with that field unset. This is an observed correlation, not an established formula. `NpcType.height` is decoded but not used by the simulator; 124 remains a presentation default, not a proven value for every simulated target.

Ancient identities, origins, geometry, sound pairs and capture citations are recorded in [Ancient Spell Audiovisuals](./ancient-spell-audiovisuals.md). Direct spells still have delayed impacts; unused projectile fields do not mean immediate damage. Successful impact IDs are not splash IDs.

## Implemented Catalog Entries

Every row is one actual catalog entry. `M` refers to the explicit standard model above; `P` is packet evidence; `E` is the Demonbane profile.

| Spell | A | C | T | H | Geometry / source |
| --- | ---: | ---: | ---: | ---: | --- |
| Wind Strike | 1162 | 90 | 91 | 92 | M, S1 |
| Water Strike | 1162 | 93 | 94 | 95 | M, S1 |
| Earth Strike | 1162 | 96 | 97 | 98 | M, S1 |
| Fire Strike | 1162 | 99 | 100 | 101 | M, S1 |
| Wind Bolt | 1162 | 117 | 118 | 119 | M, S2 |
| Water Bolt | 1162 | 120 | 121 | 122 | M, S2 |
| Earth Bolt | 1162 | 123 | 124 | 125 | M, S2 |
| Fire Bolt | 1162 | 126 | 127 | 128 | M, S2 |
| Wind Blast | 1162 | 132 | 133 | 134 | M, S2 |
| Water Blast | 1162 | 135 | 136 | 137 | M, S2 |
| Earth Blast | 1162 | 138 | 139 | 140 | M, S2 |
| Fire Blast | 1162 | 129 | 130 | 131 | M, S2 |
| Wind Wave | 1167 | 158 | 159 | 160 | M, S3 |
| Water Wave | 1167 | 161 | 162 | 163 | M, S3 |
| Earth Wave | 1167 | 164 | 165 | 166 | M, S3 |
| Fire Wave | 1167 | 155 | 156 | 157 | M, S3 |
| Wind Surge | 7855 | 1455 | 1456 | 1457 | M, S4 |
| Water Surge | 7855 | 1458 | 1459 | 1460 | M, S4 |
| Earth Surge | 7855 | 1461 | 1462 | 1463 | M, S4 |
| Fire Surge | 7855 | 1464 | 1465 | 1466 | M, S4 |
| Crumble Undead | 1166 | 145 | 146 | 147 | M, S5 |
| Iban Blast | 708 | 87 | 88 | 89 | M, S6 |
| Blood Burst | 10092 | none | none | 376 | P1; impact height 0 |
| Blood Blitz | 10091 | none | 374 | 375 | P2; impact height 0 |
| Ice Burst | 10092 | none | 366 | **363** | P3; impact height 0 |
| Smoke Rush | 10091 | none | 384 | 385 | P4; caster origin, impact height 124 |
| Shadow Rush | 10091 | none | 378 | 379 | P4; caster origin, impact height 0 |
| Blood Rush | 10091 | none | none | 373 | P4; impact height 0 |
| Ice Rush | 10091 | none | 360 | 361 | P4; caster origin, impact height 0 |
| Smoke Burst | 10092 | none | 388 | 389 | P4; target origin, impact height 124 |
| Shadow Burst | 10092 | none | none | 382 | P4; impact height 0 |
| Smoke Blitz | 10091 | none | 386 | 387 | P4; caster origin, impact height 124 |
| Shadow Blitz | 10091 | none | 380 | 381 | P4; caster origin, impact height 0 |
| Ice Blitz | 10091 | 366 | none | 367 | P4; caster height 124, impact height 0 |
| Smoke Barrage | 10092 | none | 390 | 391 | P4; target origin, impact height 124 |
| Shadow Barrage | 10092 | none | none | 383 | P4; impact height 0 |
| Blood Barrage | 10092 | none | none | 377 | P4; impact height 0 |
| Ice Barrage | 10092 | none | 368 | 369 | P4; target origin, impact height 0 |
| Inferior Demonbane | 8977 | 1865 | none | 1866 | E, S7; impact height 0 |
| Superior Demonbane | 8977 | 1867 | none | 1868 | E, S7; impact height 0 |
| Dark Demonbane | 8977 | 1869 | none | 1870 | E, S7; impact height 0 |

All three Demonbanes have fallback sequence 1162. The real sequence 8977 is frame-based, not skeletal; a missing trimmed frame archive must not be mistaken for an unsupported sequence format.

### Source Index

`SpotanimID.java` below means [the RuneLite gameval file](https://github.com/runelite/runelite/blob/ced4c4aba7a3cb7cace42e1f0c25a5f79b7faef2/runelite-api/src/main/java/net/runelite/api/gameval/SpotanimID.java); `AnimationID.java` means [its SeqType counterpart](https://github.com/runelite/runelite/blob/ced4c4aba7a3cb7cace42e1f0c25a5f79b7faef2/runelite-api/src/main/java/net/runelite/api/gameval/AnimationID.java).

| Key | Exact local source |
| --- | --- |
| S1 | `SpotanimID.java:97-108`, elemental Strike `CASTING/TRAVEL/IMPACT` names |
| S2 | `SpotanimID.java:124-147`, Bolt/Blast names; note Fire Blast precedes Wind Blast numerically |
| S3 | `SpotanimID.java:162-173`, Wave names; note Fire Wave precedes Wind Wave numerically |
| S4 | `SpotanimID.java:1462-1473`; `AnimationID.java:7854`, `HUMAN_CAST_SURGE=7855` |
| S5 | `SpotanimID.java:152-154`; `AnimationID.java:1173`, `HUMAN_CASTCRUMBLEUNDEAD_STAFF=1166` |
| S6 | `SpotanimID.java:94-96`; `AnimationID.java:715`, `HUMAN_CASTIBANBLAST=708` |
| S7 | `SpotanimID.java:1872-1877`; `AnimationID.java`, `HUMAN_SPELLCAST_DEMONBANE=8977` |
| Staff poses | `AnimationID.java:1169` (1162), `:1174` (1167) |
| P1 | Inferno capture `inferno-waves-1-68-packet-data.txt`:5651-5696, manual `blood_burst` selections at 5652/5676, cast 10092 at 5684 and hit 376 at 5690; second manual selection/cast at 11743/11773/11777. Complete casting blocks have no caster FX or player projectile. |
| P2 | Inferno capture `inferno-waves-1-68-packet-data.txt`:160269-160350, manual `blood_blitz` selections at 160269/160310, cast 10091, travel 374, successful hit 375 at 160335-160340. The earlier cast splashes with 85 at 160293; do not replace successful impact 375 with 85. |
| P3 | Wand capture `zuk-atlatl-dragon-hunter-wand-packet-data.txt`:889-894; spell identity corroborated by P4's manual Ice Burst selection |
| P4 | [Ancient Spell Audiovisuals](./ancient-spell-audiovisuals.md): all 16 manually selected spells, including corroboration for P1-P3 and Ice Burst's target-origin projectile. |

## Remaining 7 Profiles: Exact Missing Fields

These are missing **complete profiles**, not all missing animations. Named effects in this section are candidates and are not installed. `G?` means projectile start/end height, slope, start delay and impact placement are not tied to that spell; if travel is absent, only applicable timing/impact placement is unresolved.

### Standard And Arceuus: 7

| Spell | Known A | Known C | Known T | Known H / candidates | Unresolved |
| --- | --- | --- | --- | --- | --- |
| Saradomin Strike | ? | ? | ? | Named `SARADOMIN_LIGHTNING=76` | Tie actor sequence and 76's target role to spell; establish C/T presence or absence; G? |
| Claws of Guthix | ? | ? | ? | Named `GUNTHIX_CLAW=77` | Tie actor sequence and 77's target role to spell; establish C/T presence or absence; G? |
| Flames of Zamorak | ? | ? | ? | Named `ZAMORAK_FLAME=78` | Tie actor sequence and 78's target role to spell; establish C/T presence or absence; G? |
| Magic Dart | **1576** | ? | **328** | **329** | C presence/absence; G?; enchanted slayer-staff variant selection is not represented by spell name alone |
| Ghostly Grasp | **8972** | **1856** | ? | **1857** (miss 1858) | Establish T absence or actual projectile; impact timing/placement; G?; miss selection outside interface |
| Skeletal Grasp | **8972** | **1859** | ? | **1860** (miss 1861) | Establish T absence or actual projectile; impact timing/placement; G?; miss selection outside interface |
| Undead Grasp | **8972** (also captured) | **1862** (also captured) | None observed in one cast window | **1863** (miss 1864), named only | Target hit/miss FX emission and timing/placement; confirm direct delivery across casts; miss selection outside interface |

Sources: god assets `SpotanimID.java:83-85`; Magic Dart `AnimationID.java:1583-1584` and `SpotanimID.java:335-338`; enchanted Magic Dart `SpotanimID.java:1380-1381` gives 1373/1374; Grasps `AnimationID.java:8971` and `SpotanimID.java:1863-1871`. `SLAYER_MAGICDART_CAST=1576` is a player sequence, whereas `SLAYER_MAGICDART_TRAVEL=1577` in **AnimationID** animates travel **SpotAnim 328**. They are different namespaces. Generic `HUMAN_CASTING=811` exists but its name alone does not prove a god-spell assignment.

Grasp cast/hit names and decoded assets are known. The absence of a named travel asset does not show that the server sends none, so these rows leave T as `?` rather than `-1`.

An incomplete sensory-clouding capture `yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt`:4721-4789 explicitly selects Undead Grasp and emits caster FX 1862 and sequence 8972. The complete tick has no Grasp projectile or target Grasp FX, and neither hit 1863 nor miss 1864 appears elsewhere in that capture. This strengthens caster identity but does not settle target presentation; unrelated flaming-skull map effects are not Grasp impacts.

## Self-Cast Abilities Are Separate

These `spell_self_cast` abilities are **not** missing entries in the 48-spell combat catalog:

| Ability | Player sequence | Caster FX | Owner |
| --- | ---: | ---: | --- |
| Mark of Darkness | 8970 | 1852 | `SimulationEngine.castMarkOfDarkness` |
| Death Charge | 8970 | 1854; upgraded 3288 | `SimulationEngine.castDeathCharge` |
| Home Teleport | 714 | 111 | `SimulationEngine.triggerHomeTeleport` |

See the self-cast methods in [`SimulationEngine.ts`](../../src/core/SimulationEngine.ts). Noncatalog utility/debuff spells named by exclusion lists are not additional selectable combat entries, and powered-staff/weapon projectiles belong to the weapon profiles ([`weaponCombatVisuals.ts`](../../src/data/weaponCombatVisuals.ts)), not this count.
