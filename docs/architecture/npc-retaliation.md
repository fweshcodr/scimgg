# NPC Action Readiness and Retaliation

## Authoritative Clock

`NpcCombatState.nextActionTick` is the sole mutable NPC action-readiness clock.
`isNpcActionReady(combat, tick)` tests `tick >= nextActionTick` without mutation.
`scheduleNpcAction(combat, actionTick, intervalTicks)` assigns
`nextActionTick = actionTick + intervalTicks`. There are no decrements or tick-stage offsets.
Outgoing and incoming attack timestamps are metadata, not standard-flinch eligibility inputs.
The clock is not part of `NpcSnapshot`, state projections, or a persisted save format.

An ordinary action at T schedules readiness at T + attack speed. Jad schedules its next
cue from the cue tick; its independent release/windup does not reschedule readiness.
Scripted Yama and Zuk clocks and healer support-effect clocks keep their own responsibilities.

## Standard Retaliation

`createNpcRetaliation()` opts an actor into `standard` mode. No actor is opted in globally.
The standard delay is `floor(attackSpeed / 2)`, including odd speeds and speed one (delay zero).
At reaction processing tick P an NPC is eligible when it is not targeting the attacking
player, or when `nextActionTick + 8 < P`. The comparison is strict: readiness + 8 is still
in combat; readiness + 9 is eligible. In this solo simulator, the incoming source ID and
current target ID are the proxy for player-combat mode, not a multiplayer aggro model.

An eligible reaction sets readiness to `max(nextActionTick, P + delay)`: it can extend an
existing wait or leave it unchanged, never advance the next attack. It then targets the
player even when readiness is unchanged. Hits while already in player combat do not rephase
or extend that window; recording incoming metadata does not change eligibility. This clamp
belongs to standard flinching, not the general action scheduler or custom retaliation policies.

Accurate hits of every style and failed non-magical attacks react at their actual impact
tick H. An immediate hit committed after the NPC stage at D imposes readiness no earlier than
D + delay, without an extra processing tick. A standard magic miss queues its reaction at
launch + 1, before the NPC stage, independently of projectile travel. With no existing wait, speed
four gives: direct D -> D + 2,
projectile H -> H + 2, splash launch L -> L + 3. A zero-delay reaction after the NPC stage
is ready immediately but cannot retroactively act in that stage. Encounters never discover
attacks by scanning pending hits; `CombatSystem` notifies the target through
`notifyNpcOfPlayerAttack`, and `processNpcRetaliations` runs first in the NPC band. A
damage-resolved callback is no substitute: failed spells can provoke before any damage lands.

Queued reactions are processed before NPC movement/actions. Dead targets and dead or missing
sources discard pending reactions. Repeated standard notifications cannot extend a phase
once the first reaction establishes player combat.

## Explicit Policies and Opening Guards

- `retarget` changes the target without changing readiness. Jad uses this policy; its
  splashes react at launch, not standard mode's launch + 1.
- Jad healers (Yt-HurKot) use standard mode: speed four gives a first swing at splat + 2 after a
  hit and cast + 3 after a splash, as captured (Q t4801 -> 4803, P t9819 -> 9822; inferno
  facts spec, Yt-HurKot). Their independent healing, movement, freeze and persistent
  distance-independent tags are separate from it.
- `one-tick` overwrites readiness with reaction tick + 1. Enrage healers use this policy
  and their launch-origin splash reaction; other hits react at impact.
- Zuk set magers and rangers use standard mode with immutable `firstActionTick` guards at
  spawn + 6 and spawn + 8. They must satisfy both that guard and current action readiness.
  An early tag therefore acts at `max(firstActionTick, retaliationReady)`, never floor + delay.
  A mature glyph-targeted tag can preserve or delay either actor's next attack; subsequent
  actions are four ticks apart. The paired actor's clock is independent.
- Base Yama, void flares, glyphs and scripted Zuk actors are not opted in. There is no
  generic retaliation for noncombat actors.

## Pinned Sources and Limits

- [OSRS Wiki, Flinching, revision 15259611, Technical details](https://oldschool.runescape.wiki/w/Flinching?oldid=15259611#Technical_details):
  half-speed delay and attack-readiness-based reengagement.
- [RSMod, ISC, commit fa13b3f67172ef36e15d6b1514358aee61411796, NpcExtensions.kt lines 25-55](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/combat/combat-commons/src/main/kotlin/org/rsmod/api/combat/commons/npc/NpcExtensions.kt#L25-L55):
  `actionDelay + 8 < clock` or not-player-combat eligibility, and eligible half-speed overwrite.
- [RSMod, same commit, PlayerAttackManager.kt lines 1525-1551](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/combat/combat-manager/src/main/kotlin/org/rsmod/api/combat/manager/PlayerAttackManager.kt#L1525-L1551):
  failed-magic retaliation delay of one tick.
- [2004Scape, MIT, commit 647886c42f8a22c0f18e5dbe79c2697f052f8d2e, npc_combat.rs2](https://github.com/2004Scape/Server/blob/647886c42f8a22c0f18e5dbe79c2697f052f8d2e/data/src/scripts/skill_combat/scripts/npc/npc_combat.rs2):
  default retaliation at lines 7-31 and readiness predicate at lines 259-263.
- [2004Scape, same commit, npc_combat_melee.rs2 lines 36-42](https://github.com/2004Scape/Server/blob/647886c42f8a22c0f18e5dbe79c2697f052f8d2e/data/src/scripts/skill_combat/scripts/npc/npc_combat_melee.rs2#L36-L42):
  NPC melee readiness is scheduled as clock + attack rate. Only functional behavior is
  referenced, not server engine or RuneScript architecture.

These sources support the delay and eligibility rules, not a claim of 2004-era Zuk behavior or
complete boss-specific parity. Preserving a longer existing cooldown is simulator policy: the Wiki
does not settle that overlap, and the cited RSMod overwrite is not evidence for the non-shortening
clamp. The set opening guards are a simulator model fitted to recorded openings. The Zuk capture evidence and unknown boss-specific rules remain in
[`zuk-facts-spec.md`](../encounters/zuk-facts-spec.md) and
[`zuk-open-questions.md`](../encounters/zuk-open-questions.md).
