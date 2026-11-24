# TzKal-Zuk: wave 69 of the Inferno (incomplete evidence build)

Zuk is wave 69 of [the Inferno](../inferno/README.md) (`inferno`), reached from wave 68 or
practiced directly by starting the run on wave 69. `/zuk` and the Zuk lobby entry open `inferno`
with start wave 69: `zuk` is an entry alias (`retiredKinds` in `catalog.ts`, `retiredEntries` on the module), not a
separate encounter. It is not full-fight parity: every generator without a cited rule or a
documented simulator policy stays disabled.

- Runtime scope notes: [`ZUK_SCOPE_NOTES`](./controls.ts).
- Recorded facts and citations, the intro included: [facts spec](../../../docs/encounters/zuk-facts-spec.md);
  projectile packet measurements: [projectile evidence](../../../docs/encounters/zuk-projectile-evidence.md).
- Simulator policy (thresholds, sets, healing, Jad, set melee, glyph, sparks, presentation, seeds):
  [policy](../../../docs/encounters/zuk-policy.md); the 68 → 69 transition:
  [Inferno policy](../../../docs/encounters/inferno-policy.md#wave-69-transition).
- Unsettled rules and the captures that would settle them:
  [open questions](../../../docs/encounters/zuk-open-questions.md).

## Structure

[`ZukWaveDirector.ts`](./ZukWaveDirector.ts) owns wave 69's cross-NPC coordination (opening actors,
glyph patrol, cast and set clocks, Jad and healer spawns, spark landings, boss-HP phases, outcome)
from one control tick C; the Inferno encounter owns when it starts and every engine hook. A run
started on 69 opens at C = 0; one reaching it from 68 adds the glyph and Zuk at C-8 with their
clocks (`spawnTick`) at C, so both are the same fight from C on. `zukWaveRegistrations` registers
the definitions only wave 69 uses; the shared ones are the Inferno's. `alcoveScenery.ts` is the
alcove's walls and static glyph per tick around C, drawn by the Inferno's scene controller.

NPC-local state belongs to typed definitions under [`src/npcs/inferno`](../../npcs/inferno/), which
must not import concrete encounters; the director injects what they need (for example the
shadow-targeting predicate). Shared clocks, patrol, pursuit/occupancy and healing are in the
[NPC behavior guide](../../../docs/architecture/npc-behaviors.md).

Unsupported behavior stays unavailable. One recorded case is not the rule that generated it.
Evidence and source rules: [the evidence standard](../../../CONTRIBUTING.md#the-evidence-standard).
