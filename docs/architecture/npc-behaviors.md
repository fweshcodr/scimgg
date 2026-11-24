# Reusable NPC behavior

## Ownership

| Layer | Owns | Does not own |
| --- | --- | --- |
| Core services | Action-clock arithmetic, attack resolution, eligibility and collision geometry, healing application | Species IDs, attack periods, spawn layouts, style probabilities |
| NPC definitions | Species attack profiles, reactions, support relationships, ability state and child ownership | Concrete encounter imports, global NPC state maps |
| Encounters | Initial targets, layouts, spawn schedules, encounter-wide phase coordination and explicit stage order | Copies of each species' attack loop or healing implementation |

Compose through the `NpcDefinition` contract. Do not add a second runtime facade,
universal boss class, behavior tree or observer bus. A reusable definition must be exercisable
without constructing an encounter.

Movement defaults are in [NPC combat movement](npc-combat-movement.md); reaction timing is in
[NPC retaliation](npc-retaliation.md).

## Melee reach and attack selection

`combat.meleeReach` defaults to `cardinal`; `diagonal` lets a species melee every adjacent footprint
tile with line of sight. `canNpcAttack` and standard pursuit both use it through
`hasNpcAttackReach`; it never extends melee beyond one tile or permits overlapping targets.
`isNpcInMeleeRange` keeps its separate support/proximity semantics.

`selectNpcAttack({ attacker, target, choices, random })` filters weighted profiles through
`canNpcAttack` and returns the chosen profile unchanged, so definitions keep animation/event
metadata beside each plan. Weights must be finite and nonnegative (zero disables a choice); random
values seeded in `[0, 1)`. No randomness is consumed with zero or one eligible choice. Call it only
after the definition's readiness/opening guards, then resolve the plan and schedule the action
clock. It mutates no targets, timers or pursuit style; mixed-style NPCs keep their primary pursuit
range. Zuk's ranger and mager weights: [set melee policy](../encounters/zuk-policy.md#set-melee).

## Time and state

- Each actor owns its action state; a shared definition must not share a readiness tick, target,
  pending support effect or one-time latch between instances.
- `nextActionTick` has one owner per NPC action phase. Opening eligibility is supplied by the
  caller: a dynamically spawned actor does not universally miss the stage it was created in. Test
  the actual encounter enrollment before turning a measured opening delay into an absolute guard.
- An NPC spawned during the NPC band takes its turn that tick; spawn-time actions need explicit
  enrollment when creation happens after it (`completeNpcBand`, `processPostTick`, commands).
- "May this NPC act" guards use `canNpcActThisTurn(actor, tick)`, not `actor.alive`: a `queued` NPC
  killed in its own hit pass keeps that turn. Targets use `canReceiveNewAttack`, healing
  `canReceiveHealing`, and a dying healer must not heal (`isNpcLiving`).
- Yield one actor's movement before planning the next so occupancy reads the move actually applied,
  including binds and interaction stalls. When iterating an actor snapshot, re-check membership
  before dispatch: an earlier actor's lifecycle callback may have removed a later one.
- Movement legality and pursuit strategy are separate. A route finder may pick a different equally
  short path than a direct step; preserve the strategy the NPC's captures support rather than
  reusing Yama's route search because it exists.
- Keep support identity separate from combat target: a permanent parent/support target is not
  `combat.targetId`. In this Inferno model an untagged Yt-HurKot in support range of its Jad,
  including under his footprint, may heal; a tagged one pursues and melees without healing
  ([Zuk policy, Healing](../encounters/zuk-policy.md#healing)). That is not a rule for every healer:
  Fight Caves Yt-HurKot keep healing while tagged in range
  ([Yt-HurKot](https://oldschool.runescape.wiki/w/Yt-HurKot#Strategy)).

## Evidence boundaries

- Projectile lifetime does not define damage or healing time: the wave-69 healer volley at capture
  t1069 has `endtime=90`, while HP increments arrive at t1073
  (capture `inferno-waves-69-zuk-packet-data.txt`, lines 18045 and 18139).
- Missing target formula stats are not a zero-damage roll; a visual action with unavailable damage
  resolution must stay distinguishable from a modeled attack.
- Published heal ranges do not establish a uniform sampler. HP-changing support needs an explicit
  amount policy; visual-only support must not emit a fictitious heal.
- An observed attack envelope is not the NPC's maximum range.
- Do not infer attack count from projectile count: the wave-69 ranger sends paired visual
  projectiles with the same end time. Preserve packet multiplicity in conformance tests.
- Yama's under-footprint randomness and nearest-route behavior are not defaults for new species.
- Jad style odds, healer heal amounts, spark targeting, glyph defences and set scheduling are
  implemented policies, not established game laws; their bases and limits are in
  [Zuk policy](../encounters/zuk-policy.md).

## NPC index order (not modeled)

The game gives every NPC a server index and processes NPCs in index order within a tick. The
simulator also runs ordered per-NPC turns (`processingOrder`,
[hit queue section 2](npc-hit-queue-and-death.md#2-per-npc-interleaved-turns)), but server index
allocation is not reproduced: live turns use registration order. A rule that depends on the
server index is therefore a model:

| Behavior | What the order decides | Model | Evidence |
| --- | --- | --- | --- |
| Venator bow bounce target ([`ricochet.ts`](../../src/core/combat/player/ricochet.ts)) | Which reachable candidate a hop takes | Most recently spawned candidate; same-tick spawns break by registration order | Post-update captures: highest index 23/26 choices |
| Healing totem heal landing ([`totemic.ts`](../../src/encounters/colosseum/modifiers/totemic.ts)) | Whether a heal lands at launch +5 or +6 | Always +6 | +6 on all 16 heals where the totem's index was above its target's; +5 on 3 heals, all from one totem (A:1599/1605/1611) whose index was below its Javelin Colossus's. Not size or distance: every heal was from 1 tile, and another 3x3 Javelin took +6 |
| Inferno split children's add-tick turn ([`waveNpcs.ts`](../../src/npcs/inferno/waveNpcs.ts)) | Whether a child added during the NPC turns steps that tick | Every child added in the band takes its turn that tick, after every earlier registration | The allocator wraps, so a child can take a lower index than its parent and miss the add-tick turn: P t6752 and Q t4300 children stayed on their birth tiles, unlike the other 64 splits ([D10](../encounters/inferno-open-questions.md)); Q t4300 is a declared divergence in `inferno/__tests__/captureConformance.test.ts` |
| Sol beam crystals ([`beams.ts`](../../src/encounters/solHeredit/beams.ts)) | Whether a crystal steps on a warning tick, and whether it despawns on Sol's death tick | Every crystal holds on the warning tick, despawns on the death tick and is removed after the cleanup delay | Crystals indexed above Sol skipped the warning-tick step in all 66 due cases; the 3 indexed below took it 8/8 (L beam 4 and two in A). The lower-index L crystal despawns and is removed a tick late (`solHeredit/__tests__/beamTimeline.test.ts`) |
| Yama void flare detonations (capture conformance test only) | Pairing of two flares detonating on the same tick | Test pairs by capture index order | `yamaP3/__tests__/captureConformance.test.ts` |

Index allocation itself is not sequential with spawn time: in Run A, beam crystals spawned after
Sol took lower indices than him (A:4976 Sol 63273, A:5133 crystal 33430). An index model would
need its own evidence rather than assuming "newer means higher".

## Verification

Core service tests establish simulator contracts; capture tests establish which game observations
they reproduce. Do not present the former as proof of the latter.

Randomness is supplied, never global `Math.random`. Visual demonstration commands keep their
no-damage/no-healing contract. Activation status and limits live in
[the Zuk policy](../encounters/zuk-policy.md), not in the existence of a factory or animation asset.
