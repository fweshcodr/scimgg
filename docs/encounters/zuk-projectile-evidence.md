# Zuk Projectile Capture Evidence

Packet counts for the Zuk fight's projectile and graphic IDs, measured from three private gameplay
recordings. They are recording observations, not encounter rules. The endtime fits
they support are tested in the "raw Inferno endtime conformance" suite of
[`projectileProfiles.test.ts`](../../src/npcs/inferno/__tests__/projectileProfiles.test.ts).

Inputs 1, 2 and 3 are, in order:

1. capture `inferno-waves-69-zuk-packet-data.txt`
2. capture `inferno-waves-1-68-packet-data.txt`
3. capture `zuk-atlatl-dragon-hunter-wand-packet-data.txt`

## Conventions

- Scope: IDs `1375, 1376, 1377, 448, 449, 450, 660, 659, 451, 131, 157, 444` in projectile,
  `map_anim` (ground) and `spotanim` (actor) records.
- Streams: each explicit `Stream` header begins a new stream, even when its numeric label repeats.
  Tick boundaries are the first and last tick headers in stream order; the count is of tick headers.
- Every in-scope record is counted, identical duplicates included. Counts group by graphic ID and
  packet kind.
- Values are raw packet units, not converted to game ticks. An absent height, delay or other optional
  numeric field is recorded as absent, never as zero.
- A projectile's endpoints are its own coordinates, not the nested actor coordinates. A target with
  neither an `npc=` nor a `player=` marker is a tile target.

## Observed Counts

| Graphic / packet kind | Input 1, stream 1 | Input 2, stream 1 | Input 2, stream 2 | Input 3, stream 1 |
| --- | ---: | ---: | ---: | ---: |
| Tick boundaries | 0-1322 | 443-10059 | 0-1021 | 683-820 |
| Tick header count | 1323 | 9617 | 1022 | 138 |
| 1375 / projectile | 135 | 0 | 0 | 0 |
| 1376 / projectile | 105 | 663 | 0 | 0 |
| 1377 / projectile | 120 | 1006 | 0 | 0 |
| 448 / projectile | 7 | 21 | 99 | 3 |
| 449 / projectile | 7 | 21 | 99 | 3 |
| 450 / projectile | 7 | 21 | 99 | 3 |
| 660 / projectile | 283 | 0 | 0 | 0 |
| 659 / ground | 270 | 0 | 0 | 0 |
| 451 / ground | 16 | 23 | 87 | 11 |
| 131 / actor | 106 | 663 | 0 | 0 |
| 157 / actor | 23 | 44 | 186 | 14 |
| 444 / actor | 8 | 7 | 10 | 0 |
| 444 / ground | 0 | 20 | 0 | 0 |

All four streams are individually contiguous. For input 1, ID 660 has 13 NPC targets and 270 tile
targets; ID 1375 has 134 NPC targets and one player target. Ground ID 659 has no printed height in
all 270 entries and no printed delay in 41 entries. Neither absence is evidence of a zero value.
