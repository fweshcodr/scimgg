# Zulrah — open questions

Every implemented Zulrah behavior that the [facts spec](./zulrah-facts-spec.md) does **not**
establish, with the simulator's current choice and the evidence that would settle it. There are no
Zulrah captures; the permitted way to settle these is **frame-stepped gameplay video** against the
0.6 s tick (see `CONTRIBUTING.md`, Gathering new evidence), extracted into fixtures beside the tests.

Labels: **POLICY** = a deliberate simulator choice where no source decides; **INFERENCE** = derived
from a source but not stated by it; **UNVERIFIED** = no source at all.

Paths are rooted at `src/`: **N/** = `npcs/zulrah/`, **E/** = `encounters/zulrah/`.

## Timing

| Question | Current choice | Label | What would settle it |
|---|---|---|---|
| Time underwater between forms (dive start to resurface) | Dive 2 (SINKFAST's length), underwater 2, emerge 2 (EMERGEFAST's length), then a 3-tick pause before the first turn (`ZULRAH_SURFACE_PAUSE_TICKS`, reported from play); `E/rotation.ts`. Timing is built from these fixed pieces and 3 ticks per turn, not fitted to the wiki's approximate "about three minutes" | POLICY | Video: ticks from the dive animation starting to the next form appearing, and to its first attack |
| Opening: ticks from Zulrah appearing to its first cloud barrage | Zulrah waits underwater for the player's first action (move, target or prayer; WIKI), rises over 4 ticks (SNAKEBOSS_SPAWN), then waits 12 more before its first barrage (`ZULRAH_OPENING_PAUSE_TICKS`) | POLICY (12 is the user's pick from play) | Video: the player's first action to Zulrah appearing, and to its first spit |
| Ticks from surfacing to the first attack | First turn on the tick the emerge ends | UNVERIFIED | Same recording |
| Cloud barrage and snakeling turns: speed | One per 3 ticks, like attacks | POLICY | Video of a cloud-only phase (rotation 1 phase 1: 4 barrages) |
| Tail: stare length and slam tick | Slam lands 6 ticks after the stare starts; next stare 3 ticks after; `N/constants.ts` `ZULRAH_TAIL` | UNVERIFIED ("several seconds") | Video: tail animation start to the damage hitsplat, and slam to the next stare |
| Stun length | 5 ticks; `ZULRAH_TAIL.stunTicks` | UNVERIFIED ("several seconds") | Video: hitsplat to the player's first move after a tail hit |

## Tail

| Question | Current choice | Label | What would settle it |
|---|---|---|---|
| Tiles the tail hits | 3x3 around the locked tile; `isInTailArea` | INFERENCE from "moving two tiles away" | Video: a player one tile off the target (hit or not?), standing on each side |
| Which tile is locked, and when | The player's tile when the stare starts | INFERENCE ("stare at the player's position") | Video: move during the stare, see where the tail lands |
| TAIL_LEFT vs TAIL_RIGHT | Alternates, left first | POLICY | Video: which animation plays for targets on each side of Zulrah |
| What the stun blocks | Moving and attacking only (the engine's `playerStunned`); prayer, food, potions and gear still work | INFERENCE from WSt ("attacking and moving"); not stated for Zulrah | Video: pray, eat and switch gear while stunned by the tail |
| Stun visuals | Spotanim 80 STUNNED (generic circling birds) on the player; no player animation (the engine has no player-animation event; 848 HUMAN_STUNNED exists) | UNVERIFIED | Video of a tail hit |
| Facing before the first hit | South (angle 0) with no combat target until the player first damages Zulrah, then tracks the player across forms | OBSERVATION reported from play, not yet recorded | Video: Zulrah's facing before and after the first hit |
| Facing during the stare | Zulrah holds its bearing on the locked tile from stare to slam, then tracks the player again | INFERENCE ("stare at the player's position") | Video: walk away during a stare |
| Does the tail envenom? | No | INFERENCE (the venom sentence names only ranged and magic) | Video: a tail hit on an un-envenomed player |

## Clouds

| Question | Current choice | Label | What would settle it |
|---|---|---|---|
| Clouds per barrage | 2; `N/constants.ts` `ZULRAH_CLOUD.perBarrage` | POLICY (spotanim 1045 is named DOUBLE_ORB, which would suggest 2 if it is the cloud orb) | Video: orbs per barrage |
| Where clouds land | A phase of exactly 4 barrages (the opening, rotations 1-2's jad phase end, each rotation's last phase) fills 8 fixed sites in order, south base first and the arms last, leaving the arm tips clear; other barrages: first on the site nearest the player, then random. `E/clouds.ts` | INFERENCE for the fills ("fill the area with venom clouds, leaving the tips … clear"); POLICY for the order and other barrages | Video: cloud positions and order over several barrages, player at different tiles |
| Flight time, lifetime | 3 ticks; 30 ticks | UNVERIFIED | Video: orb launch to cloud, cloud appearance to disappearance |
| Damage per tick | 1–5 typeless, once a tick however many clouds overlap | UNVERIFIED ("varying damage per tick") | Video: hitsplats while standing in one cloud, and in two |
| Facing while spitting venom | Zulrah turns to each barrage's landing sites as it spits and holds that bearing until its next attack | OBSERVATION reported from play, not yet recorded | Video of a cloud phase |
| Which animation spits a barrage | 5069 (ACIDX1), as for attacks | UNVERIFIED (5068 ACIDX3 exists) | Video: compare a barrage's spit with a ranged attack |
| Orb launched as Zulrah dives | Not modelled (the cloud should appear only when Zulrah resurfaces) | WIKI-ONLY gap | — |

## Snakelings

| Question | Current choice | Label | What would settle it |
|---|---|---|---|
| Where orbs land | Random walkable tile 1–3 tiles from the player | POLICY | Video: orb landing tiles relative to the player |
| Style odds | 50/50 | POLICY | Count of melee vs magic snakelings over many orbs |
| Orb flight; first attack after landing | 3 ticks; 3 ticks | UNVERIFIED | Video |
| Magic range; melee or magic bolt timing | 7 tiles; bolt lands the next tick | UNVERIFIED | Video |
| Venom chance | 25% per attack (`SNAKELING_VENOM_CHANCE`), the venom weapons' base rate | POLICY | Many snakeling hits on an un-envenomed player |
| Lifetime | 67 ticks (40 s rounded up) | INFERENCE ("more than 40 seconds") | Video: spawn to die-off of an idle snakeling |
| Orb launched as Zulrah dives | Not modelled (spawns only after the resurface) | WIKI-ONLY gap | — |

## Attacks and rotation

| Question | Current choice | Label | What would settle it |
|---|---|---|---|
| Blue magic/ranged split | 75% magic; `E/ZulrahEncounter.ts` `TANZANITE_MAGIC_CHANCE` | POLICY ("much more frequently") | Count of blue attacks by style |
| Rotation odds | Equal | POLICY ("chosen at random") | Many fight starts |
| Out-of-pattern phases after the first rotation | Not modelled | WIKI-ONLY gap (no chance given) | — |
| Ranged and cloud projectile graphics | 1045 DOUBLE_ORB ranged, 1044 ORB clouds, 1046 FIREBALL magic | POLICY (gameval names do not say which) | Video: the projectile each attack shows |
| Projectile flight timing | Generic magic-spell timing for both styles | UNVERIFIED | Video: launch to hitsplat at several distances |
| Spot tiles | Middle (26,65), south (26,55), west (16,65), east (36,64) south-west tiles in 35_47's frame | INFERENCE from the island geometry | Video or RuneLite tile markers of Zulrah's footprint at each spot |
| Player start | (28,61) on the island base (a wiki tile marker) | INFERENCE | Video of the boat arrival |
| Accuracy | Rolled with the infobox stats | WIKI-ONLY | — |
| Snakeling 2047 SNAKEBOSS_MINION_DYING | Unused; death plays 2408 on 2045/2046 | UNVERIFIED | Video of a snakeling dying |

## Loadouts

| Question | Current choice | Label | What would settle it |
|---|---|---|---|
| Items the catalog lacks | Sharks and "Cheap food" → Anglerfish; Zul-andra teleport and house tablets → empty slots; Crystal halberd → Dragon halberd; Twinflame staff → Staff of the Dead (same wiki row) with Fire runes added to the Void hybrid pouch | POLICY (substitution) | Supporting those items in the simulator |
| Melee ring | Ring of suffering (ri) worn, Bellator ring carried (the loadout wears the Bellator ring and carries the suffering ring for snakelings) | POLICY (requested) | — |
| Blowpipe darts | Dragon darts | UNVERIFIED (the loadouts do not show them) | — |
