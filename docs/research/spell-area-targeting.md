# Burst and Barrage area targeting

Sources:

- [Burst spells](https://oldschool.runescape.wiki/w/Burst_spells)
- [Barrage spells](https://oldschool.runescape.wiki/w/Barrage_spells)
- [Ice Barrage](https://oldschool.runescape.wiki/w/Ice_Barrage)
- [Multicombat area](https://oldschool.runescape.wiki/w/Multicombat_area)

## Casts with area damage

The eight multi-target casts are Smoke, Shadow, Blood and Ice Burst plus Smoke, Shadow, Blood and
Ice Barrage. Rush, Blitz, Standard, Arceuus and other currently castable spells remain
single-target.

Burst and Barrage hit at most nine actors total: the selected primary plus up to eight secondary
targets. Accuracy and damage are rolled independently for every actor. The cast still has one
player cooldown, launch event, animation and resource eligibility check.

## True-tile geometry

The affected area is the 3×3 square centered on the selected primary actor's true tile. In this
simulator `NpcActor.position` is that south-west true tile.

Actor size does not move the center and footprint overlap does not qualify a secondary target:

- A 3×3 primary at `[10,10]` still produces only `x=9..11`, `y=9..11`.
- A secondary whose true tile is `[11,11]` qualifies regardless of its own size.
- A secondary at `[12,10]` does not qualify even when either actor's visible footprint reaches
  into the affected square.

This is the large-NPC case called out by the wiki: actors directly north or east can look adjacent
while their true tiles remain outside the spell's area.

## Combat integration

All qualifying actors are snapshotted and rolled before the selected primary is committed.
Secondary hits use the same CombatSystem damage path, including delayed hits, encounter callbacks,
hitsplats, defeat handling, launch-time multipliers and target-specific validation. They do not
emit another player launch or schedule another cooldown.

An encounter may set `EncounterEngineRules.multiCombat` to `false` to suppress fan-out. The current
combat encounters use the engine's default multiway behavior.

If more than eight secondaries occupy qualifying true tiles, deterministic world actor order
selects the first eight. The available client and wiki evidence does not establish the server's
over-cap actor-priority rule.

Spell-specific status effects such as freezing, poisoning, stat drain and blood healing are not
part of the current damage-only spell catalog and are not inferred by this targeting model.
