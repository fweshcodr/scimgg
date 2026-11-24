// @vitest-environment happy-dom

// Isolated from DraggablePanel.test.tsx on purpose: the FLIP path reads
// module-level state (`activeDragCount`, `lastViewportChangeAt`) that the
// drag/hover tests in the sibling file mutate. A separate file gets a fresh
// module instance, so these assertions about snap-vs-glide are deterministic.

import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraggablePanel } from '../DraggablePanel';
import { infoboxContentScale } from '../InfoBox/InfoBoxPanel';

type AnimatableProto = { animate?: (keyframes: unknown, options: unknown) => Animation };
let animateCalls: Array<{
  keyframes: Array<{ transform: string }>;
  options: unknown;
  cancel: ReturnType<typeof vi.fn>;
}>;

const base = {
  children: <div>content</div>,
  defaultPosition: { x: 0, y: 0, anchorX: 'right' as const, anchorY: 'bottom' as const },
  width: 200,
  height: 300,
  onPositionChange: vi.fn(),
  onScaleChange: vi.fn(),
};

beforeEach(() => {
  // Release Alt so altHeld starts false (the snap-while-Alt gate reads it).
  fireEvent.keyUp(window, { key: 'Alt' });
  fireEvent.blur(window);
  document.elementFromPoint = () => null;

  animateCalls = [];
  // jsdom has no Web Animations API; provide a recording mock so the FLIP
  // branch (guarded by `typeof el.animate === 'function'`) actually runs and
  // we can assert the exact start-scale keyframe it computes.
  (HTMLElement.prototype as unknown as AnimatableProto).animate = (keyframes, options) => {
    const cancel = vi.fn();
    animateCalls.push({ keyframes: keyframes as Array<{ transform: string }>, options, cancel });
    return { cancel } as unknown as Animation;
  };
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as AnimatableProto).animate;
});

function startScaleOf(call: { keyframes: Array<{ transform: string }> }): number {
  const m = /scale\(([-\d.]+)/.exec(call.keyframes[0].transform);
  return m ? Number.parseFloat(m[1]) : Number.NaN;
}

describe('DraggablePanel resize FLIP: painted box ratio + Alt snap', () => {
  it('FLIPs from the inverse painted-box ratio on a scale change', () => {
    const { rerender } = render(<DraggablePanel {...base} scale={1} />);
    animateCalls.length = 0; // ignore the mount pass (no scale change yet)
    rerender(<DraggablePanel {...base} scale={10 / 9} />);
    expect(animateCalls).toHaveLength(1);
    // Device-pixel rounding gives a 222px target box, animating from 200px.
    expect(startScaleOf(animateCalls[0])).toBeCloseTo(200 / 222, 9);
    expect(animateCalls[0].keyframes[1].transform).toBe('none');
  });

  it('animates the real damped infobox tile from 32px to 43px without applying damping twice', () => {
    const tile = (scale: number) => (
      <DraggablePanel
        {...base}
        scale={scale}
        width={32 * infoboxContentScale(scale)}
        height={32 * infoboxContentScale(scale)}
      />
    );
    const { rerender, container } = render(tile(1));
    animateCalls.length = 0;
    rerender(tile(2));
    expect(animateCalls).toHaveLength(1);
    const paintedWidth = Number.parseFloat((container.firstElementChild as HTMLElement).style.width);
    expect(paintedWidth).toBe(43);
    expect(startScaleOf(animateCalls[0])).toBeCloseTo(32 / 43, 9);
    expect(paintedWidth * startScaleOf(animateCalls[0])).toBeCloseTo(32, 9);
    rerender(tile(1));
    expect(startScaleOf(animateCalls[1])).toBeCloseTo(43 / 32, 9);
  });

  it('starts a growing undamped box smaller than its final size', () => {
    const { rerender } = render(<DraggablePanel {...base} scale={1} />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={10 / 9} />);
    expect(animateCalls).toHaveLength(1);
    expect(startScaleOf(animateCalls[0])).toBeLessThan(0.95);
  });

  it('SNAPS (no FLIP animation) while Alt is held', () => {
    const { rerender } = render(<DraggablePanel {...base} scale={1} />);
    fireEvent.keyDown(window, { key: 'Alt' });
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={10 / 9} />);
    expect(animateCalls).toHaveLength(0);
  });

  it('GLIDES (FLIP animation) on a scale change when Alt is NOT held', () => {
    const { rerender } = render(<DraggablePanel {...base} scale={1} />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={10 / 9} />);
    expect(animateCalls).toHaveLength(1);
  });

  it('cancels an in-flight FLIP animation on unmount (no orphaned WAAPI anim)', () => {
    const { rerender, unmount } = render(<DraggablePanel {...base} scale={1} />);
    rerender(<DraggablePanel {...base} scale={10 / 9} />);
    expect(animateCalls).toHaveLength(1);
    unmount();
    expect(animateCalls[0].cancel).toHaveBeenCalled();
  });
});

describe('DraggablePanel FLIP: re-flow and externally-driven moves snap', () => {
  const at = (y: number) => ({ x: 0, y, anchorX: 'left' as const, anchorY: 'top' as const });

  it('SNAPS when the panel box changes without a scale change (content re-flow)', () => {
    // The infobox strip dropping from 2 rows to 1: its height shrinks and its
    // top edge moves down in the same commit. The tiles are already in their new
    // slots, so gliding the position delta would smear the re-layout.
    const { rerender } = render(<DraggablePanel {...base} scale={1} position={at(0)} height={300} />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={1} position={at(34)} height={266} />);
    expect(animateCalls).toHaveLength(0);
  });

  it('still GLIDES when the box change comes WITH a scale change (sibling lockstep)', () => {
    // Alt is not held, so this is a Settings-slider resize: every panel resizes
    // over 120ms together and the strip must travel with them.
    const { rerender } = render(<DraggablePanel {...base} scale={1} position={at(0)} height={300} />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={10 / 9} position={at(34)} height={266} />);
    expect(animateCalls).toHaveLength(1);
  });

  it('SNAPS a position-only change when externallyPositioned', () => {
    // The pinned strip's owner already wrote this transform in its rAF loop, so
    // the FLIP would invert back to the previous anchor and glide forward.
    const { rerender } = render(<DraggablePanel {...base} scale={1} position={at(0)} externallyPositioned />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={1} position={at(40)} externallyPositioned />);
    expect(animateCalls).toHaveLength(0);
  });

  it('GLIDES the same position-only change when NOT externallyPositioned (contrast)', () => {
    const { rerender } = render(<DraggablePanel {...base} scale={1} position={at(0)} />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={1} position={at(40)} />);
    expect(animateCalls).toHaveLength(1);
  });

  it('still GLIDES a scale change while externallyPositioned (owner does not smooth zoom)', () => {
    const { rerender } = render(<DraggablePanel {...base} scale={1} position={at(0)} externallyPositioned />);
    animateCalls.length = 0;
    rerender(<DraggablePanel {...base} scale={10 / 9} position={at(0)} externallyPositioned />);
    expect(animateCalls).toHaveLength(1);
  });
});
