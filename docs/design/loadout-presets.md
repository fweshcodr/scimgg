# Loadout presets

Rules for the encounter loadout presets in [`src/data/playerPresets.ts`](../../src/data/playerPresets.ts)
(`EQUIPMENT_PRESETS`). A preset should load exactly what a real player of that account type
brings into the fight, ready to play: the gear for the fight's main style worn, and every switch
sitting where a player would keep it. Follow every rule below when adding or changing a preset.

## Which presets exist

- **Source every setup.** Build presets from the encounter's OSRS Wiki strategy page (its gear
  tables, inventory images and notes). Cite the page and the tab or row beside each preset. Do not
  invent setups.
- **One preset per distinct, common account type.** A tier earns a preset only when its gear
  differs meaningfully (a different main weapon or armour set). Setups a few items apart do not:
  players can edit those themselves.
- **Only what the simulator covers.** A preset exists only if it helps in the fight the simulator
  actually has. For example, the Colosseum simulator only has Sol Heredit, so setups that exist
  for the earlier waves (twisted-bow-primary, GM-time speed setups) are not separate presets.
- **Name presets by tier and main weapon**, e.g. `Max (Scythe)`, `Budget (Tentacle)`,
  `Ironman (Zombie Axe)`. Keep the shared `naked` fallback last.

### Community replicas

A preset may instead copy a community player's published setup: a screenshot whose source and date
are cited beside the preset (the Inferno `S65 Ancients` and `First cape: Tbow` sets copy one player's).
A replica is placed after the wiki sets and keeps the screenshot as shown: the worn gear, every
inventory slot in its row-major order, and the rune pouch. It is therefore exempt from the
**Inventory layout** rules below. Every other rule still applies. Where a shown item is not
supported, put the nearest supported equivalent in the same slot and say so in a comment. Check
the worn items against the screenshot's equipment-bonus totals.

## What goes in a preset

- **Wear the main style for the fight.** If the fight is melee (Sol Heredit), the melee weapon and
  armour are worn when the preset loads.
- **Carry the whole run inventory.** Include every switch and supply the tier actually brings (the
  wiki's full inventory for that setup), not a trimmed subset. Gear moved off the body to make
  room for the worn style goes into the inventory.
- **Every item must work in the simulator.** It must resolve in the item catalog, and a weapon
  must pass weapon verification (`describeWeaponVerificationGaps` in
  [`equipmentSupport.ts`](../../src/data/equipmentSupport.ts)); an unsupported weapon attacks as if
  unarmed. If an item is not supported, use the wiki's next listed alternative for that slot and
  say so in a comment.
- **Supplies must match the weapons.** Set `supplies` to match what is carried: equipped and
  quiver ammo for bows, darts loaded in a blowpipe, rune pouch runes, and the spellbook those runes
  are for (for example Death Charge runes on Arceuus).
- **Requirements must fit the tier.** Every item's skill requirements must be at most 99, and
  realistic for the account the preset represents.

## Inventory layout

The inventory is 4 columns by 7 rows; slot 1 is top-left, slot 28 bottom-right.

- **Swaps return in place.** Equipping an item puts the item it replaces into the slot that was
  clicked. Keep each style's pieces together so swapping back is the same clicks again.
- **Switch clusters at the top.** The style switched to most often goes first, top-left, in rows
  1-2. A style switch is usually at most 8 items, so it fits two rows.
- **Zig-zag click order.** A cluster is clicked down a column and across: slot 1, the slot below it
  (5), then slot 2, the slot below that (6), then 3, 7, 4, 8. The cluster is the main weapon first,
  then the armour and jewellery in order of how much they add (biggest gain first).
- **Off-weapons outside the zig-zag.** Other weapons for the same style used only in special cases
  (a Venator bow beside a twisted bow, a blowpipe beside a Bow of Faerdhinen) and one-way switches
  for another style (Eye of Ayak, trident) go in the spots left after the zig-zag, normally column 4,
  not inside it.
- **Leave the dropped off-hand's slot at the end of the zig-zag.** Equipping a two-handed weapon while
  an off-hand is worn (a defender, a book, any shield-slot item of the style being left) puts the
  off-hand in the first free inventory slot. When a switch does that (a Bow of Faerdhinen from
  tentacle and defender, for example), leave exactly one free slot, and make it the next zig-zag stop
  after that cluster's last piece, with no free slot before it. The off-hand then drops there, and
  swapping back clicks the returned pieces in the same zig-zag and ends on the off-hand. Off-weapons
  and specials move past it.
- **Jewellery and other single swaps** sit next to the style they belong to (e.g. an amulet of
  blood fury swap next to the melee specials).
- **Special-attack weapons** go in the row after the switch clusters.
- **Utility items go bottom-right.** Rune pouches, a saturated heart and similar always-carried
  utilities fill the bottom-right corner, slot 28 first, then 27.
- **Supplies fill the rest**, kept in a consistent pattern: boost potions first, then brews and
  restores, each type in its own two-column block: brews in columns 1-2 and restores in columns
  3-4, so a full row reads brew, brew, restore, restore. Never alternate them slot by slot. Where
  the counts or the boosts leave a partial row, keep each type to its own side as far as it goes
  (spare restores start the restore columns a row early; a last odd brew and restore share a row).
- If the inventory runs past 28, drop supplies first, never a switch.

## Ironman presets

- **Only items an ironman can get at that tier.** Check how each item is obtained, not only
  whether it is tradeable. Respect skill requirements (an amulet of torture needs 98 Crafting for
  its zenyte amulet, so it does not belong in a mid-game ironman preset).
- **Keep the tier consistent.** A preset built around a mid-game weapon (zombie axe, used before 85
  Slayer gives an abyssal whip) should not carry late-game gear.
- **Prefer the wiki's ironman notes.** For example the Colosseum strategy page calls the trident of
  the swamp the magic switch "easiest to obtain for Ironmen" and says irons are "limited on blood
  shards".
- Ironman presets follow the same layout rules as every other preset.

## Tests

Each encounter with presets has a test (for Sol, `src/data/__tests__/solHereditPlayerPresets.test.ts`)
that checks:

- every item and supply resolves in the catalog;
- the inventory fits in 28 slots;
- the main weapon is worn;
- each threat in the fight has an answer in the inventory;
- the layout rules above, such as utilities in the bottom-right (for wiki sets; community replicas
  are pinned to their screenshot instead).

`src/types/__tests__/playerPresets.test.ts` counts the real presets across all encounters; update
it when presets are added or removed.
