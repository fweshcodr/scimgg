# Inferno: simulator policy (waves 1–69)

How the simulator decides what the captures in [`inferno-facts-spec.md`](./inferno-facts-spec.md)
cannot settle, and how its practice run behaves. Each mechanic names its basis: **Captures** (facts
spec), **W** = OSRS Wiki, **Policy** = simulator policy with no direct evidence. A community report
appears only as non-verifying corroboration where it adds something. What would settle each rule,
and every unexplained or contradicted observation, is in
[`inferno-open-questions.md`](./inferno-open-questions.md). Wave 69's own rules are in
[`zuk-policy.md`](./zuk-policy.md).

## Mechanics

| Topic | Rule | Basis |
|---|---|---|
| Spawn slots | Uniform shuffle of the nine slots per wave, from the wave's layout stream (`(runSeed, wave)`, [Seeds](#seeds)), so a wave's layout is reproducible from its run seed. | Captures: fixed slots, assignment varies between runs; slot counts are consistent with a uniform shuffle ([observed rates](./inferno-open-questions.md#e-observed-decision-rates)). Uniformity: Policy. |
| Nibbler tiles | Uniform, with replacement, over the 3×3 area x 25–27, y 33–35 (same stream). | Captures (the area; two nibblers may share a tile). Uniformity: Policy. |
| Blob style, no Magic/Missiles protection | Random between ranged and magic (50/50) at the read. Protect from Melee alone is treated as "no protection". | W [Jal-Ak](https://oldschool.runescape.wiki/w/Jal-Ak). Odds: Policy. |
| Blob melee | On a decision tick with the player cardinally or diagonally adjacent (not underneath) and not protecting from Melee, 50% chance to melee at once, hitting that tick, instead of reading; the next decision is +6. | Captures (immediate hit, diagonal, +6: facts spec, Jal-Ak); W ("random chance"). Odds: Policy. |
| Bat drain | Each attack drains 3 run energy unless Protect from Missiles is active; a successful hit with no Protect from Missiles also drains 1 from each combat stat. | W [Jal-MejRah](https://oldschool.runescape.wiki/w/Jal-MejRah), W Inferno §Monsters. Not in the captures ([C5](./inferno-open-questions.md#c-behavior-without-direct-supporting-evidence)). |
| Meleer dig | First dig check at spawn+50 (resurrected: add+49). At a check it does not dig while its attack delay (its own last swing + 4) is within 15 ticks, i.e. after a swing in the last 19 ticks; the player's hits, which flinch-push its next action, never block a dig. A blocked check draws the next one uniform 40–60 ticks later; a dig draws it 6 + uniform 40–60 ticks after the dig-down tick, once it may walk again. Down→up 3 ticks; resurfaces with its 4×4 footprint containing the player's tile from the start of the dig-down tick, preferring the player on its NE corner, then SW, then the rest (nearest legal footprint if terrain or a standing pillar rules them all out; other NPCs never do); may walk from up+3 and attack no earlier than up+9. Underground it cannot be targeted, while its pre-dig footprint keeps blocking. | Captures (facts spec, Jal-ImKot): block window 18–23 ticks after a swing, player hits never block, post-dig offset 5–6; 19 and +6 are Policy within those bounds. Captures also cover 50/49, the 3-tick dig, the dig-down footprint and NE/SW preference (42/42), NPC overlap, up+9 and blocking; the order past the observed corners and the fallback are Policy. The 40–60 interval and the attack-delay reading come from a screenshot of a reply attributed to Jagex staff ("Arcane"), known only secondhand: checks "every 40-60 cycles (random)", and it "can't dig if its attack delay is within 15 cycles of current time"; the captured dig gaps (46–65) agree. W [Jal-ImKot](https://oldschool.runescape.wiki/w/Jal-ImKot) (6-tick wait; its "reset whenever it enters combat" is contradicted by the captures, [B17](./inferno-open-questions.md#b-contradictions-between-sources)). |
| Revived attack delay | A revived NPC steps in its add tick (engine rule) but makes no attack, blob read or resurrection before add+4; a blob's earliest shot is add+7, and a revived meleer still first checks its dig at add+49. | Captures bound the gate to add+4..add+7 (25/25 revived attackers at ≥ +7; Q t708 bat, Q t3459 ranger and P t4931 blob lose reach at +4). The exact +4 is Policy; the captures do not distinguish these alternatives. A community report ("ranger attacks 4t after respawn, mager 8t") agrees, as non-verifying corroboration; its mager +8 matches the captures. W [Jal-Zek](https://oldschool.runescape.wiki/w/Jal-Zek) ("slight delay before attacking"). |
| Mager resurrection | When it would attack and is in combat, 1/10 chance to resurrect instead, if an eligible corpse exists. Eligible: bat, blob, meleer, ranger, mager killed this wave, each original monster at most once (two of one species can each be revived); never nibblers, split blobs, Jads or healers. The corpse is drawn uniformly from the eligible ones. Revived at `floor(maxHp / 2) + 1`. Birth SW tile uniform over local x 31–37, y 28–34 (49 tiles), legal terrain, never on the player or a corpse, may overlap living NPCs; with no such tile for the drawn corpse, it does not resurrect and attacks as usual. The caster faces the birth tile; graphic 444 at birth + (size − 2) h150. The revived NPC takes its ordinary first turn that tick (it is added during the NPC turns). Mager's next attack is rez+8. | Captures: species incl. mager; birth box (every one of 34 births; all 49 tiles legal in all 34 scenes); facing and graphic offset; same-tick step 34/34; +8; 12/34 overlap living NPCs; two of one species revived (P wave 44 two bats, Q wave 49 two meleers); rate 34/318 = 10.7%, 95% CI 7.8–14.6%. `floor(maxHp / 2) + 1` is the best fit to the observed splats. No second revival of one monster was observed. Model (Policy): the uniform corpse and tile draws, the once-only limit, the no-tile fallback, and excluding the player's tile and corpses (never observed, 0/34). W [Jal-Zek](https://oldschool.runescape.wiki/w/Jal-Zek) cites Mod Ash (2023-03-24) for 1/10. |
| Nibbler targets | The encounter draws one standing pillar per wave, uniformly from the wave's own seeded stream, and every nibbler of that wave targets it. If it collapses (or none stood at the wave's start), that wave's surviving nibblers attack the player for the rest of their lives (always hits, max 4 crush); no re-draw, no retaliation. | Captures (one shared pillar per wave, 105/105; no deterministic rule fits; no retaliation). Uniformity: Policy. Player fallback: Policy, never captured; W [Jal-Nib](https://oldschool.runescape.wiki/w/Jal-Nib) for accuracy and max hit. A community report that the player then becomes the nibblers' target agrees, as non-verifying corroboration. |
| Pillar collapse damage | Nibblers adjacent to the collapsing pillar at the moment it collapses take damage equal to their remaining HP, through their hit queue (so a victim whose turn already passed takes it next tick, as captured). No damage to the player or other NPCs. | Captures (nibbler kills only). W conflicts (49 vs half HP, [B4](./inferno-open-questions.md#b-contradictions-between-sources)). |
| Jad healer placement | Waves 67–68: each healer on a distinct open tile drawn uniformly without replacement from those 4–8 tiles (Euclidean) from the Jad's center tile, never the player's; if the band runs short, the nearest free open tiles around the Jad fill in. Wave 69: [zuk-policy](./zuk-policy.md#jad-healer-placement). | Fitted to the 28 captured healers, not a verified rule ([C15](./inferno-open-questions.md#c-behavior-without-direct-supporting-evidence)). Policy. |
| Wave 68 first-attacker order | Seeded random permutation of the three Jads for the +4/+7/+10 openings. | Captures (order followed spawn index, not position, in both runs). Permutation: Policy. |
| Jad healer threshold | Healers spawn on the hit that leaves Jad at or below half HP (`hpAfter <= maxHp / 2`, `src/npcs/inferno/jad.ts`), shared with wave 69. | W says "below 175"; captures' rounded headbars cannot separate `<` from `≤`. Policy. |

## Practice flow

One encounter, `inferno`, covers waves 1–69: TzKal-Zuk is wave 69 of the same run. The player picks
a start wave (1–69), optionally marks pillars as already destroyed (waves 67–69 never have pillars),
and may set a start tile and a custom spawn layout. Waves and Zuk share one saved loadout. An
untouched setup (a new player, Reset to defaults, or a missing or unreadable saved start wave)
starts on wave 69 (`INFERNO_DEFAULT_START_WAVE`). Clearing a wave continues into the next one at
completion + 6 ticks, as in a real run; clearing wave 68 continues into wave 69
([below](#wave-69-transition)). The run is won when Zuk dies. All of this section is Policy.

### Seeds

Inferno owns `runSeed` and optional `attemptSeed` (`getSeeds()`, recorded with the run, so a replay
rebuilds it exactly). Layout and random shield side use the run seed; NPC decisions, including the
wave-69 director and its independent Jad-healer draw, use the attempt-derived NPC seed.

- The run seed alone, with the wave number, places each wave's spawns: the slot shuffle, nibbler
  tiles and wave-68 Jad order, and the wave's nibbler pillar (`layout.ts`). Wave 69's random shield
  start also reads it.
- The NPC seed (`npcDecisionSeed`) is the run seed on a run's first attempt, which has no attempt
  seed, and otherwise mixes in the attempt seed. Each ordinary wave opens an NPC stream from it and
  the wave number: the monsters' accuracy and damage, Jad healer and resurrection placement, and
  the other species decisions. Wave 69's director draws from it, and its Jad healers from a separate
  stream derived from it.
- The player's own rolls come from the engine, not these seeds.
- Which restarts keep the run seed is in the [restart table](#restarts). On wave 69 a Retry draws a
  new run seed, so a random glyph side is drawn again; only Go to the same wave keeps it.
- A run started on wave 69 builds its director when the run setup is applied, before its opening
  actors are created. A tick-zero edit that keeps wave 69 only changes the shield start.

### Restarts

Every restart is a fresh run with a fresh loadout and the configured pillars.

| Action | Wave | Run seed | Attempt seed | Opening tile |
|---|---|---|---|---|
| Start (a fresh entry) | the saved start wave | new | none | the default start: (30,32) on wave 1; on 2–68 the configured start tile (`infernoStartTile`, default (34,44)), or the default where the chosen tile is invalid; (31,44) on 69 |
| Retry (session bar, Ctrl+R) | current | kept on a wave the run places from a custom layout or has locked; otherwise new | new where the run seed is kept; otherwise none | the stood tile |
| Lock layout | current; locks its spawn layout for the run | kept | new | the stood tile |
| Random spawns / New spawns | current; clears the lock, and on the custom layout's wave drops that layout for this run | new | none | the stood tile |
| Go to the same wave | current; clears the lock | kept | new | the default start |
| Go to another wave | chosen | new | none | the default start |
| Restart fight | the saved start wave, with the saved layout and no lock | new | none | the stood tile |
| Any restart out of wave 69 into waves 1–68 | as its row | as its row | as its row | the destination setup's default start, never the stood tile |

- **The stood tile** is where the player stood at the restart, alive or dead, so a player who set up
  behind a pillar starts there again. The default start replaces it on a restart into wave 1 (the
  landing tile) or 69 (its own start), out of wave 69, and onto a tile the new run blocks: closed
  terrain, or a pillar that stands again in it (one collapsed in this run but not destroyed in the
  setup; none from wave 67). The kept tile is the run's recorded start. Ctrl+R with a replay practice
  start set restores that replay point instead.
- **Opening timing** depends on the start wave alone, so a replay rebuilds it from its recorded setup.
  Wave 1 lands: the landing animation (seq 4367, P:233) plays as the run's intro before tick 0, the
  landing line "You hit the ground in the centre of The Inferno." (P:230) shows in chat on tick 1, the
  player faces north (the capture records no facing), and the wave spawns at control + 11, as the
  capture's entry does. Waves 2–68 spawn on GO, tick 1, instead of the capture's control + 11. Wave 69
  opens at its control tick with the glyph and Zuk in place and no intro. A tick-zero setup edit can
  change the run's wave but never starts a landing, and moves the player only across the 68/69 line.
- **Lock layout** is run-only, distinct from a saved custom layout: never saved, shared or counted
  as a setup change, though a recording keeps it, so a replay takeover retries the same spawns. It
  covers only its own wave: the next wave, reached by clearing it, spawns from the run seed as
  usual. Wave 67 (one Jad on a fixed tile) and wave 69 (whose run seed picks only a shield start)
  have no Lock layout. The restart offered beside Retry follows the run being fought, never a saved
  setup it has not applied.
- **Restarts keep worn equipment** into a run with countdown movement (start waves 1–68), when the
  configured equipment and inventory are still the ones the run started from (`carryWornEquipment`).
  A worn item comes out of the configured inventory slot it occupies and the configured item it
  displaced goes into that slot, else the first free one; the weapon and shield move together. Gear
  taken off stays off, in the inventory's first free slot. A worn item the configured inventory lacks
  stays worn without being duplicated, and a slot whose displaced items would not fit keeps its
  configured gear. Inventory contents, HP, prayer, stats, ground items and supplies come from the
  configured loadout. The kept gear is the run's recorded starting loadout. A restart into wave 69
  uses the configured loadout.
- **Countdown movement:** a run starting on waves 1–68 lets the player walk during the 3..2..1
  fight-start countdown; the tick and the waves' clocks wait, other clicks are queued for the first
  tick, and the run starts and is recorded on the tile reached. Wave 69 keeps its fixed start facing
  Zuk.
- **Opening camera:** each start wave has its own opening view (`setupCameras` in
  `src/encounters/presentationModules.ts`). A restart keeps the player's camera unless the new run's
  opening view differs from the last one applied.

### Custom spawn layout

The player may place one wave's slot NPCs (waves 1–66 with any; never nibblers or Jads) on the nine
slots: all of that wave's composition, or only some of it (each kind at most as often as the wave
spawns it). It replaces the shuffle whenever the run spawns that wave, however it got there, and
nothing else: the nibblers are drawn from the same stream as without it, and every other wave stays
seeded-random. A partial layout's other slot NPCs, in spawn order, take the shuffled slots it leaves
free, in shuffle order, so the run seed places them.

### Setup links

`/inferno/?…` (or `/?…`) opens a setup.

- `bat`, `blob`, `melee`, `ranger`, `mager` are the RuneLite Inferno Stats plugin's parameters,
  `[[x,y],…]` with `x = regionX − 17`, `y = 46 − regionY` of each NPC's SW tile, so local slot =
  `(x + 17, 46 − y)` (e.g. slot (18,41) is `[1,5]`); its `copyable` flag is ignored and its links work
  verbatim.
- Our additions: `wave` (1–69; without it the species counts must be a whole wave's, which they
  name, since compositions are unique; with it they may be only part of that wave's, a partial
  layout), `pillars` (comma list of destroyed pillars: `west`, `south`, `northeast`; absent = all
  standing), `player` (`[x,y]` in the monsters' coordinates: the start tile for waves 2–68; ignored on
  waves 1 and 69; absent keeps the saved start tile; one outside the arena or under a standing pillar
  is an error) and `setup` (a RuneLite Inventory Setups export string, URL-encoded).
- A link whose setup cannot be read applies nothing. Complete gear starts the run at once; otherwise
  (no gear, unreadable gear, or unsupported items) the setup is applied and the Inferno setup card
  opens. A link saves only its own keys over the saved Inferno setup, and its gear as the Inferno's
  current loadout. A link that applied something offers Undo on its notice, restoring the saved
  Inferno mechanics and loadout as they were; the first later change to either withdraws it.
- While the Inferno is the route, outside a replay, the address bar mirrors the saved setup as a
  link without `setup`, writing only what a run uses; the untouched default stays the plain
  `/inferno/`. Edits settle for 400 ms and replace the history entry. A gearless link matching the
  saved setup is treated as the plain route; otherwise the link applies to the local setup.

## Wave 69 transition

| Topic | Rule | Basis |
|---|---|---|
| Intro start | Wave 69's intro starts (busy, C-12) 6 ticks after wave 68's completion, the ordinary next-wave gap, so control C = completion + 18. One constant, `ZUK_INTRO_DELAY_TICKS`. | Policy: no capture records wave 68's clear with the intro. |
| Intro | Busy (inputs dropped, no walking, target cleared) C-12 through C; teleport to (31,44) facing north at C-10; glyph at (30,51) and Zuk added at C-8 with the alcove's walls and the static glyph's removal; glyph steps south C-6..C-4; `Wave: 69` and control at C; Zuk's first blast C+13, first set C+72. | Captures: [zuk-facts-spec.md](./zuk-facts-spec.md#intro-c-12c) (both wave-69 recordings, entered directly at wave 69). |
| Intro presentation | Fade to black over 15 cycles from C-12, back over 50 from C-8; cut at C-9 to the captured `cam_moveto` (35,35) height 1000 looking at (28,56) height 140, lightly shaken, until C, then the player's own camera, unchanged; the mesbox line at C-12 and TzHaar-Ket-Keh's line at C-8 in chat; Zuk rises (seq 7563) at C-8; his HP bar from C. All from the snapshot's control tick (`zukIntroCutsceneFrame`), so a seek is exact; a run started on wave 69 shows none of it. Not reproduced: the hidden minimap and closed tabs, music, the intro sounds. | Captures as above (W69 t14-t26); the immediate cut for rate 0 / rate2 100 and ground-relative heights are assumptions. |
| What the run keeps | Everything: the player, position until the teleport, HP, prayer, stats and boosts, inventory and supplies, equipment, timers and cooldowns, combat clocks and pending hits, every random stream, event ids and ground items (with their ids). Nothing is healed, prepotted, reset or rebuilt; Auto-Prepot applies only at a fresh run's start. Timers run through the intro. | Policy (no capture of a 68 → 69 run). |
| Wave 69's randomness | Its director is built at C-8 from the run's seeds, as a run started on wave 69 with those seeds builds it ([Seeds](#seeds)). | Policy (determinism). |
