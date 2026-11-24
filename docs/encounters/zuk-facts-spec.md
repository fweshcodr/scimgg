# TzKal-Zuk — facts spec

What the captures and permitted sources establish, each fact beside its citation. Simulator
choices made where these facts stop are in [`zuk-policy.md`](./zuk-policy.md); unsettled rules and
the captures that would settle them are in [`zuk-open-questions.md`](./zuk-open-questions.md).
Runtime scope notes: `ZUK_SCOPE_NOTES` in [`controls.ts`](../../src/encounters/zuk/controls.ts).

Conventions: a value seen once is marked `n=1` and is not extrapolated; a capture can refute a rule
without identifying its replacement. The Wiki pages cited here are one editorial family, not
independent confirmations.

## Captures

| Capture | Ticks | Content |
|---|---|---|
| `inferno-waves-69-zuk-packet-data.txt` (W69) | 0..1322, contiguous | Wave 69 entered directly (Inferno entry at t1); one attempt ending in player defeat |
| `inferno-waves-tbow-69-zuk-packet-data.txt` (T) | 0..617 | Wave 69 entered directly; one attempt ending in Zuk's death (590 -> 591) |
| `inferno-waves-1-68-packet-data.txt` | two streams, 443..10059 then 0..1021 (restart at line 180678) | Normal waves; second Jad-healer retaliation observation |
| `zuk-atlatl-dragon-hunter-wand-packet-data.txt` | 683..820 | Jad Challenge minigame, sole NPC `jad_challenge_jad (10623)`; Jad timing only, not a wave-69 run |

Line anchors are line numbers in these captures. Normal-wave IDs 7698/7699 and
challenge 10623 are distinct NPC types from final-wave 7702/7703/7704; evidence from one variant is
applied to another only where this spec or the policy says so. Projectile and ground-graphic counts
are in [`zuk-projectile-evidence.md`](./zuk-projectile-evidence.md).

**Outcomes.** W69 ends in player defeat; T records Zuk's death at t590→591. Neither establishes glyph
destruction or what happens to an exposed player's in-flight blast when Zuk dies: at T's kill no Zuk
shot is in flight to the player. In W69 player HP reaches 0 at t1285, `human_death (836)` plays at
t1288 and `You have been defeated!` prints at t1292 (W69 lines 23274, 23308, 23327); Zuk's last HP is
484 at t1220. The glyph walks through t1291, and the t1292 removals are scene-exit cleanup, not glyph
destruction.

**Sim offset**: `sim = world − (2240, 5312)`, anchored on the Zuk `add` at t18, world `(2268,5364)` =
sim `[28,52]`. An NPC's coordinate is its south-west corner.

**Control tick t26**: `busy (12393)` 1→0. Sim tick 0 is the control tick, so
`sim tick = capture tick − 26`. All ticks below are raw W69 ticks unless stated.

## Intro (C-12..C)

Both captures enter the Inferno straight at wave 69 (W69 t1 L2695-2711, T t1 L4529-4558: busy, the
entry teleport, busy cleared) and then play the same intro, relative to control C (W69 C = t26, T
C = t27; T's ticks are W69's + 1). No capture records wave 68's clear before it.

| Offset | Observation | W69 | T |
|---|---|---|---|
| C-12 | `busy (12393)` 0→1, mesbox "A great power is starting to shake the cavern..." | t14 L2757 | t15 L4625 |
| C-10 | player `teleport` to (2271, 5356) = sim `[31,44]`, `facing` (2271, 5357), north | t16 L2780 | t17 L4654 |
| C-8 | `add` glyph 7707 at (2270, 5363) = `[30,51]`, then Zuk 7706 at `[28,52]` (spawn seq 7563); loc placements 30339, 30341, 30343 (rot 3), 30340, 30342 (rot 1), 30344 (rot 3); `loc_del` at the glyph's tile | t18 L2839-2847 | t19 L4716-4725 |
| C-7 | `loc_anim` 7559 on (2273, 5364) and 7560 on (2268, 5364) | t19 L2860-2861 | t20 L4740-4741 |
| C-6..C-4 | glyph walks south one tile a tick to (2270, 5360) = `[30,48]` | t20-t22 | t21-t23 |
| C | `Wave: 69`; busy 1→0; loc placements 30345 at (2273, 5364), 30346 at (2268, 5364), rot 3 | t26 L2899-2906 | t27 L4792-4800 |

The glyph's patrol starts at C+1 (W69 east, T west) and Zuk's first blast is at C+13 (W69 t39). The
cache LOCs these changes replace (rotations from the test cache's region 9043): 30333, 30332, 30324,
30334, 30337, 30336 and the static glyph 30338, all rotation 3. Simulator choices around the intro
(when it starts after wave 68, what the run keeps): [`inferno-policy.md`](./inferno-policy.md#wave-69-transition).

## 1. Actors and identity

| NPC | id | Spawn tick | Sim SW | Lifetimes (sorted) |
|---|---|---|---|---|
| `inferno_tzkalzuk_placeholder` | 7706 | 18 | `[28,52]` | 1274 |
| `inferno_moving_safespot` (glyph) | 7707 | 18 | `[30,51]` | 1274 |
| `inferno_mager_finalwave` (Jal-Zek) | 7703 | 98, 448, 1229 | `[26,39]` | 63 / 146 / 235 |
| `inferno_ranger_finalwave` (Jal-Xil) | 7702 | 98, 448, 1229 | `[35,39]` | 60 / 63 / 146 |
| `inferno_jad_finalwave` (JalTok-Jad) | 7704 | 795 | `[30,35]` | 195 |
| `inferno_jad_healer_finalwave` (Yt-HurKot) | 7705 | 877 (×3) | see § 5 | 113 each |
| `inferno_zuk_healer` (Jal-MejJak) | 7708 | 1065 (×4) | see § 6 | 76 / 77 / 81 / 89 |

Zuk's footprint is 7×7 from `[28,52]`, so **his center column is x=31** (load-bearing for § 6).
In W69, 7706 and 7707 both end at teleport-out; neither was destroyed. Dataset HP lookups for the
final-wave IDs work directly (7706=1200, 7703=220, 7702=125, 7704=350, 7705=90, 7708=75); the glyph
has no stat row.

## 2. Health

- **Maximum 1200.** `inferno_zuk_hp (5653)` initializes 0→1200 at t26.
- **Natural regeneration +1** at t119, 219, …, 1019 (exactly 100 apart), then t1122 and t1220
  (gaps 103 / 98, unexplained; no intervening HP update; the two sum to 201).
- 39 damage steps t30..1065; 65 varbit transitions in total.

| Tick | Transition | Line | Meaning |
|---|---|---|---|
| 535 | 603 → 600 | 10242 | First arrival at exactly 600 |
| 539 | 600 → 599 | 10328 | First drop below 600 |
| 619 | 599 → 600 | 11810 | Regeneration back to exactly 600 |
| 638 | 600 → 575 | 12102 | Leaves 600 again (19 ticks at 600) |
| 795 | 490 → 392 | 13747 | Crosses 480; Jad added the same tick |
| 1065 | 261 → 231 | 17952 | Crosses 240; four healers added the same tick |
| 1088 | 460 → 482 | 18688 | Last enrage heal |
| 1220 | 483 → 484 | 21976 | Last HP change |

Phase actors share the visible tick of their damage crossing; this constrains visible scheduling,
not the server's private callback order. Both crossings skip the equality values.

### Published rules used by the evidence build

- **Hybrid blast.** The [TzKal-Zuk article](https://oldschool.runescape.wiki/w/TzKal-Zuk#Fight_overview)
  averages effective ranged/magic accuracy against averaged ranged/magic defence and makes one
  damage roll up to the averaged maximum (not two rolls, not averaged hit chances). Component maxima
  169 ranged / 128 magic give the displayed 148; baseline attack roll 174376. Implemented in
  [`blastDamage.ts`](../../src/npcs/inferno/blastDamage.ts).
- **Phases.** [JalTok-Jad](https://oldschool.runescape.wiki/w/JalTok-Jad): Jad appears at "480 or
  less", summons three healers north of him at half health. The Zuk article: enrage and four healers
  at 240, attacks three ticks faster, Zuk cannot be meleed, remaining minions die when Zuk dies.
- **Threshold equality is disputed.** [Inferno](https://oldschool.runescape.wiki/w/Inferno#Final_boss)
  says "below 480"/"below 240"; JalTok-Jad says "480 or less" and
  [Inferno/Strategies](https://oldschool.runescape.wiki/w/Inferno/Strategies#TzKal-Zuk) "240 or
  less". W69 skips both equality values (490 → 392, 261 → 231). The strict rule is
  [simulator policy](./zuk-policy.md#phase-thresholds); the captures do not distinguish these
  alternatives.
- **Glyph.** [Ancestral Glyph](https://oldschool.runescape.wiki/w/Ancestral_Glyph): 600 HP against
  other monsters; absorbs Zuk's attacks indefinitely; travels east-west and remembers its initial
  direction ([revision 15329842](https://oldschool.runescape.wiki/w/Ancestral_Glyph?oldid=15329842)).
  The Zuk article: destruction leaves the player exposed. No defence stats are published.
- **Initial targets.** The Zuk article: both set members initially attack the glyph and switch to
  the player when attacked. JalTok-Jad: wave-69 Jad initially targets the glyph.
- **Healers.** [Jal-MejJak](https://oldschool.runescape.wiki/w/Jal-MejJak): 15-24 every 3 ticks
  until attacked, then sparks (Inferno/Strategies: "around 15-25").
  [Yt-HurKot](https://oldschool.runescape.wiki/w/Yt-HurKot#Strategy): Inferno healers heal 15-24
  every 4 ticks in melee distance of Jad, citing Mod Ash's 2020-12-30 statement (tweet
  1344226351654514688, not independently fetched). Its heal-while-fighting passage describes
  Fight Caves healers; the [TzTok-Jad](https://oldschool.runescape.wiki/w/TzTok-Jad#Strategy)
  JalTok-Jad practice paragraph requires Inferno healers to be untagged and directly next to Jad.
  The 15-24 amount conflicts with the captured Jad totals (§ 5).
- **After enrage.** W69 heals Zuk from 231 back to 482..484 (above 240) and keeps the 7-tick cadence
  through t1283 (§ 3). No second 240 crossing is recorded, so healer respawn is unobserved.

## 3. Zuk's attack cadence

`inferno_zuk_projectile (1375)`, 135 casts, t39..1283.

- **First cast t39 = control + 13**, then **every 10 ticks** through t1059 (103 casts).
- **Every 7 ticks from t1066** through t1283 (32 casts, none skipped). The previous cast is t1059, so
  t1066 is both last-cast + 7 and threshold (t1065) + 1; this one transition cannot separate the two.
  Last-cast + 7 is simulator policy; the captures do not distinguish these alternatives.
- **Flight follows the player's position before the NPC phase, not the glyph endpoint.** `endtime`
  is `16 + 10 × D` (106 and 126 are both common); impact tick is cast + `floor(endtime / 30)`. The
  exposed cast at t1066 has `endtime=106` and hits the player at t1069. Do not model a fixed flight.
- 134 casts target the glyph and one the player; none damages the glyph.

### Shadow

Zuk targets the glyph while the player stands in its shadow, and the player otherwise. With glyph SW
column `gx` (the glyph actor is 3 wide), the shadow is **`y ≥ 44` and `gx − 1 ≤ x ≤ gx + 3`**: five
columns, with no northern bound because the walkable floor ends south of the glyph. Zuk reads it on
his cast tick, after the glyph has taken that tick's step (it acts just before Zuk, consistent with
its lower NPC index in both captures: W69 46150/46151, T 57610/57611) and before the player moves. Code:
[`targeting.ts`](../../src/encounters/zuk/targeting.ts). The evidence is of two kinds, in
[`targeting.test.ts`](../../src/encounters/zuk/__tests__/targeting.test.ts):

- **Recorded.** The five-column shadow model classifies all 135 recorded casts (134 glyph, 1 player)
  from the recorded glyph and pre-movement player positions; the independent glyph track (§ 7) agrees
  with every cast row.
- **Specified.** The boundary tests (`gx − 2`, `gx − 1`, `gx + 3`, `gx + 4` and `y = 43`) specify the
  simulator's behavior; they are not independent observations of every edge tile.

## 4. Sets (mager + ranger)

Spawn at **fixed** tiles on all three occurrences: mager `[26,39]`, ranger `[35,39]` (third-set
ranger `add` at line 22100).

- **First set t98** = control + 72 = actor-add + 80 (`n=1`; both anchors fit). Glyph endpoint
  arrivals in that window are t39, t69, t99 — the set is not on an endpoint tick.
- **Mager fires from spawn + 6, ranger from spawn + 8, each every 4 ticks** (104/454/1235 and
  106/456/1237).
- 105 mager attacks; 60 ranger actions carrying 120 projectiles (two per action). No set member
  moved or meleed in W69. The ordinary-wave variants are separate evidence: 7698/7699 in the waves
  1-68 capture make 503/663 distance attacks and 379/375 walks with no melee, reach 15, and the
  ordinary-wave capture Q records ordinary-variant melee ([Inferno facts](./inferno-facts-spec.md)).
  Neither is evidence of wave-69 set melee.
- **Flight timing** from attacker center tile to the target's pre-NPC-phase player tile or NPC SW
  tile: mager `28 + 8·D` matches all 105 endtimes, ranger `46 + 8·D` all 120.
- **Observed reach** (footprint-edge): mager 14 to the glyph and 13 to the player, ranger 15 to the
  player. These bound the recording, not species maxima.
- Ranger projectile origins vary across seven tiles for a stationary ranger; a fixed launch offset
  is refuted and the origin rule is not in the export.
- **Melee** ([Jal-Xil](https://oldschool.runescape.wiki/w/Jal-Xil), [Jal-Zek](https://oldschool.runescape.wiki/w/Jal-Zek)):
  ranger crush max 19 (Attack 140, Strength 180, size 3), mager stab max 52 (Attack 370, Strength
  510, size 4), zero melee bonuses, 4-tick speed. [Inferno § Monsters](https://oldschool.runescape.wiki/w/Inferno#Monsters):
  both melee any adjacent tile including diagonals, with line of sight.
  [Inferno/Strategies](https://oldschool.runescape.wiki/w/Inferno/Strategies#Jal-Xil) says the
  ranger melees "sometimes", without odds. RuneLite `gameval/AnimationID.java`: ranger melee 7604,
  mager melee 7612. No wave-69 capture contains set melee.

### Targeting and first engagements

Magers attack the glyph at t104..120, t454..470 and t1235..1255. Each ranger is hit before its first
action, so an untouched ranger's initial target is unobserved. Pulling a ranger does not pull its
mager. A launched projectile survives retargeting: the mager cast at t470 still hits the glyph at
t473 after the mager is pulled at t472.

| Actor | Player launch | Printed hit on NPC | NPC's first player attack | Gap | Lines |
|---|---|---|---|---|---|
| Mager 1 | 119 (atlatl) | 122 | 124 | +2 | 4076, 4125, 4178 |
| Mager 2 | 469 (crossbow) | 472 | 474 | +2 | 8892, 8957, 9001 |
| Mager 3 | 1254 (atlatl) | 1257 | 1259 | +2 | 22593, 22661, 22709 |
| Ranger 1 | 100 (atlatl) | 103 | 106 | +3 | 3726, 3754, 3798 |
| Ranger 2 | 450 | 453 | 456 | +3 | 8558, 8614, 8663 |
| Ranger 3 | 1232 (atlatl) | 1235 | 1237 (its first attack) | +2 | 22130, 22238 |

The atlatl's 3-tick launch-to-printed-hit delay is printed, not inferred. Each mager's first player
attack keeps the 4-tick phase it had against the glyph. These refute an unconditional
"printed impact + 3" rule but do not establish every flinch rule; all three mager tags fall at the
same cadence phase. The [Hit delay article](https://oldschool.runescape.wiki/w/Hit_delay) excludes
the extra NPC-target processing tick from its tables, so "hit delay + 3" is not
printed impact + 3; the [Flinching article](https://oldschool.runescape.wiki/w/Flinching#Technical_details)
times re-engagement from attack readiness, not last attack + 8. The implemented retaliation rule is
[`npc-retaliation.md`](../architecture/npc-retaliation.md).

### Set schedule

Published ([Inferno § Final boss](https://oldschool.runescape.wiki/w/Inferno#Final_boss)): sets
repeat every 350 ticks (3:30), pause while Zuk is between 600 and 480, and resume at Jad's spawn
with a one-time 175-tick (1:45) addition.

Conditional on that rule, the recorded path discriminates:

| Model | Third set predicted | |
|---|---|---|
| Pause at 600→599 (t539, 259 left of the t798 due), resume at Jad spawn +175 | 795 + 259 + 175 = **1229** | Observed |
| Pause at first arrival at 600 (t535) | 1233 | Refuted |
| Timer runs while at exactly 600 (t619..638) | 1210 | Refuted |
| Resume at Jad death (t984) | 1418 | Refuted |
| 175 added twice | 1404 | Refuted |

So: keep running at the initial 600, pause on 600→599, stay paused on regeneration back to exactly
600, resume at Jad's spawn with one 175 extension. HP stayed under 600 from t638 onward and healing
to 482..484 after enrage did not re-pause the timer. Where the 175 is added (at pause, at resume or
to the due tick) is unobservable.

## 5. Jad and his healers

**Jad** spawns t795 at `[30,35]`, 5×5 (y 35..39). The player launches at t798, the hit lands at
t801 and Jad's first attack is t803, so his untouched opening is unobserved. Published
([JalTok-Jad](https://oldschool.runescape.wiki/w/JalTok-Jad)): ranged and magic every 8 ticks,
melee every 4, max hit 113; Attack 750, Strength 1020, Defence 480, Magic 510, Ranged 1020; magic
attack bonus 100, magic damage bonus 75, ranged attack bonus 80, ranged strength 0. These with the
generic NPC formulas suffice; no special Jad formula is needed. The TzTok-Jad 15-tile range is not a
JalTok-Jad measurement.

**Jad timing** (cue tick A):

- W69 cues t803 and t811 (lines 13856, 13968): ranged/magic cues repeat every 8 ticks across all 23
  recorded attacks.
- Magic t827 → release t830 (lines 14178, 14231-14237): graphics 448/449/450 with raw `starttime`
  2/6/10 and `endtime` 2/6/12 + 8·D, emitted on the release tick. Adding 90 cycles expresses them
  relative to A; they are not packets on A with starts 92/96/100. 130 magic triplets dispatch at A+3.
- Ranged t891 → release t894 → player hit t896 (lines 15232, 15289, 15331): rock 451 at height 92.
- Challenge t693/t697 (lines 51, 87): melee then ranged while the player stays adjacent; melee sound
  408 at t693/753/765/769. These are Jad Challenge (10623) observations; the policy transfers the
  melee sound and timing to live Jad 7704 (all 23 W69 Jad attacks are ranged or magic).
- **Protection deadline A+3.** Of 267 recorded releases, 18 first reflect the matching prayer at
  A+3 rather than A+2 (4 W69, 10 waves 1-68 stream 2, 4 challenge); 17 of those hit windows contain
  one zero, one has three zeros and is excluded. This supports A+3 as an observable policy, not the
  server's internal latch or intra-tick order.

| Capture | Animation | Prayer on | Release | Player hit | Lines |
|---|---|---|---|---|---|
| W69 | Magic 827 | 829 | 830 | 0 at 831 | 14178, 14208, 14231, 14249 |
| W69 | Ranged 891 | 894 (off 895) | 894 | 0 at 896 | 15232, 15267, 15289, 15301, 15331 |
| Waves 1-68 stream 1 | Magic 9693 | 9695 | 9696 | 0 at 9697 | 176163, 176177, 176201, 176217 |
| Waves 1-68 stream 2 | Magic 18 | 20 (off 23) | 21 | 0 at 23 | 183469, 183497, 183514, 183545, 183550 |
| Waves 1-68 stream 2 | Magic 135 | 138 (off 141) | 138 | 0 at 140 | 185236, 185291, 185298, 185325, 185344 |
| Challenge | Ranged 697 | 700 (off 701) | 700 | 0 at 702 | 87, 107, 116, 131, 142 |
| Challenge | Magic 705 | 708 (off 709) | 708 | 0 at 708 | 170, 197, 201, 208, 226 |
| Challenge | Magic 713 | 716 | 716 | 0 at 719 | 265, 281, 285, 312 |

**Jad death and cleanup**: zero headbar t983 (line 17060), death sequence t984 (17072), Jad and
children removed t990 (17151 onward) — six ticks after the death sequence, seven after the zero
headbar. The healers' identical 113-tick lifetimes are this parent cleanup, not an expiry.

**Healers** spawn at t877 = Jad + 82, all on one tick, at `[30,41]`, `[31,40]`, `[30,40]` in that
add/update order (indices 53724, 53725, 53726), within one tile of Jad's north edge. A west-to-east
row pack is contradicted by the empty `[32,40]`. The tbow capture's healers (t300, Jad + 36, lines
9224-9229) spawn at `[32,40]`, `[30,43]`, `[31,40]`: also north of Jad and distinct, but a different
layout ([open questions § 6](./zuk-open-questions.md#6-jad-healer-placement--n2)). Only the two healers adjacent to Jad cast at t877;
`[30,41]` is out of range. After the t881 failed-spell group engagement (an area attack), t882 places
them at `[31,42]`, `[32,41]`, `[31,41]` in that order — direct north-east stepping, not an
east-first equal-length route. At t887 the third healer stays at `[35,43]`, blocked by peers at
`[35,44]` and `[36,43]`, rather than routing around. First melee attacks t886. In the waves 1-68
capture one healer receives a failed-spell effect at t9819 and moves at t9820 while another keeps
casting on Jad (lines 177646-177679): retaliation is individual and needs no positive damage.

**Healing amount: fits 10 per action.** No per-heal amount is transmitted. Counting
`lizard_cleric_heal (2639)` actions and the player's actor-only damage against 350-HP Jads:

| Wave | Jad indices | Actions | Damage dealt to Jad | 350 + 10 × actions | Raw lines |
|---|---|---|---|---|---|
| 67 | 60744 | 8 | 433 | 430 | 177516..177762 |
| 68 | 64962, 64963, 64961 | 5 each | 402 / 403 / 403 | 400 | 185106..185330, 188778..188986, 192820..192969 |
| 69 | 52981 | 4 | 391 | 390 | W69, from 14940 |

The 1..3 residual is compatible with natural regeneration (not proven). Eight 15-24 heals would add
120..192 against a measured 83, so the published range does not fit these Jads.

**First heal is the first tick in range**, with no startup timer: W69 healers 53725/53726 cast on
their spawn tick t877 (lines 14940..14961, parent `tzhaar_heal (444)` in the same block, no delay
fields) and again at t881 (15023..15043); wave 67 spawn t9814 casts t9815/9816/9817 as each reaches
range (177516 on); wave 68 spawn t129 → t131, t380 → t383/384, t703 → t705/706. Jad's rounded
headbar updates accompany later damage, so they do not establish a cast-to-HP delay; the totals fit
application on the cast tick. Intra-tick heal/hit order is unknown.

## 6. Enrage

Triggered by the 240 crossing at t1065. Zuk's cadence drops to 7 (§ 3).

- **Four `inferno_zuk_healer` on one tick** at sim x = 22, 26, 36, 40, all y = 51: **−9, −5, +5,
  +9** from Zuk's center column. One symmetric layout, not a proven generator.
- Lifetimes 76/77/81/89 are player kill times, not expiry.
- **Heals.** All four first target Zuk, casting every 3 ticks; their t1069 projectiles target his
  placeholder. Each heal is a `wild_falloff_meteor_flying (660)` projectile with `endtime=90` (three
  ticks); Zuk's HP rises four ticks after the cast (cast t1069, HP t1073). Flight and application are
  separate events. Thirteen heals of 15–23 (15, 16×3, 17, 18, 21×2, 22×4, 23) land t1073..1088,
  taking Zuk 231 → 482.
- **Retaliation is individual.** Printed first damaging hits at t1072/1075/1080/1085 precede first
  spark volleys at t1073/1076/1081/1086. Last-heal to first-spark gaps are 4/4/3/2. Volleys then
  repeat every 3 ticks per actor. Unstruck healers keep healing Zuk.
- **Attack acceptance after tagging.** Inferno/Strategies: "Once tagged, the MejJak cannot be
  attacked a few seconds afterwards." W69 healer 55333 takes a direct hit at t1085, accepts a repeat
  blowpipe special launch at t1086 and is hit again at t1089 (lines 18558, 18613, 18751), so an
  unconditional multi-second post-hitsplat prohibition is unsupported. This one special-attack sample
  bounds the rule; it does not establish a refusal's duration, or that ordinary and special attacks
  are treated alike. The simulator's one-tick lockout is [policy](./zuk-policy.md#healing).

### Sparks

Measured over W69 lines 18164..21323; the spark facts the tests use are in
[`zukCaptureFixtures.ts`](../../src/encounters/zuk/__tests__/zukCaptureFixtures.ts).

- **Inventory.** 90 volleys of three: 270 `660` projectiles and 270 `wild_falloff_meteor_blast
  (659)` landings, zero multiset mismatches; the 660 total of 283 includes the 13 heals. Volleys per
  source 23/22/22/23. A tick with six effects is two volleys; two landings on one tile in one tick
  are both real (t1109, 1115, 1118, 1132, 1133).
- **Fields.** Every spark 660 has `starttime 0`, `endtime 90`, `progress 0`, heights 70→0, angle
  40..50. Every 659 lands at cast + 3, has no printed height, and its `delay` is absent in 41 records
  (present: 1×46, 2×55, 3×45, 4×39, 5×44). Absent is not zero.
- **Targets are tiles, not the player actor.** The player's world Y is 5358 and every healer's Y is
  5363 throughout, so only one player row is sampled. "Projectile targets the player tile" is
  refuted at the first volley (t1073). The exact pre-movement player tile receives a spark in 34 of
  90 volleys, all inside the region below; 0 of 56 volleys outside it do; 20 volleys against a moving
  player choose the old tile.
- **Candidate geometry (fits 270/270).** With `dx = playerX − Hx` before movement and healer tile
  `(Hx, Hy)`: shift −2 if `dx ≤ −3`, +2 if `dx ≥ 3`, else 0; region X `Hx+shift−3 .. Hx+shift+3`, Y
  `Hy−8 .. Hy−5` (7×4). Three ordered overlapping 3×4 strips centered at `Hx+shift+2`, `Hx+shift`,
  `Hx+shift−2`; the first strip containing the player tile places one spark on it. Shift thresholds
  1..6 give region-only errors 7/3/0/3/11/16 and combined strip-or-forced violations 20/11/0/16/33/44;
  post-movement at threshold 3 gives 32.
- **Damage.** Published (Inferno/Strategies): 3×3 area, 5-10. Across the 83 ticks t1073..1155: 19
  positive hits on 15 ticks, 68 zero-hit ticks, total 152. A **pre-movement 3×3 around each landing
  at cast + 3** predicts the hit count on every tick; tile-only leaves 13 bad ticks, post-movement
  3×3 nine, a 2-tick linger 13. Pairs 10/5 and 8/6 on one tick refute one copied roll per volley.
  Same- and different-source overlaps both hit; no identical-center duplicate ever exposed the
  player. Six hits (9, 6, 10, 5, 8, 8) land through Protect from Magic. The NPC damage-tracking
  counter does not move on spark hits, so a filter keyed on it discards all 152.
- **Sparks outlive their source.** Other healers volley on their visible death-sequence tick (t1139,
  t1144). The last source (index 55333) shows a zero headbar at t1151, plays its death sequence and
  volleys at t1152, is removed at t1154, and its volley lands at t1155 for 9 (lines 21299, 21309).

## 7. Glyph patrol

`inferno_moving_safespot (7707)`, 1100 `walk` packets. Spawns `[30,51]`, steps south to y=48 on t20,
21, 22; from t27 patrols row **y = 48** between **x = 17 and x = 43** inclusive, **one tile per
tick**. Inter-move gaps are 1 (×1056) or 5 (×43): **4 stationary ticks at each endpoint** (arrives
x=43 at t39, departs t44), 43 turnarounds. The full track is in [`zukCaptureFixtures.ts`](../../src/encounters/zuk/__tests__/zukCaptureFixtures.ts).

## 8. Ancestral Glyph damage

Sixteen hits, all from magers, 580 total, range 2..67, no zeros; every hit tick is
`cast + floor(endtime / 30)` (raw window lines 3847..22669; glyph actor index 46150). No ranger or
Jad damage to the glyph occurs.

| Cast | 104 | 108 | 112 | 116 | 120 | 454 | 458 | 462 | 466 | 470 | 1235 | 1239 | 1243 | 1247 | 1251 | 1255 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| endtime | 140 | 108 | 84 | 84 | 84 | 108 | 140 | 148 | 124 | 92 | 116 | 148 | 148 | 116 | 84 | 84 |
| Hit tick | 108 | 111 | 114 | 118 | 122 | 457 | 462 | 466 | 470 | 473 | 1238 | 1243 | 1247 | 1250 | 1253 | 1257 |
| Damage | 2 | 41 | 48 | 44 | 21 | 17 | 10 | 51 | 40 | 32 | 67 | 60 | 67 | 25 | 48 | 7 |
| Health bar | 29 | 27 | 25 | 23 | 22 | 21 | 21 | 18 | 16 | 15 | 12 | 9 | 6 | 5 | 2 | 2 |

RuneLite reconstructs the bar as `1 + floor(29 × h / 600)` for positive `h`, assuming the default
scale 30 (`OpponentInfoOverlay.java:169`, `Actor.java:97`, `HealthBarDefinition.java:41`; capture
headbar metadata unconfirmed). Under that, "600 HP and no healing" fails samples 1238, 1247, 1250,
1257, while a capped +1/100 regen at any phase, several other periods, a single +8, or a 609..611
max all fit. The bars exclude only "600 and no healing"; they do not identify regeneration.
Cache: glyph reaction 7568, death 7569.

## 9. Presentation and audio

Cycles are client cycles (20 ms, 30 per tick) relative to the emitting tick.

- **Glyph 7568 is the reaction to Zuk's blast arriving**, delayed to its end cycle (e.g.
  `delay=126` at t99, `delay=106` at t1234), not a reaction to mager hits.
- **Mager impact 131** at height 124 on all 105 mager attacks plus one exposed Zuk hit.
- **Healer spawn animation 2864**; NPC actions carry `facing` packets (e.g. `fallbackangle=256` at
  t100). The delayed defend packet (`delay=71`) is sent on the player's launch tick, alongside the
  attack sequence.
- **Parent heal graphic 444** is the healed parent's, height 256: t877 on Jad (line 14953), t1073 on
  Zuk (line 18159). Several heal contributions produce one 444 update, not one per caster.
- **Ranger 1377**: W69 t106 (lines 3820-3825) shows the pair, `starttime=60`, `endtime=46 + 8·D`,
  angle 16, progress 0, heights 256→124; the two share timing but not origin.
- **Arrival vs impact**: visual arrival is `endtime` cycles after the emitting tick;
  `floor(endtime / 30)` is the damage-tick conversion only.
- **Omitted fields**: all 267 Jad graphic 157 records omit `height` (ranged 157 has `delay=60`); all
  137 graphic 451 records omit `delay`; 659 omits `height` everywhere. Exporter semantics for omitted
  fields are unknown.
- **Yt-HurKot death 2638** (cache): 22 frames summing 20090 cycles (401.8 s), the last alone 20000.
- Every inspected Inferno NPC and effect frame-sound table is empty (cache 2686 rev 240), so frame
  audio produces nothing for this fight.

**Event audio ownership** (attribution by tick alignment; key on emitting actor, not id):

| Owner | Sound | Packets |
|---|---|---|
| Zuk cast / impact | 155 / 156 | 134 area (range 15) + 1 synth / 135 area (range 10) |
| Mager attack | 598 | 105: 16 area (range 10, at the mager) + 89 synth |
| Ranger attack | 598 | 60 synth, `delay=50`; one per action, not per projectile |
| Jad magic cue / release / impact | 159 / 162 / 163 | 7 synth at cues; per release; delayed to impact |
| Jad ranged | 163 | Undelayed, at release |
| Jad melee | 408 | Challenge t693 (line 52) |
| Jad-healer melee | 608 | 36 |
| Healer cast (heal or volley) | 155 | Area, range 8, `delay=51`; 103 = 90 volleys + 13 heals |
| Spark landing | 156 | Area, range 8, delay = the 659 landing delay; 270 |
| Deaths | 599 / 409 / 899 | Set member (4) / Jad (1) / enrage healer (3 of 4) |

**Incoming-hit families** (synth, no delay or range; include zero and burn splats; a defend packet is
not required):

| Family | Sound | Stream | Non-healing hits | Packets |
|---|---|---|---|---|
| Enrage healer | 900 | W69 | 50 | 42 |
| Set member | 600 | W69 / waves 1-68 stream 1 | 137 / 1753 | 123 / 1753 |
| Jad / Zuk (heal splats excluded) | 410 | W69 / 1-68 s1 / 1-68 s2 / challenge | 174 / 139 / 321 / 15 | 174 / 139 / 322 / 15 |
| Enrage-healer death | 899 | W69 | 4 deaths | 3 |

Regular Jad healer 7701 plays 610 on incoming hits (waves 1-68 t9831, line 177822 onward); first
W69 410 at t40 (line 3111), 600 at t106 (lines 3826, 3828: two sounds for two splats), 900 at t1074
(line 18189), 899 at t1139 (line 20869).

All 8 missing 900 and 14 missing 600 packets are distant burn splats; a pre-move footprint
Chebyshev `≤ 12` or Euclidean `≤ 13` fits both, post-move positions do not. 899 is missing only for
the eastern healer (index 55336) at t1140, listener distance 14 and the only burn-lethal healer
death, so distance and hit type are confounded. Waves 1-68 stream 2 t896 (line 195318): one lethal
2-damage hit on Jad produced two 410 packets, then death 7594 and 409 at t897. Hit and death sounds
can share an actor and tick (t6486 mager 600+599, line 116749; t7289 ranger 600+599, line 132439;
t10024 Jad 410+409, line 180528): a zero splat on the corpse on its death-sequence tick, the tick after
the kill (t7289: burn kill at 7288, 0 splat and death sequence at 7289).
