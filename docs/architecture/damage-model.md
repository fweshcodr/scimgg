# Damage Model

The code is the specification. Every formula lives in a small module under
[`src/core/combat/`](../../src/core/combat/), locked by tests beside it. Cite the OSRS Wiki,
RuneLite (by path and commit) or a capture (by file name and line or tick) next to the constant you change, in the source;
do not restate formulas here.

Callers outside `src/core/combat/` import the shared formula surface (accuracy, formula inputs and
types, `calculateMaxHit`) through the [`formulas.ts`](../../src/core/combat/formulas.ts) barrel.
Other modules are imported directly by their owners.

## Player attack pipeline

Player attacks are split so the deterministic projection (Practice's Stats and the DPS overlay)
and the random resolution cannot diverge:

1. **Plan:** `planPlayerAttack` turns a request and profile into a `PlayerAttackPlan` (per-hit max
   hits, accuracy rolls, delivery). An unsupported profile returns `gaps` instead of numbers.
2. **Project:** `projectPlayerAttack` walks the plan's probability branches, with no RNG.
3. **Resolve:** `resolvePlayerAttack` consumes the same plan with the engine's seeded `random`.

NPC attacks use `resolveAttackRequest` / `resolveNpcAttack`. `CombatSystem` owns the ordinary
NPC-to-player calculation-time HP cap ([tick eating](tick-eating.md)).

## Encounter damage modifiers

An encounter attaches its modifiers when it commits the hit, and the pending hit carries the
sampled values so later health changes cannot rewrite it. A windup cue is not necessarily
commitment (e.g. Yama ranged/magic commit at release, melee at its cue).

| Seam | Side | Effect |
|---|---|---|
| `EncounterEngineRules.playerMinimumHit` | player | floors an accurate roll; maximum unchanged |
| `NpcAttackRequest.damageBonusPercent` | NPC | `roll + floor(roll × pct / 100)` on an accurate roll, before prayer |

Current consumer: Yama Bloodied Blows' Wretched Strength uses both off one quantity
([`wretchedStrength.ts`](../../src/npcs/yama/wretchedStrength.ts)). They are two measured shapes,
not one mechanic wired twice: [contract mechanics §2.5](../encounters/yama-facts-spec.md#25-bloodied-blows).

## Known gaps

Anything the model refuses to guess is a `CalcGap`
([`combatGaps.ts`](../../src/core/combat/combatGaps.ts)). A profile carrying gaps plans as
unsupported rather than returning a number the source cannot back.

Because a gap blocks the whole attack, a rounding the source leaves open but whose behavior is
otherwise settled is modeled and flagged here instead. The wiki states neither rounding of
Osmumten's fang's 15-85% passive roll. Both ends are floors: the minimum is `floor(max * 15 / 100)`
and the top is the max hit less that minimum. A capture shows a true max of 28 capping ordinary
swings at 24
(capture `weapon-soulreaper-fang-dragonwarhammer-zombieaxe-noxhalberd-tridentoftheswamps-tridentoftheseas-packet-data.txt`,
ticks 497-522), as does the wiki's worked example (max 60 rolls 9-51); /w/Maximum_melee_hit's ×0.85
multiplier would floor 28 to 23, and the capture overrides it. The floored 15% minimum,
shared with Eviscerate, fits that example but is otherwise unverified. Behead's 6%-per-stack
minimum floors on the same footing.

## Commit discipline

Floors do not commute with multiplication, so staged floors are never merged into one expression,
even when a spot check agrees. Keep each stage where the source puts it.
