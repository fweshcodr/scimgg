// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPicoGLRenderer } from '../../render/backends/picogl/PicoGLRenderer';
import { createNullAssetManager, type Renderer } from '../../render/core/renderer';
import { ModelData } from '../../rs/model/ModelData';
import { animationFrames } from '../../util/animationFrames';
import { ModelPreview } from '../ModelPreview';

vi.mock('../../render/backends/picogl/PicoGLRenderer', () => ({ createPicoGLRenderer: vi.fn() }));

const nativeFrames = new Map<number, FrameRequestCallback>();
let nextId = 0;
const renderer: Renderer = {
  id: 'preview-test',
  supports: () => true,
  init: vi.fn(),
  resize: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  assets: createNullAssetManager(),
};

function mountPreview() {
  const model = new ModelData();
  model.verticesCount = 3;
  model.usedVertexCount = 3;
  model.faceCount = 1;
  model.verticesX = new Int32Array([0, 100, 50]);
  model.verticesY = new Int32Array([0, 0, -100]);
  model.verticesZ = new Int32Array([0, 0, 100]);
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([0x7f]);
  return render(<ModelPreview modelId={1} modelLoader={{ getModel: () => model }} />);
}

function frameAt(time: number): void {
  act(() => {
    for (const [id, callback] of [...nativeFrames]) {
      if (nativeFrames.delete(id)) callback(time);
    }
  });
}

function lastModelMatrix() {
  const command = vi.mocked(renderer.render).mock.lastCall?.[0].queue.commands[0];
  if (command?.kind !== 'mesh3d') throw new Error('Preview mesh missing');
  return command.modelMatrix;
}

beforeEach(() => {
  vi.mocked(createPicoGLRenderer).mockReturnValue(renderer);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextId;
      nativeFrames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => nativeFrames.delete(id)),
  );
});

afterEach(() => {
  cleanup();
  animationFrames.setSuspended(false);
  expect(nativeFrames.size).toBe(0);
  nativeFrames.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ModelPreview background suspension', () => {
  it('stops GPU submissions and preserves the explicit rotation pause through resume', () => {
    mountPreview();
    frameAt(100);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    frameAt(116);
    const matrix = lastModelMatrix();
    const draws = vi.mocked(renderer.render).mock.calls.length;
    const requests = vi.mocked(requestAnimationFrame).mock.calls.length;
    const queued = [...nativeFrames.values()][0];

    animationFrames.setSuspended(true);
    frameAt(60_000);
    act(() => queued?.(60_000));

    expect(nativeFrames.size).toBe(0);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(requests);
    expect(renderer.render).toHaveBeenCalledTimes(draws);
    animationFrames.setSuspended(false);
    frameAt(60_016);
    expect(renderer.render).toHaveBeenCalledTimes(draws + 1);
    expect(lastModelMatrix()).toEqual(matrix);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(renderer.init).toHaveBeenCalledOnce();
    expect(renderer.dispose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    frameAt(60_032);
    expect(lastModelMatrix()).not.toEqual(matrix);
  });

  it('defers initial and control-triggered draws while suspended', () => {
    animationFrames.setSuspended(true);

    mountPreview();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    frameAt(60_000);

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    animationFrames.setSuspended(false);
    frameAt(60_016);
    expect(renderer.render).toHaveBeenCalledOnce();
  });

  it.each([false, true])('cancels all work on unmount (suspended: %s)', (suspended) => {
    const view = mountPreview();
    frameAt(100);
    const queued = [...nativeFrames.values()][0];
    const draws = vi.mocked(renderer.render).mock.calls.length;
    animationFrames.setSuspended(suspended);

    view.unmount();
    animationFrames.setSuspended(false);
    act(() => queued?.(60_000));

    expect(nativeFrames.size).toBe(0);
    expect(renderer.render).toHaveBeenCalledTimes(draws);
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
