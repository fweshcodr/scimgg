import { describe, expect, it } from 'vitest';

import type { LocMeshData } from '../../../rs/config/loctype/LocModelLoader';
import { LocModelType } from '../../../rs/config/loctype/LocModelType';
import type { SeqType } from '../../../rs/config/seqtype/SeqType';
import { classifyMesh3DCommands } from '../../backends/picogl/commandClassifier';
import type { NpcMesh3DCommand } from '../../core/commands';
import { createQueue, type RenderQueue } from '../../core/commands';
import { bakeLocFrameGeometry, placeLocFrameGeometry } from '../../environment/locMeshBaker';
import {
  buildLocModelMatrix,
  DEFAULT_BOUNDARY_DISPLACEMENT,
  normalizeCardinalRotation,
  resolveLocPlacement,
} from '../../environment/locPlacement';
import { type SceneObjectLocData, type SceneObjectLocModelLoader, SceneObjectRenderer } from '../SceneObjectRenderer';
import type { SceneObjectSpec } from '../sceneObjectTypes';

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function makeTerrainHeights(height: number): Int32Array[] {
  const heights: Int32Array[] = [];
  for (let x = 0; x <= 4; x++) {
    const column = new Int32Array(5);
    column.fill(height);
    heights.push(column);
  }
  return heights;
}

const CLIENT_TICKS_PER_GAME_TICK = 30;

function makeFrame(alpha: number, faceBias: number): LocMeshData {
  return {
    mesh: {
      positions: new Float32Array([-64, 0, -64, 64, 0, -64, -64, 0, 64]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    },
    hslColors: new Float32Array([101, 102, 103]),
    alphas: new Float32Array([alpha, alpha, alpha]),
    faceBias: new Float32Array([faceBias, faceBias, faceBias]),
    hasTransparency: alpha < 1,
  };
}

function makeMixedFrames(): readonly LocMeshData[] {
  return [makeFrame(1, 7), makeFrame(0.25, 11)];
}

function makeSeqType(frameLengths: readonly number[] = [1, 1], heightOffset = 0): SeqType {
  return {
    frameIds: frameLengths.map((_, index) => index),
    frameLengths: [...frameLengths],
    frameStep: frameLengths.length,
    heightOffset,
  } as unknown as SeqType;
}

type CountingLoader = SceneObjectLocModelLoader & { readonly bakeCount: number };

function makeLoader(frames: readonly LocMeshData[] = makeMixedFrames()): CountingLoader {
  let bakeCount = 0;
  return {
    get bakeCount() {
      return bakeCount;
    },
    loadLocMesh(locId, modelType, rotation, worldX, worldY, worldZ) {
      expect(locId).toBe(1001);
      expect(modelType).toBe(LocModelType.FLOOR_DECORATION);
      expect(rotation).toBe(0);
      const frame = frames[0];
      if (!frame) {
        return undefined;
      }
      return {
        locId,
        mesh: frame.mesh,
        hslColors: frame.hslColors,
        alphas: frame.alphas,
        ...(frame.faceBias ? { faceBias: frame.faceBias } : {}),
        worldX,
        worldY,
        worldZ,
        sizeX: 1,
        sizeY: 1,
      };
    },
    loadAnimatedLocMeshFrames(locId, modelType, rotation, seqId) {
      expect(locId).toBe(1001);
      expect(modelType).toBe(LocModelType.FLOOR_DECORATION);
      expect(rotation).toBe(0);
      expect(seqId).toBe(2002);
      bakeCount++;
      return { frames, seqType: makeSeqType(frames.map(() => 1)) };
    },
    loadLocType() {
      return { sizeX: 1, sizeY: 1, contouredGround: -1 };
    },
  };
}

function makeSpec(
  overrides: Pick<Partial<SceneObjectSpec<SceneObjectLocData>>, 'classification' | 'lifecycle' | 'style'> = {},
): SceneObjectSpec<SceneObjectLocData> {
  return {
    id: 'runtime-loc',
    meshId: 'runtime-loc-mesh',
    materialId: 'runtime-material',
    modelMatrix: identityMatrix(),
    lifecycle: overrides.lifecycle ?? { kind: 'sync' },
    classification: overrides.classification ?? 'groundDecal',
    style: overrides.style,
    data: {
      kind: 'loc',
      locId: 1001,
      modelType: LocModelType.FLOOR_DECORATION,
      rotation: 0,
      seqId: 2002,
      localX: 1,
      localY: 1,
      level: 0,
      sizeX: 1,
      sizeY: 1,
      contouredGround: -1,
    },
  };
}

function renderOne(
  renderer: SceneObjectRenderer,
  spec: SceneObjectSpec<SceneObjectLocData>,
  currentTick = 0,
  interpolatedTick = currentTick,
): RenderQueue {
  const queue = createQueue();
  renderer.sync([spec], currentTick);
  renderer.render(queue, currentTick, interpolatedTick);
  return queue;
}

function onlyMesh(queue: RenderQueue): NpcMesh3DCommand {
  const command = queue.commands[0];
  if (!isNpcMeshCommand(command)) {
    throw new Error('Expected one mesh command');
  }
  return command;
}

function isNpcMeshCommand(command: RenderQueue['commands'][number] | undefined): command is NpcMesh3DCommand {
  return command?.kind === 'mesh3d' && 'positions' in command;
}

describe('SceneObjectRenderer', () => {
  it('Given a groundDecal loc When rendered Then it applies positive depth bias and lands in the opaque bucket', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));

    const queue = renderOne(renderer, makeSpec({ classification: 'groundDecal' }));

    const command = onlyMesh(queue);
    expect(command.depthBias).toBeGreaterThan(0);
    expect(classifyMesh3DCommands(queue.commands).opaque).toHaveLength(1);
  });

  it('Given a static groundDecal loc When rendered Then it emits a depth-biased mesh command', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const staticSpec: SceneObjectSpec<SceneObjectLocData> = {
      ...makeSpec({ classification: 'groundDecal', style: { depthBias: 0.0005 } }),
      data: {
        kind: 'loc',
        locId: 1001,
        modelType: LocModelType.FLOOR_DECORATION,
        rotation: 0,
        seqId: -1,
        localX: 1,
        localY: 1,
        level: 0,
        sizeX: 1,
        sizeY: 1,
        contouredGround: -1,
      },
    };

    const queue = renderOne(renderer, staticSpec);

    const command = onlyMesh(queue);
    // Un-contoured geometry is keyed by its loader inputs, not the spec, so placements share it.
    expect(command.meshId).toBe('scene-object-loc:1001:22:0:-1-frame-0-opaque');
    expect(command.depthBias).toBe(0.0005);
  });

  it('Given sceneMesh and aerial locs When rendered Then only explicit policy fields are applied', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const sceneMesh = onlyMesh(renderOne(renderer, makeSpec({ classification: 'sceneMesh' })));
    const aerial = onlyMesh(
      renderOne(renderer, makeSpec({ classification: 'aerial', style: { zOffset: 2, depth: 'none' } })),
    );

    expect(sceneMesh.depthBias).toBeUndefined();
    expect(aerial.depth).toBe('none');
    expect(aerial.modelMatrix[14]).toBe(2);
  });

  it('Given terrain heights When rendered Then the baked loc is anchored to terrain center height', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    renderer.setTerrainHeights(makeTerrainHeights(256));

    const command = onlyMesh(renderOne(renderer, makeSpec({ classification: 'sceneMesh' })));

    expect(command.modelMatrix[12]).toBe(1.5);
    expect(command.modelMatrix[13]).toBe(1.5);
    expect(command.modelMatrix[14]).toBe(-2);
  });

  it('Given an animated loc sequence When rendered Then opcode-16 offsets the model matrix', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    const baseLoad = loader.loadAnimatedLocMeshFrames;
    loader.loadAnimatedLocMeshFrames = (locId, modelType, rotation, seqId) => {
      const animated = baseLoad(locId, modelType, rotation, seqId);
      return animated ? { ...animated, seqType: makeSeqType([1], 32) } : undefined;
    };
    const renderer = new SceneObjectRenderer(loader);

    const command = onlyMesh(renderOne(renderer, makeSpec({ classification: 'sceneMesh' })));

    expect(command.modelMatrix[14]).toBeCloseTo(32 / 128);
  });

  it('Given unsupported animated frames When rendered Then static geometry keeps the signed sequence offset', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    loader.loadAnimatedLocMeshFrames = () => undefined;
    loader.loadSeqType = () => makeSeqType([1], -16);
    const renderer = new SceneObjectRenderer(loader);

    const command = onlyMesh(renderOne(renderer, makeSpec({ classification: 'sceneMesh' })));

    expect(command.modelMatrix[14]).toBeCloseTo(-16 / 128);
  });

  it('Given opaque and transparent frames with faceBias When rendered Then alpha split and faceBias are preserved', () => {
    const renderer = new SceneObjectRenderer(makeLoader(makeMixedFrames()));

    const opaque = onlyMesh(renderOne(renderer, makeSpec({ classification: 'sceneMesh' }), 0));
    // The loader's default seq gives each frame one CLIENT tick, so frame 1 is 1/30 of a game tick in.
    const transparent = onlyMesh(
      renderOne(renderer, makeSpec({ classification: 'sceneMesh' }), 0, 1 / CLIENT_TICKS_PER_GAME_TICK),
    );

    expect(opaque.meshId).toBe('scene-object-loc:1001:22:0:2002-frame-0-opaque');
    expect(Array.from(opaque.perVertexFaceBias ?? [])).toEqual([7, 7, 7]);
    expect(transparent.meshId).toBe('scene-object-loc:1001:22:0:2002-frame-1-transparent');
    expect(transparent.depth).toBe('read');
    expect(transparent.blend).toBe('normal');
    expect(Array.from(transparent.perVertexFaceBias ?? [])).toEqual([11, 11, 11]);
  });

  it('Given a non-identity spec modelMatrix When rendered Then it is applied after baked LOC placement', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = {
      ...makeSpec({ classification: 'sceneMesh' }),
      modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]),
    } satisfies SceneObjectSpec<SceneObjectLocData>;

    const command = onlyMesh(renderOne(renderer, spec));

    expect(command.modelMatrix[12]).toBe(3.5);
    expect(command.modelMatrix[13]).toBe(4.5);
    expect(command.modelMatrix[14]).toBe(4);
  });

  it('Given a changed spec bakes no frame commands When synced Then stale cached commands are evicted', () => {
    const loader: CountingLoader = {
      ...makeLoader([makeFrame(1, 7)]),
      loadAnimatedLocMeshFrames(locId, modelType, rotation, seqId) {
        if (seqId === 9999) {
          return undefined;
        }
        return makeLoader([makeFrame(1, 7)]).loadAnimatedLocMeshFrames(locId, modelType, rotation, seqId);
      },
    };
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec({ classification: 'sceneMesh' });

    expect(renderOne(renderer, spec).commands).toHaveLength(1);

    const data = spec.data;
    if (!data) {
      throw new Error('Expected loc spec data');
    }

    const invalidSpec = {
      ...spec,
      data: { ...data, seqId: 9999 },
    } satisfies SceneObjectSpec<SceneObjectLocData>;
    const queue = createQueue();
    renderer.sync([invalidSpec], 1);
    renderer.render(queue, 1, 1);

    expect(queue.commands).toHaveLength(0);
  });

  it('Given non-uniform sequence frame durations When rendering over client ticks Then duration-aware frame selection is used', () => {
    const frames = [makeFrame(1, 7), makeFrame(1, 11), makeFrame(1, 13)];
    const loader = makeLoader(frames);
    const baseLoad = loader.loadAnimatedLocMeshFrames;
    loader.loadAnimatedLocMeshFrames = (locId, modelType, rotation, seqId) => {
      const baked = baseLoad(locId, modelType, rotation, seqId);
      return baked ? { ...baked, seqType: makeSeqType([2, 5, 1]) } : undefined;
    };
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec({ classification: 'sceneMesh' });

    // Frame lengths are client ticks, so this whole 8-client-tick sequence plays out inside the
    // first game tick. Sampling it needs the interpolated tick, in 1/30ths.
    const clientTick = (n: number) => renderOne(renderer, spec, 0, n / CLIENT_TICKS_PER_GAME_TICK);

    expect(onlyMesh(clientTick(0)).meshId).toContain('frame-0');
    expect(onlyMesh(clientTick(2)).meshId).toContain('frame-1');
    expect(onlyMesh(clientTick(6)).meshId).toContain('frame-1');
    expect(onlyMesh(clientTick(7)).meshId).toContain('frame-2');
  });

  it('Given a whole game tick of playback When rendered Then the sequence has advanced 30 client ticks', () => {
    const frames = [makeFrame(1, 7), makeFrame(1, 11), makeFrame(1, 13)];
    const loader = makeLoader(frames);
    const baseLoad = loader.loadAnimatedLocMeshFrames;
    loader.loadAnimatedLocMeshFrames = (locId, modelType, rotation, seqId) => {
      const baked = baseLoad(locId, modelType, rotation, seqId);
      // 45 client ticks total: longer than one game tick, shorter than two.
      return baked ? { ...baked, seqType: makeSeqType([20, 20, 5]) } : undefined;
    };
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec({ classification: 'sceneMesh' });

    // One elapsed game tick is 30 client ticks in, which is frame 1, not frame 0.
    // Reading elapsed game ticks as client ticks would put tick 1 back on frame 0.
    expect(onlyMesh(renderOne(renderer, spec, 0)).meshId).toContain('frame-0');
    expect(onlyMesh(renderOne(renderer, spec, 1)).meshId).toContain('frame-1');
    // Frame 2 spans client ticks 40-44, which no whole game tick lands on — only the interpolated
    // tick reaches it.
    expect(onlyMesh(renderOne(renderer, spec, 1, 1.4)).meshId).toContain('frame-2');
  });

  it('Given unchanged specs When sync repeats Then loc frames are not rebaked', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec({ classification: 'groundDecal' });

    renderOne(renderer, spec);
    renderOne(renderer, spec);

    expect(loader.bakeCount).toBe(1);
  });

  it('Given a synced object When it disappears Then commands and lifecycle state are removed', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = makeSpec({ classification: 'groundDecal' });

    expect(renderOne(renderer, spec).commands).toHaveLength(1);
    const queue = createQueue();
    renderer.sync([], 1);
    renderer.render(queue, 1, 1);

    expect(queue.commands).toHaveLength(0);
  });

  it('Given a hidden LOC id When rendered Then the object is left out but stays baked to show again', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec({ classification: 'groundDecal' });
    const render = (hidden?: ReadonlySet<number>) => {
      const queue = createQueue();
      renderer.sync([spec], 0);
      renderer.render(queue, 0, 0, hidden);
      return queue.commands.length;
    };

    expect([render(), render(new Set([1001])), render(new Set([5])), render()]).toEqual([1, 0, 1, 1]);
    expect(loader.bakeCount).toBe(1);
  });

  it('Given synced LOCs When asked for some ids Then it reports their tiles, footprint turned with the LOC', () => {
    const frame = makeFrame(1, 7);
    const renderer = new SceneObjectRenderer({
      loadLocMesh: (locId, _modelType, _rotation, worldX, worldY, worldZ) => ({
        locId,
        mesh: frame.mesh,
        hslColors: frame.hslColors,
        alphas: frame.alphas,
        worldX,
        worldY,
        worldZ,
        sizeX: 1,
        sizeY: 1,
      }),
      loadAnimatedLocMeshFrames: () => undefined,
      loadLocType: () => ({ sizeX: 2, sizeY: 3, contouredGround: -1 }),
    });
    const pillar = (
      id: string,
      locId: number,
      rotation: number,
      localX: number,
    ): SceneObjectSpec<SceneObjectLocData> => ({
      ...makeSpec(),
      id,
      meshId: id,
      data: { kind: 'loc', locId, modelType: LocModelType.NORMAL, rotation, seqId: -1, localX, localY: 4 },
    });
    renderer.sync([pillar('a', 7, 1, 10), pillar('b', 8, 0, 20), pillar('c', 7, 0, 30)], 0);

    expect(renderer.getLocFootprints(new Set([7]))).toEqual([
      { locId: 7, x: 10, y: 4, sizeX: 3, sizeY: 2 },
      { locId: 7, x: 30, y: 4, sizeX: 2, sizeY: 3 },
    ]);
  });

  it('Given an expired one-shot object When rendered Then it is omitted after duration', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = makeSpec({ lifecycle: { kind: 'oneShot', startTick: 5, durationTicks: 2 } });

    expect(renderOne(renderer, spec, 6).commands).toHaveLength(1);
    const queue = createQueue();
    renderer.sync([spec], 7);
    renderer.render(queue, 7, 7);

    expect(queue.commands).toHaveLength(0);
  });
});

describe('SceneObjectRenderer opacity', () => {
  it('Given an opacity style When rendered Then every face is faded into the transparent pass under its own mesh id', () => {
    const renderer = new SceneObjectRenderer(makeLoader(makeMixedFrames()));
    const faded = makeSpec({ style: { depthBias: 0.0005, opacity: 0.5 } });

    const opaqueFrame = onlyMesh(renderOne(renderer, faded, 0));
    const translucentFrame = onlyMesh(renderOne(renderer, faded, 0, 1 / CLIENT_TICKS_PER_GAME_TICK));

    expect(opaqueFrame.meshId).toBe('scene-object-loc:1001:22:0:2002:opacity-0.5-frame-0-transparent');
    expect(Array.from(opaqueFrame.perVertexAlphas ?? [])).toEqual([0.5, 0.5, 0.5]);
    expect(Array.from(translucentFrame.perVertexAlphas ?? [])).toEqual([0.125, 0.125, 0.125]);
    for (const command of [opaqueFrame, translucentFrame]) {
      expect(command.depth).toBe('read');
      expect(command.blend).toBe('normal');
      expect(command.depthBias).toBe(0.0005);
      expect(classifyMesh3DCommands([command]).transparent).toEqual([command]);
    }
  });

  it('Given opacity 1 or none When rendered Then the bake and mesh ids are the unfaded ones', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));

    const plain = onlyMesh(renderOne(renderer, makeSpec()));
    const full = onlyMesh(renderOne(renderer, makeSpec({ style: { opacity: 1 } })));

    expect(full.meshId).toBe('scene-object-loc:1001:22:0:2002-frame-0-opaque');
    expect(full.meshId).toBe(plain.meshId);
    expect(full.perVertexAlphas).toBe(plain.perVertexAlphas);
  });

  it('Given a spec whose opacity changes When synced Then it re-bakes with the new alphas', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    const renderer = new SceneObjectRenderer(loader);

    renderOne(renderer, makeSpec({ style: { opacity: 0.5 } }));
    const changed = onlyMesh(renderOne(renderer, makeSpec({ style: { opacity: 0.25 } })));

    expect(loader.bakeCount).toBe(2);
    expect(changed.meshId).toContain(':opacity-0.25-');
    expect(Array.from(changed.perVertexAlphas ?? [])).toEqual([0.25, 0.25, 0.25]);
  });

  it('Given a contoured faded LOC When baked per placement Then its spec mesh id carries the opacity', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    loader.loadLocType = () => ({ sizeX: 1, sizeY: 1, contouredGround: 0 });
    const renderer = new SceneObjectRenderer(loader);
    renderer.setTerrainHeights(makeTerrainHeights(0));
    const spec = makeSpec({ style: { opacity: 0.5 } });
    const contoured = { ...spec, data: spec.data && { ...spec.data, contouredGround: 0 } };

    expect(onlyMesh(renderOne(renderer, contoured)).meshId).toBe('runtime-loc-mesh:opacity-0.5-frame-0-transparent');
  });
});

describe('SceneObjectRenderer timeline discontinuity', () => {
  it('PERF: re-anchoring keeps the baked geometry instead of re-baking it', () => {
    const loader = makeLoader();
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec();
    renderer.setTerrainHeights(makeTerrainHeights(0));
    renderOne(renderer, spec, 0);
    expect(loader.bakeCount).toBe(1);

    // A scrub fires one discontinuity per displayed tick. Re-baking every scene
    // object on each of them measured at 205ms p99 and ate 89% of the frame.
    for (let tick = 1; tick <= 20; tick++) {
      renderer.resetTimeline();
      renderOne(renderer, spec, tick);
    }

    expect(loader.bakeCount).toBe(1);
  });

  it('re-anchors the animation to the seeked tick', () => {
    const loader = makeLoader();
    const baseLoad = loader.loadAnimatedLocMeshFrames;
    // Two 4-client-tick frames. The 8-tick period deliberately does not divide the 30 client
    // ticks in a game tick, so a stale startTick lands on a different frame than a re-anchored
    // one — with 1-tick frames every whole game tick lands on frame 0 and the test proves nothing.
    loader.loadAnimatedLocMeshFrames = (locId, modelType, rotation, seqId) => {
      const baked = baseLoad(locId, modelType, rotation, seqId);
      return baked ? { ...baked, seqType: makeSeqType([4, 4]) } : undefined;
    };
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec();
    renderer.setTerrainHeights(makeTerrainHeights(0));

    const frameAt = (tick: number) => onlyMesh(renderOne(renderer, spec, tick)).perVertexFaceBias?.[0];
    const atStart = frameAt(0);
    expect(frameAt(1)).not.toBe(atStart);

    // Seeking back to the start must show the start frame again, not continue
    // counting from the original startTick.
    renderer.resetTimeline();
    expect(frameAt(2)).toBe(atStart);
  });

  it('honors an explicit animation start tick on first bake and across a seek, without re-baking', () => {
    const loader = makeLoader();
    const baseLoad = loader.loadAnimatedLocMeshFrames;
    loader.loadAnimatedLocMeshFrames = (locId, modelType, rotation, seqId) => {
      const baked = baseLoad(locId, modelType, rotation, seqId);
      // Frame 0 covers client ticks 0-29 (the first game tick), frame 1 the rest.
      return baked ? { ...baked, seqType: makeSeqType([30, 30]) } : undefined;
    };
    const base = makeSpec();
    if (!base.data) throw new Error('Expected loc spec data');
    const spec = {
      ...base,
      data: { ...base.data, animationStartTick: 10 },
    } satisfies SceneObjectSpec<SceneObjectLocData>;
    const renderer = new SceneObjectRenderer(loader);
    const frameAt = (tick: number) => onlyMesh(renderOne(renderer, spec, tick)).perVertexFaceBias?.[0];

    // First seen one tick after it started: already on frame 1, not restarted.
    expect(frameAt(11)).toBe(11);
    renderer.resetTimeline();
    expect(frameAt(10)).toBe(7);
    renderer.resetTimeline();
    expect(frameAt(11)).toBe(11);
    expect(loader.bakeCount).toBe(1);
  });

  it('still drops everything on a real scene change', () => {
    const loader = makeLoader();
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec();
    renderer.setTerrainHeights(makeTerrainHeights(0));
    renderOne(renderer, spec, 0);

    renderer.clear();
    renderOne(renderer, spec, 0);

    expect(loader.bakeCount).toBe(2);
  });

  describe('transform locs', () => {
    // 900 is a 3x3 transform loc on some var: 0-1 show 901, 2 shows 902 (animated), anything else
    // falls to the default -1. The shown locs are 1x1, as cache transform targets often are.
    const locTypes: Record<number, { sizeX: number; sizeY: number; seqId?: number; transforms?: number[] }> = {
      900: { sizeX: 3, sizeY: 3, transforms: [901, 901, 902, -1] },
      901: { sizeX: 1, sizeY: 1, seqId: -1 },
      902: { sizeX: 1, sizeY: 1, seqId: 2002 },
    };

    function transformLoader() {
      const drawn: { locId: number; seqId?: number }[] = [];
      const frame = makeFrame(1, 7);
      const loader: SceneObjectLocModelLoader = {
        loadLocType: (locId) => locTypes[locId],
        loadLocMesh(locId, _modelType, _rotation, worldX, worldY, worldZ) {
          drawn.push({ locId });
          return { locId, ...frame, worldX, worldY, worldZ, sizeX: 1, sizeY: 1 };
        },
        loadAnimatedLocMeshFrames(locId, _modelType, _rotation, seqId) {
          drawn.push({ locId, seqId });
          return { frames: [frame], seqType: makeSeqType([1]) };
        },
      };
      return { loader, drawn };
    }

    function transformSpec(transformValue?: number): SceneObjectSpec<SceneObjectLocData> {
      return {
        ...makeSpec({ classification: 'sceneMesh' }),
        data: {
          kind: 'loc',
          locId: 900,
          modelType: LocModelType.NORMAL,
          rotation: 0,
          seqId: -1,
          localX: 1,
          localY: 1,
          ...(transformValue === undefined ? {} : { transformValue }),
        },
      };
    }

    it('draws the loc its var value selects on the transform loc footprint, taking that loc seq', () => {
      const { loader, drawn } = transformLoader();
      const renderer = new SceneObjectRenderer(loader);

      // Unset var: transform 0. The 3x3 footprint centers the model on (1 + 1.5, 1 + 1.5).
      const unset = onlyMesh(renderOne(renderer, transformSpec()));
      expect(drawn).toEqual([{ locId: 901 }]);
      expect([unset.modelMatrix[12], unset.modelMatrix[13]]).toEqual([2.5, 2.5]);

      onlyMesh(renderOne(renderer, transformSpec(1)));
      expect(drawn).toHaveLength(1);
      onlyMesh(renderOne(renderer, transformSpec(2)));
      expect(drawn.at(-1)).toEqual({ locId: 902, seqId: 2002 });
    });

    it('draws nothing where the transform shows no loc, including out-of-range values', () => {
      const { loader, drawn } = transformLoader();
      const renderer = new SceneObjectRenderer(loader);

      expect(renderOne(renderer, transformSpec(3)).commands).toEqual([]);
      expect(renderOne(renderer, transformSpec(40)).commands).toEqual([]);
      expect(renderOne(renderer, transformSpec(-1)).commands).toEqual([]);
      expect(drawn).toEqual([]);
      // The shared mesh id is keyed by the drawn loc, so 901 rather than the 900 transform loc.
      expect(onlyMesh(renderOne(renderer, transformSpec(0))).meshId).toBe(
        'scene-object-loc:901:10:0:-1-frame-0-opaque',
      );
      expect(drawn).toEqual([{ locId: 901 }]);
    });
  });
});

describe('SceneObjectRenderer per-frame reuse', () => {
  /** What a renderer that has never drawn `spec` queues for it. */
  function freshCommand(spec: SceneObjectSpec<SceneObjectLocData>, heights?: Int32Array[]): NpcMesh3DCommand {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    if (heights) renderer.setTerrainHeights(heights);
    return onlyMesh(renderOne(renderer, spec));
  }

  it('PERF: Given unchanged specs When later frames draw the same sequence frame Then its commands are queued again, not copied', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = makeSpec({ classification: 'groundDecal', style: { zOffset: 0.5, blend: 'additive' } });

    const first = onlyMesh(renderOne(renderer, spec, 0));
    const later = onlyMesh(renderOne(renderer, spec, 3, 3.5));

    expect(later).toBe(first);
    expect(later).toEqual(freshCommand(spec));
  });

  it('Given a replaced spec When its policy inputs are unchanged Then the commands are reused, and When one changes Then they are rebuilt', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = makeSpec({ classification: 'sceneMesh', style: { depth: 'read' } });
    const first = onlyMesh(renderOne(renderer, spec));

    // A controller that builds its specs every frame: new objects, same values.
    const sameValues = { ...spec, modelMatrix: identityMatrix(), style: { depth: 'read' as const } };
    expect(onlyMesh(renderOne(renderer, sameValues))).toBe(first);

    const changes: SceneObjectSpec<SceneObjectLocData>[] = [
      { ...spec, materialId: 'other-material' },
      { ...spec, style: { depth: 'none' } },
      { ...spec, style: { depth: 'read', blend: 'additive' } },
      { ...spec, style: { depth: 'read', cullFace: 'none' } },
      { ...spec, style: { depth: 'read', zOffset: 1 } },
      { ...spec, style: { depth: 'read', depthBias: 0.002 } },
      { ...spec, classification: 'aerial' },
      { ...spec, modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]) },
    ];
    let previous = first;
    for (const changed of changes) {
      const command = onlyMesh(renderOne(renderer, changed));
      expect(command).not.toBe(previous);
      expect(command).toEqual(freshCommand(changed));
      previous = command;
    }
  });

  it('Given a spec matrix edited in place When rendered again Then the command follows the edit', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = makeSpec({ classification: 'sceneMesh' });
    expect(onlyMesh(renderOne(renderer, spec)).modelMatrix[12]).toBe(1.5);

    spec.modelMatrix[12] = 2;

    expect(onlyMesh(renderOne(renderer, spec)).modelMatrix[12]).toBe(3.5);
  });

  it('Given uniforms When rendered on later frames Then every frame copies them, following arrays edited in place', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const tint = [1, 2, 3];
    const spec = makeSpec({ classification: 'sceneMesh', style: { uniforms: { u_tint: tint } } });

    const first = onlyMesh(renderOne(renderer, spec));
    tint[0] = 9;
    const later = onlyMesh(renderOne(renderer, spec));

    expect(first.uniforms).toEqual({ u_tint: [1, 2, 3] });
    expect(later.uniforms).toEqual({ u_tint: [9, 2, 3] });
    expect(later.uniforms?.u_tint).not.toBe(tint);
  });

  it('Given terrain heights change under the same spec When rendered Then the object is placed at the new height', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const spec = makeSpec({ classification: 'sceneMesh' });
    renderer.setTerrainHeights(makeTerrainHeights(0));
    renderOne(renderer, spec);

    const raised = makeTerrainHeights(256);
    renderer.setTerrainHeights(raised);
    const command = onlyMesh(renderOne(renderer, spec));

    expect(command.modelMatrix[14]).toBe(-2);
    expect(command).toEqual(freshCommand(spec, raised));
  });

  it('Given two placements in one frame Then each keeps its own command and matrix', () => {
    const renderer = new SceneObjectRenderer(makeLoader([makeFrame(1, 7)]));
    const west = makeSpec({ classification: 'sceneMesh' });
    const east = {
      ...makeSpec({ classification: 'sceneMesh' }),
      id: 'runtime-loc-east',
      modelMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1]),
    } satisfies SceneObjectSpec<SceneObjectLocData>;

    for (let tick = 0; tick < 2; tick++) {
      const queue = createQueue();
      renderer.sync([west, east], tick);
      renderer.render(queue, tick, tick);
      const [first, second] = queue.commands.filter(isNpcMeshCommand);

      expect(first?.modelMatrix).not.toBe(second?.modelMatrix);
      expect([first?.modelMatrix[12], second?.modelMatrix[12]]).toEqual([1.5, 3.5]);
    }
  });

  it('Given an object leaves and returns When rendered Then it draws from a new bake', () => {
    const loader = makeLoader([makeFrame(1, 7)]);
    const renderer = new SceneObjectRenderer(loader);
    const spec = makeSpec({ classification: 'sceneMesh' });
    const first = onlyMesh(renderOne(renderer, spec, 0));

    renderer.sync([], 1);
    const returned = onlyMesh(renderOne(renderer, spec, 2));

    expect(returned).not.toBe(first);
    expect(returned).toEqual(first);
    expect(loader.bakeCount).toBe(2);
  });

  it('Given a sequence looping its last frames When played past its end Then the loop frames repeat and a non-looping one holds its last frame', () => {
    const frames = [makeFrame(1, 7), makeFrame(1, 11), makeFrame(1, 13)];
    const frameAt = (frameStep: number, clientTick: number) => {
      const loader = makeLoader(frames);
      const baseLoad = loader.loadAnimatedLocMeshFrames;
      loader.loadAnimatedLocMeshFrames = (locId, modelType, rotation, seqId) => {
        const baked = baseLoad(locId, modelType, rotation, seqId);
        return baked ? { ...baked, seqType: { ...makeSeqType([2, 5, 1]), frameStep } as SeqType } : undefined;
      };
      const renderer = new SceneObjectRenderer(loader);
      return onlyMesh(renderOne(renderer, makeSpec(), 0, clientTick / CLIENT_TICKS_PER_GAME_TICK))
        .perVertexFaceBias?.[0];
    };

    // The 8-client-tick sequence loops its last two frames (5 + 1 client ticks) once played through.
    expect([7, 8, 12, 13, 14, 19, 20].map((tick) => frameAt(2, tick))).toEqual([13, 11, 11, 13, 11, 13, 11]);
    expect([0, 7, 8, 29].map((tick) => frameAt(-1, tick))).toEqual([7, 13, 13, 13]);
  });
});

describe('SceneObjectRenderer shared geometry', () => {
  /**
   * Generic multi-placement fixture: any LOC, type, rotation and sequence. The baked vertices depend
   * on every loader input so a wrongly shared bake would show up as the wrong geometry.
   */
  function makePlacementLoader(contouredGround = -1) {
    const loads: string[] = [];
    const frame = (locId: number, rotation: number, seqId: number, index: number): LocMeshData => {
      const lift = locId + rotation * 10 + seqId + index;
      return {
        mesh: {
          positions: new Float32Array([-64, -lift, -64, 64, -lift, -64, -64, -lift, 64, 64, 0, 64, 0, 0, 0, 32, 0, 0]),
          normals: new Float32Array(18),
        },
        hslColors: new Float32Array([1, 1, 1, 2, 2, 2]),
        alphas: new Float32Array([1, 1, 1, 0.5, 0.5, 0.5]),
        hasTransparency: true,
      };
    };
    const loader: SceneObjectLocModelLoader = {
      loadLocMesh(locId, _modelType, rotation, worldX, worldY, worldZ) {
        loads.push(`static:${locId}:${rotation}`);
        const { mesh, hslColors, alphas } = frame(locId, rotation, 0, 0);
        return { locId, mesh, hslColors, alphas, worldX, worldY, worldZ, sizeX: 1, sizeY: 1 };
      },
      loadAnimatedLocMeshFrames(locId, _modelType, rotation, seqId) {
        loads.push(`animated:${locId}:${rotation}:${seqId}`);
        return {
          frames: [0, 1, 2].map((index) => frame(locId, rotation, seqId, index)),
          seqType: makeSeqType([2, 2, 2], 16),
        };
      },
      loadLocType: () => ({ sizeX: 1, sizeY: 1, contouredGround, seqId: 3003 }),
    };
    return { loader, loads };
  }

  function placementSpec(
    id: string,
    data: Partial<SceneObjectLocData> = {},
    lifecycle: SceneObjectSpec['lifecycle'] = { kind: 'sync' },
  ): SceneObjectSpec<SceneObjectLocData> {
    return {
      id,
      meshId: id,
      materialId: 'osrs-npc',
      modelMatrix: identityMatrix(),
      lifecycle,
      classification: 'sceneMesh',
      data: {
        kind: 'loc',
        locId: 7,
        modelType: LocModelType.NORMAL,
        rotation: 0,
        seqId: -1,
        localX: 1,
        localY: 1,
        ...data,
      },
    };
  }

  function sharedGeometryCount(renderer: SceneObjectRenderer): number {
    return renderer['sharedGeometry'].size;
  }

  function meshCommands(queue: RenderQueue): NpcMesh3DCommand[] {
    return queue.commands.filter(isNpcMeshCommand);
  }

  function renderAll(
    renderer: SceneObjectRenderer,
    specs: readonly SceneObjectSpec<SceneObjectLocData>[],
    tick = 0,
    interpolatedTick = tick,
  ): NpcMesh3DCommand[] {
    const queue = createQueue();
    renderer.sync(specs, tick);
    renderer.render(queue, tick, interpolatedTick);
    return meshCommands(queue);
  }

  function worldVertices(command: NpcMesh3DCommand): number[] {
    const m = command.modelMatrix;
    const out: number[] = [];
    for (let i = 0; i < command.positions.length; i += 3) {
      const [x, y, z] = [command.positions[i] ?? 0, command.positions[i + 1] ?? 0, command.positions[i + 2] ?? 0];
      out.push(
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      );
    }
    return out;
  }

  it('Given many placements of one un-contoured LOC When synced Then they bake once and share mesh ids and arrays', () => {
    const { loader, loads } = makePlacementLoader();
    const renderer = new SceneObjectRenderer(loader);
    const specs = [0, 1, 2, 3].map((x) => placementSpec(`warrior-${x}`, { localX: x, rotation: 1 }));

    const commands = renderAll(renderer, specs);

    expect(loads).toEqual(['animated:7:1:3003']);
    expect(sharedGeometryCount(renderer)).toBe(1);
    expect(new Set(commands.map((command) => command.meshId))).toEqual(
      new Set(['scene-object-loc:7:10:1:3003-frame-0-opaque', 'scene-object-loc:7:10:1:3003-frame-0-transparent']),
    );
    const opaque = commands.filter((command) => command.meshId.endsWith('-opaque'));
    expect(opaque).toHaveLength(4);
    expect(new Set(opaque.map((command) => command.positions)).size).toBe(1);
    expect(new Set(opaque.map((command) => command.modelMatrix[12]))).toEqual(new Set([0.5, 1.5, 2.5, 3.5]));
  });

  it('Given placements whose loader inputs differ When synced Then each distinct input gets its own geometry', () => {
    const { loader, loads } = makePlacementLoader();
    const renderer = new SceneObjectRenderer(loader);
    const specs = [
      placementSpec('a', { rotation: 0 }),
      placementSpec('b', { rotation: 1 }),
      placementSpec('c', { rotation: 1, seqId: 4004 }),
      placementSpec('d', { rotation: 1, locId: 8 }),
      placementSpec('e', { rotation: 1, modelType: LocModelType.FLOOR_DECORATION }),
      placementSpec('f', { rotation: 1, localX: 5 }),
    ];

    const opaqueIds = renderAll(renderer, specs)
      .filter((command) => command.meshId.endsWith('-opaque'))
      .map((command) => command.meshId);

    expect(loads).toEqual([
      'animated:7:0:3003',
      'animated:7:1:3003',
      'animated:7:1:4004',
      'animated:8:1:3003',
      'animated:7:1:3003',
    ]);
    expect(new Set(opaqueIds).size).toBe(5);
    expect(opaqueIds[5]).toBe(opaqueIds[1]);
  });

  it('Given contoured placements When synced Then geometry stays per placement under the spec mesh id', () => {
    const { loader, loads } = makePlacementLoader(0);
    const renderer = new SceneObjectRenderer(loader);
    renderer.setTerrainHeights(makeTerrainHeights(64));

    const commands = renderAll(renderer, [placementSpec('left', { localX: 1 }), placementSpec('right', { localX: 2 })]);

    expect(loads).toHaveLength(2);
    expect(sharedGeometryCount(renderer)).toBe(0);
    expect(commands.map((command) => command.meshId)).toEqual([
      'left-frame-0-opaque',
      'left-frame-0-transparent',
      'right-frame-0-opaque',
      'right-frame-0-transparent',
    ]);
  });

  it('Given shared placements When rendered Then world-space vertices match the per-placement bake', () => {
    const { loader } = makePlacementLoader();
    const renderer = new SceneObjectRenderer(loader);
    const terrain = makeTerrainHeights(0);
    terrain[2]?.fill(-96);
    renderer.setTerrainHeights(terrain);
    const specs = [0, 1, 2, 3].flatMap((rotation) =>
      [1, 2].map((localX) => placementSpec(`p-${rotation}-${localX}`, { rotation, localX, localY: 2 })),
    );

    // Frame 1 of the 2-client-tick frames, so placement and frame selection are both exercised.
    const shared = renderAll(renderer, specs, 0, 2 / CLIENT_TICKS_PER_GAME_TICK);

    const expected = specs.flatMap((spec) => {
      const data = spec.data;
      if (!data) throw new Error('Expected loc spec data');
      const animated = loader.loadAnimatedLocMeshFrames(data.locId, data.modelType, data.rotation, 3003);
      const placement = resolveLocPlacement({
        type: data.modelType,
        rotation: normalizeCardinalRotation(data.rotation),
        sizeX: 1,
        sizeY: 1,
        boundaryDisplacement: DEFAULT_BOUNDARY_DISPLACEMENT,
      });
      const geometry = bakeLocFrameGeometry({ frames: animated?.frames ?? [], locKey: spec.meshId });
      const modelMatrix = buildLocModelMatrix({
        placement,
        localX: data.localX,
        localY: data.localY,
        terrainLocalX: data.localX,
        terrainLocalY: data.localY,
        terrainHeights: terrain,
        animationHeightOffset: 16,
      });
      return placeLocFrameGeometry(geometry, { modelMatrix, zIndex: 0 })[1] ?? [];
    });
    expect(shared.map(worldVertices)).toEqual(expected.map(worldVertices));
    expect(shared.map((command) => command.meshId.replace(/^.*-frame-/, ''))).toEqual(
      expected.map((command) => command.meshId.replace(/^.*-frame-/, '')),
    );
  });

  it('Given static placements When synced Then the static model is shared too', () => {
    const { loader, loads } = makePlacementLoader();
    loader.loadLocType = () => ({ sizeX: 1, sizeY: 1, contouredGround: -1 });
    const renderer = new SceneObjectRenderer(loader);

    const commands = renderAll(renderer, [placementSpec('a', { localX: 1 }), placementSpec('b', { localX: 2 })]);

    expect(loads).toEqual(['static:7:0']);
    expect(new Set(commands.map((command) => command.meshId))).toEqual(
      new Set(['scene-object-loc:7:10:0:-1-frame-0-opaque', 'scene-object-loc:7:10:0:-1-frame-0-transparent']),
    );
  });

  it('Given a placement switches sequence under the same spec meshId When re-baked Then its frames get new mesh ids', () => {
    // Per-spec ids alone would keep the GPU meshes uploaded for the previous sequence's frames.
    const { loader } = makePlacementLoader();
    const renderer = new SceneObjectRenderer(loader);

    const idle = renderAll(renderer, [placementSpec('pool')], 0).map((command) => command.meshId);
    const despawn = renderAll(renderer, [placementSpec('pool', { seqId: 4004 })], 1).map((command) => command.meshId);

    expect(despawn.some((meshId) => idle.includes(meshId))).toBe(false);
  });

  it('Given placements leave the scene When synced or cleared Then shared geometry is released', () => {
    const { loader, loads } = makePlacementLoader();
    const renderer = new SceneObjectRenderer(loader);
    const a = placementSpec('a', { localX: 1 });
    const b = placementSpec('b', { localX: 2 });
    const rotated = placementSpec('r', { rotation: 2 });
    const oneShot = placementSpec('o', { rotation: 3 }, { kind: 'oneShot', startTick: 0, durationTicks: 1 });

    renderAll(renderer, [a, b, rotated, oneShot], 0);
    expect(sharedGeometryCount(renderer)).toBe(3);

    // One placement leaving keeps the geometry the other still draws; the expired one-shot and the
    // last user of a rotation free theirs.
    renderAll(renderer, [a], 1);
    expect(sharedGeometryCount(renderer)).toBe(1);
    renderAll(renderer, [a, b], 2);
    expect(loads).toEqual(['animated:7:0:3003', 'animated:7:2:3003', 'animated:7:3:3003']);

    // A spec whose bake inputs change drops the geometry it no longer uses.
    renderAll(renderer, [placementSpec('a', { localX: 1, rotation: 1 })], 3);
    expect(sharedGeometryCount(renderer)).toBe(1);

    renderer.clear();
    expect(sharedGeometryCount(renderer)).toBe(0);
    renderAll(renderer, [a], 4);
    expect(loads.filter((load) => load === 'animated:7:0:3003')).toHaveLength(2);
  });
});
