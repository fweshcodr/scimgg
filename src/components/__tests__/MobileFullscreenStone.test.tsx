// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { osmCssRect } from '../../layout/osmFrame';
import { MOBILE } from '../../resourcePack';
import { defaultOsmFrame } from '../../test/helpers/osmFrame';
import { MobileFullscreenStone } from '../MobileFullscreenStone';
import type { LayerSprite } from '../PixelSpriteLayer';

afterEach(cleanup);

const frame = defaultOsmFrame({ width: 1180, height: 820 }, { top: 0, right: 0, bottom: 0, left: 0 });
const sprites = (): LayerSprite[] => JSON.parse(document.querySelector('canvas')?.getAttribute('data-sprites') ?? '[]');
const glyph = () => document.querySelector('svg[data-stone-glyph]');

describe('MobileFullscreenStone', () => {
  it("sits in the left column's top slot, the pop-out's framed stone", () => {
    const { container } = render(
      <MobileFullscreenStone frame={frame} control="enter" onToggle={vi.fn()} tucked={false} />,
    );
    const root = container.firstElementChild as HTMLElement;
    // (0,4) 58x46 in the gameframe, at the chrome's scale.
    const slot = osmCssRect(frame, { x: 0, y: 4, width: 58, height: 46 });
    expect([root.style.left, root.style.top, root.style.width, root.style.height]).toEqual([
      `${slot.x}px`,
      `${slot.y}px`,
      `${slot.width}px`,
      `${slot.height}px`,
    ]);
  });

  it('enters with the outward corners glyph and leaves with the inward one', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <MobileFullscreenStone frame={frame} control="enter" onToggle={onToggle} tucked={false} />,
    );
    expect(sprites().at(-1)?.src).toBe(MOBILE.popoutStone);
    expect(glyph()).toHaveAttribute('data-stone-glyph', 'fullscreenEnter');
    // Decoration under the button, which carries the name.
    expect(glyph()).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<MobileFullscreenStone frame={frame} control="exit" onToggle={onToggle} tucked={false} />);
    expect(sprites().at(-1)?.src).toBe(MOBILE.popoutStone);
    expect(glyph()).toHaveAttribute('data-stone-glyph', 'fullscreenExit');
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('on iPhone, a tap opens the Home Screen steps in a hover card, never a title', () => {
    const onToggle = vi.fn();
    render(<MobileFullscreenStone frame={frame} control="home-screen" onToggle={onToggle} tucked={false} />);
    const button = screen.getByRole('button', { name: 'Full screen' });
    expect(button).not.toHaveAttribute('title');
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Tap Share, then Add to Home Screen');
  });
});

describe('MobileFullscreenStone attention', () => {
  it('sweeps one glint per hand-over, restarting each time', () => {
    const { container, rerender } = render(
      <MobileFullscreenStone frame={frame} control="enter" onToggle={vi.fn()} tucked={false} attention={0} />,
    );
    expect(container.querySelector('.osm-fullscreen__glint')).toBeNull();
    rerender(<MobileFullscreenStone frame={frame} control="enter" onToggle={vi.fn()} tucked={false} attention={1} />);
    const first = container.querySelector('.osm-fullscreen__glint');
    expect(first).not.toBeNull();
    rerender(<MobileFullscreenStone frame={frame} control="enter" onToggle={vi.fn()} tucked={false} attention={2} />);
    expect(container.querySelector('.osm-fullscreen__glint')).not.toBe(first);
  });
});
