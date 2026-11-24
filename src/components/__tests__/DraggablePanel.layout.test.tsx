// @vitest-environment jsdom
// The consolidated registry cases exercise real Alt+wheel events, which happy-dom does not deliver.
import { act, fireEvent, render } from '@testing-library/react';
import { type ComponentProps, Profiler, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayPresentationProvider } from '../../contexts/ReplayPresentationContext';
import type { ReplayPresentationState } from '../../core/replayPresentation';
import type { UIPosition } from '../../hooks/usePersistedSettings';
import { CHROME_RESIZE_TIMING } from '../chromeZoom';
import { DraggablePanel } from '../DraggablePanel';
import * as layoutSolver from '../snap/layoutSolver';
import { PanelSnapRegistryProvider } from '../snap/PanelSnapRegistry';

type Geometry = {
  scale: number;
  width: number;
  height: number;
  overlayScale?: number;
  ownerPositions?: Record<string, UIPosition>;
};
interface Definition {
  id: string;
  position: UIPosition;
  width: number;
  height: number;
  defaultOnly?: boolean;
  overlay?: boolean;
  extra?: Partial<ComponentProps<typeof DraggablePanel>>;
  owner?: (geometry: Geometry) => UIPosition;
}
const at = (x: number, y: number): UIPosition => ({ x, y, anchorX: 'left', anchorY: 'top' });
const initial = { scale: 1, width: 1000, height: 800 };
const ordinary = [
  { id: 'host', position: at(400, 300), width: 200, height: 200 },
  { id: 'child', position: at(605, 300), width: 100, height: 100 },
];

type AnimationCall = {
  id: string;
  frames: { transform: string }[];
  timing: KeyframeAnimationOptions;
  animation: {
    startTime: number | null;
    playState: AnimationPlayState;
    onfinish: Animation['onfinish'];
    cancel: ReturnType<typeof vi.fn>;
  };
};
let animations: AnimationCall[];
let oldAnimate: PropertyDescriptor | undefined;
let oldElementFromPoint: PropertyDescriptor | undefined;
beforeEach(() => {
  animations = [];
  oldAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: HTMLElement, frames: AnimationCall['frames'], timing: KeyframeAnimationOptions) {
      const animation: AnimationCall['animation'] = {
        startTime: null,
        playState: 'running',
        onfinish: null,
        cancel: vi.fn(),
      };
      animations.push({
        id: this.closest<HTMLElement>('[data-tutorial]')!.dataset.tutorial!,
        frames,
        timing,
        animation,
      });
      return animation;
    },
  });
  oldElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
  vi.stubGlobal('devicePixelRatio', 1);
});
afterEach(() => {
  fireEvent.keyUp(window, { key: 'Alt' });
  fireEvent.blur(window);
  if (oldAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', oldAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  if (oldElementFromPoint) Object.defineProperty(document, 'elementFromPoint', oldElementFromPoint);
  else Reflect.deleteProperty(document, 'elementFromPoint');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function workspace(definitions: Definition[], geometry: Geometry = initial, replay = false) {
  const writes = vi.fn();
  const commits = vi.fn();
  const stored = new Map<string, UIPosition>();
  function Workspace({ panels, frame }: { panels: Definition[]; frame: Geometry }) {
    const [positions, setPositions] = useState<Record<string, UIPosition>>({});
    const [liveScale, setLiveScale] = useState(frame.scale);
    const [previousScale, setPreviousScale] = useState(frame.scale);
    if (previousScale !== frame.scale) {
      setPreviousScale(frame.scale);
      setLiveScale(frame.scale);
    }
    for (const panel of panels) stored.set(panel.id, positions[panel.id] ?? panel.position);
    const content = (
      <PanelSnapRegistryProvider>
        {panels.map((panel) => (
          <DraggablePanel
            key={panel.id}
            dataTutorial={panel.id}
            defaultPosition={panel.position}
            position={
              panel.owner?.(frame) ??
              frame.ownerPositions?.[panel.id] ??
              positions[panel.id] ??
              (panel.defaultOnly ? undefined : panel.position)
            }
            width={panel.width}
            height={panel.height}
            scale={panel.overlay ? (frame.overlayScale ?? 1) : liveScale}
            scaleLocked={panel.overlay}
            onScaleChange={setLiveScale}
            viewportWidth={frame.width}
            viewportHeight={frame.height}
            externallyPositioned={!!panel.owner}
            onPositionChange={(next) => {
              writes(panel.id, next);
              setPositions((prev) => ({ ...prev, [panel.id]: { ...next } }));
            }}
            {...panel.extra}
          >
            content
          </DraggablePanel>
        ))}
      </PanelSnapRegistryProvider>
    );
    return (
      <Profiler id="workspace" onRender={commits}>
        {replay ? (
          <ReplayPresentationProvider
            presentation={{ variants: {} } as ReplayPresentationState}
            reportPanelPresentation={() => {}}
            reportMinimapZoom={() => {}}
          >
            {content}
          </ReplayPresentationProvider>
        ) : (
          content
        )}
      </Profiler>
    );
  }
  const view = render(<Workspace panels={definitions} frame={geometry} />);
  const element = (id: string) => view.container.querySelector<HTMLElement>(`[data-tutorial="${id}"]`)!;
  const rect = (id: string, painted = false) => {
    const el = element(id);
    const [x, y] = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(el.style.transform)!.slice(1).map(Number);
    const [dx, dy] = el.style.translate.split(' ').map(Number.parseFloat);
    const content = el.firstElementChild as HTMLElement;
    const left = x + (painted ? dx : 0);
    const top = y + (painted ? dy : 0);
    const width = painted
      ? Number.parseFloat(el.style.width)
      : Number.parseFloat(content.style.width) * Number(content.style.zoom);
    const height = painted
      ? Number.parseFloat(el.style.height)
      : Number.parseFloat(content.style.height) * Number(content.style.zoom);
    return { left, top, right: left + width, bottom: top + height, width, height };
  };
  return {
    ...view,
    rect,
    element,
    writes,
    commits,
    stored: (id: string) => stored.get(id),
    resize: async (frame: Geometry, panels = definitions) =>
      act(async () => view.rerender(<Workspace panels={panels} frame={frame} />)),
    altScroll: async (id: string, notches: number) => {
      const inner = element(id).firstElementChild!.firstElementChild as HTMLElement;
      fireEvent.mouseEnter(inner);
      for (let i = 0; i < Math.abs(notches); i++) {
        await act(async () => {
          fireEvent.wheel(window, { deltaY: notches > 0 ? -120 : 120, altKey: true, clientX: 1, clientY: 1 });
          await new Promise((resolve) => requestAnimationFrame(resolve));
        });
      }
      fireEvent.keyUp(window, { key: 'Alt' });
      fireEvent.mouseLeave(inner);
    },
    drag: async (id: string, dx: number, dy: number) => {
      await act(async () => {
        fireEvent.mouseDown(element(id), { button: 0, altKey: true, clientX: 500, clientY: 400 });
        fireEvent.mouseMove(window, { buttons: 1, altKey: true, clientX: 500 + dx, clientY: 400 + dy });
        fireEvent.mouseUp(window, { altKey: true, clientX: 500 + dx, clientY: 400 + dy });
        // Drain the drag-end hover probe before afterEach restores elementFromPoint.
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });
      fireEvent.keyUp(window, { key: 'Alt' });
    },
  };
}

describe('registry-owned layout transactions', () => {
  it.each([10, 20])('skips solving %i unchanged mounted panels and solves one changed panel once', async (count) => {
    const panels = Array.from({ length: count }, (_, i) => ({
      id: `panel-${i}`,
      position: at(100 + i * 120, 100),
      width: 80,
      height: 60,
    }));
    const frame = { width: 4000, height: 2000, scale: 1 };
    const ws = workspace(panels, frame);
    const solve = vi.spyOn(layoutSolver, 'solvePanelLayout');
    await ws.resize(
      { ...frame },
      panels.map((panel) => ({ ...panel, position: { ...panel.position } })),
    );
    expect(solve).not.toHaveBeenCalled();
    await ws.resize(
      frame,
      panels.map((panel, i) => (i === count - 1 ? { ...panel, width: 90 } : panel)),
    );
    expect(solve).toHaveBeenCalledOnce();
  });

  it('uses the same nearest legal position during drag and after release with intersecting exclusions', async () => {
    const ws = workspace([
      { id: 'host', position: at(0, 650), width: 150, height: 150 },
      {
        id: 'child',
        position: at(155, 650),
        width: 100,
        height: 100,
        extra: {
          exclusionRects: [
            { left: 200, top: 0, right: 400, bottom: 500 },
            { left: 350, top: 300, right: 600, bottom: 700 },
          ],
        },
      },
    ]);
    const host = ws.rect('host');
    fireEvent.mouseDown(ws.element('child'), { button: 0, altKey: true, clientX: 500, clientY: 400 });
    await act(async () => {
      fireEvent.mouseMove(window, { buttons: 1, altKey: true, clientX: 645, clientY: 100 });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const dragged = ws.rect('child');
    expect(dragged).toMatchObject({ left: 250, top: 500 });
    expect(ws.rect('host')).toEqual(host);
    await act(async () => {
      fireEvent.mouseUp(window, { altKey: true, clientX: 645, clientY: 100 });
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(ws.rect('child')).toEqual(dragged);
    expect(ws.rect('host')).toEqual(host);
    expect(ws.writes).toHaveBeenCalledExactlyOnceWith('child', at(250, 500));
  });

  it('does not recapture an arrangement when an unrelated owner follows a scale change', async () => {
    const panels = [
      ...ordinary,
      { id: 'owned', position: at(0, 0), width: 20, height: 20, owner: (g: Geometry) => at(10 * g.scale, 10) },
    ];
    const ws = workspace(panels);
    const before = ws.rect('child');
    await ws.resize({ ...initial, scale: 2 });
    expect(ws.rect('child').left - ws.rect('host').right).toBe(5);
    await ws.resize(initial);
    expect(ws.rect('child')).toEqual(before);
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('translates a fitting assembly together and ignores unrelated mounts while clamped', async () => {
    const panels = ordinary.map((p, i) => ({ ...p, position: at(i ? 855 : 650, p.position.y) }));
    const ws = workspace(panels);
    await ws.resize({ ...initial, scale: 2 });
    expect(ws.rect('child').left).toBe(800);
    expect(ws.rect('host').right).toBe(795);
    const withNewPanel = [...panels, { id: 'unrelated', position: at(10, 10), width: 20, height: 20 }];
    await ws.resize({ ...initial, scale: 2 }, withNewPanel);
    await ws.resize(initial, withNewPanel);
    expect(ws.rect('child').left).toBe(855);
    expect(ws.rect('host').left).toBe(650);
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('solves sub-half-pixel steps and makes exactly one React commit per scale step', async () => {
    const ws = workspace(ordinary);
    for (let i = 1; i <= 5; i++) {
      ws.commits.mockClear();
      await ws.resize({ ...initial, scale: 1 + i * 0.001 });
      expect(ws.rect('child').left - ws.rect('host').right).toBeCloseTo(5, 10);
      expect(ws.commits).toHaveBeenCalledOnce();
    }
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('uses the same stable viewport reference for defaults and saved placements', async () => {
    const ws = workspace([
      { id: 'default', position: at(300, 100), width: 200, height: 100, defaultOnly: true },
      { id: 'saved', position: at(300, 400), width: 200, height: 100 },
    ]);
    await ws.resize({ ...initial, width: 2000 });
    expect(ws.rect('default').left).toBe(675);
    expect(ws.rect('saved').left).toBe(675);
    await ws.resize(initial);
    expect(ws.rect('default').left).toBe(300);
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('interprets a newly supplied saved position literally even when its numbers equal the default', async () => {
    const defaults = [{ id: 'panel', position: at(300, 100), width: 200, height: 100, defaultOnly: true }];
    const frame = { ...initial, scale: 2 };
    const ws = workspace(defaults, frame);
    expect(ws.rect('panel').left).toBe(225);
    await ws.resize(frame, [{ ...defaults[0], defaultOnly: false }]);
    expect(ws.rect('panel').left).toBe(300);
    expect(ws.rect('panel').top).toBe(100);
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('keeps docked defaults unsaved across 50 resize/clamp round trips', async () => {
    const ws = workspace(ordinary.map((p) => ({ ...p, defaultOnly: true })));
    const start = ws.rect('child');
    for (let i = 0; i < 50; i++) {
      await ws.resize({ ...initial, scale: 2 });
      await ws.resize({ ...initial, width: 300, height: 200, scale: 2 });
      await ws.resize(initial);
      expect(ws.rect('child')).toEqual(start);
    }
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('keeps a shared painted right edge identical at 7/6', async () => {
    const ws = workspace(
      [
        { id: 'body', position: at(1820 - 204, 500), width: 204, height: 275 },
        { id: 'tabs', position: at(1820 - 237, 777), width: 237, height: 36 },
      ],
      { scale: 1, width: 1920, height: 970 },
    );
    await ws.resize({ scale: 7 / 6, width: 1920, height: 970 });
    expect(ws.rect('body', true).right).toBe(ws.rect('tabs', true).right);
    expect(ws.rect('body', true).right % 1).toBe(0);
    expect(ws.rect('tabs', true).top - ws.rect('body', true).bottom).toBe(2);
  });

  it('is continuous for panels at 8 and 8.001 pixels from an edge', async () => {
    const ws = workspace([
      { id: 'a', position: at(8, 100), width: 200, height: 100 },
      { id: 'b', position: at(8.001, 400), width: 200, height: 100 },
    ]);
    await ws.resize({ ...initial, width: 400 });
    expect(ws.rect('a').left).toBe(2);
    expect(ws.rect('b').left - ws.rect('a').left).toBeCloseTo(0.00025, 10);
  });

  it('breaks only the dragged panel relationship and persists that gesture once', async () => {
    const ws = workspace(ordinary);
    await ws.drag('child', 100, 100);
    expect(ws.writes).toHaveBeenCalledOnce();
    const arranged = ws.rect('child');
    await ws.resize({ ...initial, scale: 2 });
    expect(ws.rect('child').left - ws.rect('host').right).not.toBe(5);
    await ws.resize(initial);
    expect(ws.rect('child')).toEqual(arranged);
    expect(ws.writes).toHaveBeenCalledOnce();
  });

  it('applies replay snapshots exactly, without inference, projection, quantization or persistence', async () => {
    const ws = workspace(
      ordinary.map((p) => ({ ...p, position: at(p.position.x + 0.4, p.position.y + 0.6) })),
      initial,
      true,
    );
    await ws.resize({ scale: 2, width: 1600, height: 1000 });
    expect(ws.rect('host', true).left).toBe(400.4);
    expect(ws.rect('child', true).left).toBe(605.4);
    expect(ws.rect('child', true).top).toBe(300.6);
    expect(ws.writes).not.toHaveBeenCalled();
    expect(animations).toHaveLength(0);
  });
});

describe('shared solve animation', () => {
  it.each([10, 20])('starts %i panel transitions without computed-style reads', async (count) => {
    const panels = Array.from({ length: count }, (_, i) => ({
      id: `panel-${i}`,
      position: at(100 + i * 120, 100),
      width: 80,
      height: 60,
    }));
    const frame = { width: 4000, height: 2000, scale: 1 };
    const ws = workspace(panels, frame);
    const read = vi.spyOn(globalThis, 'getComputedStyle');
    await ws.resize({ ...frame, scale: 1.5 });
    expect(animations).toHaveLength(count);
    expect(read).not.toHaveBeenCalled();
  });

  it('reads all interrupted transforms before any registry geometry writes', async () => {
    const ws = workspace(ordinary);
    await ws.resize({ ...initial, scale: 1.5 });
    animations[0].animation.playState = 'paused';
    const read = vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      transform: 'matrix(0.8, 0, 0, 0.8, 5, 7)',
    } as CSSStyleDeclaration);
    // minWidth belongs exclusively to the registry applier, unlike React's own
    // mutation-phase zoom/width writes that precede the entire layout transaction.
    const writes = ordinary.map((panel) =>
      vi.spyOn((ws.element(panel.id).firstElementChild as HTMLElement).style, 'minWidth', 'set'),
    );
    await ws.resize({ ...initial, scale: 2 });
    expect(read).toHaveBeenCalledTimes(ordinary.length);
    for (const write of writes) expect(write).toHaveBeenCalledOnce();
    expect(Math.max(...read.mock.invocationCallOrder)).toBeLessThan(
      Math.min(...writes.flatMap((write) => write.mock.invocationCallOrder)),
    );
    // Both new animations still share their clock, and start from the sampled
    // visual width (1.5 * 0.8), not the old target width (1.5).
    const latest = animations.slice(-ordinary.length);
    expect(latest[0].animation.startTime).toBe(latest[1].animation.startTime);
    for (const call of latest) {
      expect(Number(/scale\(([-\d.e]+)/.exec(call.frames[0].transform)![1])).toBeCloseTo(0.6, 9);
    }
  });

  it.each(['finished', 'idle'] as const)('does not read a %s animation back as an interruption', async (playState) => {
    const ws = workspace(ordinary);
    await ws.resize({ ...initial, scale: 1.5 });
    for (const call of animations) call.animation.playState = playState;
    const read = vi.spyOn(globalThis, 'getComputedStyle');
    await ws.resize({ ...initial, scale: 2 });
    expect(read).not.toHaveBeenCalled();
    expect(animations).toHaveLength(4);
  });

  it('snaps the whole solve for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const ws = workspace(ordinary);
    animations.length = 0;
    await ws.resize({ ...initial, scale: 2 });
    expect(animations).toHaveLength(0);
    expect(ws.rect('child').left - ws.rect('host').right).toBe(5);
  });

  it('uses one start, duration and easing for the host and its follower, preserving the gap at 30ms', async () => {
    const ws = workspace([ordinary[0], { ...ordinary[1], overlay: true }]);
    animations.length = 0;
    await ws.resize({ ...initial, scale: 2 });
    expect(animations).toHaveLength(2);
    const host = animations.find((a) => a.id === 'host')!;
    const child = animations.find((a) => a.id === 'child')!;
    expect(host.animation.startTime).toBe(child.animation.startTime);
    expect(host.timing).toEqual(CHROME_RESIZE_TIMING);
    expect(child.timing).toEqual(CHROME_RESIZE_TIMING);
    // Invert the shared cubic-bezier's x(t) for t=30/200 seconds.
    const bezier = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 50; i++) {
      const t = (low + high) / 2;
      if (bezier(t, 0.16, 0.3) < 0.15) low = t;
      else high = t;
    }
    const at30ms = bezier((low + high) / 2, 1, 1);
    const sample = (call: AnimationCall, progress: number) => {
      const end = ws.rect(call.id, true);
      const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)/.exec(call.frames[0].transform)!;
      const zoom = Number((ws.element(call.id).firstElementChild as HTMLElement).style.zoom);
      const left = end.left + Number(match[1]) * zoom * (1 - progress);
      const width = end.width * (Number(match[3]) * (1 - progress) + progress);
      return { left, right: left + width };
    };
    for (const progress of [0, at30ms, 0.5, 0.9, 1]) {
      expect(sample(child, progress).left - sample(host, progress).right).toBeCloseTo(5, 9);
    }
  });

  it('snaps viewport-only and Alt steps rather than starting independent clocks', async () => {
    const ws = workspace(ordinary);
    animations.length = 0;
    await ws.resize({ ...initial, width: 1200 });
    expect(animations).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'Alt' });
    await ws.resize({ ...initial, width: 1200, scale: 2 });
    expect(animations).toHaveLength(0);
  });
});

describe('placement through resizes, wherever the panel sits', () => {
  const at1080 = { width: 1920, height: 970, scale: 1 };
  const at1440 = { width: 2560, height: 1300, scale: 1 };

  it('keeps a centered panel centered through an Alt+scroll, a UI-scale change and a window resize', async () => {
    const centred = { x: (1920 - 200) / 2, y: (970 - 100) / 2, anchorX: 'right', anchorY: 'bottom' } as const;
    const ws = workspace([{ id: 'centre', width: 200, height: 100, position: centred }], at1080);
    const expectCentred = (width: number, height: number) => {
      const rect = ws.rect('centre');
      expect((rect.left + rect.right) / 2).toBeCloseTo(width / 2, 6);
      expect((rect.top + rect.bottom) / 2).toBeCloseTo(height / 2, 6);
    };

    await ws.altScroll('centre', 2);
    expect(ws.rect('centre').width).toBeGreaterThan(200);
    expectCentred(1920, 970);

    const shared = workspace([{ id: 'shared', width: 200, height: 100, position: centred }], at1080);
    await shared.resize({ ...at1080, scale: 2 });
    expect(shared.rect('shared').width).toBe(400);
    const sharedRect = shared.rect('shared');
    expect((sharedRect.left + sharedRect.right) / 2).toBeCloseTo(960, 6);

    await ws.resize(at1440);
    expectCentred(2560, 1300);
    await ws.resize(at1080);
    expectCentred(1920, 970);
  });

  it('keeps an off-corner panel at its proportional spot and a corner panel at its gap', async () => {
    const ws = workspace(
      [
        // The minimap nudged 40px in from the top-right corner.
        { id: 'offCorner', width: 250, height: 170, position: { x: 40, y: 40, anchorX: 'right', anchorY: 'top' } },
        { id: 'corner', width: 240, height: 330, position: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } },
      ],
      at1080,
    );
    await ws.resize({ ...at1440, scale: 2 });
    const offCorner = ws.rect('offCorner');
    // 40px of 1670 free at 1x; the same fraction of the 2060 free at 2x — not 80px.
    expect(2560 - offCorner.right).toBeCloseTo((40 * 2060) / 1670, 6);
    expect(offCorner.top).toBeCloseTo((40 * 960) / 800, 6);
    const corner = ws.rect('corner');
    expect([2560 - corner.right, 1300 - corner.bottom]).toEqual([0, 0]);

    await ws.resize(at1080);
    expect(ws.stored('offCorner')).toEqual({ x: 40, y: 40, anchorX: 'right', anchorY: 'top' });
  });

  it('places left- and right-anchored saves of the same spot identically', async () => {
    const ws = workspace(
      [
        { id: 'left', width: 200, height: 100, position: { x: 600, y: 300, anchorX: 'left', anchorY: 'top' } },
        {
          id: 'right',
          width: 200,
          height: 100,
          position: { x: 1920 - 200 - 600, y: 970 - 100 - 300, anchorX: 'right', anchorY: 'bottom' },
        },
      ],
      at1080,
    );
    for (const geometry of [{ ...at1080, scale: 2 }, at1440, { ...at1440, scale: 1.5 }]) {
      await ws.resize(geometry);
      expect(ws.rect('right').left).toBeCloseTo(ws.rect('left').left, 6);
      expect(ws.rect('right').top).toBeCloseTo(ws.rect('left').top, 6);
    }
  });

  // The game panel in the bottom-right corner and an infobox strip docked 5px above it,
  // right edges aligned.
  const gamePanel = {
    id: 'gamePanel',
    width: 240,
    height: 330,
    position: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' },
  } as const;
  const strip = {
    id: 'strip',
    width: 150,
    height: 40,
    position: { x: 0, y: 330 + 5, anchorX: 'right', anchorY: 'bottom' },
  } as const;
  const expectDockedAbove = (ws: ReturnType<typeof workspace>, childId: string, hostId: string) => {
    const child = ws.rect(childId);
    const host = ws.rect(hostId);
    expect(host.top - child.bottom).toBeCloseTo(5, 6);
    expect(child.right).toBeCloseTo(host.right, 6);
  };

  it('keeps infoboxes docked above the game panel through a UI-scale change and a window resize', async () => {
    const ws = workspace([gamePanel, strip], at1080);
    await ws.resize({ ...at1080, scale: 2 });
    expectDockedAbove(ws, 'strip', 'gamePanel');
    await ws.resize({ ...at1440, scale: 2 });
    expectDockedAbove(ws, 'strip', 'gamePanel');
    await ws.resize(at1080);
    expectDockedAbove(ws, 'strip', 'gamePanel');
    expect(ws.stored('strip')).toEqual(strip.position);
  });

  it('keeps a default its owner re-derives per scale docked through the scale change and a later resize', async () => {
    // The unmoved free infobox strip: its owner hands in the spot above the host at the
    // current scale. That is the same placement at a new size, not a new arrangement, so
    // it must not be re-docked against a host still at the previous size.
    const derivedAbove = (geometry: Geometry): UIPosition => ({
      x: 0,
      y: 330 * geometry.scale + 5,
      anchorX: 'right',
      anchorY: 'bottom',
    });
    const ownerPositions = (geometry: Geometry): Geometry => ({
      ...geometry,
      ownerPositions: { strip: derivedAbove(geometry) },
    });
    const ws = workspace([gamePanel, strip], ownerPositions(at1080));
    expectDockedAbove(ws, 'strip', 'gamePanel');
    await ws.resize(ownerPositions({ ...at1080, scale: 1.5 }));
    expectDockedAbove(ws, 'strip', 'gamePanel');
    await ws.resize(ownerPositions({ ...at1440, scale: 1.5 }));
    expectDockedAbove(ws, 'strip', 'gamePanel');
    await ws.resize(ownerPositions({ width: 1280, height: 640, scale: 1.5 }));
    expectDockedAbove(ws, 'strip', 'gamePanel');
    expect(ws.writes).not.toHaveBeenCalled();
  });

  it('keeps an Auto-sized follower docked when its UI-sized host is resized with Alt+scroll', async () => {
    // The UI group grows while the Auto group stays at its independent size.
    const centredHost = {
      id: 'host',
      width: 240,
      height: 330,
      position: { x: 800, y: 400, anchorX: 'left', anchorY: 'top' },
    } as const;
    const above = {
      id: 'above',
      overlay: true,
      width: 150,
      height: 40,
      position: { x: 800 + 240 - 150, y: 400 - 5 - 40, anchorX: 'left', anchorY: 'top' },
    } as const;
    const ws = workspace([centredHost, above], at1080);
    await ws.altScroll('host', 3);
    expect(ws.rect('host').width).toBeGreaterThan(240);
    expect(ws.rect('above').width).toBe(150);
    expectDockedAbove(ws, 'above', 'host');
  });

  it('carries a chain of three from the root outwards', async () => {
    const top = {
      id: 'top',
      width: 100,
      height: 30,
      position: { x: 0, y: 330 + 5 + 40 + 5, anchorX: 'right', anchorY: 'bottom' },
    } as const;
    const ws = workspace([top, strip, gamePanel], at1080);
    await ws.resize({ ...at1440, scale: 2 });
    expectDockedAbove(ws, 'strip', 'gamePanel');
    expectDockedAbove(ws, 'top', 'strip');
    await ws.resize(at1080);
    expect(ws.stored('top')).toEqual(top.position);
    expect(ws.stored('strip')).toEqual(strip.position);
  });

  it('keeps a side-by-side pair level and gapped', async () => {
    const flick = {
      id: 'flick',
      width: 208,
      height: 144,
      position: { x: 300, y: 200, anchorX: 'left', anchorY: 'top' },
    } as const;
    const dps = {
      id: 'dps',
      width: 208,
      height: 94,
      position: { x: 300 + 208 + 5, y: 200, anchorX: 'left', anchorY: 'top' },
    } as const;
    const ws = workspace([flick, dps], at1080);
    for (const geometry of [{ ...at1080, scale: 2 }, at1440, at1080]) {
      await ws.resize(geometry);
      expect(ws.rect('dps').left - ws.rect('flick').right).toBeCloseTo(5, 6);
      expect(ws.rect('dps').top).toBeCloseTo(ws.rect('flick').top, 6);
    }
    expect(ws.stored('dps')).toEqual(dps.position);
  });

  it('leaves a docked panel where its owner puts it in the same commit', async () => {
    const ws = workspace([gamePanel, strip], at1080);
    const owned = { x: 400, y: 500, anchorX: 'right', anchorY: 'bottom' } as const;
    await ws.resize({ ...at1080, scale: 2, ownerPositions: { strip: owned } });
    expect(ws.rect('strip').left).toBe(1920 - 300 - 400);
    expect(ws.rect('strip').top).toBe(970 - 80 - 500);
  });

  it.each([
    { externallyPositioned: true },
    { physicalSize: { width: 150, height: 40 } },
  ])('never moves a docked panel its owner positions: %j', async (extra) => {
    // Pins, fixed chrome and replay snapshots are placed by their owner; replay in
    // particular must land every recorded panel exactly where it was recorded.
    const ws = workspace([gamePanel, { ...strip, extra }], at1080);
    const before = ws.rect('strip');
    await ws.resize({ ...at1440, scale: 2 });
    expect(ws.stored('strip')).toEqual(strip.position);
    expect(ws.rect('gamePanel').top - ws.rect('strip').bottom).not.toBeCloseTo(5, 0);
    expect(before.right).toBe(1920);
  });

  it('keeps every panel in place through every kind of resize, and back exactly', async () => {
    // Every movable panel the game has, at its real size: in corners, off corners, mid-screen
    // and docked to neighbors. All plugin overlays, including XP drops, follow Auto;
    // the rest follow the UI scale.
    const panels: Definition[] = [
      { id: 'tabBar', width: 237, height: 36, position: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } },
      { id: 'body', width: 204, height: 275, position: { x: 0, y: 38, anchorX: 'right', anchorY: 'bottom' } },
      { id: 'strip', width: 168, height: 32, position: { x: 0, y: 318, anchorX: 'right', anchorY: 'bottom' } },
      { id: 'minimap', width: 244, height: 166, position: { x: 40, y: 40, anchorX: 'right', anchorY: 'top' } },
      { id: 'orbs', width: 60, height: 150, position: { x: 0, y: 300, anchorX: 'right', anchorY: 'top' } },
      {
        id: 'boss',
        overlay: true,
        width: 208,
        height: 42,
        position: { x: 359, y: 24, anchorX: 'left', anchorY: 'top' },
      },
      {
        id: 'zuk',
        overlay: true,
        width: 208,
        height: 134,
        position: { x: 359, y: 74, anchorX: 'left', anchorY: 'top' },
      },
      {
        id: 'flick',
        overlay: true,
        width: 208,
        height: 144,
        position: { x: 104, y: 88, anchorX: 'left', anchorY: 'top' },
      },
      {
        id: 'dps',
        overlay: true,
        width: 208,
        height: 94,
        position: { x: 800, y: 420, anchorX: 'left', anchorY: 'top' },
      },
      {
        id: 'xp',
        overlay: true,
        width: 170,
        height: 300,
        position: { x: 235, y: 96, anchorX: 'right', anchorY: 'top' },
      },
    ];
    const base = { width: 1920, height: 970, scale: 1, overlayScale: 1 };
    const ws = workspace(panels, base);
    const start = Object.fromEntries(panels.map((panel) => [panel.id, ws.rect(panel.id)]));
    const fraction = (id: string, geometry: typeof base) => {
      const r = ws.rect(id);
      return [r.left / (geometry.width - r.width), r.top / (geometry.height - r.height)];
    };
    const startFraction = (id: string) => {
      const r = start[id];
      return [r.left / (1920 - r.width), r.top / (970 - r.height)];
    };
    const expectDocked = (child: string, host: string, gap: number, edge: 'right' | 'left') => {
      expect(ws.rect(host).top - ws.rect(child).bottom).toBeCloseTo(gap, 6);
      expect(ws.rect(child)[edge]).toBeCloseTo(ws.rect(host)[edge], 6);
    };
    const expectBelow = (child: string, host: string, gap: number) => {
      expect(ws.rect(child).top - ws.rect(host).bottom).toBeCloseTo(gap, 6);
      expect(ws.rect(child).left).toBeCloseTo(ws.rect(host).left, 6);
    };
    const expectLayout = (geometry: typeof base) => {
      // Corners and edges keep their exact gaps.
      expect([geometry.width - ws.rect('tabBar').right, geometry.height - ws.rect('tabBar').bottom]).toEqual([0, 0]);
      expect(geometry.width - ws.rect('orbs').right).toBe(0);
      // Docked neighbors stay docked.
      expectDocked('body', 'tabBar', 2, 'right');
      expectDocked('strip', 'body', 5, 'right');
      expectBelow('zuk', 'boss', 8);
      // Everything else keeps its share of the free space. (The Zuk timer, the larger of
      // the docked pair, is placed by its own rule and carries the boss bar.)
      for (const id of ['minimap', 'flick', 'dps', 'xp', 'zuk']) {
        const [fx, fy] = fraction(id, geometry);
        const [sx, sy] = startFraction(id);
        expect(fx).toBeCloseTo(sx, 6);
        expect(fy).toBeCloseTo(sy, 6);
      }
    };
    const expectBackToStart = () => {
      for (const panel of panels) {
        expect(ws.rect(panel.id)).toEqual(start[panel.id]);
        expect(ws.stored(panel.id)).toEqual(panel.position);
      }
    };

    // A UI-scale step, an Auto step, a window resize, and all three at once.
    for (const step of [
      { ...base, scale: 7 / 6 },
      { ...base, overlayScale: 7 / 6 },
      { ...base, width: 2240, height: 1132 },
      { width: 2240, height: 1132, scale: 7 / 6, overlayScale: 7 / 6 },
    ]) {
      await ws.resize(step);
      expectLayout(step);
      await ws.resize(base);
      expectLayout(base);
      expectBackToStart();
    }

    // Alt+scroll changes the UI group without resizing the Auto group.
    await ws.altScroll('tabBar', 1);
    for (const id of ['tabBar', 'body', 'strip', 'minimap', 'orbs']) {
      expect(ws.rect(id).width).toBeGreaterThan(start[id].width);
    }
    for (const id of ['boss', 'zuk', 'flick', 'dps', 'xp']) {
      expect(ws.rect(id)).toEqual(start[id]);
    }
    expectLayout({ ...base, scale: 7 / 6 });
    await ws.altScroll('tabBar', -1);
    expectBackToStart();
  });

  it.each([
    ['100px from the right', { tabBar: { x: 100, y: 0 }, body: { x: 100, y: 38 } }],
    ['2px off the bottom', { tabBar: { x: 0, y: 2 }, body: { x: 0, y: 40 } }],
  ])('keeps the inventory on its tab bar %s through a UI-scale step', async (_label, placed) => {
    const ws = workspace(
      [
        { id: 'tabBar', width: 237, height: 36, position: { ...placed.tabBar, anchorX: 'right', anchorY: 'bottom' } },
        { id: 'body', width: 204, height: 275, position: { ...placed.body, anchorX: 'right', anchorY: 'bottom' } },
      ],
      at1080,
    );
    const start = { tabBar: ws.rect('tabBar'), body: ws.rect('body') };
    await ws.resize({ ...at1080, scale: 7 / 6 });
    expect(ws.rect('body').right).toBeCloseTo(ws.rect('tabBar').right, 6);
    expect(ws.rect('tabBar').top - ws.rect('body').bottom).toBeCloseTo(2, 6);
    await ws.resize(at1080);
    expect({ tabBar: ws.rect('tabBar'), body: ws.rect('body') }).toEqual(start);
  });

  it('lets a panel dragged away from its host go its own way', async () => {
    const ws = workspace([gamePanel, strip], at1080);
    await ws.drag('strip', -600, -300);
    const dragged = ws.rect('strip');
    expect(ws.rect('gamePanel').top - dragged.bottom).toBeGreaterThan(200);
    await ws.resize({ ...at1080, scale: 2 });
    // Placed by its own rule: its fraction of the free space, nowhere near the host.
    const next = ws.rect('strip');
    expect(next.left / (1920 - 300)).toBeCloseTo(dragged.left / (1920 - 150), 6);
  });
});
