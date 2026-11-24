// @vitest-environment happy-dom

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraggablePanel } from '../../DraggablePanel';
import { OverlapGuideOverlay } from '../OverlapGuideOverlay';
import { PanelSnapRegistryProvider } from '../PanelSnapRegistry';

const originalElementsFromPoint = document.elementsFromPoint;

beforeEach(() => {
  fireEvent.keyUp(window, { key: 'Alt' });
  fireEvent.blur(window);
  document.elementFromPoint = () => null;
});

afterEach(() => {
  fireEvent.keyUp(window, { key: 'Alt' });
  document.elementsFromPoint = originalElementsFromPoint;
});

interface PanelSpec {
  label: string;
  x: number;
  y: number;
  locked?: boolean;
}

function renderPanels(panels: PanelSpec[], { disabled = false }: { disabled?: boolean } = {}) {
  const view = render(
    <PanelSnapRegistryProvider>
      {panels.map((panel) => (
        <DraggablePanel
          key={panel.label}
          position={{ x: panel.x, y: panel.y, anchorX: 'left', anchorY: 'top' }}
          defaultPosition={{ x: panel.x, y: panel.y, anchorX: 'left', anchorY: 'top' }}
          width={200}
          height={100}
          scale={1}
          viewportWidth={1000}
          viewportHeight={800}
          altHintLabel={panel.label}
          locked={panel.locked}
          onPositionChange={vi.fn()}
          onScaleChange={vi.fn()}
        >
          <div data-panel={panel.label} />
        </DraggablePanel>
      ))}
      <OverlapGuideOverlay disabled={disabled} />
    </PanelSnapRegistryProvider>,
  );
  // The later panel paints on top, as it does for siblings at the default z-index.
  const topmost = view.container.querySelector(`[data-panel="${panels.at(-1)?.label}"]`);
  document.elementsFromPoint = vi.fn(() => (topmost ? [topmost] : []));
  return view;
}

const guides = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="overlap-guide"]'), (guide) => ({
    label: guide.querySelector('.overlap-guide__label')?.textContent ?? null,
    overlaps: guide.querySelectorAll('.overlap-guide__overlap').length,
  }));

describe('OverlapGuideOverlay', () => {
  it('outlines only the covered panel, and only while Alt is held', () => {
    const { container } = renderPanels([
      { label: 'DPS Overlay', x: 0, y: 0 },
      { label: 'Prayer Flick Helper', x: 100, y: 50 },
    ]);
    expect(guides(container)).toEqual([]);

    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    // The covered panel's center (100, 50) is under the cover, so its name is redrawn.
    expect(guides(container)).toEqual([{ label: 'DPS Overlay', overlaps: 1 }]);
    expect(container.querySelector('.overlap-guide-overlay')?.hasAttribute('data-visible')).toBe(true);

    act(() => {
      fireEvent.keyUp(window, { key: 'Alt' });
    });
    // Kept mounted to fade out, but no longer shown.
    expect(container.querySelector('.overlap-guide-overlay')?.hasAttribute('data-visible')).toBe(false);
  });

  it('leaves the name to the panel itself when its center is still in view', () => {
    const { container } = renderPanels([
      { label: 'DPS Overlay', x: 0, y: 0 },
      { label: 'Boss HP', x: 150, y: 60 },
    ]);
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    expect(guides(container)).toEqual([{ label: null, overlaps: 1 }]);
  });

  it('ignores locked panels, which cannot be dragged aside', () => {
    const { container } = renderPanels([
      { label: 'Infoboxes', x: 0, y: 0, locked: true },
      { label: 'Prayer Flick Helper', x: 100, y: 50 },
    ]);
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    expect(guides(container)).toEqual([]);
  });

  it('ignores panels that do not overlap', () => {
    const { container } = renderPanels([
      { label: 'DPS Overlay', x: 0, y: 0 },
      { label: 'Prayer Flick Helper', x: 300, y: 0 },
    ]);
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    expect(guides(container)).toEqual([]);
  });

  it('stays hidden when disabled, as during replay playback', () => {
    const { container } = renderPanels(
      [
        { label: 'DPS Overlay', x: 0, y: 0 },
        { label: 'Prayer Flick Helper', x: 100, y: 50 },
      ],
      { disabled: true },
    );
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    expect(guides(container)).toEqual([]);
  });

  it('never takes pointer events, so Alt drag and Alt wheel reach the panel underneath', () => {
    const { container } = renderPanels([
      { label: 'DPS Overlay', x: 0, y: 0 },
      { label: 'Prayer Flick Helper', x: 100, y: 50 },
    ]);
    act(() => {
      fireEvent.keyDown(window, { key: 'Alt' });
    });
    const layer = container.querySelector<HTMLElement>('.overlap-guide-overlay');
    expect(layer).not.toBeNull();
    expect(layer?.style.pointerEvents).toBe('none');
  });
});
