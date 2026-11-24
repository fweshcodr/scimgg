import { describe, expect, it } from 'vitest';
import type { RenderQueue } from '../../core/commands';
import { SpotAnimRenderer } from '../SpotAnimRenderer';
import { getOneShotDurationCycles, type OneShotSpotAnimRequest, updateOneShotSpotAnim } from '../spotAnimPlayback';

function fixture(frameLengths = [5, 10, 15, 30]) {
  const renderer = new SpotAnimRenderer();
  const part = {
    kind: 'mesh3d',
    meshId: 'static',
    materialId: 'osrs-npc',
    positions: new Float32Array(9),
    normals: new Float32Array(9),
    modelMatrix: new Float32Array(16),
    depth: 'readwrite',
  } as const;
  renderer['meshCache'].set(100, {
    static: [part],
    frames: frameLengths.map((_, frame) => [{ ...part, meshId: `frame-${frame}` }]),
    frameLengths,
    frameStep: -1,
    heightOffset: 128,
  });
  const request: OneShotSpotAnimRequest = {
    instanceId: 'graphic',
    spotAnimId: 100,
    startCycle: 300,
    transformSource: { kind: 'static', value: { position: [8.5, 9.5, 2], yaw2048: 512 } },
    style: { zIndex: 72, depthBias: 0.0005, cullFace: 'back', requireTransparentSort: true },
    heightOffsetMode: 'actor',
    fallbackDurationCycles: 90,
  };
  const render = (tick: number) => {
    renderer.tick(Math.floor(tick), tick);
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);
    return queue.commands.flatMap((command) =>
      command.kind === 'mesh3d'
        ? [
            {
              id: command.meshId,
              matrix: Array.from(command.modelMatrix),
              zIndex: command.zIndex,
              depthBias: command.depthBias,
              cullFace: command.cullFace,
            },
          ]
        : [],
    );
  };
  return { renderer, request, render };
}

describe('spotAnimPlayback', () => {
  it.each([
    { lengths: [5, 10, 15, 30], fallback: 90, expected: 60 },
    { lengths: [], fallback: 90, expected: 90 },
    { lengths: [0, 0], fallback: 90, expected: 90 },
    { lengths: [], fallback: 0, expected: 0 },
    { lengths: [0, 0], fallback: 0, expected: 0 },
  ])('keeps cache duration in client cycles with the explicit fallback: $lengths / $fallback', ({
    lengths,
    fallback,
    expected,
  }) => {
    const { renderer } = fixture(lengths);

    const duration = getOneShotDurationCycles(renderer, 100, fallback);

    expect(duration).toBe(expected);
  });

  it.each([0, 90])('returns fallback %s when cache lengths are unavailable', (fallback) => {
    const renderer = new SpotAnimRenderer();

    const duration = getOneShotDurationCycles(renderer, 100, fallback);

    expect(duration).toBe(fallback);
  });

  it.each([
    { tick: 9.999, status: 'pending', mesh: [] },
    { tick: 10, status: 'active', mesh: ['frame-0'] },
    { tick: 10.25, status: 'active', mesh: ['frame-1'] },
    { tick: 10.75, status: 'active', mesh: ['frame-2'] },
    { tick: 11.999, status: 'active', mesh: ['frame-3'] },
    { tick: 12, status: 'expired', mesh: [] },
  ])('renders cache frames only inside the delayed lifetime at $tick', ({ tick, status, mesh }) => {
    const { renderer, request, render } = fixture();

    const actual = updateOneShotSpotAnim(renderer, request, tick * 30);

    expect(actual).toBe(status);
    expect(render(tick).map((command) => command.id)).toEqual(mesh);
  });

  it.each([
    { tick: 9, spotAnimId: 100, status: 'pending' },
    { tick: 11, spotAnimId: 999, status: 'unloaded' },
    { tick: 12, spotAnimId: 100, status: 'expired' },
  ])('removes stale drawing when the request is $status', ({ tick, spotAnimId, status }) => {
    const { renderer, request, render } = fixture();
    renderer.spawn({
      instanceId: request.instanceId,
      spotAnimId: 100,
      transform: request.transformSource,
      lifecycle: { kind: 'manual' },
    });

    const actual = updateOneShotSpotAnim(renderer, { ...request, spotAnimId }, tick * 30);

    expect(actual).toBe(status);
    expect(render(tick)).toEqual([]);
  });

  it('reports an unavailable future asset as unloaded so adapters choose retention', () => {
    const { renderer, request, render } = fixture();

    const status = updateOneShotSpotAnim(renderer, { ...request, spotAnimId: 999 }, 9 * 30);

    expect(status).toBe('unloaded');
    expect(render(9)).toEqual([]);
  });

  it.each([9, 10])('drops loaded graphics with no duration even at tick %s', (tick) => {
    const { renderer, request, render } = fixture([]);

    const status = updateOneShotSpotAnim(renderer, { ...request, fallbackDurationCycles: 0 }, tick * 30);

    expect(status).toBe('expired');
    expect(render(tick)).toEqual([]);
  });

  it('gives empty-cache graphics the caller fallback without extending it on refresh', () => {
    const { renderer, request, render } = fixture([]);
    updateOneShotSpotAnim(renderer, request, 10 * 30);

    const status = updateOneShotSpotAnim(renderer, request, 12.9 * 30);

    expect(status).toBe('active');
    expect(render(12.9).map((command) => command.id)).toEqual(['static']);
    expect(render(13)).toEqual([]);
  });

  it('refreshes the transform without restarting renderer-owned progress or expiry', () => {
    const { renderer, request, render } = fixture();
    updateOneShotSpotAnim(renderer, request, 10.25 * 30);
    render(10.25);

    updateOneShotSpotAnim(
      renderer,
      { ...request, transformSource: { kind: 'static', value: { position: [12, 14, 3] } } },
      11.25 * 30,
    );

    const mesh = render(11.25)[0];
    expect(mesh?.id).toBe('frame-3');
    expect(mesh?.matrix.slice(12, 15)).toEqual([12, 14, 3]);
    expect(renderer['activeInstances'].get('graphic')?.frameProgress).toBeUndefined();
    expect(render(12)).toEqual([]);
  });

  it.each([
    'actor',
    'sequence',
  ] as const)('passes style, yaw and %s height mode through to real mesh commands', (heightOffsetMode) => {
    const { renderer, request, render } = fixture();

    updateOneShotSpotAnim(renderer, { ...request, heightOffsetMode }, 10 * 30);

    const mesh = render(10)[0];
    expect(mesh).toMatchObject({ zIndex: 72, depthBias: 0.0005, cullFace: 'back' });
    expect(mesh?.matrix.slice(12, 15)).toEqual([8.5, 9.5, heightOffsetMode === 'actor' ? 2 : 3]);
    expect(mesh?.matrix[1]).toBeCloseTo(-1 / 128);
  });

  it('resolves a live actor transform at rendering while a static tile stays anchored', () => {
    const { renderer, request, render } = fixture();
    let actorX = 10;
    updateOneShotSpotAnim(renderer, request, 10 * 30);
    updateOneShotSpotAnim(
      renderer,
      {
        ...request,
        instanceId: 'actor',
        transformSource: {
          kind: 'dynamic',
          resolve: () => ({ position: [actorX + 2, 7, 4] }),
        },
      },
      10 * 30,
    );
    actorX = 20;

    const meshes = render(10.5);

    expect(meshes.map((mesh) => mesh.matrix.slice(12, 15))).toEqual([
      [8.5, 9.5, 2],
      [22, 7, 4],
    ]);
  });
});
