// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { osmCssRect } from '../../layout/osmFrame';
import { MOBILE } from '../../resourcePack';
import { defaultOsmFrame } from '../../test/helpers/osmFrame';
import { MobileRestartStone, RESTART_CONFIRM_WINDOW_MS } from '../MobileRestartStone';
import type { LayerSprite } from '../PixelSpriteLayer';

const frame = defaultOsmFrame({ width: 1180, height: 820 }, { top: 0, right: 0, bottom: 0, left: 0 });

const sprites = (): LayerSprite[] => JSON.parse(document.querySelector('canvas')?.getAttribute('data-sprites') ?? '[]');
const stoneSrc = () => sprites().find((s) => s.src === MOBILE.popoutStone || s.src === MOBILE.popoutStoneSelected)?.src;
const glyph = () => document.querySelector<SVGElement>('svg[data-stone-glyph="restart"]');
const restartButton = () => screen.getByRole('button', { name: 'Restart' });
const tap = (target: Element) => {
  fireEvent.pointerDown(target, { pointerType: 'touch' });
  fireEvent.click(target);
};

const renderStone = (props: Partial<React.ComponentProps<typeof MobileRestartStone>> = {}) => {
  const onRestart = vi.fn();
  const view = render(
    <MobileRestartStone frame={frame} slot={1} onRestart={onRestart} disabled={false} tucked={false} {...props} />,
  );
  return { onRestart, ...view };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MobileRestartStone', () => {
  it('sits in the system slot it is given, under the full-screen stone by default', () => {
    const { container, rerender, onRestart } = renderStone();
    const root = container.firstElementChild as HTMLElement;
    // (0, 4 + 46) 58x46: abutting the full-screen stone's frame.
    const slot = osmCssRect(frame, { x: 0, y: 50, width: 58, height: 46 });
    expect([root.style.left, root.style.top, root.style.width, root.style.height]).toEqual([
      `${slot.x}px`,
      `${slot.y}px`,
      `${slot.width}px`,
      `${slot.height}px`,
    ]);
    expect(sprites().at(-1)?.src).toBe(MOBILE.popoutStone);
    expect(glyph()).not.toBeNull();
    expect(glyph()?.style.opacity).toBe('');

    // Without a full-screen stone it takes the top slot.
    rerender(<MobileRestartStone frame={frame} slot={0} onRestart={onRestart} disabled={false} tucked={false} />);
    expect(root.style.top).toBe(`${osmCssRect(frame, { x: 0, y: 4, width: 58, height: 46 }).y}px`);
  });

  it('arms on the first tap without restarting, and restarts once on the second', () => {
    const { container, onRestart } = renderStone();
    const root = container.firstElementChild as HTMLElement;

    tap(restartButton());
    expect(onRestart).not.toHaveBeenCalled();
    expect(root.dataset.armed).toBe('true');
    expect(stoneSrc()).toBe(MOBILE.popoutStoneSelected);
    expect(document.body.textContent).toContain('Tap again to restart');

    tap(restartButton());
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(root.dataset.armed).toBeUndefined();
    expect(stoneSrc()).toBe(MOBILE.popoutStone);

    // Disarmed again: a third tap only re-arms.
    tap(restartButton());
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('lets the arm lapse after the confirm window', () => {
    const { container, onRestart } = renderStone();
    const root = container.firstElementChild as HTMLElement;

    tap(restartButton());
    act(() => {
      vi.advanceTimersByTime(RESTART_CONFIRM_WINDOW_MS - 1);
    });
    expect(root.dataset.armed).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(root.dataset.armed).toBeUndefined();
    expect(document.body.textContent).not.toContain('Tap again to restart');

    tap(restartButton());
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('disarms on a press anywhere else', () => {
    const { container, onRestart } = renderStone();
    const root = container.firstElementChild as HTMLElement;

    tap(restartButton());
    expect(root.dataset.armed).toBe('true');
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(root.dataset.armed).toBeUndefined();

    tap(restartButton());
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('is inert and dimmed while restart is disabled', () => {
    const { onRestart } = renderStone({ disabled: true });
    const button = restartButton();
    expect(button).toBeDisabled();
    tap(button);
    tap(button);
    expect(onRestart).not.toHaveBeenCalled();
    // The stone and its glyph fade together, so the glyph never reads as live on a dead stone.
    expect(sprites().at(-1)).toMatchObject({ src: MOBILE.popoutStone, opacity: 0.4 });
    expect(glyph()?.style.opacity).toBe('0.4');
  });

  it('drops the arm when a drawer tucks it, and does not bring it back', () => {
    const { container, rerender, onRestart } = renderStone();
    const root = container.firstElementChild as HTMLElement;
    const at = (tucked: boolean) => (
      <MobileRestartStone frame={frame} slot={1} onRestart={onRestart} disabled={false} tucked={tucked} />
    );

    tap(restartButton());
    expect(root.dataset.armed).toBe('true');
    rerender(at(true));
    expect(root).toHaveClass('osm-menu--tucked');
    expect(root.inert).toBe(true);
    expect(root.dataset.armed).toBeUndefined();

    rerender(at(false));
    expect(root.dataset.armed).toBeUndefined();
    tap(restartButton());
    expect(onRestart).not.toHaveBeenCalled();
  });
});
