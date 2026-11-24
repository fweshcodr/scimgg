# Events

Events are the semantic bridge from simulation to render/audio: the simulation says *what*
happened (`attackKind: 'magic_fire'`), never a cache or asset id; the renderer decides how it looks.

- `GameEvent = CoreGameEvent | EncounterGameEvent`
  ([`src/core/events/types.ts`](../../src/core/events/types.ts)). `CoreGameEvent` is a closed
  union; `EncounterGameEvent` (`{ eventId, tick, type: string, [key: string]: unknown }`) is how
  encounters emit their own (`fireball_spawned`, `wave_activated`, `zuk_healer_cast`, ...).
- Because of that index signature, narrow to a core variant with the `isCoreEvent` guard, not a
  bare `event.type === '...'` check.
- [`TickEvents`](../../src/core/events/TickEvents.ts): callers `emit` an `EmittableGameEvent<T>`
  (no `eventId`/`tick`); `emit` stamps the tick from `setTick` and a monotonically increasing
  `eventId`; the engine `flush()`es the buffer each tick.
- Several payload fields exist for reasons their names do not carry:
  `hit_applied.targetPosition` drives positional audio attenuation; `xp_drop.predictedHit` is
  emitted on the attack tick so the XP drop overlay can show a hit before a delayed hit lands.
  Read the union.

## Consumption

`SceneCompositor.build()` filters events through `getUnprocessedEvents()` (by
`lastProcessedEventId`) and forwards the new ones to controllers, `onEncounterEvents()` and
`EventAudioPlayer`. The cursor makes a one-shot effect fire once however many frames render the
same tick. A replay discontinuity rewinds the cursor so the landed frame's own events are consumed
again ([Replay timeline discontinuity](replay-timeline-discontinuity.md)).

The tick an event is *delivered* on can matter beyond its `tick` field: `EventAudioPlayer` measures
`delayCycles` from the flush the event arrives on (example: Yama's fireball barrage in
[the sound-ID audit](audio-sound-ids.md#the-fireball-barrages-delays-are-measured-from-the-sets-start-tick)).
