# Inferno: facts spec (waves 1–68)

Canonical evidence for the `inferno` encounter and the ordinary-wave Inferno NPC definitions in
`src/npcs/inferno/`. Wave 69 (Zuk) lives in [`zuk-facts-spec.md`](./zuk-facts-spec.md). Simulator
policy for rules the evidence cannot settle lives in [`inferno-policy.md`](./inferno-policy.md).
Everything unexplained, contradicted or unsupported is in
[`inferno-open-questions.md`](./inferno-open-questions.md).

## Sources

| Alias | Source |
|---|---|
| **P** | capture `inferno-waves-1-68-packet-data.txt`. Two contiguous streams: ticks 443–10059 (entry, waves 1–67), then 0–1021 (resumed wave 68, written `R:t`). Reset at P:180676–180680. |
| **Q** | capture `inferno-waves-(35ish)-to-68-packet-data.txt`. Actually resumes at **wave 28** (Q:4641–4649); contiguous ticks 0–5222. `inferno-tbow-waves-(35ish)-to-68-packet-data.txt` is byte-identical — not a third run. |
| **C** | capture `inferno-waves-69-zuk-packet-data.txt` (cross-checks only). |
| **W** | OSRS Wiki: [Inferno](https://oldschool.runescape.wiki/w/Inferno), [Rocky support](https://oldschool.runescape.wiki/w/Rocky_support), and each NPC article linked below. |
| **RL** | RuneLite (BSD-2) `runelite-api/.../gameval/NpcID.java:35239–35337` for ID names. |

Coordinates are local to map square (35,83), region 9043: `world = local + (2240, 5312)` — the same
frame as `src/encounters/zuk/constants.ts`. All positions are SW anchor tiles, plane 0.
Projectile end-cycle `E` is in client cycles (30 per tick).

## Wave structure

| Fact | Value | Evidence |
|---|---|---|
| Wave start | `Wave: N` game message and the entire initial NPC batch on the same tick | every wave, e.g. P:352–360 |
| Wave completion | `Wave completed!` on the tick the last encounter NPC is **removed** (not killed) | P:857–859 |
| Next wave | **completion + 6 ticks**, 106/106 uninterrupted transitions (66 in P, 40 in Q) | e.g. P t508→514, P:857–895 |
| Death→next spawn | not a constant (8–12) — it is removal delay + 6 | see per-NPC removal delays |
| Entry | landing t459 (P:228–233), control restored t469 (`busy` 1→0, P:288–295), wave 1 t480 (P:351–360) → **control + 11** | resumes agree: P:183373–183431, Q:4519–4649 (control t3, spawn t14) |
| Player between waves | not moved, not healed, prayer not restored | P:868–901; Q:55787, 99477–99484 |
| Landing tile | local (30,32) | P:232 |
| Wave counter state | none observed beyond the chat message (no wave varbit) | — |

### Composition

Matches the Wiki table (W Inferno §Wave breakdown) in both runs (all 41 overlapping waves agree).
Waves 1–66 contain 3 nibblers except waves 3, 8, 17, 34 (6 nibblers, nothing else). 67 = one Jad,
68 = three Jads, no nibblers. The non-nibbler progression is: Bat → Blob introduced at 4 → Meleer at 9
→ Ranger at 18 → Mager at 35, with the full table reproduced in code (`waves.ts`) from W.

### Spawn slots

Ordinary wave-start NPCs (bat/blob/meleer/ranger/mager) use **nine fixed SW tiles**, never two in one
wave. Assignment varies between runs; the RNG is not observable.

| Slot | Local | Slot | Local | Slot | Local |
|---:|---|---:|---|---:|---|
| 1 | (18,41) | 4 | (22,23) | 7 | (33,29) |
| 2 | (20,35) | 5 | (32,18) | 8 | (40,34) |
| 3 | (18,18) | 6 | (40,21) | 9 | (39,41) |

Every size uses every slot by its SW tile (324/324 placements in P and Q, 31–41 per slot). Independent
corroboration: the Plugin Hub plugin inferno-scouter (BSD-2-Clause, commit `ff025377`,
`InfernoScouterPlugin.java:1088–1099`) lists the same nine region-9043 tiles and matches each wave
NPC's SW tile against them exactly, for every species.

Nibblers spawn independently in the **3×3 area x 25–27, y 33–35**; two may share a tile.
Per-wave spawns (NPC id, index and tile of every wave-start add, P waves 1–68 and Q waves 28–68):
[`infernoWaveSpawnsCapture.ts`](../../src/encounters/inferno/__tests__/fixtures/infernoWaveSpawnsCapture.ts).

Jad tiles are fixed: wave 67 (25,35); wave 68 (34,34), (25,35), (28,23) (P:175851, 183429–183431;
Q:99484, 101045–101047).

### Dynamic additions

Completion must count every encounter combat NPC, not the initial batch: blob children, resurrected
NPCs and Jad healers are later `add`s. A Jad's surviving healers are removed with the Jad on its
completion tick (P:180590–180601).

## Pillars (Rocky supports)

| Pillar | LOC | Damage varbit | Local SW | Footprint |
|---|---:|---:|---|---|
| West | 30353 | 5655 | (17,37) | 3×3 |
| South | 30354 | 5656 | (27,23) | 3×3 |
| North-east | 30355 | 5657 | (34,39) | 3×3 |

- Each intact pillar is a collidable LOC plus an invisible NPC **7709** (`inferno_invisible_3x3`) that
  receives hits (P:254–259).
- **255 HP**: the varbits count damage up; natural collapse at 255 (Q:52473–52495, Q:83956–83983).
  Also W Rocky support.
- Damage **persists across waves** and across pause/resume (Q:1804–1806, P:181941–181943).
- Collapse: remove 7709 and the LOC, add NPC **7710** at the anchor playing seq **7561**, area sound
  **1021** centered SW+(1,1). 7710 is removed after **+2** ticks (natural, Q:52535, Q:84038) or **+3**
  (scripted end-of-66, P:175832–175834, Q:99454); the sim models both
  (`PILLAR_COLLAPSE_REMOVAL_TICKS`). Why the delay differs by cause is not established.
- When wave 66 completes, all surviving pillars collapse on the completion tick (P:175792–175814).
- Collapse killed adjacent pillar-attacking nibblers (Q:52483–52515, Q:83968–84038). Damage to the
  player or other NPCs is **not observed**. The killing splat lands on the collapse tick for a nibbler
  that acts later in the tick (index 63103, Q:52488) and one tick later for one whose turn had passed,
  including the nibbler whose swing collapsed the pillar (63102, Q:52484→52512; 59498, Q:83969→84012): the
  order of a hit queued on the collapse tick.

## NPCs

Removal delay = ticks from death sequence start to NPC removal (all matched deaths, P+Q). The removal
happens in the removed NPC's own turn, in index order: a corpse still blocks lower-index NPCs on its
removal tick (Q t4119/t4120, Q:88304–88366 t4180/t4181, P t7626/t7627) and not higher-index ones
(P:140314–140366, t7687).
**Regeneration** (best fit to the observed splats): every species regains 1 HP per 100 ticks from
add+101. Replaying each captured kill's splats with it leaves 0 HP for 872/886 lives, 806 without
(P t4959 Jal-ImKot: killing splat 5 after one regeneration). The other 14 overkill by 1 with no
regeneration window (e.g. P t755 bat); unexplained (open question A6).
**Dying swing**: an NPC killed on its swing tick still plays the swing, but a melee swing at the player
deals nothing (P t959 Jal-ImKot and 13 more, no splat), while a Jal-Nib's swing at the pillar still lands
(15/15).
Projectile hit tick = emission tick + `floor(E / 30)`; `D` = Chebyshev distance to the projectile's
packet target tile (the player's pre-movement tile).

| NPC | ID | Size | Attack / def / death seq | Cadence | Removal | Evidence |
|---|---:|---:|---|---:|---:|---|
| Jal-Nib | 7691 | 1 | 7574 / 7575 / 7576 | 4 | +2 (330/330) | P:520–530, P:479–525 |
| Jal-MejRah | 7692 | 2 | 7578 / 7579 / 7580 | 3 | +2 (91/91) | P:552–646, P:833–859 |
| Jal-Ak | 7693 | 3 | mage 7581, melee 7582, range 7583 / 7585 / 7584 | read+3; 6 in reach | +2, then split | P:2139–2468 |
| Jal-AkRek-Mej | 7694 | 1 | 7581 / — / 7584 | 4 | +2 | P:2586–2689, P:2817–2853 |
| Jal-AkRek-Xil | 7695 | 1 | 7583 / — / 7584 | 4 | +2 | same |
| Jal-AkRek-Ket | 7696 | 1 | 7582 / — / 7584 | 4 | +3 | P:2897–2937 |
| Jal-ImKot | 7697 | 4 | 7597 / 7598 / 7599; dig 7600/7601 | 4 | +5 (73/73) | P:8088–8457 |
| Jal-Xil | 7698 (Zuk 7702) | 3 | range 7605, melee 7604 / 7607 / 7606 | 4 | +4 (61/61) | P:18765–19839 |
| Jal-Zek | 7699 (Zuk 7703) | 4 | magic 7610, rez 7611, melee 7612 / — / 7613 | 4 | +2 (67/67) | P:52305–54493 |
| JalTok-Jad | 7700 (Zuk 7704) | 5 | magic 7592, range 7593 / 7591 / 7594 | 8 (w67), 9 (w68) | +6 (8/8) | P:175899–180596 |
| Yt-HurKot | 7701 (Zuk 7705) | 1 | heal 2639, melee 2637 / 2635 | 4 | with Jad | P:177522–177679 |
| Rocky support proxy | 7709 / collapse 7710 | 3 | collapse 7561 | — | +2 / +3 | above |

### Projectiles

| Attack | Proj | Start | End `E` | Heights | Slope | Progress | Source for `D` |
|---|---:|---:|---|---|---:|---:|---|
| Bat | 1382 | 10 | 32+8D | 200→124 | 16 | 128 | packet source tile |
| Blob ranged | 1378 | 10 | 32+8D | 160→124 | 16 | 32 | packet source tile |
| Blob magic | 1380 | 28 | 28+8D | 160→124 | 16 | 32 | packet source tile |
| Small Xil | 1379 | 10 | 32+8D | 80→124 | 16 | 32 | — |
| Small Mej | 1381 | 28 | 28+8D | 80→124 | 16 | 32 | — |
| Ranger | 1377 ×2 (one hit) | 60 | 46+8D | 256→124 | 16 | 0 | NPC SW+(1,1) |
| Mager | 1376 (+ impact gfx 131) | 28 | 28+8D | 400→124 | 0 | 32 | NPC SW+(2,2) |
| Jad magic | 448/449/450 | 2/6/10 | 2/6/12+8D | 512→124 | 16 | 32 | lead projectile |

Examples: P:377–379, 2140–2142, 2226–2228, 2594–2599, 18773–18778, 52311–52313; Q:4687–4692,
16035–16037. Ranger/mager/Jad profiles are in `src/npcs/inferno/projectileProfiles.ts`.

Launch tiles (presentation; P, Q and C, launches by a lone attacking NPC of its type): bat its **SW tile**
(143/143 stationary); blob SW+(1,1) of its pre-movement footprint (298); children SW (212); mager SW+(2,2)
(1150). The ranger's two projectiles leave two tiles out on its facing side, one either side of the
center line, or one out on each adjacent side for a diagonal (facing N: SW+(0,3)/(2,3) 318×, E:
(3,0)/(3,2) 158×, W: (-1,0)/(-1,2) 125×, NE: (1,3)/(3,1) 104×); facing the target, that fits 743/819
volleys.

### Behavior

- **Jal-Nib** — targets the invisible pillar NPC (P:520–530) every 4 ticks for 0–4 (4 max observed).
  **All nibblers of a wave head for the same pillar** (105/105 waves, 330/330 nibblers); which one
  varies wave to wave, and nearest, fixed order, lowest HP, previous wave and nearest-to-player are
  all contradicted (P waves 1–3 north → west → south with all standing, P:371–375, 903–907,
  1658–1668; Q 28–30 west → north → south with the player nearest north). A hit nibbler keeps walking
  to its pillar (58 hit-then-pillar cases). **First swing the tick after reaching the attack tile**
  (93/93; P wave 9: reaches (20,37) t934 P:7933, first hit t935 P:7962–7967, spawn+6), never on the
  arrival turn; then every 4 ticks. Attack tiles from central spawns: west (20,37), south (27,26),
  north-east (33,39). Captures never show a wave's nibblers outliving their pillar. **Nibblers neither block nor are
  blocked by NPCs**: two walk onto the same tile and stay stacked (P:371–375, P:390; 633 stacked
  nibbler-ticks after a first step in P, 498 in Q), walk through other footprints (into a Jal-Ak's,
  Q:10432–10504; a Jal-Xil's, P:18845–18928), and attack one pillar from one tile on the same tick
  (P:10617/10620, Q:15831/15834). Other NPCs also step onto tiles nibblers hold (Jal-Ak P:37508,
  Jal-Xil Q:8206).
- **Jal-MejRah** — ranged every 3 ticks, attacks from up to 4 tiles from its footprint edge
  (Q:83876). First attack observed spawn+1. Largest timed hit 19 (Q:37369). Run energy is **not in
  the export**.
- **Jal-Ak** — **read, then release 3 ticks later.** On a decision tick with reach (player outside
  its footprint, within 15 tiles of it, attackable LoS — after the blob's step, before the player's)
  it reads the protection prayer: Protect from Magic → ranged, Missiles → magic. Every one of 446
  emissions had reach exactly 3 ticks earlier (e.g. P:2087→2138–2142, P:4202→4271, P:6336→6379,
  Q:22196, Q:90383); 436/436 styles match the read. No read animation: the attack sequence plays on
  the release tick (387/387). The next decision is release+3, so 6 ticks while the player stays in
  reach; without reach it waits — there is no spawn-based phase. At release LoS is **not** needed
  (50/446 fired through lost LoS, e.g. P:59668–59724), but range is: a player more than 15 tiles from
  the blob's footprint at the start of the release tick drops the shot (Q t24, Q:4895–4909; also P
  t1280, t1906, Q t313, t1511, t2890). Projectile source and distance use the blob's pre-movement
  footprint (446/446; 38 moving releases, e.g. P t3656, P:59717–59724). A release due on the
  death-animation tick still fires (Q t1083, Q t3860: Q:82067–82110). **Melee** happens on a decision
  tick, cardinally or diagonally adjacent, and hits that tick; the next decision is +6 (P t3661,
  P:59796–59811, next projectile t3670; Q t250 diagonal, 15 dmg, Q:9497–9505). Prayer is checked at
  release (P t3024–3028). There is **no scan animation**. Max timed hits: ranged 29, magic 24. Death →
  +2 removal; in that turn the **three children are added first, then the parent leaves** (P:2484–2540).
  No parent moves while dying (0/66). **Birth tiles** relative to the parent's SW: **Xil (1,1), Ket (0,0),
  Mej (2,2)**, added in that order. The parent's removal clears its whole 3×3 of collision flags, the
  children's birth tiles included. Each child then takes an ordinary first step in its add tick, so the
  captured `add` tile is where that step ended: with this layout the generic movement reproduces 198/198
  child add tiles (125 after a hidden step; Q t895's Ket, born under the player, escapes south by the
  underfoot rule). At P t774 Xil steps and re-flags its new tile, so Ket stays blocked t775–783 and enters
  at t784 (P:5497–5661). Exception: two splits whose children got lower NPC indices (index wrap, P t6752,
  Q t4300) stay put on the add tick (open question D10). A resurrected blob at P t4931 that did not fire at t4935 is
  explained by the revived attack gate (Jal-Zek below).
- **Split blobs** — fixed styles, all three act on the same tick from spawn+3 (P:2586–2599,
  Q:5760–5770), born in combat with the player: a hit or splash before then does not delay them (P t610
  ice blitz on Xil, splash on Mej; both attack at t612, P:2540–2600). No prayer read.
- **Jal-ImKot** — melee every 4 ticks, hit on swing tick. **First dig check at spawn+50** (24/24 wave
  spawns) or **revived add+49** (9/9 resurrections); a recent swing may suppress it (below). An
  attack at spawn+20 does not move it (Q:33983→34433→35166).
  Dig down→up = **3 ticks** (42/42). **Dig checks** (73 meleers, 42 digs, P+Q):
  - **Window after its swing: 18–23 ticks.** A swing 18 ticks before the spawn+50 check blocks the
    dig: the meleer is corner-trapped and only swings again at t7360 (P t7331→7349, P:133154–133604).
    A swing 24 ticks before a dig does not block it (Q t1860→1884, Q:41775–42299), nor does a
    22-damage hit 39 ticks before (P t9132→9171, P:166074–166614).
  - **The player's hits never block a dig**, though they would flinch its next action: P hits from
    t9229, dig t9236 (P:167455–167514); Q hits t1880/1882, dig t1884 (Q:42175–42299).
  - **Dig→dig gaps with no swing between: 46–65** (10 gaps; P t9074→9120, P:164637–165748, is the
    shortest; P t9171→9236, P:166614–167511, the longest). Counted from the dig-down tick, the next
    check therefore comes 5–6 + 40..60 ticks later.

  This agrees with a reply attributed to Jagex staff (see the policy, Meleer dig): checks every 40–60
  cycles, and no dig while its attack delay, the last swing + 4, is within 15 cycles. It refutes W's
  reset on entering combat (open question B17). The resurfaced 4×4 footprint **contains the player's tile from
  the start of the dig-down tick** (42/42: the player on its NE corner 25×, on its SW corner 16× when
  the NE one is blocked, on (1,1) once, P t1145→1148 P:11209–11241, where both are; the up-tick tile
  misses P t3017→3020 P:45573–45640, P t8079→8082 P:147761–147814, P t9074→9077 P:164646–164712 and
  Q t1654→1657 Q:37209–37300), and may **overlap other NPCs** (a bat P:152815–152827, a mager Q:81854–81857). Walks at ≥ up+3. **First attack after a resurface ≥ up+9**
  (17/25 exactly +9, none +6..+8; P t8809→8818 P:159912–160148, P t8512→8521 P:155672–155781).
  **Its pre-dig footprint keeps blocking other NPCs while it is underground** (P wave 63: down at (37,37)
  t8806 P:159828–159830; the mager behind it first moves at t8810, P:159935–159955). Between down and
  up the only splats in 42 digs are burn (id 74, P:11222, P:131749). No capture has every containing
  footprint illegal, so the fallback beyond them is unobserved.
- **Jal-Xil** (ordinary 7698) — 4-tick ranged (two visual projectiles, one hit), reach 15 from
  footprint edge (P:125019, Q:91118). Adjacent cardinal/diagonal melee 7604 observed 5× in Q
  (Q:5349 …). This is ordinary-wave evidence; wave 69's set rangers (7702) are a separate variant,
  with no melee in the cited wave-69 sample ([zuk-facts-spec.md](./zuk-facts-spec.md)).
- **Jal-Zek** (ordinary 7699) — 4-tick magic, reach 15. Diagonal melee observed (Q:18357–18361,
  34 dmg).
  **Resurrection**: seq 7611, message "Jal-Zek uses his power to trigger the rebirth of a fallen foe.",
  graphic 444 height 150, revived NPC added the same tick with its normal ID. Its **birth SW tile** is
  the tile the caster faces (P t4869: `facing coord=(2275,5342)`, P:85377–85383); graphic 444 sits at
  birth + (size − 2, size − 2). Every captured birth tile lies in local **x 31–37, y 28–34**, and all 49
  tiles of that box are legal in all 34 captured scenes. The revived NPC then takes an **ordinary first
  turn in its add tick**, so the captured `add` tile is where that step ended (20/34 step; 34/34
  reproduced). **`floor(maxHp / 2) + 1` HP** is the best fit to the observed splats (with it, every
  revival's splats end at 0 HP, including the even maxima `ceil(maxHp / 2)` misses: P t4931 blob 21,
  Q t4701 mager 111). The footprint may **overlap living NPCs** (12/34, often the
  mager itself: P t4869, P t4931, P t7588, Q t3505); none was born on a corpse or the player's tile
  (0/34, too few to rule either out). After a
  revival the mager's first step is rez+7 or later (8/8 that moved within 60 ticks; exactly +7 at P t4869,
  P t4931, Q t1966, Q t3459); a revived NPC overlapping it waits with it. Revived NPCs step from their add tick (above)
  but **attack only at add+7 or later**: the 25 of 34 seen attacking
  (earliest Q t708 bat at +7, Q:18157–18278; Q t3459 ranger +37; P t4931 blob read t5023, shot t5026),
  so an attack gate exists, bounded to add+4..add+7: Q t708 bat, Q t3459 ranger and P t4931 blob
  lose reach at +4. The exact gate within that bound is simulator policy (Revived attack delay); a
  blob can read at +4 and shoot at +7. Revived species: bat, blob, meleer, ranger, **mager**
  (Q:98155–98166). Not observed: nibblers, split blobs. **Not limited per species**: P wave 44 revives
  two bats, Q wave 49 two meleers. A second revival of one monster was not observed. Next magic attack **rez+8** (P:65935–66260, Q:19576–19720,
  Q:98064–98332). 34 casts in 318 eligible attack turns (10.7%); one with the player diagonally adjacent
  (Q t2298, Q:50567–50585).
- **Jad, wave 67** — 8-tick cycle, first tell **spawn+4** (both runs). Tell → release +3; ranged hit
  tell+5; magic hit release + floor(E/30). **5 healers** on the half-HP threshold hit (P:177516–177531,
  Q:99841–99861).
- **Jads, wave 68** — each on a **9-tick** cycle, first tells **+4/+7/+10**, ordered by NPC index (spawn
  order), **not** by position (P east-first, Q south-first). Survivors keep 9 ticks. **3 healers per
  Jad**.
- **Yt-HurKot** — **spawn tiles** (28 healers, 8 batches, P/R/Q): added on the Jad's half-HP hit tick,
  each batch on distinct tiles, none on the player, none inside or adjacent to the Jad: 2–5 tiles from
  its footprint (0/4/11/11/2 at 1–5), 4.0–7.8 from its center tile (open question C15, with lines).
  Heals 10 HP per effective cast every 4 ticks (best fit for kill-damage totals;
  casts after the Jad's death sequence starts don't count), heals on first adjacency, aggro switches
  individually when hit. `jadHealer.ts` matches. **Waves 67–68: first move or heal at add+1**,
  even when added beside the Jad (0/28 act on the add tick: P t9814, R t129/t380/t703, Q t4791/t4891/
  t5004/t5125); wave 69's heal on it (W69 t877). **Untagged, they step with the generic combat
  movement towards the Jad's contact destination**, not its nearest tile: 63/64 untagged steps in P+Q
  (e.g. P t9815 (27,43)→(26,42), P:177546; Q t4792–4794, Q:99872; R t130–132). Wave 69 shows one
  untagged step (tbow capture t301), which fits either rule. **From the Jad's death sequence to its
  removal an untagged healer still walks to it and casts heal** (seq 2639 with the Jad's 444): Q t4839
  death, steps t4842, heal t4843 (Q:100902–100938); Q t4944–4945; Q t5065. Those casts restore
  nothing. **Retaliation is the standard mode at speed 4**: a hit healer turns at the splat and first
  swings at splat + 2 (6/6: Q t4801→4803 Q:100028–100074, t5014→5016, t5131→5133 ×2, P t9831→9833,
  R t403→405); a splashed one turns at cast + 1 and swings at cast + 3 (P t9819 healer 62227, graphic
  85 and no splat, P:177631–177679). Wave 69's six engagements are all splashes; each turns at cast + 1
  and swings on arrival (W69 t881→882, t886; tbow t302→303), so nothing there contradicts it.
- **Tile occupancy** — Yt-HurKot sometimes step onto a tile another healer stands on (11 times in P,
  Q and both wave-69 runs, e.g. P t9831, Q t4842, W69 t914). Every case follows entity collision
  flags: each tile has one blocked flag, an entity entering sets it, and any entity leaving clears it
  even when another still stands there. NPCs move in index order, before the player, and a player
  run clears its middle tile too. Here the player's run passes over the occupied healer, or one of
  two stacked healers leaves. Over 5,324 Inferno combat-NPC steps (P, Q and both wave-69 runs; not
  nibblers, Zuk or his shield), the flags leave no step into a blocked tile once the split order and
  the hidden add-tick steps below are applied; counting occupants has 34. Players do block ordinary NPC steps: only one of 6411 P+Q steps enters the player's tile, by a
  nibbler. The sim models the flags (`npcOccupancy.ts`).
  - The game turns NPCs in **index order**, which the printed add order need not follow: P t9814
    prints 62229 before 62227, and at t9843 62229 enters the tile 62227 has just left.
  - **Split children:** 10 steps that look like exceptions (9 Jal-Ak melee children stepping onto a
    sibling soon after a split, e.g. P t613–614, and a bat beside one, Q t2646–2647, moving between the
    parent's removal and its children's steps) all fit once the children are added before the parent
    leaves (its removal clears their birth tiles) and take their hidden first step in the add tick.
    P t774 fits too: Xil's add-tick step re-flags its tile, keeping Ket out until t784. Sibling stacks
    P t849 and Q t2993 follow the same order.
  - **NPCs added mid-band take a turn that tick.** The add packet's coordinate for a split child or a
    revived NPC is its end-of-tick tile, after an ordinary first step; wave spawns, added after the NPC
    turns, first move next tick.
  - **Open, R t402:** two ticks after a player run cleared a healer's tile (R t400), the healer behind
    it still does not step in. Every other stack fits the flags.

### Audio

Sound IDs, delays and positions per NPC and for the pillar collapse:
[sound-ID audit §6](../architecture/audio-sound-ids.md#6-inferno-waves-168).

## Wiki stats (for formula inputs)

| NPC | Lvl | HP | Atk | Str | Def | Mag | Rng | Max | Speed | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| [Jal-Nib](https://oldschool.runescape.wiki/w/Jal-Nib) | 32 | 10 | 1 | 1 | 15 | 15 | 1 | 4 crush | 4 | always hits player |
| [Jal-MejRah](https://oldschool.runescape.wiki/w/Jal-MejRah) | 85 | 25 | 0 | 0 | 55 | 120 | 120 | 19 ranged | 3 | range 4 |
| [Jal-Ak](https://oldschool.runescape.wiki/w/Jal-Ak) | 165 | 40 | 160 | 160 | 95 | 160 | 160 | 29 | 6 | |
| [Jal-AkRek-Mej](https://oldschool.runescape.wiki/w/Jal-AkRek-Mej) | 70 | 15 | 1 | 1 | 95 | 120 | 1 | 18 magic | 4 | range 15 |
| [Jal-AkRek-Xil](https://oldschool.runescape.wiki/w/Jal-AkRek-Xil) | 70 | 15 | 1 | 1 | 95 | 1 | 120 | 18 ranged | 4 | range 15 |
| [Jal-AkRek-Ket](https://oldschool.runescape.wiki/w/Jal-AkRek-Ket) | 70 | 15 | 120 | 120 | 95 | 1 | 1 | 18 crush | 4 | |
| [Jal-ImKot](https://oldschool.runescape.wiki/w/Jal-ImKot) | 240 | 75 | 210 | 290 | 120 | 120 | 220 | 49 slash | 4 | |
| [Jal-Xil](https://oldschool.runescape.wiki/w/Jal-Xil) | 370 | 125 | 140 | 180 | 60 | 90 | 250 | 46 rng / 19 melee | 4 | |
| [Jal-Zek](https://oldschool.runescape.wiki/w/Jal-Zek) | 490 | 220 | 370 | 510 | 260 | 300 | 510 | 70 mag / 52 melee | 4 | |
| [JalTok-Jad](https://oldschool.runescape.wiki/w/JalTok-Jad) | 900 | 350 | 750 | 1020 | 480 | 510 | 1020 | 113 | 8 / 9 (w68) | |
| [Yt-HurKot](https://oldschool.runescape.wiki/w/Yt-HurKot) | 141 | 90 | 165 | 125 | 100 | 150 | 150 | 18 melee | 4 | Inferno variant; levels from `src/data/osrs/monsters.json` (7701/7705) |

Attack/defence bonuses: use the repo's `src/data/osrs/monsters.json` entries for these IDs where
present; otherwise the linked infoboxes.

## Not established by evidence

See [`inferno-policy.md`](./inferno-policy.md) for the simulator's choice on each: spawn-slot and
nibbler-tile RNG; blob style with no/melee protection and blob melee odds; bat run/stat drain; the
exact meleer dig-block window (captured 18–23 ticks after a swing) and post-dig offset (5 or 6);
resurrection chance, eligibility, corpse and tile draws and the once-only limit; the exact revived
attack gate; nibbler pillar choice and no-pillar behavior; collapse damage beyond nibblers; Jad
healer placement; 68→69 transition.
