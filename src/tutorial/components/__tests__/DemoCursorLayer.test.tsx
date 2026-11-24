// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CursorArrow, POINTER_CURSOR_HOTSPOT } from '../../../components/cursors/PointerCursor';
import { DemoPlayheadStore } from '../../runtime/demoPlayheadStore';
import { setWatchInputGated, WATCH_INPUT_GATED_ATTR } from '../../runtime/tutorialInputBoundary';
import type { DemoCursorSession } from '../../runtime/types';
import type { DemoCursorTrack } from '../../types';
import { DemoCursorLayer } from '../DemoCursorLayer';

const WATCH_GATE_ATTR = WATCH_INPUT_GATED_ATTR;
const demoCursorLayerSource = readFileSync(join(process.cwd(), 'src/tutorial/components/DemoCursorLayer.tsx'), 'utf8');
const demoCursorLayerCss = readFileSync(join(process.cwd(), 'src/tutorial/components/DemoCursorLayer.css'), 'utf8');
const pointerCursorSource = readFileSync(join(process.cwd(), 'src/components/cursors/PointerCursor.tsx'), 'utf8');
const disallowedCursorSourcePattern = new RegExp(
  [
    ['A', 'e', 'r', 'o'].join(''),
    ['W', 'i', 'n', 'd', 'o', 'w', 's'].join(''),
    ['D', 'e', 'v', 'i', 'a', 'n', 't', 'A', 'r', 't'].join(''),
    ['K', 'D', 'E'].join(''),
    ['B', 'r', 'e', 'e', 'z', 'e'].join(''),
    ['P', 'o', 's', 'y'].join(''),
  ].join('|'),
);

function makeSession(track: DemoCursorTrack): DemoCursorSession {
  return { id: 'demo-1', stepIndex: 0, track, tickMs: 600 };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = '';
  setWatchInputGated(false);
});

describe('DemoCursorLayer ms-cue pause behavior', () => {
  const msClickTrack: DemoCursorTrack = {
    blockInput: false,
    cues: [
      {
        time: { kind: 'ms', ms: 100 },
        target: { kind: 'selector', selector: '#tgt' },
        moveMs: 0,
        click: true,
      },
    ],
  };

  function mountTargetButton(): () => number {
    document.body.innerHTML = '<button id="tgt">P</button>';
    const btn = document.getElementById('tgt') as HTMLElement;
    let count = 0;
    // mousedown is the load-bearing event (prayer buttons toggle on it).
    btn.addEventListener('mousedown', () => {
      count += 1;
    });
    return () => count;
  }

  it('defers the synthetic click while paused, then fires it on resume', () => {
    const clicks = mountTargetButton();
    // SAME session reference across rerenders so the playback effect (keyed on
    // `session`) is NOT restarted - only `phase` changes.
    const session = makeSession(msClickTrack);
    const { rerender } = render(<DemoCursorLayer session={session} phase="paused" uiScale={1} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(clicks()).toBe(0);

    rerender(<DemoCursorLayer session={session} phase="running" uiScale={1} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(clicks()).toBe(1);
  });

  it('fires the synthetic click immediately when already running', () => {
    const clicks = mountTargetButton();
    const session = makeSession(msClickTrack);
    render(<DemoCursorLayer session={session} phase="running" uiScale={1} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(clicks()).toBe(1);
  });
});

describe('DemoCursorLayer resting place', () => {
  it('rests centered in the room the open sidebars leave', () => {
    const session = makeSession({ blockInput: false, cues: [] });
    const restingX = (sidebarInsets?: { left: number; right: number }) => {
      const { container, unmount } = render(
        <DemoCursorLayer session={session} phase="running" uiScale={1} sidebarInsets={sidebarInsets} />,
      );
      const transform = container.querySelector<HTMLElement>('.demo-cursor')?.style.transform ?? '';
      unmount();
      return Number(/translate3d\(([-\d.]+)px/.exec(transform)?.[1]);
    };
    expect(restingX()).toBe(window.innerWidth / 2);
    expect(restingX({ left: 320, right: 0 })).toBe(320 + (window.innerWidth - 320) / 2);
  });
});

describe('DemoCursorLayer input gating honors blockInput during review', () => {
  it('does NOT gate input during review when blockInput is false', () => {
    render(
      <DemoCursorLayer
        session={null}
        review={{ cues: [], tickMs: 600, playheadMs: 0, blockInput: false }}
        phase="awaiting-user"
        uiScale={1}
      />,
    );
    expect(document.body.hasAttribute(WATCH_GATE_ATTR)).toBe(false);
  });

  it('gates input during review when blockInput is not opted out', () => {
    render(
      <DemoCursorLayer
        session={null}
        review={{ cues: [], tickMs: 600, playheadMs: 0, blockInput: true }}
        phase="awaiting-user"
        uiScale={1}
      />,
    );
    expect(document.body.hasAttribute(WATCH_GATE_ATTR)).toBe(true);
  });

  it('blocks Tab like any other game hotkey while gated, and leaves Escape for exiting', () => {
    render(
      <DemoCursorLayer
        session={null}
        review={{ cues: [], tickMs: 600, playheadMs: 0, blockInput: true }}
        phase="awaiting-user"
        uiScale={1}
      />,
    );
    const gameKeys = vi.fn();
    window.addEventListener('keydown', gameKeys);
    try {
      for (const key of ['Tab', 'F5']) {
        expect(fireEvent.keyDown(document.body, { key })).toBe(false);
      }
      expect(gameKeys).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(gameKeys).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('keydown', gameKeys);
    }
  });
});

describe('DemoCursorLayer cursor artwork', () => {
  it('draws the pointer at its normal size with the tip on the upper-left hotspot', () => {
    const { container } = render(<CursorArrow />);

    const svg = container.querySelector('svg.demo-cursor-arrow');
    const pointer = container.querySelector('svg.demo-cursor-arrow .demo-cursor-pointer');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '21');
    expect(svg).toHaveAttribute('height', '32');
    // One viewBox unit per CSS pixel, so path coordinates are pixel offsets from the hotspot origin.
    expect(svg).toHaveAttribute('viewBox', '0 0 21 32');
    expect(container.querySelector('svg.demo-cursor-arrow title')).toBeNull();
    expect(POINTER_CURSOR_HOTSPOT).toEqual({ x: 1, y: 1 });
    expect(pointer?.getAttribute('d')).toMatch(
      new RegExp(`^M${POINTER_CURSOR_HOTSPOT.x}[ ,]${POINTER_CURSOR_HOTSPOT.y}(?![\\d.])`),
    );
  });

  it('uses the native blocked gameplay cursor affordance', () => {
    const blockedRule =
      demoCursorLayerCss.match(/body\[data-tutorial-watch-input-gated=['"]true['"]\][^{]+\{(?<body>[^}]*)\}/)?.groups
        ?.body ?? '';

    expect(blockedRule).toContain('cursor:');
    expect(blockedRule).toMatch(/cursor:\s*not-allowed\s*;/);
    expect(blockedRule).not.toContain('data:image/svg+xml');
    expect(blockedRule).not.toContain('url(');
  });

  it('does not reference disallowed or unverified cursor asset sources', () => {
    const cursorSourceText = `${demoCursorLayerSource}\n${demoCursorLayerCss}\n${pointerCursorSource}`;

    expect(cursorSourceText).not.toMatch(disallowedCursorSourcePattern);
  });

  it('preserves demo cursor stacking and pointer passthrough', () => {
    const cursorRule = demoCursorLayerCss.match(/\.demo-cursor\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const zIndex = Number(cursorRule.match(/z-index:\s*(\d+)/)?.[1] ?? 0);

    expect(zIndex).toBe(58);
    expect(cursorRule).toContain('pointer-events: none');
  });

  it('renders the demo cursor at 85% of the normal pointer size while preserving the hotspot origin', () => {
    const arrowRule = demoCursorLayerCss.match(/\.demo-cursor-arrow\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const pressedRule =
      demoCursorLayerCss.match(/\.demo-cursor\[data-pressed=['"]true['"]\] \.demo-cursor-arrow\s*\{(?<body>[^}]*)\}/)
        ?.groups?.body ?? '';

    expect(arrowRule).toContain('--demo-cursor-scale: 0.85;');
    expect(arrowRule).toContain('--demo-cursor-press-scale: 0.84;');
    expect(arrowRule).toContain('transform-origin: 1px 1px;');
    expect(arrowRule).toContain('transform: scale(var(--demo-cursor-scale));');
    expect(pressedRule).toContain('scale: var(--demo-cursor-press-scale);');
  });

  it('lets the demo cursor drop-shadow paint past the SVG viewport (no square clip)', () => {
    const arrowRule = demoCursorLayerCss.match(/\.demo-cursor-arrow\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    // Guards the shadow-clip fix: the arrow SVG must opt out of the UA-default
    // `svg { overflow: hidden }` so the inner path's drop-shadow isn't chopped
    // off in a hard square at the SVG viewport edge.
    expect(arrowRule).toContain('overflow: visible;');
  });
});

describe('DemoCursorLayer review playhead store (production path)', () => {
  const tickCueTrack = [
    { time: { kind: 'tick' as const, tick: 1 }, target: { kind: 'selector' as const, selector: '#tgt' }, moveMs: 0 },
  ];

  it('drives the review cursor from the DemoPlayheadStore, overriding the prop playhead', () => {
    document.body.innerHTML = '<button id="tgt">P</button>';
    const store = new DemoPlayheadStore();
    store.set(0);

    // The prop playheadMs is deliberately 600 (which alone would SHOW the cursor);
    // the store value (0) must win, proving DemoCursorLayer subscribes to the store.
    const { container } = render(
      <DemoCursorLayer
        session={null}
        review={{ cues: tickCueTrack, tickMs: 600, playheadMs: 600, blockInput: false }}
        demoPlayheadStore={store}
        phase="awaiting-user"
        uiScale={1}
      />,
    );
    expect(container.querySelector('.demo-cursor')?.getAttribute('data-visible')).toBe('false');

    act(() => store.set(600));
    expect(container.querySelector('.demo-cursor')?.getAttribute('data-visible')).toBe('true');
  });
});
