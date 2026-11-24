# Equipment combat families

## Contract

`src/data/equipmentCombatFamilies.ts` owns explicitly evidenced cosmetic combat
identity, not item support. `EQUIPMENT_COMBAT_FAMILIES` is a readonly array of
`{ readonly baseId: number; readonly variantIds: readonly number[] }` rows.
`getEquipmentCombatBaseId(itemId)` returns the direct same-state base, or the input
unchanged. `getEquipmentCombatVariantIds(baseId)` returns only that base's direct
variants, **not the base itself**; unknown IDs and variant IDs return `[]`.
Bases are unique and cannot themselves be variants. There is no alias chaining.

The owner has no imports, catalog parsing, generated-alias dependency, capability
table, or presentation implementation. Consumers retain the original item ID in
equipment/inventory/state/models and read **actual cache stats by that raw ID**.
Combat-rule lookup may use the family base; presentation may try raw-ID data first
and then the base. Neither route makes an unsupported base supported.
`isVerifiedEquipmentPiece` remains the capability owner (its nonweapon answer is
currently always true, not proof that a broken item can be worn in OSRS).

This identity is not universal item interchangeability. Keep raw-ID death rules,
tradeability, unlocks, and god affiliation: notably the [holy rapier][holy-rapier],
[holy staff][holy-staff] and [holy scythe][holy-scythe] gain Saradomin affiliation. No identity lookup
recharges, repairs, imbues, corrupts, unlocks, or upgrades an item.

## Classification disposition

The ledger below records the disposition and state boundaries of each kit family
and explicitly sourced recolor; the exported rows, not a second numeric manifest,
are the exact ID inventory. Deferred candidates are listed after it.

| Candidate families | Disposition and state boundary | Evidence |
| --- | --- | --- |
| Rune scimitar god kits; rune/dragon defender trim; dragon full helm, chainbody, platebody, platelegs, plateskirt, boots, square shield, kiteshield; dragon scimitar; four godswords; Tzhaar-ket-om | Map each kit to its own item, not another item with equal stats. Defender locks have separate rows. | [Ornament kit, Treasure Trails][kits] |
| Fury, torture, anguish, occult, berserker necklace, tormented bracelet; light/dark infinity hat/top/bottoms | Map each jewellery item / armour slot independently. Blood fury and other upgrades are not ornaments. | [Treasure Trails][kits] |
| Twisted ancestral; sanguine Torva; radiant Oathplate; silver amulet of rancour | Map three slots separately; rancour (s) `29804 -> 29801`. Torva targets **restored** `26382/26384/26386`, never damaged `26376/26378/26380`. | [PvM kits][kits]; [Torva full helm][torva]; [Amulet of rancour (s)](https://oldschool.runescape.wiki/w/Amulet_of_rancour_(s)) |
| Holy rapier; holy Sanguinesti; holy/sanguine scythes | Rapier `25734 -> 22324`; staff charged/uncharged `25731/25733 -> 22323/22481`; scythes charged `25736/25739 -> 22325`, uncharged `25738/25741 -> 22486`. | [Holy staff][holy-staff], [holy scythe][holy-scythe], [sanguine scythe][sanguine-scythe]; [PvM kits][kits] |
| Fang; Elidinis' ward; Masori assembler, assembler max cape and hood | Ward `27253 -> 27251` is **fortified**, not `25985`. Normal, locked, broken assemblers map only to the matching state; max cape/hood do not collapse into ordinary assembler. | [Ward (or)][ward]; [assembler][assembler], [max cape][max-cape]; [PvM kits][kits] |
| Dragon hunter crossbow black/turquoise | Map to `21012`; classification does not add crossbow support. | [PvM kits][kits] |
| Corrupted Bowfa clan colors and Deadman reward; corrupted Blade of Saeldor colors | Bowfa `25884/86/88/90/92/94/96` and `33021 -> 25867`, **never `25865`**. Saeldor `25870/72/74/76/78/80/82 -> 24551`, never charged `23995` or inactive `23997`. | [Corrupted Bowfa][bowfa]; [Elven crystals / Deadman reward kits][kits]; RuneLite `BOW_OF_FAERDHINEN_INFINITE_TRAHAEARN = 25888` |
| Crystal helm/body/legs clan colors and Deadman rewards; crystal crown colors | Six armour groups preserve active/inactive states; crown is its own family. No beta, Gauntlet or battle-royale copies. | [Crystal helm][crystal]; [Elven crystals / Deadman rewards][kits] |
| Dragon pickaxe upgraded/Zalcano/Trailblazer/Reloaded; steam/lava battle and mystic staffs; odium/malediction wards; dark bow paints; volcanic/frozen whip; granite clamps | Map cosmetics only. Mystic and battle staffs remain different; clamp `12848 -> 4153` and ornate-handle clamp `24227 -> 24225` remain different. | [Last Man Standing kits][kits]; [Zalcano pickaxe][pickaxe] |
| Trailblazer and Reloaded dragon/infernal tools | Axe, harpoon and pickaxe are separate; infernal charged/uncharged states are separate. `13243` is **infernal pickaxe**, not dragon pickaxe. Echo tools are not these ornaments. | [Leagues kits][kits]; [infernal pickaxe (or)][infernal] |
| Shattered Relics void/elite void, whip/tentacle, rune crossbow, six god books, five mystic pieces | Void and elite pieces remain distinct; all eight locked ornaments target locked counterparts. Books target their complete same-god book, never a damaged book. | [Leagues kits][kits]; RuneLite `*_TROUVER` item constants |
| Blazing blowpipe and bulwark; Echo Virtus, venator bow, Ahrim's four pieces | Only the charged blowpipe has a row: empty blowpipes cannot be wielded and are not in the catalog. Venator uncharged/charged stay separate. Ahrim undamaged, 100, 75, 50 and 25 each have their own row, including the staff; broken (`0`) pieces cannot be worn and are not in the catalog. | [Leagues kits][kits]; [Echo hood][echo-hood], [top][echo-top], [skirt][echo-skirt], [staff][echo-staff] infoboxes |
| Demonic seas/swamp tridents, enhanced tridents, Iban's staffs and Soulreaper axe | Preserve enhanced, full, partially charged, uncharged, upgraded and broken states. Seas `33322 -> 11907`, `33323 -> 11905`, **`33434 -> 11908`** despite misleading grouped catalog metadata. | [Leagues kits][kits]; [seas trident (o)][trident] infobox |
| Elder chaos, elder maul, heavy ballista; bounty ornament dragon scimitar/claws/warhammer/armour; fighter torso and Neitiznot helm | Explicit kit IDs only. Torso `28069 -> 24175` stays locked. `(cr)` is allowed only for individually classified bounty cosmetics, never inferred from the suffix. Other unsupported dragon-weapon kits are deferred below. | [Bounty Hunter kits][kits] |
| Dragon claws/warhammer `(or)`; Armadyl helmet/chainskirt, Bandos tassets/boots, Dagon'hai `(or)` | Known **cache-only proposed** cosmetic items: classify identity without asserting availability or granting support. Armadyl chestplate `26715` and Bandos chestplate `26718` are absent from the current catalog, so not added. | [Claws][claws], [warhammer][warhammer], [Armadyl helmet][armadyl], [Bandos kit][bandos], [Dagon'hai kit][dagonhai] |
| Armageddon godsword/dark bow/Voidwaker/volatile staff and three imbued capes; Annihilation toxic staff | These are explicitly sourced main-game **reward cosmetics**, unlike mode-only copies. Toxic staff charged/uncharged are separate; godsword/dark bow share existing cosmetic groups directly. | [Deadman reward kits][kits] |
| All fourteen Slayer helmet cosmetics, including hooded, Oathplate and radiant | Four families: regular, Nightmare Zone imbue, Soul Wars imbue, Emir's Arena imbue. Radiant maps directly to the same-state plain Slayer helmet, not via Oathplate. | [Slayer helmet, Cosmetics][slayer] |
| Tanzanite/magma helms; all eleven Graceful recolors (including Trailblazer, Adventurer, Varlamore) | Only the charged helms have a row: uncharged serpentine, tanzanite and magma helms cannot be worn and are not in the catalog. Graceful has twelve groups: six slots, each with distinct inventory/worn forms. | [Tanzanite][tanzanite], [magma][magma], [Graceful recoloring][graceful]; RuneLite `*_WORN` constants |
| Mystic dark/light/dusk colors | Five same-slot groups also include the Shattered Relics ornaments; no arena copies. | Wiki dusk [hat][mystic-hat], [top][mystic-top], [bottom][mystic-bottom], [gloves][mystic-gloves], [boots][mystic-boots] explicitly state all colors share bonuses. |

### Deferred and excluded

| Candidates | Disposition |
| --- | --- |
| Unsupported dragon-weapon bounty kits: `28019/28021/28023/28025` dagger poison states, `28027` mace, `28029` sword, `28033` longsword, `28037` battleaxe, `28041/28043/28045/28047` spear poison states, `28049` halberd, `28051` 2h sword, `28053` crossbow | **15 deferred IDs**, self-resolving. Bases currently lack weapon capability. Before adding rows, preserve each poison state; do not infer mappings from `(cr)` or name stripping. Their kit status is covered by the [Bounty Hunter overview][kits]. |
| Other unsupported bases already classified above: rune scimitar, Tzhaar-ket-om, dragon hunter crossbow, corrupted Saeldor, dragon tools, infernal axe/harpoon, steam/lava staffs, granite mauls, heavy ballista, Dinh's bulwark, venator, Ahrim staff, Iban, volatile/toxic staff, Soulreaper; unsupported charge-state counterparts | **Identity classified, capability deferred.** An evidence-backed row does not turn these on. Bowfa corruption likewise cannot borrow degrading Bowfa's support by mapping to `25865`. Check the live support gate, not a frozen supported-item count; presentation coverage can change independently. |
| `(bh)` upgrades (e.g. dark bow `27853`), Gauntlet/corrupted training weapons (e.g. `29599`), LMS/arena/beta/battle-royale copies (e.g. `20593`, `27187`, `25495`, `33166/33168/33170`) | Self-resolving; neither identical names nor generated aliases establish the same playable combat state. No blanket Deadman, beta, bh, cr, ritual, nz or l stripping. |
| Retro Torva `30302/30303/30304` | Self-resolving, never restored Torva. They have no equip op, so they are not in the catalog. |
| Ghommal's avernic defenders `27550/27551/27552/27553` | Self-resolving: [the attached hilt retains its benefits][ghommal], so this is not an ordinary cosmetic equivalence assertion. |
| Echo tools, Echo boots, enhanced/corrupted/charged forms, ordinary versus elite void, blood fury, Neitiznot faceguard, fortified ward, holy water/book/sandals/moleys, offensive blackjacks `6408/6412/6418` | Distinct items or states, not renamed ornaments. Bases remain themselves; any listed cosmetic counterpart only joins that exact state. |
| Plain trimmed/gilded/heraldic Treasure Trail equipment, unrelated fashion/holiday recolors, max-cape conversions other than the Masori kit relationship | Outside the **ornament-kit plus explicitly evidenced recolor** scope; self-resolving. The included dragon `(g)` pieces and defender `(t)` are kits, not a blanket trim rule. |
| Cannon ornaments and kit items themselves | Not equippable catalog candidates; no family rows. |

## Evidence and extension rules

IDs were checked against the catalog and RuneLite
`runelite-api/src/main/java/net/runelite/api/{ItemID.java,gameval/ItemID.java}`
(BSD-2-Clause). Wiki article text/infoboxes establish the transformation
and state boundaries. Generated `itemAliases.json` is discovery metadata only.
No row claims cache-stat equality or variant-specific animation/projectile/sound
behavior; consumers must retain raw stats and may use the base-presentation
fallback (simulator policy) without new captures.

For a future extension: cite an allowed article/infobox or local source, identify
the exact state-specific base, check catalog IDs and raw cache equipment stats,
then add one explicit row or extend its direct variant list. Add a positive
regression and the nearest different-state exclusion. Never add a name heuristic,
runtime source strings, a second capability registry, or a base-to-base link.
Preserve relevant charge, degradation, poison, imbue, lock and upgrade state even
when the numeric stat lines happen to match. New capability belongs to its
existing owner and must be verified separately. Keep unresolved items self-resolving.

[kits]: https://oldschool.runescape.wiki/w/Ornament_kit
[torva]: https://oldschool.runescape.wiki/w/Torva_full_helm
[holy-staff]: https://oldschool.runescape.wiki/w/Holy_sanguinesti_staff
[holy-rapier]: https://oldschool.runescape.wiki/w/Holy_ghrazi_rapier
[holy-scythe]: https://oldschool.runescape.wiki/w/Holy_scythe_of_vitur
[sanguine-scythe]: https://oldschool.runescape.wiki/w/Sanguine_scythe_of_vitur
[ward]: https://oldschool.runescape.wiki/w/Elidinis%27_ward_(or)
[assembler]: https://oldschool.runescape.wiki/w/Masori_assembler
[max-cape]: https://oldschool.runescape.wiki/w/Masori_assembler_max_cape
[bowfa]: https://oldschool.runescape.wiki/w/Bow_of_Faerdhinen_(c)
[crystal]: https://oldschool.runescape.wiki/w/Crystal_helm
[infernal]: https://oldschool.runescape.wiki/w/Infernal_pickaxe_(or)
[pickaxe]: https://oldschool.runescape.wiki/w/Dragon_pickaxe_(or)
[echo-hood]: https://oldschool.runescape.wiki/w/Echo_ahrim%27s_hood
[echo-top]: https://oldschool.runescape.wiki/w/Echo_ahrim%27s_robetop
[echo-skirt]: https://oldschool.runescape.wiki/w/Echo_ahrim%27s_robeskirt
[echo-staff]: https://oldschool.runescape.wiki/w/Echo_ahrim%27s_staff
[trident]: https://oldschool.runescape.wiki/w/Trident_of_the_Seas_(o)
[claws]: https://oldschool.runescape.wiki/w/Dragon_claws_(or)
[warhammer]: https://oldschool.runescape.wiki/w/Dragon_warhammer_(or)
[armadyl]: https://oldschool.runescape.wiki/w/Armadyl_helmet_(or)
[bandos]: https://oldschool.runescape.wiki/w/Bandos_armour_ornament_kit
[dagonhai]: https://oldschool.runescape.wiki/w/Dagon%27hai_robes_ornament_kit
[slayer]: https://oldschool.runescape.wiki/w/Slayer_helmet#Cosmetics
[tanzanite]: https://oldschool.runescape.wiki/w/Tanzanite_helm
[magma]: https://oldschool.runescape.wiki/w/Magma_helm
[graceful]: https://oldschool.runescape.wiki/w/Graceful_outfit#Recolouring
[ghommal]: https://oldschool.runescape.wiki/w/Ghommal%27s_avernic_defender_5
[mystic-hat]: https://oldschool.runescape.wiki/w/Mystic_hat_(dusk)
[mystic-top]: https://oldschool.runescape.wiki/w/Mystic_robe_top_(dusk)
[mystic-bottom]: https://oldschool.runescape.wiki/w/Mystic_robe_bottom_(dusk)
[mystic-gloves]: https://oldschool.runescape.wiki/w/Mystic_gloves_(dusk)
[mystic-boots]: https://oldschool.runescape.wiki/w/Mystic_boots_(dusk)
