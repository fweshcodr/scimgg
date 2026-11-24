// @vitest-environment jsdom
// Deliberately NOT happy-dom: happy-dom does not deliver the Alt+wheel resize gesture events these tests assert on.

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { type ComponentProps, useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveSetting } from '../../hooks/useLiveSetting';
import type { UIPosition } from '../../hooks/usePersistedSettings';
import { stubMaxTouchPoints } from '../../test/helpers/maxTouchPoints';
import { ALT_WHEEL_GESTURE_IDLE_MS } from '../altWheelResize';
import { DraggablePanel, stepScale } from '../DraggablePanel';
import { usePanelContentScale } from '../panelContentScale';
import { PANEL_SCALE_STOPS } from '../panelScale';
import { type PanelRect, PanelSnapRegistryProvider, usePanelSnapRegistry } from '../snap/PanelSnapRegistry';
import { TooltipProvider } from '../Tooltip/TooltipContext';

beforeEach(() => {
  fireEvent.keyUp(window, { key: 'Alt' });
  fireEvent.blur(window);
  // jsdom doesn't implement elementFromPoint; DraggablePanel's drag-end
  // hover-restore path calls it inside a rAF after mouseup.
  document.elementFromPoint = () => null;
});

function renderDraggablePanel(props: Partial<ComponentProps<typeof DraggablePanel>> = {}) {
  const defaultProps: ComponentProps<typeof DraggablePanel> = {
    children: <div data-testid="panel-content">content</div>,
    defaultPosition: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' },
    width: 200,
    height: 300,
    scale: 1,
    onPositionChange: vi.fn(),
    onScaleChange: vi.fn(),
  };

  const result = render(<DraggablePanel {...defaultProps} {...props} />);
  const outer = result.container.firstElementChild as HTMLDivElement;
  const zoomDiv = outer.firstElementChild as HTMLDivElement;
  const transformDiv = zoomDiv.firstElementChild as HTMLDivElement;

  return {
    ...result,
    outer,
    zoomDiv,
    transformDiv,
  };
}

/** Solver geometry is unquantized; the wrapper's width/height are paint-only. */
function logicalRect(element: HTMLElement) {
  const [left, top] = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(element.style.transform)?.slice(1).map(Number) ?? [
    NaN,
    NaN,
  ];
  const content = element.firstElementChild as HTMLElement;
  const zoom = Number(content.style.zoom);
  const width = Number.parseFloat(content.style.width) * zoom;
  const height = Number.parseFloat(content.style.height) * zoom;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

describe('DraggablePanel scaling system', () => {
  describe('integer scale CSS properties', () => {
    it('applies expected CSS at scale=1.0', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.0 });

      expect(zoomDiv.style.zoom).toBe('1');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('applies expected CSS at scale=2.0', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 2.0 });

      expect(zoomDiv.style.zoom).toBe('2');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('applies expected CSS at scale=3.0', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 3.0 });

      expect(zoomDiv.style.zoom).toBe('3');
      expect(transformDiv.style.transform).toBe('none');
    });
  });

  describe('fractional scale CSS properties', () => {
    it('uses direct zoom at scale=1.5', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.5 });

      expect(zoomDiv.style.zoom).toBe('1.5');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('uses direct zoom at scale=1.3', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.3 });

      expect(zoomDiv.style.zoom).toBe('1.3');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('uses direct zoom at scale=1.7', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.7 });

      expect(zoomDiv.style.zoom).toBe('1.7');
      expect(transformDiv.style.transform).toBe('none');
    });
  });

  describe('outer container layout dimensions', () => {
    it('keeps unscaled dimensions at scale=1.0', () => {
      const { outer } = renderDraggablePanel({ width: 200, height: 300, scale: 1.0 });

      expect(outer.style.width).toBe('200px');
      expect(outer.style.height).toBe('300px');
    });

    it('scales dimensions at scale=1.5', () => {
      const { outer } = renderDraggablePanel({ width: 200, height: 300, scale: 1.5 });

      expect(outer.style.width).toBe('300px');
      expect(outer.style.height).toBe('450px');
    });

    it('scales dimensions at scale=2.0', () => {
      const { outer } = renderDraggablePanel({ width: 200, height: 300, scale: 2.0 });

      expect(outer.style.width).toBe('400px');
      expect(outer.style.height).toBe('600px');
    });
  });

  describe('transform origin', () => {
    it('keeps transform origin anchored to top-left', () => {
      const { transformDiv } = renderDraggablePanel({ scale: 1.7 });

      expect(transformDiv.style.transformOrigin).toBe('0 0');
    });
  });

  describe('willChange property', () => {
    it('does NOT set a persistent willChange on the inner scale layer at rest', () => {
      // A persistent `will-change: transform` is a hard Blink LCD-text veto —
      // it forces every glyph in the panel into blurry grayscale AA. The inner
      // layer is `transform: none` at rest and the FLIP scale/move glide self-
      // composites while it animates (a running WAAPI transform), so no hint is
      // needed. Both layers must be hint-free at rest so text keeps subpixel /
      // bilevel AA.
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.5 });

      expect(zoomDiv.style.willChange).toBe('');
      expect(transformDiv.style.willChange).toBe('');
    });
  });

  describe('scale boundary edge cases', () => {
    it('handles scale=1.01 with direct zoom and no resting transform', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.01 });

      expect(zoomDiv.style.zoom).toBe('1.01');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('keeps exact scale=2.0 at zoom=2 and no resting transform', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 2.0 });

      expect(zoomDiv.style.zoom).toBe('2');
      expect(transformDiv.style.transform).toBe('none');
    });
  });

  describe('children inline imageRendering', () => {
    it('does not set imageRendering inline style directly on children', () => {
      const { container } = renderDraggablePanel({
        scale: 1.5,
        children: <img alt="test child" src="/test.png" />,
      });

      const childImage = container.querySelector('img') as HTMLImageElement;
      expect(childImage.style.imageRendering).toBe('');
    });
  });

  describe('scale stops', () => {
    const EXPECTED_STOPS = [1, 5 / 4, 4 / 3, 3 / 2, 8 / 5, 5 / 3, 7 / 4, 11 / 6, 15 / 8, 2];

    it.each(EXPECTED_STOPS)('produces correct CSS at scale stop %f', (stop) => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: stop });
      expect(zoomDiv.style.zoom).toBe(String(stop));
      expect(transformDiv.style.transform).toBe('none');
    });

    it('uses direct zoom for 4/3 scale (best non-integer)', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 4 / 3 });
      expect(zoomDiv.style.zoom).toBe(String(4 / 3));
      expect(transformDiv.style.transform).toBe('none');
    });

    it('uses direct zoom for 5/3 scale', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 5 / 3 });
      expect(zoomDiv.style.zoom).toBe(String(5 / 3));
      expect(transformDiv.style.transform).toBe('none');
    });
  });

  describe('controlled position equality', () => {
    it('does not trigger an extra render when position values are unchanged', async () => {
      let childRenderCount = 0;
      function RenderCounter() {
        childRenderCount += 1;
        return <div data-testid="panel-content">content</div>;
      }

      const pos = { x: 10, y: 20, anchorX: 'right' as const, anchorY: 'bottom' as const };

      const { rerender, outer } = renderDraggablePanel({
        position: pos,
        viewportWidth: 800,
        viewportHeight: 600,
        children: <RenderCounter />,
      });

      expect(childRenderCount).toBe(1);
      expect(outer.style.transform).toBe('translate3d(590px, 280px, 0)');

      const pos2 = { ...pos };
      rerender(
        <DraggablePanel
          defaultPosition={{ x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' }}
          width={200}
          height={300}
          scale={1}
          onPositionChange={vi.fn()}
          onScaleChange={vi.fn()}
          position={pos2}
          viewportWidth={800}
          viewportHeight={600}
        >
          <RenderCounter />
        </DraggablePanel>,
      );

      await waitFor(() => {
        expect(childRenderCount).toBe(2);
      });
      expect(outer.style.transform).toBe('translate3d(590px, 280px, 0)');
    });

    it('updates when controlled position values change', async () => {
      const initial = { x: 10, y: 20, anchorX: 'right' as const, anchorY: 'bottom' as const };
      const next = { x: 40, y: 60, anchorX: 'right' as const, anchorY: 'bottom' as const };

      const { rerender, outer } = renderDraggablePanel({ position: initial, viewportWidth: 800, viewportHeight: 600 });
      expect(outer.style.transform).toBe('translate3d(590px, 280px, 0)');

      rerender(
        <DraggablePanel
          defaultPosition={{ x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' }}
          width={200}
          height={300}
          scale={1}
          onPositionChange={vi.fn()}
          onScaleChange={vi.fn()}
          position={next}
          viewportWidth={800}
          viewportHeight={600}
        >
          <div data-testid="panel-content">content</div>
        </DraggablePanel>,
      );

      await waitFor(() => {
        expect(outer.style.transform).toBe('translate3d(560px, 240px, 0)');
      });
    });
  });

  describe('renderScale controlled prop sync', () => {
    it('uses controlled scale prop for rendering when provided', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1.5 });

      expect(zoomDiv.style.zoom).toBe('1.5');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('updates zoom and scale immediately when controlled scale prop changes', () => {
      const { rerender, zoomDiv, transformDiv } = renderDraggablePanel({ scale: 1 });

      expect(zoomDiv.style.zoom).toBe('1');
      expect(transformDiv.style.transform).toBe('none');

      rerender(
        <DraggablePanel
          defaultPosition={{ x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' }}
          width={200}
          height={300}
          scale={1.5}
          onPositionChange={vi.fn()}
          onScaleChange={vi.fn()}
        >
          <div data-testid="panel-content">content</div>
        </DraggablePanel>,
      );

      // Zoom updates immediately (no deferral) — FLIP handles visual smoothing.
      expect(zoomDiv.style.zoom).toBe('1.5');
      expect(transformDiv.style.transform).toBe('none');
    });

    it('outer div dimensions use renderScale', () => {
      const { outer } = renderDraggablePanel({ width: 200, height: 300, scale: 1.5 });

      expect(outer.style.width).toBe('300px');
      expect(outer.style.height).toBe('450px');
    });

    it('renderScale falls back to internal state when no controlled prop', () => {
      const { zoomDiv, transformDiv } = renderDraggablePanel({
        scale: undefined,
        defaultScale: 1.5,
      });

      expect(zoomDiv.style.zoom).toBe('1.5');
      expect(transformDiv.style.transform).toBe('none');
    });
  });

  describe('edgeInset default behavior', () => {
    it('renders with edgeInset=0 without errors', () => {
      const { outer } = renderDraggablePanel({ edgeInset: 0 });
      expect(outer).toBeTruthy();
    });

    it('keeps panel exactly at viewport edge when position is (0,0) and edgeInset=0', () => {
      const { outer } = renderDraggablePanel({
        defaultPosition: { x: 0, y: 0, anchorX: 'left', anchorY: 'top' },
        edgeInset: 0,
        viewportWidth: 800,
        viewportHeight: 600,
      });

      expect(outer.style.transform).toBe('translate3d(0px, 0px, 0)');
    });
  });

  describe('exclusion rects', () => {
    it('renders correctly when exclusionRects is provided', () => {
      const { outer } = renderDraggablePanel({
        defaultPosition: { x: 0, y: 0, anchorX: 'left', anchorY: 'top' },
        viewportWidth: 800,
        viewportHeight: 600,
        width: 50,
        height: 50,
        exclusionRects: [{ left: 0, top: 0, right: 60, bottom: 80 }],
      });

      expect(outer.style.transform).toBe('translate3d(60px, 0px, 0)');
    });

    it('renders correctly with an empty exclusionRects array', () => {
      const { outer } = renderDraggablePanel({
        defaultPosition: { x: 0, y: 0, anchorX: 'left', anchorY: 'top' },
        viewportWidth: 800,
        viewportHeight: 600,
        exclusionRects: [],
      });

      expect(outer.style.transform).toBe('translate3d(0px, 0px, 0)');
    });
  });

  describe('pointerPassthrough pointer-events', () => {
    it('sets inner-scale pointer-events to none when pointerPassthrough is true', () => {
      const { transformDiv } = renderDraggablePanel({ pointerPassthrough: true });
      expect(transformDiv.style.pointerEvents).toBe('none');
    });

    it('sets inner-scale pointer-events to auto when pointerPassthrough is false', () => {
      const { transformDiv } = renderDraggablePanel({ pointerPassthrough: false });
      expect(transformDiv.style.pointerEvents).toBe('auto');
    });

    it('defaults inner-scale pointer-events to auto when pointerPassthrough is omitted', () => {
      const { transformDiv } = renderDraggablePanel({});
      expect(transformDiv.style.pointerEvents).toBe('auto');
    });
  });

  describe('Alt-held move affordance', () => {
    it('shows the affordance and optional label while Alt is held', async () => {
      const { container } = renderDraggablePanel({ altHintLabel: 'XP drops' });

      // Always mounted (so the exit transition can play); hidden until Alt.
      const affordance = container.querySelector('.dp-move-affordance');
      expect(affordance).not.toBeNull();
      expect(affordance?.hasAttribute('data-visible')).toBe(false);

      fireEvent.keyDown(window, { key: 'Alt' });

      await waitFor(() => {
        expect(container.querySelector('.dp-move-affordance[data-visible]')).not.toBeNull();
      });
      expect(container.querySelectorAll('.dp-move-affordance__corner')).toHaveLength(4);
      expect(container.querySelector('.dp-move-affordance__label')?.textContent).toBe('XP drops');

      fireEvent.keyUp(window, { key: 'Alt' });

      await waitFor(() => {
        expect(container.querySelector('.dp-move-affordance[data-visible]')).toBeNull();
      });
    });

    it('makes passthrough panels grabbable while Alt is held and restores them on blur', async () => {
      const { container, transformDiv } = renderDraggablePanel({ pointerPassthrough: true });

      expect(transformDiv.style.pointerEvents).toBe('none');

      fireEvent.keyDown(window, { key: 'Alt' });

      await waitFor(() => {
        expect(transformDiv.style.pointerEvents).toBe('auto');
      });
      expect(container.querySelector('.dp-move-affordance[data-visible]')).not.toBeNull();

      fireEvent.blur(window);

      await waitFor(() => {
        expect(transformDiv.style.pointerEvents).toBe('none');
      });
      expect(container.querySelector('.dp-move-affordance[data-visible]')).toBeNull();
    });

    it('does not show the affordance on locked panels, but still makes them hit-testable for Alt+wheel', async () => {
      const { container, transformDiv } = renderDraggablePanel({ locked: true, pointerPassthrough: true });

      fireEvent.keyDown(window, { key: 'Alt' });

      await waitFor(() => {
        expect(transformDiv.style.pointerEvents).toBe('auto');
      });
      expect(container.querySelector('.dp-move-affordance[data-visible]')).toBeNull();
    });

    it('marks <html> with data-panel-dragging for the drag lifetime (suppresses the hover tier)', () => {
      const { outer } = renderDraggablePanel();

      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(false);

      fireEvent.mouseDown(outer, { altKey: true, button: 0, clientX: 100, clientY: 100 });
      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(true);

      // buttons: 1 — a 0-buttons mousemove triggers useRafDrag's self-heal and ends the drag
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150, buttons: 1 });
      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(true);

      fireEvent.mouseUp(window, { clientX: 150, clientY: 150 });
      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(false);
    });

    it('follows the pointer in frame pixels inside a frame stretched by different factors per axis', () => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      try {
        // Stretch to Window: a 765x503 frame drawn 2x wide and 1.5x tall.
        const { container } = render(
          <div className="game-viewport-frame">
            <DraggablePanel
              defaultPosition={{ x: 100, y: 100, anchorX: 'left', anchorY: 'top' }}
              width={200}
              height={100}
              scale={1}
              viewportWidth={765}
              viewportHeight={503}
              onPositionChange={vi.fn()}
            >
              <div>content</div>
            </DraggablePanel>
          </div>,
        );
        const frame = container.firstElementChild as HTMLElement;
        Object.defineProperty(frame, 'offsetWidth', { value: 765, configurable: true });
        Object.defineProperty(frame, 'offsetHeight', { value: 503, configurable: true });
        frame.getBoundingClientRect = () => new DOMRect(0, 0, 765 * 2, 503 * 1.5);
        const outer = frame.firstElementChild as HTMLElement;
        const before = logicalRect(outer);

        fireEvent.mouseDown(outer, { altKey: true, button: 0, clientX: 400, clientY: 300 });
        // 100 client px across and 60 down are 50 and 40 frame px.
        fireEvent.mouseMove(window, { buttons: 1, altKey: true, clientX: 500, clientY: 360 });
        const after = logicalRect(outer);
        fireEvent.mouseUp(window, { altKey: true, clientX: 500, clientY: 360 });

        expect(after.left - before.left).toBeCloseTo(50, 6);
        expect(after.top - before.top).toBeCloseTo(40, 6);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('edit mode (the Mobile layout\'s "Edit layout")', () => {
    beforeEach(() => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    let restoreTouchPoints = () => {};

    afterEach(() => {
      vi.unstubAllGlobals();
      restoreTouchPoints();
      restoreTouchPoints = () => {};
    });

    function touch(target: EventTarget, type: string, x: number, y: number) {
      fireEvent(
        target as Element,
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          pointerId: 7,
          isPrimary: true,
          clientX: x,
          clientY: y,
        }),
      );
    }

    const TOP_LEFT = { x: 10, y: 10, anchorX: 'left', anchorY: 'top' } as const;

    it('drags a panel with a plain touch, no Alt, and saves where it was dropped', () => {
      const onPositionChange = vi.fn();
      const childPress = vi.fn();
      const { container } = renderDraggablePanel({
        defaultPosition: TOP_LEFT,
        position: TOP_LEFT,
        viewportWidth: 1000,
        viewportHeight: 800,
        editDrag: true,
        onPositionChange,
        children: (
          <button type="button" data-testid="child-btn" onPointerDown={childPress}>
            child
          </button>
        ),
      });
      const button = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      touch(button, 'pointerdown', 50, 50);
      touch(window, 'pointermove', 90, 70);
      touch(window, 'pointerup', 90, 70);

      expect(childPress).not.toHaveBeenCalled();
      expect(onPositionChange).toHaveBeenCalledWith({ x: 50, y: 30, anchorX: 'left', anchorY: 'top' });
    });

    /**
     * A mouse (or pen) press as Chromium delivers it: each pointer event, then its compatibility
     * mouse event, except that a canceled pointerdown suppresses the mouse events until release.
     * Returns the pointerdown, so a test can see whether the page took the press over.
     */
    function mouseGesture(
      target: Element,
      from: { x: number; y: number },
      to: { x: number; y: number },
      pointerType = 'mouse',
    ): PointerEvent {
      const down = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerType,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: from.x,
        clientY: from.y,
      });
      fireEvent(target, down);
      const compat = !down.defaultPrevented;
      if (compat) fireEvent.mouseDown(target, { button: 0, buttons: 1, clientX: from.x, clientY: from.y });
      const move = { pointerType, pointerId: 1, isPrimary: true, buttons: 1, clientX: to.x, clientY: to.y };
      fireEvent(target, new PointerEvent('pointermove', { bubbles: true, ...move }));
      if (compat) fireEvent.mouseMove(window, { buttons: 1, clientX: to.x, clientY: to.y });
      fireEvent(target, new PointerEvent('pointerup', { bubbles: true, ...move, buttons: 0 }));
      if (compat) fireEvent.mouseUp(window, { button: 0, buttons: 0, clientX: to.x, clientY: to.y });
      return down;
    }

    it('drags with a plain mouse press too, and shows the movability affordance throughout', () => {
      const onPositionChange = vi.fn();
      const childPointerDown = vi.fn();
      const childMouseDown = vi.fn();
      const { container } = renderDraggablePanel({
        defaultPosition: TOP_LEFT,
        position: TOP_LEFT,
        viewportWidth: 1000,
        viewportHeight: 800,
        editDrag: true,
        onPositionChange,
        children: (
          <button type="button" data-testid="child-btn" onPointerDown={childPointerDown} onMouseDown={childMouseDown}>
            child
          </button>
        ),
      });
      expect(container.querySelector('.dp-move-affordance[data-visible]')).not.toBeNull();
      const button = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      mouseGesture(button, { x: 50, y: 50 }, { x: 60, y: 50 });

      expect(onPositionChange).toHaveBeenCalledWith({ x: 20, y: 10, anchorX: 'left', anchorY: 'top' });
      expect(childPointerDown).not.toHaveBeenCalled();
      expect(childMouseDown).not.toHaveBeenCalled();
      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(false);
    });

    it.each([
      { where: 'on a touchscreen, taking the press over as a finger', maxTouchPoints: 10, takenOver: true },
      { where: 'on a separate pad (no touchscreen), through the mouse path', maxTouchPoints: 0, takenOver: false },
    ])('drags with a pen $where, exactly once', ({ maxTouchPoints, takenOver }) => {
      restoreTouchPoints = stubMaxTouchPoints(maxTouchPoints);
      const onPositionChange = vi.fn();
      const childMouseDown = vi.fn();
      const { container } = renderDraggablePanel({
        defaultPosition: TOP_LEFT,
        position: TOP_LEFT,
        viewportWidth: 1000,
        viewportHeight: 800,
        editDrag: true,
        onPositionChange,
        children: (
          <button type="button" data-testid="child-btn" onMouseDown={childMouseDown}>
            child
          </button>
        ),
      });
      const button = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      const down = mouseGesture(button, { x: 50, y: 50 }, { x: 60, y: 50 }, 'pen');

      // Taken over, the press is canceled, so its compatibility mouse events cannot start a
      // second, mouse drag; otherwise they are the drag.
      expect(down.defaultPrevented).toBe(takenOver);
      expect(onPositionChange).toHaveBeenCalledOnce();
      expect(onPositionChange).toHaveBeenCalledWith({ x: 20, y: 10, anchorX: 'left', anchorY: 'top' });
      expect(childMouseDown).not.toHaveBeenCalled();
      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(false);
    });

    it('drops nothing when the browser cancels the touch', () => {
      const onPositionChange = vi.fn();
      const { outer } = renderDraggablePanel({
        defaultPosition: TOP_LEFT,
        position: TOP_LEFT,
        editDrag: true,
        onPositionChange,
      });

      touch(outer, 'pointerdown', 50, 50);
      touch(window, 'pointermove', 90, 70);
      touch(window, 'pointercancel', 90, 70);

      expect(onPositionChange).not.toHaveBeenCalled();
      expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(false);
    });

    it('does not move a locked panel, and a plain press does nothing outside edit mode', () => {
      const onPositionChange = vi.fn();
      const locked = renderDraggablePanel({
        defaultPosition: TOP_LEFT,
        position: TOP_LEFT,
        editDrag: true,
        locked: true,
        onPositionChange,
      });
      touch(locked.outer, 'pointerdown', 50, 50);
      touch(window, 'pointerup', 90, 70);
      locked.unmount();

      const plain = renderDraggablePanel({ defaultPosition: TOP_LEFT, position: TOP_LEFT, onPositionChange });
      touch(plain.outer, 'pointerdown', 50, 50);
      fireEvent.mouseDown(plain.outer, { button: 0, clientX: 50, clientY: 50 });
      fireEvent.mouseUp(window, { clientX: 90, clientY: 70 });

      expect(onPositionChange).not.toHaveBeenCalled();
    });
  });

  describe('alt-modified events do not reach descendant buttons', () => {
    it('swallows alt+mousedown so descendant onMouseDown does not fire', () => {
      const childMouseDown = vi.fn();
      const { container } = renderDraggablePanel({
        children: (
          <button type="button" data-testid="child-btn" onMouseDown={childMouseDown}>
            child
          </button>
        ),
      });
      const btn = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      fireEvent.mouseDown(btn, { altKey: true, button: 0 });

      expect(childMouseDown).not.toHaveBeenCalled();
    });

    it('lets non-alt mousedown reach descendant onMouseDown normally', () => {
      const childMouseDown = vi.fn();
      const { container } = renderDraggablePanel({
        children: (
          <button type="button" data-testid="child-btn" onMouseDown={childMouseDown}>
            child
          </button>
        ),
      });
      const btn = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      fireEvent.mouseDown(btn, { altKey: false, button: 0 });

      expect(childMouseDown).toHaveBeenCalledTimes(1);
    });

    it('swallows alt+contextmenu so descendant onContextMenu does not fire', () => {
      const childContextMenu = vi.fn();
      const { container } = renderDraggablePanel({
        children: (
          <button type="button" data-testid="child-btn" onContextMenu={childContextMenu}>
            child
          </button>
        ),
      });
      const btn = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      fireEvent.contextMenu(btn, { altKey: true });

      expect(childContextMenu).not.toHaveBeenCalled();
    });

    it('lets non-alt contextmenu reach descendant onContextMenu normally', () => {
      const childContextMenu = vi.fn();
      const { container } = renderDraggablePanel({
        children: (
          <button type="button" data-testid="child-btn" onContextMenu={childContextMenu}>
            child
          </button>
        ),
      });
      const btn = container.querySelector('[data-testid="child-btn"]') as HTMLButtonElement;

      fireEvent.contextMenu(btn, { altKey: false });

      expect(childContextMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe('locked prop', () => {
    it('tells a tour what the player cannot do to it: move it, resize it, both or neither', () => {
      const states = [
        {},
        { locked: true },
        { scaleEnabled: false },
        { scaleLocked: true },
        { locked: true, scaleEnabled: false },
      ];
      const marks = states.map((props) => {
        const { outer, unmount } = renderDraggablePanel(props);
        const mark = [outer.hasAttribute('data-locked'), outer.hasAttribute('data-scale-locked')];
        unmount();
        return mark;
      });
      expect(marks).toEqual([
        [false, false],
        [true, false],
        [false, true],
        [false, true],
        [true, true],
      ]);
    });

    it('does not call onPositionChange on Alt+left mousedown when locked', () => {
      const onPositionChange = vi.fn();
      const { outer } = renderDraggablePanel({ locked: true, onPositionChange });
      // Alt+left mousedown would normally start a drag and (on move) fire
      // onPositionChange; when locked the handler must early-return.
      fireEvent.mouseDown(outer, { altKey: true, button: 0, clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(window, { clientX: 200, clientY: 200 });
      expect(onPositionChange).not.toHaveBeenCalled();
    });

    it('does not reset position on Alt+right-click when locked', () => {
      const onPositionChange = vi.fn();
      const draggedPosition = { x: 100, y: 100, anchorX: 'right' as const, anchorY: 'bottom' as const };
      const { outer } = renderDraggablePanel({ locked: true, position: draggedPosition, onPositionChange });
      // Alt+right-click would normally snap the panel back to defaultPosition
      // and emit onPositionChange; when locked nothing should fire.
      fireEvent.mouseDown(outer, { altKey: true, button: 2 });
      expect(onPositionChange).not.toHaveBeenCalled();
    });

    it('still calls onScaleChange on Alt+wheel when movement is locked', async () => {
      const onScaleChange = vi.fn();
      const { zoomDiv } = renderDraggablePanel({ locked: true, scale: 1, onScaleChange });

      fireEvent.mouseEnter(zoomDiv.firstElementChild as HTMLDivElement);
      fireEvent.wheel(window, { deltaY: -120, altKey: true, clientX: 500, clientY: 500 });
      await waitFor(() => expect(onScaleChange).toHaveBeenCalledWith(7 / 6));
    });
  });

  describe('physicalSize prop', () => {
    // A pinned panel is sized from a rect its owner already snapped in frame space, so
    // the box is authoritative and the content zooms to COVER it — a shortfall would
    // leave a sliver of whatever sits behind the panel along its outer edge.
    it('takes its box from physicalSize instead of width x scale', () => {
      const { outer } = renderDraggablePanel({
        width: 200,
        height: 300,
        scale: 1.5,
        physicalSize: { width: 301, height: 451 },
      });

      expect(outer.style.width).toBe('301px');
      expect(outer.style.height).toBe('451px');
    });

    it('zooms to cover the snapped box, never to fit inside it', () => {
      // 301/200 = 1.505 vs 451/300 = 1.5033: cover takes the larger.
      const { zoomDiv } = renderDraggablePanel({
        width: 200,
        height: 300,
        scale: 1.5,
        physicalSize: { width: 301, height: 451 },
      });

      expect(Number(zoomDiv.style.zoom)).toBeCloseTo(301 / 200, 10);
      expect(Number(zoomDiv.style.zoom)).toBeGreaterThanOrEqual(451 / 300);
    });

    it('clips the covering overflow, which a movable panel must not do', () => {
      const pinned = renderDraggablePanel({ physicalSize: { width: 301, height: 451 } });
      expect(pinned.outer.style.overflow).toBe('hidden');

      const movable = renderDraggablePanel();
      expect(movable.outer.style.overflow).toBe('visible');
    });

    it('publishes the applied zoom to descendants, not the global UI scale', () => {
      function ScaleProbe() {
        return <span data-testid="applied-scale">{usePanelContentScale()}</span>;
      }

      const pinned = renderDraggablePanel({
        width: 200,
        height: 300,
        scale: 1.5,
        physicalSize: { width: 301, height: 451 },
        children: <ScaleProbe />,
      });
      const readProbe = (root: HTMLElement) => Number(root.querySelector('[data-testid="applied-scale"]')?.textContent);
      expect(readProbe(pinned.container)).toBeCloseTo(301 / 200, 10);

      const movable = renderDraggablePanel({ width: 200, height: 300, scale: 1.5, children: <ScaleProbe /> });
      expect(readProbe(movable.container)).toBe(1.5);
    });
  });

  describe('scaleLocked prop', () => {
    // Fixed layout pins manual resizing; Auto overlays only add their own lock.
    const renderUnderForcedUiScale = (onScaleChange: () => void) => {
      const result = render(
        <TooltipProvider forcedScale={1}>
          <DraggablePanel
            defaultPosition={{ x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' }}
            width={200}
            height={300}
            scale={1}
            onScaleChange={onScaleChange}
          >
            <div data-testid="locked-content">content</div>
          </DraggablePanel>
        </TooltipProvider>,
      );
      // The hover target is the transform layer that wraps the content (see renderDraggablePanel).
      fireEvent.mouseEnter(result.getByTestId('locked-content').parentElement as HTMLElement);
      fireEvent.wheel(window, { deltaY: -120, altKey: true, clientX: 500, clientY: 500 });
    };

    it('follows the shared UI-scale lock by default', async () => {
      const onScaleChange = vi.fn();
      renderUnderForcedUiScale(onScaleChange);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(onScaleChange).not.toHaveBeenCalled();
    });
  });

  describe('scaleEnabled prop', () => {
    it('does not call onScaleChange on Alt+wheel when scaling is disabled', async () => {
      const onScaleChange = vi.fn();
      const { zoomDiv } = renderDraggablePanel({ scaleEnabled: false, scale: 1, onScaleChange });

      fireEvent.mouseEnter(zoomDiv.firstElementChild as HTMLDivElement);
      fireEvent.wheel(window, { deltaY: -120, altKey: true, clientX: 500, clientY: 500 });
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(onScaleChange).not.toHaveBeenCalled();
    });
  });
});

describe('stepScale (Alt+wheel scale stepping)', () => {
  // The shared production ladder. Imported rather than
  // duplicated so a change to the stops cannot leave these expectations describing a ladder
  // that no longer ships.
  const STOPS = [...PANEL_SCALE_STOPS];

  it('offers the complete scale ladder through 300 percent', () => {
    expect(STOPS[0]).toBe(1);
    expect(STOPS.at(-1)).toBe(3);
  });

  it('returns prev for a zero net step', () => {
    expect(stepScale(4 / 3, 0, STOPS)).toBe(4 / 3);
  });

  it('returns prev when there are no stops', () => {
    expect(stepScale(1.5, 3, [])).toBe(1.5);
  });

  it('steps up one stop from an exact stop', () => {
    expect(stepScale(1, 1, STOPS)).toBe(7 / 6);
    expect(stepScale(4 / 3, 1, STOPS)).toBe(3 / 2);
  });

  it('steps down one stop from an exact stop', () => {
    expect(stepScale(7 / 6, -1, STOPS)).toBe(1);
    expect(stepScale(4 / 3, -1, STOPS)).toBe(7 / 6);
  });

  it('collapses a multi-notch burst into one jump (up)', () => {
    // index 0 -> +3 -> index 3
    expect(stepScale(1, 3, STOPS)).toBe(3 / 2);
  });

  it('collapses a multi-notch burst into one jump (down)', () => {
    // 4/3 is index 2 -> -2 -> index 0
    expect(stepScale(4 / 3, -2, STOPS)).toBe(1);
  });

  it('clamps at the maximum stop', () => {
    expect(stepScale(3, 1, STOPS)).toBe(3);
    expect(stepScale(17 / 6, 5, STOPS)).toBe(3);
    expect(stepScale(1, 100, STOPS)).toBe(3);
  });

  it('clamps at the minimum stop', () => {
    expect(stepScale(1, -1, STOPS)).toBe(1);
    expect(stepScale(7 / 6, -5, STOPS)).toBe(1);
    expect(stepScale(2, -100, STOPS)).toBe(1);
  });

  it('snaps to the next stop up when starting BETWEEN stops', () => {
    // 1.05 sits between 1 (idx0) and 7/6 (idx1); one step up lands on 7/6,
    // two steps go one further to 4/3 (the between-value consumes one step).
    expect(stepScale(1.05, 1, STOPS)).toBe(7 / 6);
    expect(stepScale(1.05, 2, STOPS)).toBe(4 / 3);
  });

  it('snaps to the next stop down when starting BETWEEN stops', () => {
    // 1.3 sits between 7/6 (idx1) and 4/3 (idx2); one step down lands on 7/6,
    // two steps go one further down to 1.
    expect(stepScale(1.3, -1, STOPS)).toBe(7 / 6);
    expect(stepScale(1.3, -2, STOPS)).toBe(1);
  });

  it('returns a custom scale above 200 percent to the notch ladder', () => {
    expect(stepScale(2.25, 1, STOPS)).toBe(7 / 3);
    expect(stepScale(2.25, -1, STOPS)).toBe(13 / 6);
  });

  it('treats a value within 0.001 of a stop as being on that stop', () => {
    // 1.0005 is within epsilon of stop 1, so +1 lands on 7/6, not on itself.
    expect(stepScale(1.0005, 1, STOPS)).toBe(7 / 6);
  });

  it('honors a restricted stops ladder (min/max filtered)', () => {
    const narrow = [1, 3 / 2, 2];
    expect(stepScale(1, 1, narrow)).toBe(3 / 2);
    expect(stepScale(1, 2, narrow)).toBe(2);
    expect(stepScale(1, 9, narrow)).toBe(2);
    expect(stepScale(2, -2, narrow)).toBe(1);
  });
});

describe('unmount-during-drag cleanup', () => {
  it('fires notifyDragEnd on unmount mid-drag so <html> data-panel-dragging is not stranded', () => {
    // useRafDrag's OWN cleanup clears its isDraggingRef before this component's
    // cleanup runs, so the leak guard must key off a DraggablePanel-owned flag
    // (dragActiveRef). Otherwise activeDragCount + the global marker leak.
    const { outer, unmount } = renderDraggablePanel();
    fireEvent.mouseDown(outer, { altKey: true, button: 0, clientX: 10, clientY: 10 });
    expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(true);
    // Unmount WITHOUT a mouseup (panel disappears mid-drag).
    unmount();
    expect(document.documentElement.hasAttribute('data-panel-dragging')).toBe(false);
  });
});

describe('proportional layout on UI-scale change', () => {
  const BASE = {
    children: <div>content</div>,
    defaultPosition: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const,
    width: 200,
    height: 300,
  };

  it('keeps its fraction of the free space as the panel grows, rather than scaling the offset', async () => {
    // 1024x768 jsdom viewport. At 1x the 200x300 box has 824 x 468 of free space; at 2x
    // the 400x600 box has 624 x 168. Each gap shrinks with the free space, so the panel
    // grows about the point the same fraction across itself.
    const onPositionChange = vi.fn();
    const position = { x: 100, y: 200, anchorX: 'right', anchorY: 'bottom' } as const;
    const { rerender, container } = render(
      <DraggablePanel {...BASE} position={position} scale={1} onPositionChange={onPositionChange} />,
    );
    onPositionChange.mockClear();

    rerender(<DraggablePanel {...BASE} position={position} scale={2} onPositionChange={onPositionChange} />);

    const rect = logicalRect(container.firstElementChild as HTMLElement);
    expect(1024 - rect.right).toBeCloseTo((100 * 624) / 824, 9);
    expect(768 - rect.bottom).toBeCloseTo((200 * 168) / 468, 9);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('returns to the original offsets across a scale round-trip', async () => {
    const onPositionChange = vi.fn();
    const position = { x: 100, y: 200, anchorX: 'right', anchorY: 'bottom' } as const;
    const render1 = (scale: number) => (
      <DraggablePanel {...BASE} position={position} scale={scale} onPositionChange={onPositionChange} />
    );
    const { rerender, container } = render(render1(1));
    const outer = container.firstElementChild as HTMLDivElement;
    const originalTransform = outer.style.transform;

    rerender(render1(2));
    rerender(render1(1));

    await new Promise((resolve) => setTimeout(resolve, 0));
    // A burst that ends where it started has nothing new to save, and must not leave a
    // mid-burst offset behind.
    expect(onPositionChange.mock.calls.at(-1)?.[0] ?? position).toEqual(position);
    expect(outer.style.transform).toBe(originalTransform);
  });

  it('leaves a panel pinned in its anchor corner alone', async () => {
    const onPositionChange = vi.fn();
    const position = { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const;
    const { rerender } = render(
      <DraggablePanel {...BASE} position={position} scale={1} onPositionChange={onPositionChange} />,
    );
    onPositionChange.mockClear();

    rerender(<DraggablePanel {...BASE} position={position} scale={2} onPositionChange={onPositionChange} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('defers to a controlled position that moved in the same commit', async () => {
    // The pinned infobox strip recomputes its position against the NEW scale
    // every step; rescaling it here too would double-apply the ratio.
    const onPositionChange = vi.fn();
    const { rerender, container } = render(
      <DraggablePanel
        {...BASE}
        position={{ x: 100, y: 200, anchorX: 'right', anchorY: 'bottom' }}
        scale={1}
        onPositionChange={onPositionChange}
      />,
    );
    onPositionChange.mockClear();

    rerender(
      <DraggablePanel
        {...BASE}
        position={{ x: 150, y: 250, anchorX: 'right', anchorY: 'bottom' }}
        scale={2}
        onPositionChange={onPositionChange}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPositionChange).not.toHaveBeenCalled();
    // 1024x768 jsdom viewport, box is 400x600 at scale 2: left = 1024-400-150
    // = 474 (the owner's x, un-rescaled). The 600px-tall box no longer fits
    // above y=250, so displayPos clamps the top edge to 0 for painting only.
    const outer = container.firstElementChild as HTMLDivElement;
    expect(outer.style.transform).toBe('translate3d(474px, 0px, 0)');
  });

  it('never moves a panel that renders at a fixed size, whatever the global UI scale does', async () => {
    // A panel sized by the overlay size renders at the same scale whatever the UI scale
    // does, so a UI-scale step reaches it as a re-render with nothing changed.
    const onPositionChange = vi.fn();
    const position = { x: 235, y: 96, anchorX: 'right', anchorY: 'top' } as const;
    const { rerender, container } = render(
      <DraggablePanel {...BASE} position={position} scale={1} onPositionChange={onPositionChange} />,
    );
    onPositionChange.mockClear();

    rerender(
      <DraggablePanel {...BASE} position={position} scale={1} zIndex={11} onPositionChange={onPositionChange} />,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onPositionChange).not.toHaveBeenCalled();

    // It moves only when its own box grows, keeping its fraction of the free space.
    rerender(<DraggablePanel {...BASE} position={position} scale={2} onPositionChange={onPositionChange} />);
    const rect = logicalRect(container.firstElementChild as HTMLElement);
    expect(1024 - rect.right).toBeCloseTo((235 * 624) / 824, 9);
    expect(rect.top).toBeCloseTo((96 * 168) / 468, 9);
    expect(onPositionChange).not.toHaveBeenCalled();
  });
});

describe('Alt+wheel resize gesture ownership', () => {
  const wheel = (deltaY: number) => fireEvent.wheel(window, { deltaY, altKey: true, clientX: 500, clientY: 500 });

  it('keeps resizing after the panel shrinks out from under the cursor', async () => {
    // Growing pulls a corner-anchored panel towards a stationary cursor;
    // shrinking pulls it away. Hover-gating every step made scrolling DOWN
    // dead-end mid-ladder while scrolling UP worked fine.
    const onScaleChange = vi.fn();
    const { zoomDiv } = renderDraggablePanel({ scale: 1, onScaleChange });

    fireEvent.mouseEnter(zoomDiv.firstElementChild as HTMLDivElement);
    wheel(-120);
    await waitFor(() => expect(onScaleChange).toHaveBeenCalled());
    onScaleChange.mockClear();

    // The panel has now shrunk/grown away from the pointer: hover is gone.
    fireEvent.mouseLeave(zoomDiv.firstElementChild as HTMLDivElement);
    wheel(120);
    await waitFor(() => {
      expect(onScaleChange).toHaveBeenCalled();
    });
  });

  it('ignores Alt+wheel that starts away from every panel', async () => {
    // Starting a gesture still requires the cursor to be over the panel, so an
    // Alt+wheel that starts over the scene resizes nothing.
    const onScaleChange = vi.fn();
    renderDraggablePanel({ scale: 1, onScaleChange });

    wheel(-120);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onScaleChange).not.toHaveBeenCalled();
  });

  it('ignores Alt+wheel while TooltipProvider forces the scale', async () => {
    const onScaleChange = vi.fn();
    const result = render(
      <TooltipProvider initialScale={1} forcedScale={1.5}>
        <DraggablePanel
          defaultPosition={{ x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' }}
          width={200}
          height={300}
          scale={1.5}
          onScaleChange={onScaleChange}
        >
          <div>content</div>
        </DraggablePanel>
      </TooltipProvider>,
    );
    const outer = result.container.firstElementChild as HTMLDivElement;
    const zoomDiv = outer.firstElementChild as HTMLDivElement;

    fireEvent.mouseEnter(zoomDiv.firstElementChild as HTMLDivElement);
    wheel(-120);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(onScaleChange).not.toHaveBeenCalled();
    expect(zoomDiv.style.zoom).toBe('1.5');
  });

  it('keeps a burst on its panel while the wheel turns, and hands over once it goes quiet', async () => {
    const aScaleChange = vi.fn();
    const bScaleChange = vi.fn();
    const panel = (id: string, onScaleChange: () => void, x: number) => (
      <DraggablePanel
        dataTutorial={id}
        defaultPosition={{ x, y: 0, anchorX: 'left', anchorY: 'top' }}
        width={200}
        height={300}
        scale={1}
        onScaleChange={onScaleChange}
      >
        <div data-content={id} />
      </DraggablePanel>
    );
    const view = render(
      <>
        {panel('a', aScaleChange, 0)}
        {panel('b', bScaleChange, 400)}
      </>,
    );
    const inner = (id: string) => view.container.querySelector(`[data-content="${id}"]`)?.parentElement as HTMLElement;
    const notch = async () => {
      await act(async () => {
        wheel(-120);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });
    };
    fireEvent.keyDown(window, { key: 'Alt' });
    fireEvent.mouseEnter(inner('a'));
    await notch();
    expect(aScaleChange).toHaveBeenCalledTimes(1);

    // Still wheeling: the cursor reaching B (as when A shrinks away) leaves the burst on A.
    fireEvent.mouseLeave(inner('a'));
    fireEvent.mouseEnter(inner('b'));
    await notch();
    expect(aScaleChange).toHaveBeenCalledTimes(2);
    expect(bScaleChange).not.toHaveBeenCalled();

    // A pause ends the burst while Alt stays down, and the next one starts where the cursor is.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ALT_WHEEL_GESTURE_IDLE_MS + 50));
    });
    await notch();
    expect(bScaleChange).toHaveBeenCalledTimes(1);
    expect(aScaleChange).toHaveBeenCalledTimes(2);
  });

  it('releases the gesture when Alt is released', async () => {
    const onScaleChange = vi.fn();
    const { zoomDiv } = renderDraggablePanel({ scale: 1, onScaleChange });

    fireEvent.mouseEnter(zoomDiv.firstElementChild as HTMLDivElement);
    wheel(-120);
    await waitFor(() => expect(onScaleChange).toHaveBeenCalled());

    fireEvent.mouseLeave(zoomDiv.firstElementChild as HTMLDivElement);
    fireEvent.keyUp(window, { key: 'Alt' });
    onScaleChange.mockClear();

    wheel(-120);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onScaleChange).not.toHaveBeenCalled();
  });
});

describe('proportional layout across a fast resize burst', () => {
  const BASE_BURST = {
    children: <div>content</div>,
    defaultPosition: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const,
    width: 200,
    height: 300,
  };

  it('keeps projecting when the owner echoes the stored offset as a fresh object', async () => {
    // A resize burst interleaves our onPositionChange write with the next scale
    // step, so the owner re-emits the SAME offset as a fresh object. Treating
    // that identity change as an owner move skipped the rescale and lost that
    // step's ratio for good — the drift users saw when scrolling quickly.
    const onPositionChange = vi.fn();
    const panel = (scale: number, pos: { x: number; y: number }) => (
      <DraggablePanel
        {...BASE_BURST}
        position={{ ...pos, anchorX: 'right', anchorY: 'bottom' }}
        scale={scale}
        onPositionChange={onPositionChange}
      />
    );
    const { rerender, container } = render(panel(1, { x: 100, y: 200 }));
    onPositionChange.mockClear();

    rerender(panel(1.5, { x: 100, y: 200 }));
    const step = { x: 100, y: 200 };
    expect(1024 - logicalRect(container.firstElementChild as HTMLElement).right).toBeCloseTo((100 * 724) / 824, 9);

    // Step 2: the owner's echo of step 1 lands in the SAME commit as the next scale
    // step. New object, identical values — it must not become the new reference, so
    // step 2 lands exactly where a single 1 → 2 step would.
    rerender(panel(2, { x: step.x, y: step.y }));
    const rect = logicalRect(container.firstElementChild as HTMLElement);
    expect(1024 - rect.right).toBeCloseTo((100 * 624) / 824, 9);
    expect(768 - rect.bottom).toBeCloseTo((200 * 168) / 468, 9);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('still defers when the owner genuinely moves the panel', async () => {
    const onPositionChange = vi.fn();
    const { rerender } = render(
      <DraggablePanel
        {...BASE_BURST}
        position={{ x: 100, y: 200, anchorX: 'right', anchorY: 'bottom' }}
        scale={1}
        onPositionChange={onPositionChange}
      />,
    );
    onPositionChange.mockClear();

    rerender(
      <DraggablePanel
        {...BASE_BURST}
        position={{ x: 150, y: 250, anchorX: 'right', anchorY: 'bottom' }}
        scale={2}
        onPositionChange={onPositionChange}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPositionChange).not.toHaveBeenCalled();
  });
});

describe('persisted position across size-only vs viewport commits', () => {
  const BASE_VP = {
    children: <div>content</div>,
    defaultPosition: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const,
    width: 200,
    height: 300,
  };

  it('does not clamp-persist on a scale-only commit, so round-trips stay lossless', async () => {
    // At scale 3 a 200x300 panel parked 300px off the corner no longer fits the
    // 500x500 viewport. displayPos clamps that for PAINTING, but writing the
    // clamped value back would destroy the offset and a scale round-trip could
    // never restore it. Only the proportional rescale may be emitted.
    const onPositionChange = vi.fn();
    const panel = (scale: number) => (
      <DraggablePanel
        {...BASE_VP}
        position={{ x: 300, y: 300, anchorX: 'right', anchorY: 'bottom' }}
        scale={scale}
        viewportWidth={500}
        viewportHeight={500}
        onPositionChange={onPositionChange}
      />
    );
    const { rerender, container } = render(panel(1));
    const outer = container.firstElementChild as HTMLDivElement;
    const originalTransform = outer.style.transform;
    onPositionChange.mockClear();

    rerender(panel(3));

    await new Promise((resolve) => setTimeout(resolve, 0));
    // The 600x900 box has no free space to take a fraction of: the offset is kept and
    // only the paint is clamped, so nothing is written.
    expect(outer.style.transform).toBe('translate3d(0px, 0px, 0)');
    expect(onPositionChange).not.toHaveBeenCalled();

    rerender(panel(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(outer.style.transform).toBe(originalTransform);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('still rescales and clamps when the viewport itself changes', async () => {
    const onPositionChange = vi.fn();
    const panel = (vw: number, vh: number) => (
      <DraggablePanel
        {...BASE_VP}
        position={{ x: 100, y: 100, anchorX: 'left', anchorY: 'top' }}
        scale={1}
        viewportWidth={vw}
        viewportHeight={vh}
        onPositionChange={onPositionChange}
      />
    );
    const { rerender, container } = render(panel(1000, 1000));
    onPositionChange.mockClear();

    // Halving the viewport halves a left/top-anchored panel's slack-relative offset.
    rerender(panel(500, 500));

    const rect = logicalRect(container.firstElementChild as HTMLElement);
    expect(rect.left).toBeCloseTo((100 * 300) / 800, 9);
    expect(rect.top).toBeCloseTo((100 * 200) / 700, 9);
    expect(onPositionChange).not.toHaveBeenCalled();
  });
});

describe('placement projection with controlled-position feedback', () => {
  afterEach(() => {
    fireEvent.keyUp(window, { key: 'Alt' });
    fireEvent.blur(window);
  });

  const initialGeometry = { viewportWidth: 1920, viewportHeight: 1080, scale: 1.5 };
  const enlargedGeometry = { viewportWidth: 2560, viewportHeight: 1440, scale: 2 };
  const anchors = [
    { anchorX: 'left', anchorY: 'top' },
    { anchorX: 'right', anchorY: 'top' },
    { anchorX: 'left', anchorY: 'bottom' },
    { anchorX: 'right', anchorY: 'bottom' },
  ] as const;

  function feedbackPanel(initialPosition: UIPosition, extra: Partial<ComponentProps<typeof DraggablePanel>> = {}) {
    let stored = initialPosition;
    const writes = vi.fn();
    function ControlledPanel(props: typeof initialGeometry) {
      const [position, setPosition] = useState(initialPosition);
      stored = position;
      return (
        <DraggablePanel
          defaultPosition={initialPosition}
          position={position}
          width={208}
          height={100}
          onPositionChange={(next) => {
            writes(next);
            setPosition({ ...next });
          }}
          {...props}
          {...extra}
        >
          content
        </DraggablePanel>
      );
    }
    const view = render(<ControlledPanel {...initialGeometry} />);
    return {
      ...view,
      writes,
      stored: () => stored,
      outer: view.container.firstElementChild as HTMLDivElement,
      resize: async (geometry: typeof initialGeometry) => {
        await act(async () => view.rerender(<ControlledPanel {...geometry} />));
      },
    };
  }

  it.each(anchors)('round-trips 1920@1.5 → 2560@2 → 1920@1.5 ($anchorX/$anchorY)', async (anchor) => {
    const original = { x: 300, y: 200, ...anchor };
    const panel = feedbackPanel(original);
    const originalTransform = panel.outer.style.transform;
    await panel.resize(enlargedGeometry);
    expect(panel.stored()).toEqual(original);
    expect(panel.outer.style.transform).not.toBe(originalTransform);
    await panel.resize(initialGeometry);
    expect(panel.stored()).toEqual(original);
    expect(panel.outer.style.transform).toBe(originalTransform);
  });

  it.each(
    anchors,
  )('composes simultaneous, scale-first and viewport-first transitions ($anchorX/$anchorY)', async (anchor) => {
    const initial = { x: 300, y: 200, ...anchor };
    const simultaneous = feedbackPanel(initial);
    await simultaneous.resize(enlargedGeometry);
    const expected = simultaneous.stored();
    const expectedTransform = simultaneous.outer.style.transform;
    simultaneous.unmount();

    for (const intermediate of [
      { ...initialGeometry, scale: enlargedGeometry.scale },
      { ...enlargedGeometry, scale: initialGeometry.scale },
    ]) {
      const separate = feedbackPanel(initial);
      await separate.resize(intermediate);
      await separate.resize(enlargedGeometry);
      expect(separate.stored()).toEqual(expected);
      expect(separate.outer.style.transform).toBe(expectedTransform);
      await separate.resize(intermediate);
      await separate.resize(initialGeometry);
      expect(separate.stored()).toEqual(initial);
      separate.unmount();
    }
  });

  it.each(anchors)('restores intent after a viewport smaller than the panel ($anchorX/$anchorY)', async (anchor) => {
    const original = { x: 300, y: 200, ...anchor };
    const panel = feedbackPanel(original, { edgeInset: 8 });
    const originalTransform = panel.outer.style.transform;
    await panel.resize({ ...initialGeometry, viewportWidth: 100, viewportHeight: 100 });
    expect(panel.outer.style.transform).toBe('translate3d(8px, 8px, 0)');
    expect(panel.stored()).toEqual(original);
    expect(panel.writes).not.toHaveBeenCalled();
    await panel.resize(initialGeometry);
    expect(panel.stored()).toEqual(original);
    expect(panel.outer.style.transform).toBe(originalTransform);
  });

  it('keeps a right/bottom panel at its fraction of a small window that it still fits, and restores it', async () => {
    const original = { x: 300, y: 200, anchorX: 'right', anchorY: 'bottom' } as const;
    const panel = feedbackPanel(original);
    // 312x150 box: 1608 x 930 of free space at 1920x1080, 88 x 100 at 400x250.
    await panel.resize({ ...initialGeometry, viewportWidth: 400, viewportHeight: 250 });
    const [left, top] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/
      .exec(panel.outer.style.transform)
      ?.slice(1)
      .map(Number) ?? [Number.NaN, Number.NaN];
    expect(left).toBeCloseTo((1308 / 1608) * 88, 9);
    expect(top).toBeCloseTo((730 / 930) * 100, 9);
    await panel.resize(initialGeometry);
    expect(panel.stored()).toEqual(original);
    expect(panel.outer.style.transform).toBe('translate3d(1308px, 730px, 0)');
  });

  it.each(anchors)('does not accumulate error over 50 mixed-order round trips ($anchorX/$anchorY)', async (anchor) => {
    const original = { x: 300, y: 200, ...anchor };
    const panel = feedbackPanel(original);
    for (let i = 0; i < 50; i++) {
      await panel.resize({ ...initialGeometry, scale: enlargedGeometry.scale });
      await panel.resize(enlargedGeometry);
      await panel.resize({ ...initialGeometry, viewportWidth: 200, viewportHeight: 100 });
      await panel.resize(initialGeometry);
      expect(panel.stored()).toEqual(original);
    }
  });

  it.each([
    { externallyPositioned: true },
    { physicalSize: { width: 312, height: 150 } },
  ])('does not remap an owner-positioned panel: %j', async (extra) => {
    const original = { x: 300, y: 200, anchorX: 'left', anchorY: 'top' } as const;
    const panel = feedbackPanel(original, extra);
    await panel.resize(enlargedGeometry);
    expect(panel.outer.style.transform).toBe('translate3d(300px, 200px, 0)');
    expect(panel.writes).not.toHaveBeenCalled();
  });

  it('defers to an owner move during a simultaneous viewport and scale change', async () => {
    const writes = vi.fn();
    const original = { x: 300, y: 200, anchorX: 'left', anchorY: 'top' } as const;
    const moved = { ...original, x: 450, y: 250 };
    const panel = (geometry: typeof initialGeometry, position: UIPosition) => (
      <DraggablePanel
        {...geometry}
        width={208}
        height={100}
        defaultPosition={original}
        position={position}
        onPositionChange={writes}
      >
        content
      </DraggablePanel>
    );
    const view = render(panel(initialGeometry, original));
    await act(async () => view.rerender(panel(enlargedGeometry, moved)));
    expect((view.container.firstElementChild as HTMLElement).style.transform).toBe('translate3d(450px, 250px, 0)');
    expect(writes).not.toHaveBeenCalled();
    await act(async () => view.rerender(panel(initialGeometry, moved)));
    await act(async () => view.rerender(panel(enlargedGeometry, moved)));
    expect((view.container.firstElementChild as HTMLElement).style.transform).toBe('translate3d(450px, 250px, 0)');
    expect(writes).not.toHaveBeenCalled();
  });

  it('rebases after a drag instead of restoring the old placement on the next resize', async () => {
    const panel = feedbackPanel({ x: 300, y: 200, anchorX: 'left', anchorY: 'top' });
    await panel.resize({ ...initialGeometry, viewportWidth: 400, viewportHeight: 250 });
    await act(async () => {
      fireEvent.mouseDown(panel.outer, { altKey: true, button: 0, clientX: 30, clientY: 30 });
      fireEvent.mouseMove(window, { altKey: true, buttons: 1, clientX: 50, clientY: 50 });
      fireEvent.mouseUp(window, { altKey: true, clientX: 50, clientY: 50 });
    });
    const dragged = panel.stored();
    const transform = panel.outer.style.transform;
    await panel.resize(initialGeometry);
    await panel.resize({ ...initialGeometry, viewportWidth: 400, viewportHeight: 250 });
    expect(panel.stored()).toEqual(dragged);
    expect(panel.outer.style.transform).toBe(transform);
  });
});

describe('shift-drag snapping against passive targets', () => {
  function PassiveSiblings({ siblings }: { siblings: readonly PanelRect[] }) {
    const registry = usePanelSnapRegistry();
    useEffect(() => {
      if (!registry) return;
      const releases = siblings.map((sibling) => registry.registerPanel(sibling.id, () => sibling));
      return () => {
        for (const release of releases) release();
      };
    }, [registry, siblings]);
    return null;
  }

  function renderSnappablePanel(
    siblings: readonly PanelRect[],
    props: Partial<ComponentProps<typeof DraggablePanel>> = {},
  ) {
    const onPositionChange = vi.fn();
    const view = render(
      <PanelSnapRegistryProvider>
        <PassiveSiblings siblings={siblings} />
        <DraggablePanel
          defaultPosition={{ x: 300, y: 250, anchorX: 'left', anchorY: 'top' }}
          width={200}
          height={100}
          scale={1}
          viewportWidth={800}
          viewportHeight={600}
          onPositionChange={onPositionChange}
          {...props}
        >
          <div>content</div>
        </DraggablePanel>
      </PanelSnapRegistryProvider>,
    );
    const outer = view.container.firstElementChild;
    if (!(outer instanceof HTMLDivElement)) throw new Error('Expected the panel root to mount');
    return { outer, onPositionChange };
  }

  function dragWithShift(outer: HTMLElement, to: { x: number; y: number }) {
    fireEvent.mouseDown(outer, { altKey: true, shiftKey: true, button: 0, clientX: 350, clientY: 300 });
    // Shift must stay held on EVERY subsequent event: keyState resyncs the
    // modifier snapshot from each pointer event's flags, and a flag-less
    // mousemove would drop Shift and end snap mode mid-drag (correctly).
    fireEvent.mouseMove(window, { clientX: to.x, clientY: to.y, buttons: 1, altKey: true, shiftKey: true });
    fireEvent.mouseUp(window, { clientX: to.x, clientY: to.y, altKey: true, shiftKey: true });
  }

  afterEach(() => {
    // Restore the keyState module globals the flagged events above mutated.
    fireEvent.keyUp(window, { key: 'Shift' });
  });

  it('refuses a snap that would land the panel outside the viewport', async () => {
    // The target sits below the 600px frame: engaging its top edge (distance 4)
    // would push the panel's bottom to 604.
    const { outer, onPositionChange } = renderSnappablePanel([
      { id: 'below-frame', left: 250, top: 609, right: 450, bottom: 660 },
    ]);

    dragWithShift(outer, { x: 350, y: 560 });

    expect(outer.style.transform).toBe('translate3d(300px, 500px, 0)');
    await waitFor(() =>
      expect(onPositionChange).toHaveBeenCalledWith({ x: 300, y: 500, anchorX: 'left', anchorY: 'top' }),
    );
  });

  it('snaps to the nearest valid alternative when the closest candidate is invalid', () => {
    // below-frame is closer (distance 4) but illegal; right-dock (distance 10)
    // lands fully inside the frame and wins.
    const { outer } = renderSnappablePanel([
      { id: 'below-frame', left: 250, top: 609, right: 450, bottom: 660 },
      { id: 'right-dock', left: 515, top: 480, right: 615, bottom: 620 },
    ]);

    dragWithShift(outer, { x: 350, y: 560 });

    expect(outer.style.transform).toBe('translate3d(310px, 500px, 0)');
  });

  it('refuses a snap that would land the panel inside an exclusion zone', () => {
    // The exclusion push lands the panel at left 400; the target's contact edge
    // (distance 5) would push it back to 405, overlapping the zone at 600.
    const { outer } = renderSnappablePanel([{ id: 'in-sidebar', left: 610, top: 240, right: 710, bottom: 400 }], {
      exclusionRects: [{ left: 600, top: 0, right: 800, bottom: 600 }],
    });

    dragWithShift(outer, { x: 560, y: 300 });

    expect(outer.style.transform).toBe('translate3d(400px, 250px, 0)');
  });
});

describe('fast Alt+scroll bursts with controlled-scale feedback and a delayed store', () => {
  // The shared UI scale as App wires it: a live value that moves every step, written to
  // storage once the burst goes quiet, with storage echoing it back a little later still.
  const STORE_ECHO_MS = 30;

  function notch(direction: 1 | -1) {
    const event = new WheelEvent('wheel', {
      deltaY: -direction * 100,
      altKey: true,
      clientX: 1,
      clientY: 1,
      bubbles: true,
      cancelable: true,
    });
    // jsdom's constructor drops wheelDeltaY, the property that marks a detented mouse wheel.
    Object.defineProperty(event, 'wheelDeltaY', { value: direction * 120 });
    window.dispatchEvent(event);
  }
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

  afterEach(() => {
    fireEvent.keyUp(window, { key: 'Alt' });
    fireEvent.blur(window);
  });

  function renderBurstWorkspace() {
    const scaleChanges: number[] = [];
    const stored: { scale: number; positions: Record<string, UIPosition> } = { scale: 1, positions: {} };
    const initialPositions: Record<string, UIPosition> = {
      gamePanel: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' },
      strip: { x: 0, y: 330 + 5, anchorX: 'right', anchorY: 'bottom' },
    };
    const sizes = { gamePanel: { width: 240, height: 330 }, strip: { width: 150, height: 40 } };
    function Workspace() {
      const [storage, setStorage] = useState(1);
      const live = useLiveSetting(
        storage,
        (value: number) => {
          setTimeout(() => setStorage(value), STORE_ECHO_MS);
        },
        { delayMs: 20 },
      );
      const [positions, setPositions] = useState(initialPositions);
      stored.scale = storage;
      stored.positions = positions;
      return (
        <PanelSnapRegistryProvider>
          {(['gamePanel', 'strip'] as const).map((id) => (
            <DraggablePanel
              key={id}
              dataTutorial={id}
              defaultPosition={initialPositions[id]}
              position={positions[id]}
              {...sizes[id]}
              scale={live.value}
              viewportWidth={1920}
              viewportHeight={970}
              onPositionChange={(next) => setPositions((prev) => ({ ...prev, [id]: { ...next } }))}
              onScaleChange={(next) => {
                scaleChanges.push(next);
                live.change(next);
              }}
            >
              <div data-content={id} />
            </DraggablePanel>
          ))}
        </PanelSnapRegistryProvider>
      );
    }
    const view = render(<Workspace />);
    const root = (id: string) => view.container.querySelector<HTMLElement>(`[data-tutorial="${id}"]`) as HTMLElement;
    const zoom = () => Number((root('gamePanel').firstElementChild as HTMLElement).style.zoom);
    const rect = (id: string) => {
      return logicalRect(root(id));
    };
    fireEvent.keyDown(window, { key: 'Alt' });
    fireEvent.mouseEnter(root('gamePanel').querySelector('[data-content="gamePanel"]')?.parentElement as HTMLElement);
    return { view, zoom, rect, scaleChanges, stored };
  }

  const step = (n: number) => PANEL_SCALE_STOPS[PANEL_SCALE_STOPS.indexOf(1) + n];

  it('lands N notches on N ladder steps, one commit per frame', async () => {
    const ws = renderBurstWorkspace();
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        notch(1);
        await nextFrame();
      });
    }
    expect(ws.scaleChanges).toEqual([1, 2, 3, 4, 5].map(step));
    expect(ws.zoom()).toBe(step(5));
  });

  it('collapses notches that arrive within one frame into a single step change', async () => {
    const ws = renderBurstWorkspace();
    await act(async () => {
      for (let i = 0; i < 4; i++) notch(1);
      await nextFrame();
    });
    expect(ws.scaleChanges).toEqual([step(4)]);
  });

  it('returns to the start after the same number of notches up and down, storing it once', async () => {
    const ws = renderBurstWorkspace();
    const start = ws.rect('gamePanel');
    for (const direction of [1, 1, 1, 1, -1, -1, -1, -1] as const) {
      await act(async () => {
        notch(direction);
        await nextFrame();
      });
    }
    expect(ws.zoom()).toBe(1);
    expect(ws.rect('gamePanel')).toEqual(start);
    // Wait for the debounced store round trip to settle rather than a fixed sleep, which
    // under full-suite load can end before the final write's echo lands. A stale write
    // that sticks would still fail this.
    await waitFor(() => expect(ws.stored.scale).toBe(1));
    expect(ws.zoom()).toBe(1);
  });

  it('never steps back when an earlier step comes back from storage mid-burst', async () => {
    const ws = renderBurstWorkspace();
    const zooms: number[] = [];
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        notch(1);
        await nextFrame();
        // Pause past the debounce every other notch, so storage echoes a stale step
        // while the burst is still going.
        if (i % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 25 + STORE_ECHO_MS / 2));
      });
      zooms.push(ws.zoom());
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    zooms.push(ws.zoom());
    expect(zooms).toEqual([1, 2, 3, 4, 5, 6, 6].map(step));
    expect(ws.stored.scale).toBe(step(6));
  });

  it('keeps a docked neighbor attached through a fast burst', async () => {
    const ws = renderBurstWorkspace();
    const expectDocked = () => {
      const host = ws.rect('gamePanel');
      const strip = ws.rect('strip');
      expect(host.top - strip.bottom).toBeCloseTo(5, 6);
      expect(strip.right).toBeCloseTo(host.right, 6);
    };
    for (const burst of [[1, 1, 1], [1], [1, 1], [-1, -1, -1, -1], [1]] as const) {
      await act(async () => {
        for (const direction of burst) notch(direction);
        await nextFrame();
      });
      expectDocked();
    }
  });
});

describe('defaults, crisp steps and the device-pixel grid', () => {
  afterEach(() => {
    fireEvent.keyUp(window, { key: 'Alt' });
    fireEvent.blur(window);
  });

  const DEFAULT = { x: 104, y: 88, anchorX: 'left', anchorY: 'top' } as const;
  const panelAt = (scale: number, extra: Partial<ComponentProps<typeof DraggablePanel>> = {}) => (
    <DraggablePanel
      defaultPosition={DEFAULT}
      width={208}
      height={144}
      scale={scale}
      viewportWidth={1920}
      viewportHeight={970}
      {...extra}
    >
      <div data-content="panel" />
    </DraggablePanel>
  );
  const outerOf = (container: HTMLElement) => container.firstElementChild as HTMLDivElement;

  it('places a 1x default the same whether it loads at 2x or grows to 2x, and saves nothing', async () => {
    const onPositionChange = vi.fn();
    const loaded = render(panelAt(2, { onPositionChange }));
    const expectedX = (104 * (1920 - 416)) / (1920 - 208);
    const expectedY = (88 * (970 - 288)) / (970 - 144);
    expect(logicalRect(outerOf(loaded.container)).left).toBeCloseTo(expectedX, 9);
    expect(logicalRect(outerOf(loaded.container)).top).toBeCloseTo(expectedY, 9);
    loaded.unmount();

    const grown = render(panelAt(1, { onPositionChange }));
    expect(outerOf(grown.container).style.transform).toBe('translate3d(104px, 88px, 0)');
    await act(async () => grown.rerender(panelAt(2, { onPositionChange })));
    expect(logicalRect(outerOf(grown.container)).left).toBeCloseTo(expectedX, 9);
    expect(logicalRect(outerOf(grown.container)).top).toBeCloseTo(expectedY, 9);
    await act(async () => grown.rerender(panelAt(1, { onPositionChange })));
    expect(outerOf(grown.container).style.transform).toBe('translate3d(104px, 88px, 0)');
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Still on its default: nothing to save, so the next load places it the same way.
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('resets to the 1x default as it projects at the current size, and saves that', async () => {
    const onPositionChange = vi.fn();
    const view = render(
      panelAt(2, { position: { x: 900, y: 500, anchorX: 'left', anchorY: 'top' }, onPositionChange }),
    );
    await act(async () => {
      fireEvent.mouseDown(outerOf(view.container), { altKey: true, button: 2 });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onPositionChange).toHaveBeenCalledOnce();
    const reset = onPositionChange.mock.calls[0][0];
    expect(reset.x).toBeCloseTo((104 * (1920 - 416)) / (1920 - 208), 9);
    expect(reset.y).toBeCloseTo((88 * (970 - 288)) / (970 - 144), 9);
    expect(reset).toMatchObject({ anchorX: 'left', anchorY: 'top' });
  });

  it('swallows an Alt+scroll over a panel sized by Auto without blocking the game UI', async () => {
    // The plugin overlays cannot resize, so the wheel over them must not reach the camera,
    // but taking the burst would leave the game UI unresizable for the rest of the Alt press.
    const overlayScaleChange = vi.fn();
    const gameScaleChange = vi.fn();
    const view = render(
      <>
        {panelAt(1.5, { scaleLocked: true, onScaleChange: overlayScaleChange, dataTutorial: 'overlay' })}
        {panelAt(1, { onScaleChange: gameScaleChange, dataTutorial: 'game' })}
      </>,
    );
    const inner = (id: string) =>
      view.container.querySelector(`[data-tutorial="${id}"] [data-content="panel"]`)?.parentElement as HTMLElement;
    const notch = () => {
      const event = new WheelEvent('wheel', { deltaY: -100, altKey: true, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'wheelDeltaY', { value: 120 });
      window.dispatchEvent(event);
      return event;
    };
    fireEvent.keyDown(window, { key: 'Alt' });
    fireEvent.mouseEnter(inner('overlay'));
    let overOverlay: WheelEvent | undefined;
    await act(async () => {
      overOverlay = notch();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(overOverlay?.defaultPrevented).toBe(true);
    expect(overlayScaleChange).not.toHaveBeenCalled();

    // Same Alt press, no pause: straight on to the game UI.
    fireEvent.mouseLeave(inner('overlay'));
    fireEvent.mouseEnter(inner('game'));
    let overGame: WheelEvent | undefined;
    await act(async () => {
      overGame = notch();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(overGame?.defaultPrevented).toBe(true);
    expect(gameScaleChange).toHaveBeenCalledWith(PANEL_SCALE_STOPS[PANEL_SCALE_STOPS.indexOf(1) + 1]);
    expect(overlayScaleChange).not.toHaveBeenCalled();
    expect((outerOf(view.container).firstElementChild as HTMLElement).style.zoom).toBe('1.5');
  });

  it('paints on whole device pixels while its placement stays exact', () => {
    const view = render(panelAt(1, { position: { x: 100.4, y: 50.7, anchorX: 'left', anchorY: 'top' } }));
    const outer = outerOf(view.container);
    expect(outer.style.transform).toBe('translate3d(100.4px, 50.7px, 0)');
    const [dx, dy] = outer.style.translate.split(' ').map((value) => Number.parseFloat(value));
    expect(100.4 + dx).toBeCloseTo(100, 9);
    expect(50.7 + dy).toBeCloseTo(51, 9);
  });

  it('gives the zoomed content one 1x pixel for its borders', () => {
    const view = render(panelAt(2));
    const zoom = outerOf(view.container).firstElementChild as HTMLElement;
    expect(zoom.style.getPropertyValue('--unscaled-px')).toBe('0.5px');
    expect(zoom.style.getPropertyValue('--border-give')).toBe('0.5px');
  });
});
