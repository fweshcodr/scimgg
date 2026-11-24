# Tick eating and damage commitment

## Contract

Ordinary NPC-to-player attacks cap their calculated damage to the player's HP at calculation. A
delayed hit keeps that bound even if the player heals. Immediate attacks use the same rule, but
ordinary food cannot run between their calculation and application. Player-origin, NPC-to-NPC and
environmental damage are outside this default.

Tick eating follows from `calculate and cap -> heal -> apply`. It is not a food effect, an
invulnerability window, or a rule that leaves the player on 1 HP: multiple committed hits can still
kill, eating before calculation raises the HP the cap sees, and healing after death cannot revive.

Order at application: keep the calculated offensive damage (bonuses and incoming multipliers
included) plus a snapshot of calculation-time HP; apply protection-prayer mitigation at its declared
check timing; cap *that* result to the saved HP; then Elysian mitigation (shield and proc evaluated
at impact, adding no delay). Prayer-check timing is independent of the HP snapshot. The Bloodied
Blows capture below rules out cap-before-prayer; Elysian's position after the cap is a simulator
choice, not a measurement.

Zuk's blast explicitly permits overkill: it is not limited by calculation-time HP. Clamping HP to
zero on application is not a substitute for calculation-time capping.

## Windup versus delayed impact

A visual cue does not necessarily commit a hit. Encounter-owned windups end at the
damage-calculation point, and a committed hit's delay starts there. Yama's simulator model:

| Attack | Calculation | Application | Food tick-eat window |
| --- | --- | --- | --- |
| Melee | At the melee cue | One tick later | Between cue and impact |
| Ranged / magic | At release, after the three-tick windup | On the release tick | None |

Yama ranged/magic use the ordinary cap, not an overkill exception; food on the release tick is
already in HP when the attack is calculated. Cue and damage-arrival ticks are the captured ones. This
split is simulator policy based on observed play; neither the Wiki nor the captures establish Yama's
internal calculation point.

## Evidence

- [OSRS Wiki: Tick eating, rev 15034399](https://oldschool.runescape.wiki/w/Tick_eating?oldid=15034399):
  almost all monster attacks cap to current HP at calculation; healing between calculation and
  application enables tick eating; Zuk, Maiden and PvP are uncapped exceptions. Delayed
  Dusk/Vardorvis melee is tick-eatable and adjacent TzTok-Jad magic has no usable delay, so style
  alone cannot determine tick-eatability.
- [RSMod `Player.queueHit(Npc)`, ISC, fa13b3f](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/player/src/main/kotlin/org/rsmod/api/player/hit/PlayerExtensions.kt#L62-L85)
  caps to current HP before modifiers and queueing; its
  [`queueImpactHit`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/player/src/main/kotlin/org/rsmod/api/player/hit/PlayerExtensions.kt#L272-L332)
  omits that cap. Corroboration only; its 100% prayer block cannot distinguish prayer-before-cap
  from cap-before-prayer.
- [RSMod game-cycle order](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/GameCycle.kt#L46-L57)
  puts player input before NPC and player main; the simulator keeps its input-before-hit order.
- Bloodied Blows capture `yama-contract-of-bloodied-blows-packet-data-1.txt`
  (contiguous): in P3 the player has 7 HP at tick 2556, gets the ranged cue at 2557, activates
  Protect from Missiles at 2558 and takes a player-owned 5 at 2560 (to 2 HP); a second cue at 2578
  lands 6 at 2581 (7 to 1 HP), both with the correct overhead and matching NPC-damage counters, no
  healing or damage confound. Capping to 7 *before* 5–6% floored penetration would give 0. These
  are compatible with a post-prayer cap or no cap; the cap itself rests on the Wiki.
- 2004Scape (MIT, 647886c4) blocks fully and clamps at application; it settles neither the modern
  cap nor Yama's partial-prayer ordering. Nothing is adopted from it.

The cap is independently implemented from the Wiki rule. Bloodied Blows uses 6% penetration (the
Wiki publishes 5%); the cap must not silently change that separately calibrated rate or its
rounding.

## Open in-game checks

For Yama, test melee, ranged and magic separately, without and then with damage-modifying
contracts, recording cue-tick HP, healing and its tick, HP loss and its tick, prayer, distance and
any other damage source; avoid overlapping hits and poison. A hit larger than cue-time HP separates
a committed capped hit from late calculation or overkill, but not those two from each other; a
single survival is inconclusive, and visual delay alone does not show a calculation-to-application
delay. Delayed-heal techniques for immediate melee are not established; do not infer their ordering
from a delayed hitsplat.
