// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as solver from '../layoutSolver';
import { createPanelLayoutStore, type PanelLayoutInput } from '../PanelSnapRegistry';

afterEach(() => vi.restoreAllMocks());

function setup(count: number) {
  const solve = vi.spyOn(solver, 'solvePanelLayout');
  const store = createPanelLayoutStore();
  const inputs: PanelLayoutInput[] = Array.from({ length: count }, (_, i) => ({
    name: `panel-${i}`,
    position: { x: 100 + i * 120, y: 100, anchorX: 'left', anchorY: 'top' },
    defaultPosition: { x: 0, y: 0, anchorX: 'left', anchorY: 'top' },
    width: 80,
    height: 60,
    baseWidth: 80,
    baseHeight: 60,
    scale: 1,
    viewport: { width: 4000, height: 2000 },
    ownerPositioned: false,
    replay: false,
    dragging: false,
    inset: 0,
  }));
  const reads = inputs.map((_, i) => vi.fn(() => inputs[i]));
  const paint = vi.fn();
  const prepare = vi.fn(() => paint);
  const remove = reads.map((read, i) => store.register(`panel-${i}`, read, prepare));
  store.commit();
  solve.mockClear();
  reads.forEach((read) => {
    read.mockClear();
  });
  paint.mockClear();
  prepare.mockClear();
  const tick = () =>
    inputs.forEach((_, i) => {
      store.update(`panel-${i}`);
      store.commit();
    });
  return { store, inputs, reads, prepare, paint, solve, remove, tick };
}

describe('layout input comparison and paint transactions', () => {
  it.each([10, 20])('reads %i unchanged registrations once each, with no solve or paint', (count) => {
    const { store, inputs, reads, solve, paint, prepare, tick } = setup(count);
    const published = store.getPositions();
    // React callers commonly recreate objects without changing their values.
    inputs.forEach((input, i) => {
      inputs[i] = {
        ...input,
        position: { ...input.position! },
        defaultPosition: { ...input.defaultPosition },
        viewport: { ...input.viewport },
      };
    });
    tick();
    for (const read of reads) expect(read).toHaveBeenCalledOnce();
    expect(solve).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(paint).not.toHaveBeenCalled();
    expect(store.getPositions()).toBe(published);
    // A clean commit itself does not even read an input.
    for (let i = 0; i < count; i++) store.commit();
    for (const read of reads) expect(read).toHaveBeenCalledOnce();
  });

  it('solves exactly once when one registration changes', () => {
    const { inputs, solve, paint, tick } = setup(20);
    inputs[19] = { ...inputs[19], width: 160, height: 120, scale: 2 };
    tick();
    expect(solve).toHaveBeenCalledOnce();
    expect(paint).toHaveBeenCalledTimes(20);
    expect(solve.mock.calls[0][0][19].width).toBe(160);
  });

  it('takes one complete snapshot when every sibling changes before its layout effect runs', () => {
    const { inputs, reads, solve, tick } = setup(20);
    inputs.forEach((input, i) => {
      inputs[i] = { ...input, width: 160, height: 120, scale: 2 };
    });
    tick();
    expect(solve).toHaveBeenCalledOnce();
    expect(solve.mock.calls[0][0].every((panel) => panel.width === 160 && panel.height === 120)).toBe(true);
    // One local check per panel plus one registry refresh, not N registry scans.
    expect(reads.reduce((n, read) => n + read.mock.calls.length, 0)).toBe(40);
  });

  it('marks removals and intentional arrangements dirty even if geometry did not change', () => {
    const { store, solve, remove } = setup(2);
    store.arrange('panel-0');
    store.commit();
    expect(solve).toHaveBeenCalledOnce();
    solve.mockClear();
    remove[1]();
    store.commit();
    expect(solve).toHaveBeenCalledOnce();
    expect(store.getPositions().has('panel-1')).toBe(false);
  });

  it('tells geometry subscribers after a solve that moves, resizes, mounts or removes a panel, never after an unchanged one', () => {
    const { store, inputs, paint, tick, remove } = setup(3);
    const order: string[] = [];
    paint.mockImplementation(() => order.push('paint'));
    const geometry = vi.fn(() => order.push('geometry'));
    store.subscribeGeometry(geometry);

    // Unchanged inputs (a tick): no solve, nothing to tell.
    tick();
    expect(geometry).not.toHaveBeenCalled();

    // Moved: told once, after every panel's DOM writes.
    inputs[1] = { ...inputs[1], position: { ...inputs[1].position!, x: 500 } };
    tick();
    expect(geometry).toHaveBeenCalledOnce();
    expect(order.at(-1)).toBe('geometry');
    expect(order.filter((event) => event === 'paint')).toHaveLength(3);

    // Resized in place.
    inputs[2] = { ...inputs[2], width: 120 };
    tick();
    expect(geometry).toHaveBeenCalledTimes(2);

    // Mounted, and removed.
    store.register(
      'panel-3',
      () => ({ ...inputs[0], name: 'panel-3', position: { ...inputs[0].position!, y: 400 } }),
      () => undefined,
    );
    store.commit();
    expect(geometry).toHaveBeenCalledTimes(3);
    remove[0]();
    expect(geometry).toHaveBeenCalledTimes(4);
    // The solve after the removal moves nothing more.
    store.commit();
    expect(geometry).toHaveBeenCalledTimes(4);
  });

  it('prepares every panel before applying any DOM writes', () => {
    const store = createPanelLayoutStore();
    const events: string[] = [];
    const { inputs } = setup(3);
    for (let i = 0; i < 3; i++)
      store.register(
        `panel-${i}`,
        () => inputs[i],
        () => {
          events.push(`read-${i}`);
          return () => events.push(`write-${i}`);
        },
      );
    store.commit();
    expect(events).toEqual(['read-0', 'read-1', 'read-2', 'write-0', 'write-1', 'write-2']);
  });
});
