# Zulrah (prototype)

Status: work in progress. There are no captures behind it: its facts come from the OSRS Wiki, the
cache and RuneLite's gameval names, and everything else is a recorded open question (see Evidence).

## What it does

- All four rotations from [Zulrah/Strategies](https://oldschool.runescape.wiki/w/Zulrah/Strategies).
  The fight opens on serpentine in the middle, which all four share, and the rotation is drawn when
  that phase ends. Each rotation's last phase counts as the next one's first, so the next (freshly
  drawn) rotation continues from its second phase. The Rotation setup choice pins one rotation.
- Magma (red) tail slams: Zulrah faces the locked tile through its stare, then slams it for 20-30
  typeless and a stun that blocks moving and attacking (`ZULRAH_TAIL`, the engine's `playerStunned`).
- Serpentine (green) ranged volleys, tanzanite (blue) mixed magic/ranged, and the jad phase
  (10 attacks alternating, opening on ranged).
- Zulrah is one actor: each form change is a dive, 2 ticks hidden underwater, and a transformation
  into the next form at its next spot, so HP and hits in flight carry across. The fight opens with
  Zulrah underwater until the player's first action (wiki).
- Stats, max hit 41 and the 3-tick attack speed come from the [Zulrah](https://oldschool.runescape.wiki/w/Zulrah)
  infobox. They are entered by hand in `src/data/osrs/monsters.json`; the wiki sync script was not run.
- The Zulrah Attacks toggle turns the attacks off, while the rotation keeps its timing.
- The island spans map squares 35_47 and 35_48, so its arms (local y 64-70) lie past the core
  64x64 square. The engine and picking accept any tile inside the arena's bounds
  (`isInTileSpace` in `core/constants.ts`), not only 0-63.
- Hits over 50 on Zulrah become a random 45-50 (`ZULRAH_HIT_CAP`, applied in `CombatSystem`).
- Venom clouds: each barrage spits 2 orbs that land 3 ticks later as 3x3 clouds lasting 30 ticks;
  standing in any cloud deals 1-5 typeless a tick (`ZULRAH_CLOUD`, `clouds.ts`). They are drawn as
  loc 11700. The Venom Clouds toggle turns them off.
- Snakelings: each snakeling turn spits a white orb that lands 3 ticks later, 1-3 tiles from the
  player, as a melee (2045) or magic (2046) snakeling: 1 HP, max hit 15 or 13, attacking every 3
  ticks. They chase the player, die off after 40 seconds and all die with Zulrah
  (`npcs/zulrah/snakeling.ts`). The Snakelings toggle turns them off.
- Venom: every Zulrah ranged/magic attack that does not miss envenoms, prayer or not (wiki); each
  snakeling attack has a 25% chance (`SNAKELING_VENOM_CHANCE`, policy); the engine's venom then hits 6, 8, ... up to 20 every 30 ticks. A worn
  serpentine, tanzanite or magma helm grants immunity (`data/venomImmunity.ts`). Anti-venom,
  anti-venom+ and extended anti-venom+ cure it (`data/itemEffects.ts`), and the Max preset carries
  an extended anti-venom+. The Venom toggle turns it off.
- Every phase is an ordered list of turns (`zulrahPhaseActions`): cloud barrages and snakeling orbs
  in the wiki's order around the attacks.

## Not modelled

- The wiki's note that rotations after the first can include a random out-of-pattern phase.

## Evidence

- [Facts spec](../../../docs/encounters/zulrah-facts-spec.md): what the wiki, Jagex, the cache and
  RuneLite's gameval names establish.
- [Open questions](../../../docs/encounters/zulrah-open-questions.md): every implemented choice they
  do not settle, and the recording that would.
- [Policy](../../../docs/encounters/zulrah-policy.md): the decisions taken past the evidence.

## Files

| File | Role |
|---|---|
| `ZulrahEncounter.ts` | Phase machine: emerge, active, dive, next form |
| `rotation.ts` | The four rotation tables, rotation stepping and spot tiles |
| `controls.ts` | Mechanics toggle |
| `renderConfig.ts` | The three forms' clips; drawn by the Inferno compositor (`render/scene/zulrahSceneBuilder.ts`) |
| `../../npcs/zulrah/zulrah.ts` | The actor and its attacks |
