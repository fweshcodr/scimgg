---
name: combat-tutorial
description: Author or change a combat encounter tutorial (a Basics walkthrough, mechanic drill or strategy lesson) in src/tutorial/content, including its evidence, mechanic toggles, events, encounter commands, demo timing and Training course placement.
---

# Combat encounter tutorials

A combat tutorial is a `Tutorial` object
([`src/tutorial/types.ts`](../../../src/tutorial/types.ts)) in
`src/tutorial/content/<id>.ts`, listed in `TUTORIAL_REGISTRY`
([`registry.ts`](../../../src/tutorial/content/registry.ts)) and placed in a
Training course ([`courses.ts`](../../../src/tutorial/content/courses.ts)). The
Yama tutorials (`src/tutorial/content/yama-*.ts`) are the working examples; use
them for shape, not as a source of facts about another encounter.

## Evidence

A tutorial teaches the simulator's behavior as if it were the game's, so every
mechanical claim a player acts on (ticks, damage, prayer rules, tiles, cycles)
follows the [evidence standard](../../../CONTRIBUTING.md#the-evidence-standard).

- Cite the observed fact or the fixture that pins it, such as the encounter's
  `docs/encounters/<encounter>-facts-spec.md` entry or a `__tests__/fixtures/`
  capture fixture.
- Where the simulator follows a documented policy rather than an observed fact
  (`docs/encounters/<encounter>-policy.md`), the copy must not present it as
  game fact.
- Block any instruction the simulator does not support. A step that tells the
  player to do something the engine does not model teaches the wrong thing; leave
  it out or record it as an open question.

If the encounter has no simulator implementation, a tutorial cannot be checked.
Build the encounter first.

## Real keys, events and commands

- **Mechanic toggles**: do not trust `MechanicsConfig` in
  [`src/types/simulation.ts`](../../../src/types/simulation.ts); its string index
  signature lets any key type-check. The supported set is the encounter module's
  `controls` (`defaultMechanicsConfig`, `mechanicsToggles`, plus per-variant
  `variantControls`) in
  [`src/encounters/modules.ts`](../../../src/encounters/modules.ts), usually built
  in `src/encounters/<encounter>/controls.ts`. Global toggles are
  `GLOBAL_MECHANICS_TOGGLES` and `GLOBAL_PLAYER_TOGGLES` in `simulation.ts`.
- **Events**: `eventName`, `failEventName` and `advanceOn` events must be real.
  Core events are in [`src/core/events/types.ts`](../../../src/core/events/types.ts);
  encounter events are emitted from `src/encounters/<encounter>/`. `matcher` and
  `failMatcher` are `(event: GameEvent) => boolean` predicates over the payload
  fields. Never invent an event name; add the event to the encounter first.
- **Encounter commands**: encounter-specific setup (forcing an attack style,
  spawning a hazard) is an `encounter-command` action with a
  `TutorialEncounterCommandId` from
  [`src/tutorial/encounterCommands.ts`](../../../src/tutorial/encounterCommands.ts).
  Only Yama ids exist; another encounter needs an id and a
  `resolveTutorialEncounterCommand` case for its engine command in
  `src/encounters/<encounter>/commands.ts`.
- **Action types** must exist in the `EncounterControlAction` union in
  `types.ts`.

## Step contract

- `surface` is `'encounter'`. `id` is kebab-case and encounter-prefixed.
  `availability: 'wip'` omits the tutorial from the Training picker and its
  counts; preview it with the UI harness (`?open=tutorial:<id>`).
- Use `info`, `encounter-control`, `world-highlight`, `wait-for-event`,
  `checkpoint` and `demo` steps. For in-scene emphasis use `world-highlight`;
  `spotlight` steps are for app tours.
- `setup` on a `wait-for-event` step runs before the event subscription attaches,
  so a `reset` or `encounter-command` in setup cannot tick the counter.
- `failResetsProgress: true` makes a fail reset the streak instead of ending the
  step; use it for "N in a row" drills.
- A checkpoint `seed` has no player position.
- A demo should prefer `setup` over the `mechanics` and `resetBefore` shorthands,
  and set `resetBefore: false` when `setup` already resets.
- There is no highlight-style field; the overlay chooses the treatment.

## Watch steps: two clocks

A `demo` step has two timelines:

- Cursor cues with `{ kind: 'tick' }` time (`clickPrayer`, `openPanelTab` and
  `clickSelector` given a number, from
  [`cursorChoreography.ts`](../../../src/tutorial/content/cursorChoreography.ts))
  use **absolute engine ticks**. `{ kind: 'ms' }` cues are wall-clock from the
  demo's start.
- `scriptedActions[].tickOffset` and `stopAtTickOffset` are **demo-local**: 0 is
  the start of the demo's main phase, after setup and any `fastForwardToTick`.
- `fastForwardToTick` must stay below the first tick cue, leaving room for the
  cursor's glide, or that cue fires late. A cursor-only demo must set
  `stopAtTickOffset`: without scripted actions it defaults to 1, so the tick cues
  never play.
- Seed the watch and the practice alike. `buildGuidedDrill`
  ([`guidedDrill.ts`](../../../src/tutorial/content/guidedDrill.ts)) applies the
  same mechanics, tile preset and opening command to the demo setup and the ready
  checkpoint's seed. Hand-written demos must keep that themselves, or the player
  practices a different fight from the one they watched.

The example is the "Watch: Yama's Basic Attacks" demo in
[`yama-basics.ts`](../../../src/tutorial/content/yama-basics.ts): it
fast-forwards to tick 5, prays at absolute ticks 10 and 17, and stops at demo
offset 19 (engine tick 24). Its `describe` block in
[`yama-basics.test.ts`](../../../src/tutorial/content/__tests__/yama-basics.test.ts)
pins those numbers and the matching ready seed; pin a new demo the same way.

Teach through the in-engine demo, not recorded footage.

## Course placement

- `encounterContext.kind` is what advertises a tutorial:
  `hasTutorialsForEncounter(kind)`
  ([`content/index.ts`](../../../src/tutorial/content/index.ts)) is a plain string
  match and the only gate for the Configure panel's Start Tutorial button and the
  encounter picker's Start Tutorial action. An unknown kind
  fails silently; `courses.test.ts` checks every kind is registered. Kinds and
  variants are in [`src/encounters/catalog.ts`](../../../src/encounters/catalog.ts).
- Every tutorial in `TUTORIAL_REGISTRY` must sit in exactly one track
  (`walkthrough`, `mechanic-drill` or `strategy`) of one course in
  `TRAINING_COURSES`. A tutorial in no track is unreachable in the picker.
- Every tutorial in an encounter course must declare that course's
  `encounterKind` exactly, and an encounter course is keyed by its base kind.
  Variants resolve to the base course (`getCourseForEncounterKind`), so a
  tutorial that declares a variant kind (such as a Yama contract) fails the course
  tests whether it sits in the base course or in a course of its own. Teaching a
  variant needs a course-model change first.
- Only `yama` has an encounter course. Another encounter's first tutorial adds a
  course keyed by its base kind.

## Verify

```bash
npx vitest run src/tutorial/content/__tests__/courses.test.ts src/tutorial/content/__tests__/index.test.ts src/tutorial/content/__tests__/<tutorial>.test.ts
```

Use a browser only to see a glide or movement the numbers do not settle, within
the browser reach limit in [`AGENTS.md`](../../../AGENTS.md#testing-and-browser-limits).
