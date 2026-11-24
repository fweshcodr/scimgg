# Ancient Spell Audiovisuals

Source: capture `ancient-spells-casts-anims-sounds-packet-data.txt`; line numbers below refer to it. The capture contains one successful cast of each attack spell against 1x1 NPCs, across contiguous ticks 593-682.

## Captured Identities

`A` is the player sequence; `C`, `P` and `H` are caster, projectile and successful-hit SpotAnim IDs. `none` means the complete cast window contains no corresponding packet. Sound pairs are immediate caster `synth_sound` / delayed target `sound_area`.

| Spell | Cast tick | A | C | P / origin | H | Sound pair | Capture lines |
| --- | ---: | ---: | --- | --- | ---: | --- | --- |
| Smoke Rush | 597 | 10091 | none | 384 / caster | 385 | 183 / 185 | 24-49 |
| Shadow Rush | 602 | 10091 | none | 378 / caster | 379 | 178 / 179 | 96-127 |
| Blood Rush | 607 | 10091 | none | none | 373 | 106 / 110 | 163-192 |
| Ice Rush | 612 | 10091 | none | 360 / caster | 361 | 171 / 173 | 234-265 |
| Smoke Burst | 617 | 10092 | none | 388 / target | 389 | 183 / 182 | 305-338 |
| Shadow Burst | 674 | 10092 | none | none | 382 | 178 / 177 | 1060-1080 |
| Blood Burst | 656 | 10092 | none | none | 376 | 106 / 105 | 830-848 |
| Ice Burst | 645 | 10092 | none | 366 / target | 363 | 171 / 170 | 662-695 |
| Smoke Blitz | 635 | 10091 | none | 386 / caster | 387 | 183 / 181 | 534-554 |
| Shadow Blitz | 640 | 10091 | none | 380 / caster | 381 | 178 / 176 | 600-618 |
| Blood Blitz | 663 | 10091 | none | 374 / caster | 375 | 106 / 104 | 910-930 |
| Ice Blitz | 679 | 10091 | 366, height 124 | none | 367 | 171 / 169 | 1113-1139 |
| Smoke Barrage | 622 | 10092 | none | 390 / target | 391 | 183 / 180 | 376-405 |
| Shadow Barrage | 629 | 10092 | none | none | 383 | 178 / 175 | 468-483 |
| Blood Barrage | 650 | 10092 | none | none | 377 | 106 / 102 | 737-772 |
| Ice Barrage | 669 | 10092 | none | 368 / target | 369 | 171 / 168 | 991-1011 |

Gameval names are not spell assignments. Ice Burst emits `ice_blitz_impact (363)` (line 683), while Ice Blitz emits caster `ice_burst_travel (366), height=124` (line 1125) and target `ice_burst_impact (367)` (line 1134). Blood Rush has no projectile packet despite the named travel asset 372.

## Geometry And Timing

All ten projectile packets specify `starttime=51`, `angle=16`, `progress=64`, and `startheight=172`. Smoke endpoints and target impacts specify height 124; the other projectile endpoints specify 0 and their target spotanim height is omitted (zero). Heights are OSRS local units, not tiles.

Smoke Burst/Barrage and Ice Burst/Barrage source coordinates equal the target tile, not the player's tile (lines 334-336, 399-401, 688-690, 1007-1009). Their duration still follows caster-to-target distance. In particular Smoke Barrage starts and ends at `(3095,3509)` but runs from cycle 51 to 66, with the caster at `(3097,3509)`.

Observed distances 1, 2, 3 and 6 produce impact delays 56, 66, 76 and 106 client cycles, matching the magic presentation formula `46 + 10 * distance`. Every target impact sound has the same delay as its spotanim and uses range 10. These presentation delays must not be rounded to damage ticks; damage scheduling is unaffected.

Blood Barrage's sound position `(3101,3507)` (line 766) is the target's new coordinate in the cast tick (line 759), not an offset from its earlier selection tile. Capture-time positions, rather than later renderer state, determine launch geometry and area-sound positioning.

## Boundaries

This recording does not establish alternate frozen-target effects, large-target overrides, multi-target combinations or splash variants. Keep the combat rules and known miss behavior; do not use successful-hit sounds for known accuracy failures. NPC hurt/death sounds 513/512 and punch/block sounds 2566/511 are not spell sounds.

The separate Leviathan Shadow Barrage capture has encounter-specific height/timing and a later stun effect. It does not override this ordinary-target profile. Standard spells and powered weapons keep their own presentation defaults.
