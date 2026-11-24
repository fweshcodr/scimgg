# Architecture

Scim.GG is a deterministic, tick-based simulation with React input, replayable state and an
event-driven renderer.

```text
React/UI -> useEncounterManager -> simulationEngineFactory -> SimulationEngine
                                                        |-> Encounter
                                                        |-> NPC definitions
                                                        `-> CombatSystem

SimulationEngine -> SimulationState + TickEvents -> replay / UI / scene builder -> render + audio
```

## Dependency direction

- [`src/core/`](../../src/core/) owns world state, tick order, combat, movement, replay contracts
  and the abstract `Encounter` contract. It never imports concrete encounters, NPC families,
  rendering or UI.
- [`src/encounters/`](../../src/encounters/) owns each live fight and its cross-NPC coordination.
- [`src/npcs/`](../../src/npcs/) owns reusable NPC definitions, factories and NPC-local state.
- [`src/render/`](../../src/render/), [`src/audio/`](../../src/audio/) and
  [`src/components/`](../../src/components/) consume snapshots and semantic events; they never
  drive simulation state.

`EncounterSnapshot` is the clone-safe public state/visual DTO for UI, rendering and replay frames;
live objects, callbacks, maps and RNG functions never enter it. `TickEvents` carries one-shot
semantic transitions for rendering and audio.

## Where changes belong

- New fight or cross-NPC mechanic: `src/encounters/<name>/`.
- Reusable NPC behavior or NPC-local state: `src/npcs/<family>/`.
- Rule every encounter must obey: `src/core/`.
- Persistent/seekable output: the encounter's snapshot DTO.
- One-shot visual or audio transition: a semantic event with local types, emitters and guards.
- Models, clips, particles, sounds or UI: presentation/render/audio/component layers.

Do not add an encounter base class, forwarding runtime facade, global NPC scheduler or universal
effect queue without repeated behavior the current direct composition cannot express.

## Guides

Simulation
- [Encounters](encounters.md): structure, tick pipeline, registration, determinism, checklists
- [Actors](actors.md)
- [Reusable NPC behavior](npc-behaviors.md), [NPC combat movement](npc-combat-movement.md),
  [NPC retaliation](npc-retaliation.md)
- [Combat](combat.md), [Damage model](damage-model.md), [Tick eating](tick-eating.md)
- [Equipment combat families](equipment-combat-families.md)
- [Events](events.md)
- [Yama contract mechanics](../encounters/yama-facts-spec.md)

Presentation
- [Rendering](rendering.md), [runtime scene objects](scene-objects.md),
  [projectile motion](projectile-motion.md)
- [Movement and facing](movement-and-facing.md)
- [Replay timeline discontinuity](replay-timeline-discontinuity.md) and
  [replay recording](replay-recording.md)
- [Audio](audio.md), the [sound-effect synthesizer](audio-synth.md) and the
  [sound-ID audit](audio-sound-ids.md)
- [Workspace docking](workspace-docking.md), [fixed-mode chrome seams](fixed-mode-chrome-seams.md),
  [Mobile chrome scale](mobile-chrome-scale.md)
