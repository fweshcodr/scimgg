# Chinchompa combat

Grey (10033), red (10034) and black (11959) chinchompas, implemented in
`src/core/combat/player/chinchompa.ts` and `PlayerAutoAttackSystem.ts`. Each rule below is marked
as **cited**, **captured**, **inferred**, **simulator policy** or **simulator choice**; unverified and
unmodeled details say so.

Sources:

- [Chinchompa](https://oldschool.runescape.wiki/w/Chinchompa) (grey and shared mechanics, with its
  cited Mod Ash replies: [2018-05-06](https://twitter.com/JagexAsh/status/993196171677126661),
  [2021-09-01](https://twitter.com/JagexAsh/status/1433094187797340166), 2025-05-07)
- [Black chinchompa](https://oldschool.runescape.wiki/w/Black_chinchompa) (its own target cap,
  and Mod Ash 2024-07-29 on heavy defence)
- [Red chinchompa](https://oldschool.runescape.wiki/w/Red_chinchompa) (stats)
- capture `inferno-waves-(35ish)-to-68-packet-data.txt:4665-4686, 4806-4822` (black throws)

## Rules

| Rule | Status | Implementation |
|---|---|---|
| Stats: grey +45 ranged attack / +0 strength, red +70/+15, black +80/+30; one-handed and stackable | Cited (item articles' combat stats) | Cache data |
| Short fuse (Accurate, +3 invisible Ranged, 4 ticks), Medium fuse (Rapid, 3 ticks), Long fuse (Longrange, 4 ticks); range 9, or 10 on Long fuse; Heavy attack type | Cited | `attackStyles.ts`, `weaponCombatData.ts` |
| The primary target's defence roll uses **heavy** ranged defence | Cited, but the source hedges ("I believe those are 'heavy'") | `weaponCombatData.ts` |
| Distance accuracy, measured to the target's tile **closest to the player**: Short 100/75/50 %, Medium 75/100/75 %, Long 50/75/100 % at 0-3 / 4-6 / 7+ tiles | Cited | `FUSE_ACCURACY_PERCENT` |
| The modifier applies to the accuracy/defence roll when the attack is cast, like armour bonuses | Cited (Mod Ash 2018-05-06) | One attack-roll stage |
| The modifier stage floors, `floor(roll * percent / 100)`, like every other stage; its place among the other stages is ours | Simulator choice: no source states the rounding or the order | `chinchompaFuseAccuracy` |
| 3x3 blast; PvM cap 11 targets (grey, red) or 12 (black), the primary included | Cited (PvP caps of 9 and 10 do not apply here) | `CHINCHOMPA_AREAS` |
| Blast centered on the primary's south-west true tile, as Burst/Barrage ([spell-area-targeting.md](./spell-area-targeting.md)) | Simulator policy: the sources do not say how the area is anchored on large NPCs | `spellAreaTargets.ts` |
| The primary's accuracy roll decides for every target: a miss misses all, a hit hits all | Cited (wiki and Mod Ash, 2025-05-07) | `sharedAccuracy` |
| Damage rolls independently per target, up to the primary's max hit with Salve and Avarice boosts removed | Cited | The simulator models neither boost, so secondaries use the primary's max hit as is. If either boost is added, it must stay off the secondaries. |
| The blast only fans out in multi-way combat; otherwise only the primary is hit | Simulator policy, matching Burst/Barrage. The wiki does not state single-way behavior. | `multiCombat === false` check |
| Splashed NPCs do not newly aggro; XP is one combined drop | Simulator policy, matching Burst/Barrage; not stated by the sources | Shared secondary-hit path |
| Black throw: animation 7618, projectile 1272 starting at cycle 21 and ending at cycle 52 (4 tiles) or 77 (9 tiles), impact spotanim 157; at 4 tiles the hitsplats land 2 ticks after release | Captured (two throws, at 4 and 9 tiles; no hitsplat seen for the 9-tile throw) | `chinchompaVisuals`, projectile profile |
| Projectile end `32 + 5 × distance` cycles at every distance, and the hit `1 + floor((32 + 5 × distance) / 30)` ticks after release | Inferred: the two captured throws fit it, and the tick conversion is the simulator's projectile timing rule | Projectile profile |
| Grey/red projectiles 908/909 | Unverified (RuneLite gameval names; never captured) | `equipmentVerification.ts` |
| Throw and explosion sounds | Not modeled; the generic ranged sound plays | `equipmentVerification.ts` |
| Ammo | Infinite, as for all simulator ammunition | — |
