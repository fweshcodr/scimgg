# Crystal bow

Covers the active crystal bow (`ItemID.CRYSTAL_BOW = 23983`) and the fully charged new bow
(`ItemID.CRYSTAL_BOW_2500 = 24123`), from RuneLite `gameval/ItemID.java`. No packet capture
of it exists yet.

## Shot

Observed in game:

- Attack animation 426 (`AnimationID.HUMAN_BOW`), idle pose 808.
- Launch spotanim 250 (`SpotanimID.SP_ATTACK_GLOW_ARROW_LAUNCH`). It travels as 249
  (`SP_ATTACK_GLOW_ARROW_TRAVEL`), the projectile named in the generated visuals row for 23983.
- Sound 1352, the same sound the Bow of Faerdhinen plays. The Bowfa capture sends it with no
  delay on the launch tick (capture `blowpipe-spec-bowfa-attacks-packet-data.txt:75`), and
  the crystal bow uses that timing.

The generated launch profile is 163/146 heights, start delay 41, launch height 96. It matches the
captured Bowfa shot (`blowpipe-spec-bowfa-attacks-packet-data.txt:65-75`).

## Combat

From [/w/Crystal_bow](https://oldschool.runescape.wiki/w/Crystal_bow):

- Bonuses: +100 ranged attack, +78 ranged strength. In the simulator these come from the cache.
- Speed and range: 5 ticks (4 on Rapid), range 10, two-handed. It fires its own arrows and needs
  no ammunition.
- Requirements: 70 Ranged (also 50 Agility and Roving Elves, which the simulator does not model).

Hit delay follows the bow formula `1 + floor((3 + distance) / 6)`
([/w/Hit_delay](https://oldschool.runescape.wiki/w/Hit_delay) § Bows and crossbows).

The crystal armour bonus applies to both the crystal bow and the Bow of Faerdhinen
([/w/Crystal_equipment](https://oldschool.runescape.wiki/w/Crystal_equipment) § Crystal armour):

| Piece | Accuracy | Damage |
|---|---|---|
| Helm | +5% | +2.5% |
| Body | +15% | +7.5% |
| Legs | +10% | +5% |

The full set gives +30% accuracy and +15% damage. A Slayer helmet (i) multiplies the crystal damage
bonus instead of adding to it.
