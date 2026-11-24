# Combat System

[`CombatSystem`](../../src/core/combat/CombatSystem.ts) commits attacks, resolves the pending-hit
queue, applies damage and protection prayers, and pulses burn stacks. It knows nothing about engine
internals; everything arrives through a `CombatBridge`. Formula ownership is in
[Damage model](damage-model.md).

`CombatSystemOptions.random` must be the engine's seeded stream. Left at `Math.random`, replay
takeover rolls different damage from the fight that was on screen.

## Attack commit

`processAttack` (cooldown check, then rolls) and `processAttackRequest` (pre-resolved) both funnel
into `commitAttack`:

1. Emit `attack_started` with resolved style, kind, spell/weapon/ammo ids and `impactDelayTicks`.
2. If pending hits are enabled and `impactDelayTicks > 0`, queue a `PendingHit`: damage is sampled
   at launch and the protection prayer seeded from the launch tick.
3. Otherwise apply immediately (`hit_applied`, `hitsplat_spawned`, `actor_died` on a kill).

Ordinary NPC-to-player attacks keep their calculation-time HP cap while queued; Zuk permits
overkill. See [Tick eating](tick-eating.md).

A hit on an NPC is not capped at calculation, but on impact it deals, records and splats at most
the NPC's remaining HP. Evidence: in the Colosseum captures every player hit on a 1-HP Bee swarm
splats 1 (17/17), including scythe, special-attack and Venator hits, and no Fremennik warbander's
splats ever total more than its HP (30/30).

## Pending hits

Every hit enters `world.pendingHits` through `CombatSystem.queuePendingHit`, which gives it a
world-owned `enqueueSequence` and binds it to the source and target instances it was launched
between. Each target is drained by `processPendingHitsForTarget`, which visits that target's hits in
`enqueueSequence` order; `impactTick` only decides whether a hit is due. Each NPC's hits are drained at
the start of its own turn in the NPC band, and the player's by `processPendingHits(world, bridge,
'player')` in the player band ([tick pipeline](encounters.md#per-tick-pipeline)). See
[NPC hit queue](npc-hit-queue-and-death.md).
For each hit:

- Drop it if its target id now names a different actor instance, or none. Do the same for its
  source only when its `sourceDeathPolicy` is `'cancel-before-impact'`; a `'persist'` hit (player
  attacks, released NPC projectiles) is delivered by the instance that launched it, even once dead
  or pruned, and keeps that NPC's type for attribution.
- Re-sample the target's overhead on the hit's prayer-check tick. `PrayerCheckTiming` is
  `'launch'` (default; essentially every NPC attack), `'impact'` or `{ afterLaunchTicks: n }`.
- Keep it queued while `impactTick > world.tick`.
- Otherwise remove it from the queue before any callback runs, then drop it if the target is a dead
  player or an NPC taken out of life at nonzero HP, or if a cancelable source is dead.
- An NPC target already at 0 HP takes it as a zero impact: a 0 block splat and a 0 damage report,
  with no roll, effect, death, defeat or kill reward. Only the killing blow carries those.
- Otherwise apply it with the launch-tick damage multipliers, so a buff that expired mid-flight
  cannot rewrite it.

`NpcAttackRequest` and `AttackPlan` require `sourceDeathPolicy`, so every NPC attack profile
classifies it explicitly. A further hit of an accepted attack (`processSupplementalHitRequest`) is
not refused because an earlier component killed the target.

## Protection prayers

Mitigation is `calculatePrayerDamage`
([`damageCalculation.ts`](../../src/core/combat/damageCalculation.ts)), selected per attack by a
`PrayerReduction`, applied only under the correct overhead:

| Type | Damage through a correct prayer |
|---|---|
| `block` (default) | 0 |
| `cap` | `min(value, damage)` |
| `reduce` | `floor(damage × round(value × 100) / 100)`: the penetrating share, floored |
| `bypass` | full damage |

`reduce` floors the *penetrating* share, so every roll below `100 / rate` reads 0. Do not switch it
to "roll minus the floored blocked share": existing `reduce` rates (currently all Yama's) are
calibrated to this arithmetic ([contract mechanics](../encounters/yama-facts-spec.md#5-phase-3-damage-numbers)). Rates must be whole
percents; `0.125` silently becomes 13%.

`bypass` (`BYPASS_PROTECTION_PRAYER`) is for mechanic damage the encounter already decided connects.
Typeless hits are never mitigated, and their `hit_applied.prayedCorrectly` is `null`.
