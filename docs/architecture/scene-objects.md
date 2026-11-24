# Runtime Scene Objects

Runtime scene objects are animated LOC spawns that an encounter owns, drives from simulation state,
and tears down through the simulation lifecycle.

| Need | Path | Owner |
|---|---|---|
| Static cache scenery (walls, pillars, floors) | `locRender` in `EncounterRenderConfig` | `LocRenderer`; no encounter code |
| Encounter-owned animated LOCs that appear/disappear with simulation state, possibly over many ticks | **Runtime scene objects** | Encounter's `SceneObjectController` |
| Projectiles, impacts, one-shot spell effects | Spotanims | `SpotAnimRenderer` plus an effect controller in [`src/render/effects/controllers/`](../../src/render/effects/controllers/) |

## Contract

Types live in [`sceneObjectTypes.ts`](../../src/render/graphics/sceneObjectTypes.ts);
`SceneObjectLocData` lives in [`SceneObjectRenderer.ts`](../../src/render/graphics/SceneObjectRenderer.ts).

- Implement `SceneObjectController<SimulationState, SceneObjectLocData>` and set
  `createSceneObjectController` in the encounter's `EncounterRenderConfig` (registered through
  [`presentationModules.ts`](../../src/encounters/presentationModules.ts)). `SceneCompositor` calls
  the factory once at render initialization; the controller lives for the encounter session.
- `consumeEvents(events)` receives each frame's new `GameEvent`s (one-shot triggers).
  `update(context)` runs every frame and returns the **full** set of active specs; the renderer
  diffs against the previous set. Read state from `context.state.encounter`, the typed snapshot the
  encounter publishes from `getSnapshot()` as plain `structuredClone`-safe data.
- Spec `id` is identity: keep it stable across frames, or every frame re-bakes. Match `meshId` to
  `id`. Un-contoured LOCs share their baked frames automatically: every placement with the same
  loc, model type, rotation and resolved sequence draws one set of frame meshes, each with its
  own model matrix, so repeated objects cost one bake and one GPU upload. Terrain-contoured LOCs
  (`contouredGround >= 0`) bake per placement under `meshId`.
- `seqId: -1` uses the LOC type's default sequence; a negative resolved seq renders the static mesh
  when it can be loaded. The renderer re-bakes only when the bake key changes (loc, rotation, seq,
  position, terrain revision, ...), so returning stable specs every frame is cheap. Treat a spec as a
  value: change it by returning a new spec, not by editing its fields. The renderer keeps each drawn
  frame's queued commands and draws them again while the policy inputs stay the same (material,
  classification, style and `modelMatrix` values). New spec objects with equal values still reuse
  them, and a `modelMatrix` edited in place is detected. Specs with `style.uniforms` are copied
  every frame.
- `modelMatrix` is applied after the baked LOC placement (from `localX`/`localY` and terrain); use
  identity unless you need an extra transform.
- Without `animationStartTick`, a sequence starts on the tick the renderer first sees the spec, and
  re-anchors to the displayed tick after a replay seek. When the encounter's recorded state knows
  when the sequence began (for example a despawn that starts on a recorded death tick), pass that
  tick so a seek into the middle of the sequence lands on the right frame. It is timeline state,
  not part of the bake key, so changing it never re-bakes geometry.
- **LOC only.** `SceneObjectLocData` is the only supported data kind. Do not add a `kind: 'mesh'`
  branch without first extending `SceneObjectRenderer`.

| Lifecycle | Behavior |
|---|---|
| `sync` | Alive while the controller keeps returning it; omit it to despawn |
| `oneShot` | Active from `startTick` for `durationTicks`, then evicted |
| `manual` | Active until `expiresAtTick`, or forever if omitted |

| Classification | Default depth bias | Use for |
|---|---|---|
| `groundDecal` | `GROUND_DECAL_DEPTH_BIAS` (0.0001) | Floor overlays, pools, tile markers |
| `sceneMesh` | none | Upright objects at ground level |
| `aerial` | none | Floating objects |

`style.depthBias` overrides the default; `style.zOffset` shifts rendered Z without touching bias.
`style.opacity` (0..1) multiplies every face's alpha when the frames are baked, so a faded object
draws entirely in the transparent pass (depth read, normal blend). It is part of the bake key and the
mesh ids: pick one value per spec rather than animating it.

`context.fightStartCountdown` is `'holding'` while the start-of-fight countdown holds the fight and
`'released'` from GO until its overlay finishes; it is absent when no countdown runs, including
replay viewing. It is UI timing, never simulation or replay state, so only presentation may depend on
it. Yama's start glyphs hint (`YamaSceneObjectController`) is its consumer.

## Forbidden

- Encounter code must not call `LocRenderer` methods or import `SceneObjectRenderer`; render reads
  encounter state, never the reverse.
- No `any`, non-null assertions or `ts-ignore` in the controller or its spec data.

## Example

```typescript
// src/encounters/exampleEncounter/PillarSceneObjectController.ts (illustrative)
export class PillarSceneObjectController
  implements SceneObjectController<SimulationState, SceneObjectLocData>
{
  consumeEvents(): void {}

  update(context: SceneObjectFrameContext<SimulationState>): readonly SceneObjectSpec<SceneObjectLocData>[] {
    const snapshot = context.state.encounter;
    if (snapshot.kind !== 'example_encounter') return [];
    return snapshot.visuals.pillars.map(({ x, y }) => ({
      id: `pillar-${x}-${y}`,
      meshId: `pillar-${x}-${y}`,
      materialId: 'osrs-npc',
      modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      lifecycle: { kind: 'sync' },
      classification: 'sceneMesh',
      data: { kind: 'loc', locId: PILLAR_LOC_ID, modelType: LocModelType.NORMAL, rotation: 0,
              seqId: PILLAR_SEQ_ID, localX: x, localY: y },
    }));
  }
}
```

Cover each controller with at least a smoke test: call `update` with a minimal
`SceneObjectFrameContext` and assert the returned ids and classifications.
