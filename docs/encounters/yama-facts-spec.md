# Yama P3 — facts spec

Mechanic facts and capture evidence behind [`contractConfig.ts`](../../src/encounters/yamaP3/contractConfig.ts).
Wiki sources: [Yama](https://oldschool.runescape.wiki/w/Yama), Yama/Strategies and the individual
contract pages. Captures are private gameplay captures cited by file name (see
[Capture fixtures](../agent-reference.md#capture-fixtures)), and the facts the tests use are in
`src/encounters/yamaP3/__tests__/fixtures/`. Captures win over published figures where they conflict.

P3 alone is simulated. The optional countdown glyphs ("Show Glyphs at Start") depict the chosen
opener; its 50/50 choice substitutes for P2 (§1). Not modeled: P1/P2 gameplay, thresholds and
landing speed, the Judge, duo play, XP bonuses, and separate demonbane vulnerability.

### Capture index

The conformance suite ([`captureConformance.test.ts`](../../src/encounters/yamaP3/__tests__/captureConformance.test.ts))
names each capture by file; its facts live in one module per capture under
[`fixtures/yamaP3Capture/`](../../src/encounters/yamaP3/__tests__/fixtures/yamaP3Capture/). "The eight
captures" below means the suite's `ALL_CAPTURES` set (marked ✓). Ticks quoted in this document are
capture ticks unless written as control+N.

| Capture file | Fixture module | Variant | In the eight | P3 control | P3 opening HP |
|---|---|---|:---:|---:|---|
| `yama-packet-data.txt` | `base` | Base | ✓ | 810 | 808 / 2500 |
| `yama-normal-contract-long-p3-packet-data.txt` | `baseLong` | Base | | 2197 | 790 / 2500 |
| `yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt` | `baseKnownGear` | Base, known defensive bonuses | | 2263 | 795 / 2500 |
| `yama-contract-of-divine-severance-packet-data-1.txt` | `divine1` | Divine Severance | ✓ | 1083 | 1243 / 2500 |
| `yama_divine_severance.txt` | `divine2` | Divine Severance | ✓ | 3653 | 1225 / 2500 |
| `yama_forfeit_breath.txt` | `forfeit` | Forfeit Breath | ✓ | 594 | 1218 / 2500 |
| `yama-contract-of-glyphic-attenuation-packet-data-1.txt` | `glyphic1` | Glyphic Attenuation | ✓ | 17514 | 1431 / 2875 |
| `yama-contract-of-glyphic-attenuation-packet-data-2.txt` | `glyphic2` | Glyphic Attenuation | ✓ | 19144 | 1415 / 2875 |
| `yama-contract-of-bloodied-blows-packet-data-1.txt` | `bloodied` | Bloodied Blows | ✓ | 2426 | 1427 / 3000 |
| `yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt` | `sensory1` | Sensory Clouding | ✓ | 8839 | 1254 / 2500 |
| `yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt` | `sensory2` | Sensory Clouding, P3 only | | 1542 | 1258 / 2500 |

Three further captures supply void-flare explosions only:
`yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt`,
`yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt` and
`yama-contract-of-glyphic-attenuation-packet-data-p3-void-flare-explosions.txt`. Their rows are
inline in the suite (`BLOODIED_BLOWS_CAPTURE_EXPLOSIONS`, `CROSS_CONTRACT_EXPLOSIONS`) and in
`YAMA_FLARE_LIFECYCLES` ([`yamaP3Captures.ts`](../../src/encounters/yamaP3/__tests__/fixtures/yamaP3Captures.ts)).
`BLOODIED_BLOWS_REPORTED_EXPLOSIONS` is a community-reported table, not a capture.

## 1. Shared sigil baseline

`SIGIL_ENCOUNTER_BASE` carries what every sigil contract shares:

| Mechanic | Source | Shipped |
|---|---|---|
| Attack speed 7 ticks | Wiki (8→7); P3 already 7 | `beatIntervalTicks: 7` |
| Auto max hit | Wiki stat table: one figure for all three styles, 46 base, 53 under any contract | `meleeDamage`/`rangedMagicDamage: [0, 53]` |
| Combat levels | Wiki [Contract variants](https://oldschool.runescape.wiki/w/Yama#Contract_variants): one level block for every contract | `CONTRACT_COMBAT_LEVELS` 400 Atk / 402 Str / 247 Def / 275 Mag / 241 Rng, applied by contract id (`monsters.json` has only the Normal and P3 forms). `strength` reaches nothing: Yama's damage is a configured range |
| P3 starting HP | Wiki: contracts transition at ~75%/~50%; base at 1/3. Captured openings fall on both sides of half (index above): Bloodied 73 under 1500, Sensory 4 and 8 over 1250 | Practice initialization, not an exact transition: `boss.hp` = `floor(pool / 2)` (base `floor(pool / 3)`). The suite allows `bossMaxHp / 30` either side, a fitted allowance |
| Special cadence | Packet-verified: casts every 7 ticks from control+12 in cycles of 10, specials on capture ordinals 6 and 9. Base shares this grid but also specials on ordinal 2 in its first cycle only | `beatsPerCycle: 10, fireballBeats: [0,3,7], snapFireballBeats: [0,7], voidFlareBeats: [8]` (sim beats run one ahead of capture ordinals); base adds `firstCycleSnapFireballBeats: [0,3,7]` |
| Prayer penetration | Packet-derived, by style (§5) | ranged/magic `reduce` 12%; melee `reduce` 48% |
| Shadow waves | Packet-verified (§5) | deltas `[0,15,22]` incl. first cycle, `randomOffsets`, damage `[28, 35]`. Wave/fire-streak frequency is not changed (unverified) |
| Void flare HP | Max 140 (`monsters.json`); P3 flares spawn at half, 71 | `voidFlares.hp: 71` |
| Void flare fuse | Packet-verified: detonation at add + 3 + E/30 + 2, E = fuse bar `endtime`. P3 beat pairs and Divine drumbeat singles carry E=600 (explode add+25); base P3 melee-swing singles E=360 (add+17); P1/P2's add+26 is E=630. Untargetable until add+3, when both bars appear. No contract melee-flare detonation is measured: `glyphic2` records an E=360 single at control+33 that ends without detonating | `VOID_FLARE_CHARGE_TICKS = 25`, `MELEE_VOID_FLARE_CHARGE_TICKS = 17` |
| Void flare pair cadence | Two flares at capture control+61, +131, … in every capture | `voidFlareBeats: [8]` |
| Void flare corners | Strict round-robin `(26,25) → (23,33) → (35,25) → (38,33)`, one shared pointer per flare; all 50 P3 spawns across the eight captures fit, pairs and drumbeat singles alike. Only the start corner varies (all four occur). No capture has a contested corner; the blocked-corner rule is policy (§3) | |
| Ranged-style alternation | Fire/shadow parity advances once per **cast**; specials and melee swings leave it alone. The opener is either: eight of the eleven fixtures open on shadow, `baseLong`, `baseKnownGear` and `sensory2` on fire. In the captures that record phase 2 it matches the color of phase 2's northern glyphs (Shadow → ranged, Fire → magic) | `firstRangeMageType` rolled 50/50 per fight, standing in for P2 |
| Void flare explosion | §5 | `explosionDamage: { atZeroHp: [8, 17], perRemainingHp: 7/16 }` |

## 2. Individual contracts

### 2.1 Divine Severance

Wiki: "Yama deactivates protection prayers on sight. Yama no longer penetrates prayers. Yama spawns
Voidflares continuously. Voidflare explosions are lethal."

| Mechanic | Config | Evidence |
|---|---|---|
| Prayer auto-deactivation | `prayerRestrictions.protection: { expiresAfterTicks: 2 }` | Wiki: "after it has been active for two ticks". Packet-verified both ways: a click one tick before a landing still blocks it (13 landings, zero leaked); the varbit `1->0` always arrives at click+1, so the prayer cannot be up at click+2. **Measure by damage, not varbit spans**: the `1->0` lands on a tick that still protects (clean instance: tick 911 click / 912 `1->0` **and** blocked `hit id=12, value=0` / 913), so spans read 1 |
| No penetration | `rangedMagicPrayerReduction: { type: 'block' }`; melee keeps the sigil `reduce` 48% | Recorded prayed ranged/magic P3 hits were zero (24 in `divine1`, 13 in `divine2`); the sim blocks those styles and keeps its melee policy. No prayed melee landing is recorded |
| Continuous flares | `voidFlares.continuous`, `continuousIntervalTicks: 20` | Observed: ONE extra flare every 20 ticks from fight start through both transitions, **on top of** the beat pair. Base and forfeit captures have no drumbeat. The fight-long phase is not reproducible in a P3-only sim, so the simulator anchors it to P3 sim ticks with `tick % 20 === 0` and spawns it only while fewer than `maxActive` (4) flares are alive (`voidFlareCoordinator.ts`); both are simulator policy |
| Lethal explosions | `voidFlares.explosionDamage: 'lethal'` | Lethal explosions heal Yama nothing |
| Flare HP | `continuousHp: 81` (`hp` stays 71) | Applies to the drumbeat flares only: across 36 flares in both divine captures every drumbeat flare dies to an 81 hitsplat and every beat-pair flare to 71 (NPC hitsplats are clamped to HP removed). The wiki reads as if all flares change |

### 2.2 Forfeit Breath

Wiki: "Yama drains Challenger's stamina passively. Yama drains Challenger's stamina on dealing
damage. Challenger loses upon reaching 0 stamina."

Run energy is the real `player.runEnergy` (0–10000). `onTickStart` drains 100 (1%) every 4 ticks;
`onPlayerDamageTaken` drains 100 per damage point; reaching 0 fails with `'StaminaDepleted'`. Both
magnitudes are simulator policy: no cited source states either rate, and the extracted capture
facts do not include run energy. Hooks return `{ runEnergyDelta, fail }`, applied by
`processHookResult()`. The `infiniteStamina` mechanic suppresses both drain and failure, so this
contract defaults it **off**.

### 2.3 Glyphic Attenuation

Wiki: "Glyphs protect you for less time, and are more punishing. Yama is now weak to crush, and
nothing else. Challenger's prayer bonus affects their drain rate inversely. Challenger's prayer bonus
increases the damage they deal."

| Mechanic | Config | Evidence |
|---|---|---|
| HP 2875 | `boss.hp: 1437`, `maxHp: 2875` | `hpbar_hud_basehp` reads 2875 in both captures; P3 opens at 1431 / 1415 |
| Crush-only | `monsterStatOverrides` | A restat, not a forced miss (below) |
| Inverted prayer drain | `prayerDrain.modifyDrainResistance` = `max(40, 60 - 2*prayerBonus)` | No published formula. One point: at +46 both captures drain 0.903 points/tick on piety + overhead = resistance **40** (ordinary Yama: 152). The bare sign-flip is falsified (negative at +46); the curve between +10 and +46 is unconstrained |
| Prayer bonus → damage | `outgoingDamageMultiplier` = `1 + 0.0155 × prayerBonus` | Measured from max-hit splats (below) |
| Penetration | Inherits sigil ranged/magic 12% | Glyphic's leak of 6 is the lower bound that sets 12% (§5) |
| Void flares | Defaults | Pairs at control+61+70k, 71 HP, 25-tick fuse, no drumbeat |
| Glyph duration | N/A in P3 | Every glyph message falls before the P3 control tick. Captures show a **2**-tick absorb→fade gap against 10 in base/forfeit/divine (wiki says 3) |

**Damage bonus.** Hitsplat id **43** is `DAMAGE_MAX_ME`
([`HitsplatID.java`](https://github.com/runelite/runelite/blob/ced4c4aba7a3cb7cace42e1f0c25a5f79b7faef2/runelite-api/src/main/java/net/runelite/api/HitsplatID.java)),
so each such splat is the client stating the max hit. Dividing by the no-contract max for the same
loadout:

| capture splat | no-contract max | captured max | prayer bonus | implied rate |
|---|---:|---:|---:|---|
| crush vs Yama, strength 118 | 49 | 83 | +46 | [1.508%, 1.553%) |
| crush vs Yama, strength 117 | 48 | 82 | +46 | [1.540%, 1.585%) |
| crush vs Yama, strength 116 | 48 | 82 | +46 | [1.540%, 1.585%) |
| Dark Demonbane vs void flare | 65 | 109 | +44 | [1.538%, 1.573%) |
| Dark Demonbane vs Judge of Yama | 49 | 82 | +44 | [1.531%, 1.577%) |

Intersection **[1.540%, 1.553%)** per point (×1.71 at +46). Two weapons, three targets, three
strength levels and two prayer bonuses agree, and the magic switch scaling identically shows the
bonus is **not** melee-only. Caveats: Jagex say the bonus is "larger at the higher thresholds", so
the curve may not be a line through 1.0; the window shifts ~0.03%/point per point of error in the
assumed prayer bonus (read from the equipment screen, not the capture); the magic rows assume the
switch keeps the melee armour, which their agreement with the melee rows checks.

**Defence.** The bonuses are the contract's own: "Yama's defence bonuses are now +80 crush defence
and +666 for all others". Phase 3 multiplies every defence bonus by 1.35 as in the base fight
(+100/+80/+333/+220 → +135/+108/+449/+297, Yama/Strategies § Phase 3), so crush lands on **+108**;
the +666 sentinel is left unscaled. Both the +108 and the unscaled +666 are extrapolations, not
measurements. The Defence *level* is the contract block's 247 (`CONTRACT_COMBAT_LEVELS`, Wiki
Contract variants), not the base fight's 225 from the infobox and Yama/Strategies.

The captures cannot measure the level. Only `glyphic1` is clean (`glyphic2`'s elder maul specs drain
Defence 35% for the rest of the fight; its Yama keeps NPC index 33744 across phases). Piety, attack
118, Inquisitor's mace, aggressive. The model column uses the shipped Defence 247 and the attack
roll (~33,360) that reproduces the standard hit-chance formula at the base fight's 225:

| phase | crush defence | captured | 95% CI (Wilson) | model @ def 247 |
|---|---:|---|---|---:|
| 1-2 | +80 | 30/75 = 40.0% | [29.7%, 51.3%] | 45.2% |
| 3 | +108 | 6/20 = 30.0% | [14.5%, 51.9%] | 37.9% |
| 3, base Yama's +449 for contrast | +449 | — | — | 12.7% |

Anything within roughly ±25 Defence fits at these sample sizes; what the captures rule out is base
Yama's +449. A thrall shares the target, so a tick with both a miss and a thrall hitsplat must read
as a miss, not be dropped. With +666 elsewhere, stab lands ~7% at Defence 247 and Dark Demonbane
under 10% (magic accuracy reads Yama's Magic level, 275 under contracts): non-viable but not zero, and
Practice's expected-DPS projection uses the same attack plan.

### 2.4 Sensory Clouding

Wiki: "Yama's attacks have increased prayer penetration. Yama can pursue forever. Voidflare
explosions are lethal. Challenger has 50% reduced attack range."

| Mechanic | Config | Evidence |
|---|---|---|
| Increased penetration | ranged/magic `reduce` 0.17 | No published rate. 38 strict single-hitsplat prayed P3 landings across both captures (24 + 14), 28 positive, largest 9. 17% is the fitted rate if 56 and 9 are the two ceilings (`floor(56 × rate)`: 16% → 8, 18% → 10); the samples establish only lower bounds on both, and a higher true max pulls the rate down (max 60 at 15% also gives 9). The 10 zeros mix misses and rolls under `100/17`. Classify by the overhead on the **landing tick alone**: the "either end protects" rule puts tick 8882's 19 in the prayed set, which no rate below 34% explains |
| Infinite pursuit | `pursuit: true` → `YamaEncounter.moveNpc` | Yama walks one tile per step along the ordinary route to the player's orthogonal perimeter ([`npcPursuit.ts`](../../src/core/npcPursuit.ts)). `captureConformance.test.ts` pins deterministic movements only (bind windows and under-footprint sidesteps excluded) at **119/120** (`sensory1`) and **46/50** (`sensory2`), divergent ticks listed in `SENSORY_PURSUIT_EXPECTATIONS`. The alternatives score 42/120 (other neighbor order) and 97/120 (eight-neighbor destination ring) ([open questions](./sensory-clouding-open-questions.md#5-pursuit)) |
| Max hit | `rangedMagicDamage: [0, 56]` | Wiki's flat 53 **falsified**: an unprayed magic auto lands 56 at tick 9029 as an ordinary `hit id=16`, with no `DAMAGE_MAX_ME` from Yama in the capture, so 56 is a floor. Melee keeps the sigil 53 and 48% as simulator policy: no melee swing was identified in these Sensory samples |
| P3 starting HP | `boss.hp: 1250` | Practice initialization. `sensory1` opens at 1254 of 2500, on the hit that leaves Yama at exactly 1254, and `sensory2` at 1258, both above half |
| Lethal explosions | `'lethal'` | Flares otherwise untouched |
| Halved attack range | `modifyPlayerCombatParams`: `max(1, floor(range / 2))` | |

Everything else matches the shared baseline: pool 2500, casts every 7 from control+12 with specials on
ordinals {6, 9} mod 10, wave cycles at control+12+70k with deltas `[0,15,22]` and all three waves in
cycle 0 (0 free passes).

**Scorching shackles.** The capture's player uses a
[scorching bow](https://oldschool.runescape.wiki/w/Scorching_bow), whose special binds demons; that
bind, not boss behavior, makes every long stationary window. Implemented as
`SPECIAL_ATTACK_REGISTRY[29591]`: 25% energy; the bind is guaranteed regardless of accuracy and
blocks 21 NPC movement ticks from the tick the projectile ARRIVES (five of the eight casts below
splat `hit id=12, value=0` and still bind and burn), one under the special's 3-tick hit
delay (the hitsplat carries OSRS's
[processing-order tick](https://oldschool.runescape.wiki/w/Hit_delay#Processing_order_delay); the
bind does not). Across both captures, the eight casts whose hitsplat is unambiguously the player's
all splat on cast+3, and the seven catching Yama mid-chase stop him on cast+2, at footprint
distances 1–4; the hit delay is a registry constant because the bow's projectile timing gives 2 at
distances 1–2. Yama is released on cast+23 after 21 stationary ticks. The burn, scheduled from the
shot, pulses `hit id=74, value=1` on cast+3, +7, +11, +15, +19, +23.

### 2.5 Bloodied Blows

Wiki: "Voidflares are spawned in higher quantities. Voidflares are more resistant to attacks. Both
Yama & Challenger gain Wretched Strength."

Evidence: `yama-contract-of-bloodied-blows-packet-data-1.txt`, ticks 2112–2599, contiguous P1→P3
kill, P3 control 2426. The player fought from range at low HP (attacks launched at 2–27 HP): 23 P3
player hits and 17 prayed P3 Yama landings.

| Mechanic | Config | Evidence |
|---|---|---|
| HP 3000 | `maxHp: 3000`, `hp: 1500` | `hpbar_hud_basehp` 3000; P3 opens at 1427 (practice initialization at half, §1) |
| Wretched Strength | `playerMinimumHit` (player clamp) + `autoAttacks.wretchedStrength` → `NpcAttackRequest.damageBonusPercent` (Yama bonus) | Two shapes over one quantity (table below). Player clamp measured; Yama's shape constrained; his coefficient 1 is simulator policy |
| More flares | `voidFlareBeats: [3, 8]`, `spawnCount: 2`, `maxActive: 4` | "Four void flares spawn instead of two" arrives in P3 as TWO PAIRS half a cycle apart (control+26, +61, +96, +131), alternating west and east corner pairs; phase 1 spawns four at once. `spawnCount: 4` would leave the arena clear for the 35 ticks the capture has a live pair |
| Flares more resistant | `guaranteedPlayerMaximum: false` | "No longer guaranteed a maximum hit against void flares"; flares use ordinary accuracy and damage. Other variants keep the guaranteed maximum. Any further "more resistant" effect is not modeled (§3) |
| Flare HP | `hp: 71` | All 8 P3 flares died to a single 71. The wiki's "two of them will have reduced health" is a P1/P2 statement |
| Penetration | ranged/magic `reduce` 0.06 | Wiki: "decreased from 10% to 5%" (29 May 2025; the capture is post-change). At 98% missing health the Wretched bonus raises a maximum roll of 53 to 104; floored 5% permits at most 5, and 6% is the lowest whole percent that reaches the observed 6. The rate is coupled to Yama's coefficient: the mean Wretched bonus over the 17 landings is 1.75×, so a smaller coefficient would need a higher rate |
| Cadence, waves | Shared baseline | Identical; 0 free passes |

**Wretched Strength is two shapes over one quantity, the whole-percent missing health**
([`wretchedStrength.ts`](../../src/npcs/yama/wretchedStrength.ts)). The wiki: "Unlike the Dharok's set
effect of the same name, this increases the minimum hit **of the player** and not the maximum hit".

| Quantity | Sampled at | Applied to | Evidence |
|---|---|---|---|
| Player's `floor(100 × missing / maxHp)` | Player HP when the attack is planned (launch) | Each accurate planned hitsplat, floored at `floor(hitMax × percent / 100)` ([`playerAttackPlanTransforms.ts`](../../src/core/combat/playerAttackPlanTransforms.ts)) | Capture: launch HP fits; landing HP does not (below). Per-hitsplat application is policy (§3) |
| Yama's `floor(100 × missing / maxHp)` | Yama HP when his attack resolves: ranged/magic at release, three ticks after the cast; melee on the swing tick ([`yama.ts`](../../src/npcs/yama/yama.ts) `resolveYamaAttack`) | Accurate roll before prayer: `roll + floor(roll × percent / 100)` | Shape from the 17 prayed leaks (below), analyzed against Yama's HP on the cast tick. Which tick the game samples is not established; the release tick and the coefficient 1 are simulator policy |

**Player: a clamp.** `wretchedMinimumHit(maxHit, hp, maxHp)` floors an accurate roll at
`floor(maxHit × floor(100 × missing / maxHp) / 100)`:

- **Clamp, not a re-roll over `[min, max]`:** 17 of 23 P3 player hits land exactly ON the floor;
  uniform over `[min, 68]` would put ~2.8 there.
- **The maximum does not move:** both `DAMAGE_MAX_ME` splats read 68, at floors for 12 HP and 6 HP.
  This rules out additive `roll + min` and a post-roll multiplier (which would also leave a lower
  tail; 23 uniform rolls all ≥ 48 has probability ~1e-12).
- **Launch HP, not landing HP:** the opening 48 was cast at 27 HP and landed at 17 after a
  locator-orb sip; landing HP implies floor fraction 0.69, launch HP gives 0.72 exactly.

| launch HP | missing % | predicted floor | observed |
|---:|---:|---:|---|
| 27 | 72 | 48 | 48 |
| 17 | 82 | 55 | 55, 55, 57 |
| 12 | 87 | 59 | 59, 61, 68 |
| 9 | 90 | 61 | 61, 61, 61 |
| 7 | 92 | 62 | 62, 62, 62, 62, 62 |
| 2 | 97 | 65 | 67 |

The whole-percent quantization is measured: Dharok's `(missing/100) × (maxHp/100)` floored predicts
60 at 9 HP and 61 at 7 HP, against observed 61 (×3) and 62 (×5). Dharok's literal formula exceeds
100× on a 3000 pool; the normalized percentage is the form that behaves at both 99 and 3000. In play:
against the mage preset with Mark of Darkness, Dark Demonbane's max on a flare is 84, so the floor
reaches a flare's 71 at exactly **14 HP**; a max of 80 moves the cut-off to 10, 90 to 20.

**Yama: a post-roll bonus**, `roll + floor(roll × missingPercent / 100)` before prayer. Every
observation is through prayer: 17 P3 landings (cast+3, single hitsplat, correct overhead at impact)
at 55–98% missing, leaking six 0s and 1, 2, 2, 2, 2, 3, 3, 3, 3, 5 and 6. A leak of 6 at 98% needs
`rate × maxDamage ≥ 6`, while a leak of 1 at 86% needs the attack to come in small; a floor (and
re-roll, additive, or floor-after-prayer orderings) cannot satisfy both, a multiplier can. The
coefficient is not measured: an unprayed hit above 53 would show a boost exists, but cannot give the
coefficient without the unboosted roll. A known maximum (a `DAMAGE_MAX_ME` splat from Yama) or enough
controlled unprayed hits at several HP levels could bound it (§3).

## 3. Open questions

- Glyphic prayer-drain curve (one prayer bonus) and damage rate (two nearby bonuses).
- Sensory Clouding's true ranged/magic max (56 is a floor; needs a `DAMAGE_MAX_ME` splat) and hence
  its rate; its melee is unobserved
  ([Sensory open questions](./sensory-clouding-open-questions.md)).
- Bloodied Blows, Yama's side: the coefficient 1 and the sampling tick are simulator policy (§2.5).
- Bloodied Blows, the player floor is applied **per hitsplat**, including specials planned through
  the same path such as the Purging staff special. The capture is 23 single-hitsplat Dark Demonbane
  casts, so per-hitsplat versus "the attack total once" versus "only the first hitsplat" is
  unobserved. Damage over time (Eclipse moon burn, burning claws) is not floored; the capture has no
  damage-over-time source. Simulator policy; the captures do not distinguish these alternatives.
- Bloodied Blows, outside the observed range: player samples span 2–27 of 99 HP (72–97% missing).
  Nothing constrains the floor below 72% missing, the whole-percent quantization is fitted from that
  band, and the `maxHp` normalization has only been checked against a 99-HP player.
- Bloodied Blows flare resistance: only the lost max-hit guarantee is modeled. Whether "more
  resistant to attacks" also means higher defence, more HP or a damage reduction is not observed.
- A blocked flare corner (every variant). An occupied corner, or one whose south-west tile the
  player stands on, relocates that flare to the next free corner; the pointer still advances one
  corner from the one it claimed, and with no free corner nothing spawns
  ([`voidFlareCoordinator.ts`](../../src/encounters/yamaP3/voidFlareCoordinator.ts)). No capture has a
  contested corner (peak concurrency 4, spread by the rotation), and the player check ignores the
  other three tiles of the 2×2 flare. Simulator policy; the captures do not distinguish these
  alternatives.
- The exact P3 transition HP (practice initialization at half, §1).
- Fireball damage `[0, 20]` is unmeasured (§5).
- No contract melee-flare detonation is measured (§1).
- Whether contract specials do more damage (wiki says so, no values).

## 4. Engine seams

Contract mechanics use `EncounterEngineRules` ([`types.ts`](../../src/core/encounters/types.ts)) or
extend it. Every multiplier is an `EncounterDynamic<number>` (number or `(ctx) => number`) resolved
with `resolveDynamic` and re-read at each use; that is how Glyphic scales damage off live prayer
bonus. `CombatBridge` deliberately takes plain numbers, so `SimulationEngine` and
`PlayerAutoAttackSystem` are the only resolvers.

Wretched Strength uses neither bridge multiplier: the player's half is a floor
(`playerMinimumHit`, since the max stands still while the floor moves), and Yama's per-attack bonus
rides `NpcAttackRequest.damageBonusPercent`, fixed when the attack resolves (§2.5) rather than
re-read as a multiplier at impact.

## 5. Phase 3 damage numbers

Penetration, accuracy and wave figures below were derived from the base, both divine, forfeit and
both glyphic captures; Bloodied Blows and Sensory Clouding are measured in their own sections.

**Penetration is a fraction of the roll, and a phase-3 mechanic.** In the six captures above,
prayers block Yama's ranged and magic autos outright in P1–2 (137 of 138 prayed landings read 0)
and leak only in P3, matching "his ranged and magic attacks will now pierce prayer (although very
negligible)". The claim does not cover Sensory Clouding: `sensory1` records non-zero prayed
landings before its P3 control, as its increased penetration would predict. The extracted fixtures
hold P3 landings only, so these P1–2 counts come from the captures, not from
`captureConformance.test.ts`.

**P3 autos miss, and the engine rolls for it.** Over the seven captures whose contract lets autos
through prayer, **53 of 158** prayed P3 landings read 0: 36.6% magic (n=82), 30.3% ranged (n=76),
overlapping CIs, no style split (Divine excluded: it blocks). That 33.5% [26.7%, 41.2%] is a
**zero-splat rate, not a miss rate**: a correct overhead also zeroes every roll under `100 / rate`
(13 of 47 rolls on base's 8%), and an OSRS 0 is a block splat either way. The cleaner miss signal is
the 15 unprayed landings, at 5/15. `captureConformance.test.ts` holds the model to this as a
zero-splat rate, pinned at the one known loadout below.

**Melee rolls accuracy too, and misses more.** `yama-normal-contract-long-p3-packet-data.txt`
supplies the prayed P3 melee landings: **5 of 9** read 0, and exempting melee from the roll scores
**13.2 log-likelihood units** worse. Melee is **Slash** (Yama infobox), reading the player's slash
defence, which a melee loadout stacks high: that preset's slash defence **357** gives a predicted
**58.4%** miss against an implied **54–55%**, with nothing fitted. The rate is gear-dependent by
construction, so no captured miss rate transfers to another loadout.

**Known-gear validation.** `yama-normal-contract-203-magic-def-223-range-def-p3-packet-data.txt`:
base Yama P3, magic defence **203**, ranged defence **223**, Augury throughout, 99 Defence and Magic,
88 clean landings, none of them used to fit the predictions.

| | observed | predicted | pooled-capture rival |
|---|---|---|---|
| prayed ranged zeros | 25/38 = **65.8%** | **65.4%** (p=1.00) | 30.3% (p=0.00004) |
| prayed magic zeros | 23/43 = **53.5%** | **57.2%** (p=0.65) | 36.6% (p=0.026) |

**12.5 log-likelihood units** in favor; the whole leak distribution fits (chi-square 3.3 magic, 4.4
ranged, 3 df), and the largest prayed leak in 81 landings is **3** = `floor(46 × 0.08)` (9% would
allow 4; none appears). The pooled 158-landing figure cannot test an assumed loadout: those
captures have unknown gear, so the comparison measures the gear guess. Only a capture stating its
own defensive bonuses settles an accuracy question.

**Rounding: the penetrating share, floored** (`floor(damage × rate)`), so every roll below
`100 / rate` reads 0; subtracting the floored *blocked* share can only zero a roll of 0. The
discriminating sample is a base-Yama P3 fight with **no armour** and correct prayer, which is not
among the indexed captures: **20 of 59** prayed autos read 0, where accuracy can explain only ~10%
under any plausible level/prayer assumption.

| | predicted zeros | observed |
|---|---|---|
| floor of the penetrating share | **34%** | **33.9%** |
| roll minus the floored blocked share | 12% | 33.9% |

A 7–11 log-likelihood margin under any assumption. With the miss rate left free, the two roundings
fit every contract within ±0.2 units, so only a known loadout separates them.

**Every rate is calibrated to this arithmetic.** A largest observed leak is a lower bound on the
ceiling `floor(maxHit × rate)`, so it bounds the rate from below; an upper bound needs a stated
ceiling. Yama checks a melee prayer at launch and a ranged/magic prayer at impact
([`yama.ts`](../../src/npcs/yama/yama.ts) `prayerCheckAt`).

| variant | style | max hit | prayed P3 landings | largest observed leak | whole percents consistent | shipped |
|---|---|---:|---|---:|---|---|
| base Yama | ranged/magic | 46 | 142 (`baseLong`) | 3 | 7–8, if 3 is the ceiling (Wiki "up to 3") | **8%** |
| sigil default (forfeit, glyphic) | ranged/magic | 53 | 29 forfeit, 57 glyphic | 5 / 6 | ≥ 12 | **12%** |
| bloodied blows | ranged/magic | 53, Wretched-boosted to 104 at 98% missing | 17 | 6 | ≥ 6 at coefficient 1 | **6%** |
| sensory clouding | ranged/magic | ≥ 56 | 38 (24 + 14) | 9 | 17, if 56 and 9 are the ceilings | **17%** |
| divine severance | ranged/magic | 53 | 37 (24 + 13) | 0 | block | **block** |
| base Yama | melee | 46 | 9 (`baseLong`) | 22 | 48–49, if 22 is the ceiling (Wiki "up to 22") | **48%** |
| every contract | melee | 53 | none | — | unmeasured | **48%** (policy) |

These are not Jagex's published percentages (bloodied blows' published 5% cannot reach its observed
6); the published figures look like rounded descriptions, so the captures win. Glyphic's 6 needs
≥12%; forfeit's 5 alone would allow 10–11%, and forfeit not rolling a 6 in 20 positive landings has
a ~15% chance at 12%. Base's 8% gives the Wiki's "up to 3" for magic and ranged
(`floor(46 × 0.08) = 3`). Melee's 48% gives `floor(46 × 0.48) = 22`, matching "the melee attack can
now hit up to 22 through prayer" (Yama/Strategies § Phase 3) and the largest melee leak; 50% would
allow 23. Under a contract the same 48% caps melee at `floor(53 × 0.48) = 25`, unobserved.

Classify a landing as prayed by the overhead matching the cast's style **on the landing tick**;
reading either end pulls base's lone 10 and sensory's 19 into the prayed set. Reducing the ROLL
beats reducing the max hit and re-rolling by 6.5 log-likelihood units, hence `reduce`. A cap is the
one shape excluded: `min(6, roll)` on `[0, 53]` returns exactly 6 on 89% of hits, where the captures
hold three 6s in 47 splats.

**Shadow waves** (no wiki P3 figure; measured from splats where the player stood on a lit
`vfx_shadow_wall_02/03` tile and nothing else could explain it: no auto landing on cast+3, no melee
range, no void-flare explosion, no death-clamped splat):

| variant | samples | captures contributing | shipped |
|---|---|---:|---|
| base Yama | 16 18 20 | 1 of 1 | `[16, 20]` |
| sigil contracts | 28 28 29 31 31 33 35 | 3 of 5 | `[28, 35]` |

Both bands are uniform over what was observed; true floors may be lower (base especially). Neither
glyphic capture contributes (every contact coincides with an auto or a death clamp).

**Fireballs are `[0, 20]`** ("up to 20 damage per explosion", Yama/Strategies § Phase 3), unmeasured:
no capture isolates a fireball hitsplat (the sensory capture has 130 overlay tile-ticks,
2 stand-ons, 0 splats). The P3 player-specific ground overlays `vfx_flaming_skull_shadow_impact01`
(3252) and `vfx_player_yama_falling_rock_impact01` (3262) do not damage unconditionally: players stand
in them 203 times and take a hitsplat twice, which does not exclude a conditional rule. The
simulator does not read those overlays: it damages a player on its own impact tiles during the
impact phase and on its explosion tiles during the explosion phase, at most once each per fireball
([`fireballHazards.ts`](../../src/encounters/yamaP3/fireballHazards.ts)).

#### Void flare explosions

**Explosions scale with the flare's REMAINING hitpoints, and a detonating flare heals Yama.** Wiki:
"the amount of damage dealt, along with health restored to Yama, scales on their remaining health at
the time of explosion. At full health, they will hit between 42-44 damage" (Yama/Strategies § Void
Flares), against 23-25 for a P3 flare at half its 140 pool. Void Flare's flat "23-25 damage in the
final phase" is not a constant.

`yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt` measures the curve: the player
tanked flares at a spread of HP. Fourteen P3 detonations (control 517), every flare spawning on 71:

| detonation tick | flare HP | player damage | Yama heal | Yama HP before heal |
|---:|---:|---:|---:|---:|
| 568 | 71 | 45 | 120 | 1406 |
| 568 | 1 | 10 | 26 | 1406 |
| 603 | 71 | 47 | 125 | 1552 |
| 603 | 71 | 47 | 125 | 1552 |
| 638 | 71 | 47 | 125 | 1802 |
| 638 | 27 | 21 | 56 | 1802 |
| 673 | 27 | 22 | 58 | 1983 |
| 708 | 70 | 45 | 120 | 2041 |
| 743 | 38 | 28 | 74 | 2161 |
| 778 | 46 | 35 | 93 | 2219 |
| 778 | 11 | 19 | 50 | 2219 |
| 813 | 70 | 42 | 112 | 2362 |
| 848 | 7 | 19 | 50 | 2381 |
| 848 | 10 | 17 | 45 | 2381 |

Flare HP is `71 − damage already taken`; the headbar (id 2, width 20) tracks `ceil(hp / 71 × 20)`.
Each damage figure is confirmed by Yama's same-tick heal, `floor(8 × damage / 3)`, so it is read from
two packets. Within a tick, splats pair to flares by NPC index order. **Yama's HP alone does not
determine the damage**: ticks 568, 638, 778 and 848 detonate two flares under an identical Yama with
different damage (568: 71 HP dealt 45, 1 HP dealt 10). That does not exclude some contribution from
his HP. The 35 community-reported rows (`BLOODIED_BLOWS_REPORTED_EXPLOSIONS` in
[`captureConformance.test.ts`](../../src/encounters/yamaP3/__tests__/captureConformance.test.ts); a
report, not a capture) give Yama HP 252–1310, and their residual correlates `+0.005` with it (mean
12.87 below 800, 13.15 above): grounds to leave it out, not proof of absence.

Shipped band `floor(7/16 × hp) + [8, 17]`: 39–48 at 71, 69–78 at 140, 8–17 at 0.

- **Ten is the minimum fitted width over these capture and reported rows.** Nothing narrower
  contains all 52 samples at any slope (14 capture + 35 reported + 3 P1). A 7-wide band fits the 14
  capture samples alone, but nine reported rows fall outside it (e.g. 40 at 71, 24 at 17). True
  support may be wider. Independent end slopes converge to equal slopes; health-proportional or
  max-hit-shaped widths are rejected (AIC 277 and 278 vs 245).
- **The slope is a choice inside an interval.** `7/16` is a dyadic value picked from equally good
  fits (a repeating binary fraction makes `Math.floor` land a point low at some HP). It is not
  measured. The uniform roll is an assumption.

All non-lethal contracts fit this one band in both phase groups, so it lives on
`SIGIL_ENCOUNTER_BASE`. Cross-contract rows read flare HP from the headbar (a range) and count as
fitting if any HP in it fits (glyphic `47` only at 69–71 of `68-71`; glyphic `21` only at 10 of `8-10`):

| contract | P1/P2 (spawn 140) | P3 (spawn 71) |
|---|---|---|
| Bloodied Blows | 75, 71, 77 @ 140 | 14 capture + 35 reported, hp 1-71 |
| Glyphic Attenuation | 73 @ 139-140, 22 @ 29-31 | 47 @ 68-71, 21 @ 8-10 |
| Forfeit Breath | 38 @ 54-56 | 40 @ 68-71, 24 @ 32-35 |

Divine Severance and Sensory Clouding are `'lethal'` and never roll the band; their captures contain
zero `hit id=6` heal splats (bloodied blows: 14), and their six detonations heal nothing.

**Base Yama keeps a flat `[10, 27]`.** Its full-health P3 flares deal 23, 26 and 27 where contracts
deal 39–48 at the same HP, so the contract curve does not transfer. This is **not** the wiki's
Wretched-Strength-on-flares bugfix: that hotfix is 23 May 2025 and the 3000 pool these captures read
is 29 May 2025, so they post-date it; the cause is unknown and the split is base-vs-contract. Base
stays flat only because its four samples sit at two HP values (23/26/27 at 71, and 10 at the
`fill=1` detonation on tick 3049, HP 1–3), too few for a slope; the 10 also fits the contract band at
1–3 HP. The wiki states scaling for every flare, so flat is a data gap, not a claim.

**The heal** ("flares ... will damage players and heal Yama if not destroyed", Yama § Fight
overview) arrives as `hit id=6` on Yama on the detonation tick and is not its own roll:
`floor(8 × damage / 3)` reproduces every unclamped pair. The player's splat arrives the tick *after*
(impact spotanim `vfx_voidflare_human_impact_blue` has `delay=30`), and the simulator models that
split. Tick below is the detonation tick:

| capture | tick | player damage | Yama heal |
|---|---:|---:|---:|
| `yama-normal-contract-203-magic-def-223-range-def-p3` | 3049 | 10 | 26 |
| `yama-contract-of-glyphic-attenuation-packet-data-1` | 16991 | 22 | 58 |
| `yama-normal-contract-long-p3` | 3339 | 23 | 61 |
| `yama-normal-contract-long-p3` | 3346 | 26 | 69 |
| `yama-normal-contract-long-p3` | 3213 | 27 | 72 |
| `yama_forfeit_breath` | 198 | 38 | 101 |
| `yama-contract-of-glyphic-attenuation-packet-data-1` | 16388 | 73 | 137 (clamped) |

The six unclamped rows bound the constant to `[8/3, 59/22)`; the bloodied blows detonations sit
inside and do not narrow it. The seventh is Yama reaching his 2875 pool with 137 headroom (the heal
splat reports what was restored). Two explosions that rolled 0 healed nothing: proportional, no floor.

#### Wave timing

Base P3 shadow waves recur on a **70-tick cycle** of staggered diagonal X waves (`waves.periodTicks: 70`,
`waves.deltas: [0,14,21]`, `speedTilesPerTick: 2`), anchored by `startDelay: 7` so the delta-0 danger
lands at sim tick 16+70k (sim tick 0 = P3 control). The **first cycle is partial**: base fires only
the delta-14 wave (`firstCycleDeltas: [14]`, first danger at sim tick 30), verified real rather than a
capture gap (the client streams world data from control+1 yet emits a single shadow wall in cycle 0).
Each X is clipped to a central band so it never reaches the corners
([`waves.ts`](../../src/encounters/yamaP3/waves.ts)).

Contracts share the cadence (cycle bases at control+12+70k) but use deltas `[0,15,22]` and fire all
three waves in the first cycle; the divine captures read `[0,15|16,22|23]`. The ±1 delta difference
is consistent across contract captures (medium confidence it is intentional rather than noise).
