// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayFrameProvider } from '../../contexts/ReplayFrameContext';
import type { ReplayCursorTrack } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { freshReplayCapture } from '../../replay/format/capture';
import { WATCH_INPUT_GATED_ATTR } from '../../tutorial/runtime/tutorialInputBoundary';
import { ReplayCursorLayer } from '../ReplayCursorLayer';
import { TooltipProvider } from '../Tooltip/TooltipContext';
import { TooltipOverlay } from '../Tooltip/TooltipOverlay';
import { useTooltip } from '../Tooltip/useTooltip';

const replayCursorLayerCss = readFileSync(join(process.cwd(), 'src/components/ReplayCursorLayer.css'), 'utf8');

afterEach(cleanup);

function renderClicks(track: ReplayCursorTrack, playheadMs: number) {
  return render(
    <ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} playheadMs={playheadMs} />,
  );
}

describe('ReplayCursorLayer click feedback', () => {
  it.each([99.5, 100])('honors the independent click cutoff at %s ms', (playheadMs) => {
    const store = new ReplayFrameStore();
    store.setHistory([], [], {
      ...freshReplayCapture(),
      cursorClicks: { provenance: 'bounded-v1', stoppedAtMs: 100, reason: 'entry-limit' },
    });
    store.set(playheadMs, undefined);
    const track: ReplayCursorTrack = {
      samples: [{ tMs: 0, x: 20, y: 30, insideFrame: true }],
      clicks: [{ tMs: 0, x: 20, y: 30, insideFrame: true, type: 'ui' }],
    };
    render(
      <ReplayFrameProvider store={store}>
        <ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} />
      </ReplayFrameProvider>,
    );
    expect(screen.queryByTestId('replay-click-marker-ui') !== null).toBe(playheadMs < 100);
    expect(screen.getByTestId('replay-cursor')).toBeInTheDocument();
  });

  it.each([
    'cursorSamples',
    'presentationSamples',
  ] as const)('hides unverified coordinates after %s stops', (stoppedTrack) => {
    const store = new ReplayFrameStore();
    store.setHistory([], [], {
      ...freshReplayCapture(),
      [stoppedTrack]: { provenance: 'bounded-v1', stoppedAtMs: 100, reason: 'entry-limit' },
    });
    store.set(100, undefined);
    const track: ReplayCursorTrack = {
      samples: [{ tMs: 0, x: 20, y: 30, insideFrame: true }],
      clicks: [{ tMs: 0, x: 20, y: 30, insideFrame: true, type: 'ui' }],
    };

    render(
      <ReplayFrameProvider store={store}>
        <ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} />
      </ReplayFrameProvider>,
    );

    expect(screen.queryByTestId('replay-cursor')).toBeNull();
    if (stoppedTrack === 'presentationSamples') expect(screen.queryByTestId('replay-click-marker-ui')).toBeNull();
    else expect(screen.getByTestId('replay-click-marker-ui')).toBeInTheDocument();
  });

  it.each([
    [null, 1],
    ['menuEvents', 0],
    ['cursorSamples', 0],
  ] as const)('projects holds from the store menu timeline (%s stopped: %i)', (stoppedTrack, expected) => {
    const store = new ReplayFrameStore();
    store.setHistory(
      [],
      [
        {
          kind: 'open',
          tMs: 400,
          state: {
            x: 10,
            y: 10,
            scale: 1,
            hoveredIndex: -1,
            submenuParentIndex: -1,
            hoveredSubmenuIndex: -1,
            submenuPosition: null,
            rowHeight: 28,
            scrollTop: 0,
            entries: [{ action: 'Walk here' }],
          },
        },
      ],
      {
        ...freshReplayCapture(),
        ...(stoppedTrack === null
          ? {}
          : { [stoppedTrack]: { provenance: 'bounded-v1', stoppedAtMs: 300, reason: 'entry-limit' } }),
      },
    );
    store.set(450, undefined);
    const track: ReplayCursorTrack = {
      samples: [{ tMs: 100, x: 20, y: 30, insideFrame: true, pinned: true, touch: true }],
      clicks: [],
    };

    render(
      <ReplayFrameProvider store={store}>
        <ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} />
      </ReplayFrameProvider>,
    );

    expect(screen.queryAllByTestId('replay-hold-marker')).toHaveLength(expected);
  });

  it('marks a touch hold as a pad cap on the press point, held then lifted, beneath later taps', () => {
    const view = (playheadMs: number, menuView: { rowHeight?: number } = { rowHeight: 28 }) => {
      const store = new ReplayFrameStore();
      store.setHistory(
        [],
        [
          {
            kind: 'open',
            tMs: 1000,
            state: {
              x: 160,
              y: 130,
              scale: 1,
              hoveredIndex: -1,
              submenuParentIndex: -1,
              hoveredSubmenuIndex: -1,
              submenuPosition: null,
              ...menuView,
              entries: [{ action: 'Walk here' }],
            },
          },
        ],
        freshReplayCapture(),
      );
      store.set(playheadMs, undefined);
      const track: ReplayCursorTrack = {
        samples: [{ tMs: 400, x: 200, y: 130, insideFrame: true, pinned: true, touch: true }],
        // A tap on the menu's first row, soon after it opened.
        clicks: [{ tMs: 1150, x: 200, y: 150, insideFrame: true, type: 'ui', touch: true }],
      };
      return render(
        <ReplayFrameProvider store={store}>
          <ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} />
        </ReplayFrameProvider>,
      );
    };
    const cap = () => screen.getByTestId('replay-hold-marker').querySelector<SVGSVGElement>('.replay-hold-cap');

    let rendered = view(1000);
    const marker = screen.getByTestId('replay-hold-marker');
    expect(marker).toHaveStyle('transform: translate3d(200px, 130px, 0)');
    // The top half of the tap's spread pad, with the tap's tone and edge classes.
    expect(cap()).toHaveAttribute('viewBox', '0 0 18 9');
    expect(cap()?.classList.contains('replay-tap-disc')).toBe(true);
    expect(cap()?.querySelectorAll('.replay-tap-rim')).toHaveLength(2);
    expect(cap()).toHaveStyle('opacity: 1');
    rendered.unmount();

    // Held steady, then lifting.
    rendered = view(1250);
    expect(cap()).toHaveStyle('opacity: 1');
    // Painted beneath the tap that lands on the menu.
    expect(
      screen.getByTestId('replay-hold-marker').compareDocumentPosition(screen.getByTestId('replay-click-marker-ui')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    rendered.unmount();
    rendered = view(1350);
    expect(cap()).toHaveStyle('opacity: 0.6');
    rendered.unmount();
    rendered = view(1500);
    expect(screen.queryByTestId('replay-hold-marker')).toBeNull();
    rendered.unmount();

    // A mouse menu (no rowHeight) gets nothing.
    view(1000, {});
    expect(screen.queryByTestId('replay-hold-marker')).toBeNull();

    const capRule = replayCursorLayerCss.match(/\.replay-tap-disc\.replay-hold-cap\s*\{(?<body>[^}]*)\}/)?.groups?.body;
    expect(capRule).toContain('transform: translate(-50%, -100%);');
    // Clipped to that half: the tap disc's overflow: visible would let it cover the menu.
    expect(capRule).toContain('overflow: hidden;');
  });
  it('renders OSRS sprites for world clicks and distinct neutral feedback for UI clicks', () => {
    const track = {
      samples: [],
      clicks: [
        { tMs: 100, x: 120, y: 130, insideFrame: true, type: 'yellow' },
        { tMs: 100, x: 220, y: 230, insideFrame: true, type: 'red' },
        { tMs: 100, x: 320, y: 330, insideFrame: true, type: 'ui' },
      ],
    } satisfies ReplayCursorTrack;

    renderClicks(track, 100);

    const yellow = screen.getByTestId('replay-click-marker-yellow');
    const red = screen.getByTestId('replay-click-marker-red');
    const ui = screen.getByTestId('replay-click-marker-ui');
    expect(within(yellow).getByTestId('replay-click-sprite')).toBeInTheDocument();
    expect(within(red).getByTestId('replay-click-sprite')).toBeInTheDocument();
    expect(yellow.querySelector('.replay-click-pulse')).toBeNull();
    expect(red.querySelector('.replay-click-pulse')).toBeNull();
    expect(replayCursorLayerCss).not.toContain('.replay-click-pulse');
    expect(within(ui).queryByTestId('replay-click-sprite')).toBeNull();
    expect(within(ui).getByTestId('replay-click-ui-ring')).toBeInTheDocument();
    expect(within(ui).getByTestId('replay-click-ui-core')).toBeInTheDocument();
    expect(yellow).toHaveStyle('transform: translate3d(120px, 130px, 0)');
    expect(red).toHaveStyle('transform: translate3d(220px, 230px, 0)');
    expect(ui).toHaveStyle('transform: translate3d(320px, 330px, 0)');
  });

  it('uses the cool semantic role and a larger footprint for neutral UI clicks', () => {
    const ringRule = Array.from(replayCursorLayerCss.matchAll(/\.replay-click-ui-ring\s*\{(?<body>[^}]*)\}/g))
      .flatMap((match) => (match.groups?.body ? [match.groups.body] : []))
      .join('\n');
    const coreRule = Array.from(replayCursorLayerCss.matchAll(/\.replay-click-ui-core\s*\{(?<body>[^}]*)\}/g))
      .flatMap((match) => (match.groups?.body ? [match.groups.body] : []))
      .join('\n');

    expect(ringRule).toContain('color: var(--color-info);');
    expect(ringRule).toContain('width: 20px;');
    expect(ringRule).toContain('height: 20px;');
    expect(ringRule).toContain('border-width: 2px;');
    expect(coreRule).toContain('width: 6px;');
    expect(coreRule).toContain('height: 6px;');
    expect(coreRule).toContain('background: var(--color-info);');
    expect(`${ringRule}${coreRule}`).not.toContain('var(--color-warning)');
    expect(`${ringRule}${coreRule}`).not.toContain('var(--color-error)');
  });

  it('derives world sprite frames and normalized progress from the shared playhead', () => {
    const track = {
      samples: [],
      clicks: [{ tMs: 600, x: 120, y: 130, insideFrame: true, type: 'yellow' }],
    } satisfies ReplayCursorTrack;
    const view = renderClicks(track, 600);

    // When / Then: start
    let marker = screen.getByTestId('replay-click-marker-yellow');
    expect(marker).toHaveAttribute('data-progress', '0.0000');
    expect(marker).toHaveAttribute('data-sprite-frame', '0');

    // When / Then: middle
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={4} playheadMs={900} />,
    );
    marker = screen.getByTestId('replay-click-marker-yellow');
    expect(marker).toHaveAttribute('data-progress', '0.5000');
    expect(marker).toHaveAttribute('data-sprite-frame', '3');

    // When / Then: end
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={0.5} playheadMs={1199} />,
    );
    marker = screen.getByTestId('replay-click-marker-yellow');
    expect(marker).toHaveAttribute('data-progress', '0.9983');
    expect(marker).toHaveAttribute('data-sprite-frame', '4');

    // When / Then: exclusive boundary
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} playheadMs={1200} />,
    );
    expect(screen.queryByTestId('replay-click-marker-yellow')).toBeNull();
  });

  it('keeps paused and sought phases stable without remounting an active occurrence', () => {
    const track = {
      samples: [],
      clicks: [{ tMs: 100, x: 120, y: 130, insideFrame: true, type: 'ui' }],
    } satisfies ReplayCursorTrack;
    const view = renderClicks(track, 250);
    const initial = screen.getByTestId('replay-click-marker-ui');

    // When: pause and speed props change while playhead is stable
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={4} isPlaying={false} speedMultiplier={4} playheadMs={250} />,
    );

    expect(screen.getByTestId('replay-click-marker-ui')).toBe(initial);
    expect(initial).toHaveAttribute('data-progress', '0.3571');

    // When: seek forward, then backward inside the same occurrence
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={4} isPlaying={false} speedMultiplier={1} playheadMs={400} />,
    );
    expect(initial).toHaveAttribute('data-progress', '0.7143');
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={4} isPlaying={false} speedMultiplier={1} playheadMs={250} />,
    );

    expect(screen.getByTestId('replay-click-marker-ui')).toBe(initial);
    expect(initial).toHaveAttribute('data-progress', '0.3571');
  });

  it('renders identical simultaneous clicks independently with stable occurrence identity', () => {
    const first = { tMs: 0, x: 120, y: 130, insideFrame: true, type: 'red' } as const;
    const second = { tMs: 300, x: 120, y: 130, insideFrame: true, type: 'red' } as const;
    const track = {
      samples: [],
      clicks: [first, second, second],
    } satisfies ReplayCursorTrack;
    const view = renderClicks(track, 500);
    const occurrenceOne = document.querySelector<HTMLElement>('[data-occurrence="1"]');

    // When / Then: overlapping identical data remains independent
    expect(screen.getAllByTestId('replay-click-marker-red')).toHaveLength(3);
    expect(screen.getAllByTestId('replay-click-marker-red').map((marker) => marker.dataset.occurrence)).toEqual([
      '0',
      '1',
      '2',
    ]);

    // When: filtered-list churn removes only the expired first occurrence
    view.rerender(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} playheadMs={600} />,
    );

    expect(screen.getAllByTestId('replay-click-marker-red')).toHaveLength(2);
    expect(document.querySelector('[data-occurrence="1"]')).toBe(occurrenceOne);
  });

  it('keeps the overlay inert and defines a playhead-driven reduced-motion contract', () => {
    const track = {
      samples: [],
      clicks: [{ tMs: 100, x: 120, y: 130, insideFrame: true, type: 'ui' }],
    } satisfies ReplayCursorTrack;

    renderClicks(track, 200);

    const layer = screen.getByTestId('replay-cursor-layer');
    const reducedMotion = replayCursorLayerCss.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(?<body>[\s\S]*)\}\s*$/,
    )?.groups?.body;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).not.toHaveAttribute('tabindex');
    expect(replayCursorLayerCss).not.toMatch(/@keyframes|animation:|transition:/);
    expect(reducedMotion).toContain('transform: translate3d(-50%, -50%, 0) !important;');
    expect(reducedMotion).not.toContain('.replay-click-sprite');
    expect(reducedMotion).not.toContain('background-position');
    expect(reducedMotion).not.toMatch(/opacity\s*:/);
    // A tap holds its spread size: no contact-to-spread step.
    expect(reducedMotion).toMatch(/\.replay-tap\[data-tap-frame\] \.replay-tap-disc--contact\s*\{\s*display: none;/);
    expect(reducedMotion).toMatch(/\.replay-tap\[data-tap-frame\] \.replay-tap-disc--spread\s*\{\s*display: block;/);
  });

  it('adds a tap beneath touch clicks only, and keeps every X', () => {
    const track = {
      samples: [],
      clicks: [
        { tMs: 100, x: 120, y: 130, insideFrame: true, type: 'yellow' },
        { tMs: 100, x: 220, y: 230, insideFrame: true, type: 'red', touch: true },
        { tMs: 100, x: 320, y: 330, insideFrame: true, type: 'ui', touch: true },
      ],
    } satisfies ReplayCursorTrack;

    renderClicks(track, 100);

    const mouse = screen.getByTestId('replay-click-marker-yellow');
    const finger = screen.getByTestId('replay-click-marker-red');
    const fingerUi = screen.getByTestId('replay-click-marker-ui');
    expect(within(mouse).queryByTestId('replay-tap')).toBeNull();
    expect(mouse).not.toHaveAttribute('data-touch');
    expect(finger).toHaveAttribute('data-touch', 'true');
    expect(within(mouse).getByTestId('replay-click-sprite')).toBeInTheDocument();
    expect(within(finger).getByTestId('replay-click-sprite')).toBeInTheDocument();
    // Painted before (beneath) the X and the UI marker, never over them.
    const tap = within(finger).getByTestId('replay-tap');
    expect(tap.compareDocumentPosition(within(finger).getByTestId('replay-click-sprite'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const uiTap = within(fingerUi).getByTestId('replay-tap');
    expect(uiTap.compareDocumentPosition(within(fingerUi).getByTestId('replay-click-ui-ring'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('steps the tap with the playhead and drops it before the X ends', () => {
    const track = {
      samples: [],
      clicks: [{ tMs: 600, x: 120, y: 130, insideFrame: true, type: 'yellow', touch: true }],
    } satisfies ReplayCursorTrack;
    const view = renderClicks(track, 600);
    const at = (playheadMs: number) =>
      view.rerender(
        <ReplayCursorLayer
          track={track}
          frameIndex={1}
          isPlaying={false}
          speedMultiplier={1}
          playheadMs={playheadMs}
        />,
      );

    expect(screen.getByTestId('replay-tap')).toHaveAttribute('data-tap-frame', '0');
    at(750);
    expect(screen.getByTestId('replay-tap')).toHaveAttribute('data-tap-frame', '1');
    at(850);
    expect(screen.getByTestId('replay-tap')).toHaveAttribute('data-tap-frame', '2');
    expect(screen.getByTestId('replay-tap')).toHaveStyle('opacity: 0.5');
    at(900);
    expect(screen.queryByTestId('replay-tap')).toBeNull();
    expect(screen.getByTestId('replay-click-sprite')).toBeInTheDocument();
    // Scrubbing back brings the contact frame back.
    at(620);
    expect(screen.getByTestId('replay-tap')).toHaveAttribute('data-tap-frame', '0');
  });

  it('snaps tap edges only where the frame lands enough device pixels per art pixel', async () => {
    const track = { samples: [], clicks: [] } satisfies ReplayCursorTrack;
    let paintedWidth = 1000;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ width: paintedWidth, height: 500, top: 0, left: 0, right: paintedWidth, bottom: 500 }) as DOMRect,
    );
    vi.stubGlobal('devicePixelRatio', 1);

    renderClicks(track, 0);
    const layer = screen.getByTestId('replay-cursor-layer');
    // 1x screen, full-size frame: 1.375 device px per art pixel.
    expect(layer).toHaveAttribute('data-tap-edges', 'smooth');

    // A 3x phone fitting the frame to 0.45: 1.86 device px per art pixel.
    vi.stubGlobal('devicePixelRatio', 3);
    paintedWidth = 450;
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(layer).toHaveAttribute('data-tap-edges', 'pixel');

    // The same frame on a 2x screen: 1.24.
    vi.stubGlobal('devicePixelRatio', 2);
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(layer).toHaveAttribute('data-tap-edges', 'smooth');

    const ruleBody = (selector: string) =>
      replayCursorLayerCss.match(new RegExp(`${selector}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body ?? '';
    expect(ruleBody('\\.replay-tap-disc')).toContain('shape-rendering: geometricPrecision;');
    expect(ruleBody('\\.replay-cursor-layer\\[data-tap-edges="pixel"\\] \\.replay-tap-disc')).toContain(
      'shape-rendering: crispEdges;',
    );
    // The rim is the disc's outermost pixels: one outline less the fill's, never a stroke.
    expect(ruleBody('\\.replay-tap-rim')).toContain('fill-rule: evenodd;');
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubElementFromPoint(element: Element | null) {
  const elementFromPoint = vi.fn(() => element);
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: elementFromPoint,
  });
  return elementFromPoint;
}

const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
const originalElementsFromPoint = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalElementFromPoint) {
    Object.defineProperty(document, 'elementFromPoint', originalElementFromPoint);
  } else {
    Reflect.deleteProperty(document, 'elementFromPoint');
  }
  if (originalElementsFromPoint) Object.defineProperty(document, 'elementsFromPoint', originalElementsFromPoint);
  else Reflect.deleteProperty(document, 'elementsFromPoint');
});

const ReplayTooltipTrigger: React.FC<{ text?: string | null }> = ({ text = 'Replay hover tooltip' }) => {
  const { bindTooltip } = useTooltip();
  return (
    <button
      type="button"
      {...bindTooltip(() => (text === null ? null : { lines: [{ spans: [{ text, color: '#fff' }] }] }))}
    >
      Replay hover target
    </button>
  );
};

describe('ReplayCursorLayer', () => {
  it('clears recorded hover when the cursor leaves the captured frame', async () => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByRole('button', { name: 'Replay hover target' }),
    });
    const track: ReplayCursorTrack = {
      samples: [
        { tMs: 0, x: 120, y: 200, insideFrame: true },
        { tMs: 600, x: -10, y: 200, insideFrame: false },
      ],
      clicks: [],
    };
    const tree = (playheadMs: number) => (
      <TooltipProvider>
        <ReplayTooltipTrigger />
        <TooltipOverlay />
        <ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} playheadMs={playheadMs} />
      </TooltipProvider>
    );
    const { rerender } = render(tree(0));
    expect(await screen.findByText('Replay hover tooltip')).toBeInTheDocument();

    rerender(tree(600));

    expect(screen.queryByText('Replay hover tooltip')).toBeNull();
  });

  it('hovers recorded content rather than viewer controls covering the recorded position', async () => {
    const viewer = document.createElement('button');
    viewer.setAttribute('data-replay-viewer-chrome', '');
    document.body.appendChild(viewer);
    stubElementFromPoint(viewer);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [viewer, screen.getByRole('button', { name: 'Replay hover target' })],
    });

    render(
      <TooltipProvider>
        <ReplayTooltipTrigger />
        <TooltipOverlay />
        <ReplayCursorLayer
          track={{ samples: [{ tMs: 0, x: 120, y: 200, insideFrame: true }], clicks: [] }}
          frameIndex={0}
          isPlaying={false}
          speedMultiplier={1}
        />
      </TooltipProvider>,
    );

    expect(await screen.findByText('Replay hover tooltip')).toBeInTheDocument();
  });

  it('re-aims a stationary cursor after the playback window resizes', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    const elementFromPoint = stubElementFromPoint(target);
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callbacks.push(callback));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    renderClicks({ samples: [{ tMs: 0, x: 400, y: 300, insideFrame: true }], clicks: [] }, 0);
    const layer = screen.getByTestId('replay-cursor-layer');
    Object.defineProperties(layer, { offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 500, 300));
    elementFromPoint.mockClear();

    fireEvent(window, new Event('resize'));
    act(() => {
      for (const callback of callbacks.splice(0)) callback(0);
    });

    expect(elementFromPoint).toHaveBeenLastCalledWith(300, 200);
  });

  it.each(
    [
      { transition: 'frame', beforeMs: 0, afterMs: 600, frameIndex: 1 },
      { transition: 'click', beforeMs: 299, afterMs: 300, frameIndex: 0 },
    ].flatMap((scenario) => ['Potion (3)', null].map((text) => ({ ...scenario, text }))),
  )('refreshes a stationary tooltip to $text at a replay $transition', async ({
    transition,
    beforeMs,
    afterMs,
    frameIndex,
    text,
  }) => {
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => screen.getByRole('button', { name: 'Replay hover target' }),
    });
    const track: ReplayCursorTrack = {
      samples: [{ tMs: 0, x: 120, y: 130, insideFrame: true }],
      clicks: [],
    };
    const clickTrack: ReplayCursorTrack = {
      samples: [...track.samples, { tMs: 300, x: 120, y: 130, insideFrame: true, pinned: true }],
      clicks: [{ tMs: 300, x: 120, y: 130, insideFrame: true, type: 'yellow' }],
    };
    const tree = (content: string | null, frame: number, playheadMs: number) => (
      <TooltipProvider>
        <ReplayTooltipTrigger text={content} />
        <TooltipOverlay />
        <ReplayCursorLayer
          track={transition === 'click' ? clickTrack : track}
          frameIndex={frame}
          isPlaying={true}
          speedMultiplier={1}
          playheadMs={playheadMs}
        />
      </TooltipProvider>
    );
    const view = render(tree('Potion (4)', 0, beforeMs));
    const target = screen.getByRole('button', { name: 'Replay hover target' });
    expect(await screen.findByText('Potion (4)')).toBeInTheDocument();

    view.rerender(tree(text, frameIndex, afterMs));

    expect(screen.getByRole('button', { name: 'Replay hover target' })).toBe(target);
    expect(screen.queryByText('Potion (4)')).toBeNull();
    if (text !== null) expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('renders click markers only inside the click window', () => {
    const track = {
      samples: [{ tMs: 600, x: 100, y: 110, insideFrame: true }],
      clicks: [{ tMs: 600, x: 120, y: 130, insideFrame: true, type: 'red' }],
    } satisfies ReplayCursorTrack;
    const { rerender } = render(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />,
    );

    expect(screen.getByTestId('replay-cursor')).toHaveStyle('transform: translate3d(120px, 130px, 0)');
    expect(screen.getByTestId('replay-click-marker-red')).toBeInTheDocument();

    rerender(<ReplayCursorLayer track={track} frameIndex={2} isPlaying={false} speedMultiplier={1} />);

    expect(screen.queryByTestId('replay-click-marker-red')).toBeNull();
  });

  it('positions yellow and red click wrappers exactly on captured click coordinates', () => {
    const track = {
      samples: [{ tMs: 600, x: 90, y: 100, insideFrame: true }],
      clicks: [
        { tMs: 600, x: 120, y: 130, insideFrame: true, type: 'yellow' },
        { tMs: 600, x: 220, y: 230, insideFrame: true, type: 'red' },
      ],
    } satisfies ReplayCursorTrack;

    render(<ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />);

    const yellowMarker = screen.getByTestId('replay-click-marker-yellow');
    const redMarker = screen.getByTestId('replay-click-marker-red');

    expect(yellowMarker).toHaveStyle('transform: translate3d(120px, 130px, 0)');
    expect(redMarker).toHaveStyle('transform: translate3d(220px, 230px, 0)');
  });

  it('sets the gameplay cursor gate while mounted and clears it on unmount', () => {
    const track = {
      samples: [{ tMs: 600, x: 100, y: 110, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const { unmount } = render(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />,
    );

    expect(document.body).toHaveAttribute(WATCH_INPUT_GATED_ATTR, 'true');

    unmount();

    expect(document.body).not.toHaveAttribute(WATCH_INPUT_GATED_ATTR);
  });

  it('stacks above z-index 30 gameplay UI while preserving pointer passthrough', () => {
    const track = {
      samples: [{ tMs: 600, x: 100, y: 110, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    render(<ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />);

    const layer = screen.getByTestId('replay-cursor-layer');
    const layerRule = replayCursorLayerCss.match(/\.replay-cursor-layer\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const zIndex = Number(layerRule.match(/z-index:\s*(\d+)/)?.[1] ?? 0);
    expect(layer).toHaveClass('replay-cursor-layer');
    expect(zIndex).toBe(31);
    expect(layerRule).toContain('pointer-events: none');
    expect(layerRule).toContain('overflow: hidden');
  });

  it('scales the replay cursor to 63.75 percent of the normal pointer size (75% of the demo cursor)', () => {
    const replayArrowRule =
      replayCursorLayerCss.match(/\.replay-cursor \.demo-cursor-arrow\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    expect(replayArrowRule).toContain('--demo-cursor-scale: 0.6375;');
    expect(replayArrowRule).not.toContain('scale(0.72)');
  });

  it('dispatches a passive mousemove to the gameplay element under the replay cursor', () => {
    const surface = document.createElement('div');
    surface.setAttribute('data-tutorial-input-surface', 'gameplay');
    const target = document.createElement('button');
    surface.appendChild(target);
    document.body.appendChild(surface);
    const mouseMoves: MouseEvent[] = [];
    target.addEventListener('mousemove', (event) => mouseMoves.push(event));
    const elementFromPoint = stubElementFromPoint(target);
    const track = {
      samples: [{ tMs: 600, x: 123, y: 234, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    render(<ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />);

    expect(elementFromPoint).toHaveBeenCalledWith(123, 234);
    expect(mouseMoves).toHaveLength(1);
    expect(mouseMoves[0]).toBeInstanceOf(PointerEvent);
    expect(mouseMoves.at(-1)).toMatchObject({
      bubbles: true,
      button: 0,
      buttons: 0,
      cancelable: false,
      clientX: 123,
      clientY: 234,
      type: 'mousemove',
    });
  });

  it('does not dispatch click, pointer, or context menu events during replay cursor hover', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    const forbiddenEvents = [
      'pointerdown',
      'pointerup',
      'mousedown',
      'mouseup',
      'click',
      'dblclick',
      'contextmenu',
    ] as const;
    const dispatched: string[] = [];
    for (const eventName of forbiddenEvents) {
      target.addEventListener(eventName, () => dispatched.push(eventName));
    }
    stubElementFromPoint(target);
    const track = {
      samples: [{ tMs: 600, x: 123, y: 234, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    render(<ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />);

    expect(dispatched).toEqual([]);
  });

  it('shows a tooltip from replay-driven mousemove without a real mouseenter', async () => {
    const track = {
      samples: [{ tMs: 600, x: 123, y: 234, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((x: number, y: number) => {
        const trigger = screen.queryByRole('button', { name: 'Replay hover target' });
        if (x === 123 && y === 234 && trigger instanceof Element) return trigger;
        return null;
      }),
    });

    render(
      <TooltipProvider>
        <ReplayTooltipTrigger />
        <TooltipOverlay />
        <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} />
      </TooltipProvider>,
    );

    expect(await screen.findByText('Replay hover tooltip')).toBeInTheDocument();
  });

  it("raises no hover, and no tooltip, under a recorded finger, as the recorder's screen showed none", async () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    const mouseMoves = vi.fn();
    target.addEventListener('mousemove', mouseMoves);
    stubElementFromPoint(target);
    const touchTrack = {
      samples: [{ tMs: 600, x: 123, y: 234, insideFrame: true, touch: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const view = render(<ReplayCursorLayer track={touchTrack} frameIndex={1} isPlaying={false} speedMultiplier={1} />);
    expect(mouseMoves).not.toHaveBeenCalled();
    // Nor is a pointer drawn: a finger has none between taps.
    expect(screen.queryByTestId('replay-cursor')).toBeNull();

    // A tap the game reported as a click counts too: it is stamped like the samples.
    view.rerender(
      <ReplayCursorLayer
        track={{ samples: [], clicks: [{ tMs: 600, x: 123, y: 234, insideFrame: true, type: 'yellow', touch: true }] }}
        frameIndex={1}
        isPlaying={false}
        speedMultiplier={1}
      />,
    );
    expect(mouseMoves).not.toHaveBeenCalled();

    // The same position from a mouse hovers as before.
    view.rerender(
      <ReplayCursorLayer
        track={{ samples: [{ tMs: 600, x: 123, y: 234, insideFrame: true }], clicks: [] }}
        frameIndex={1}
        isPlaying={false}
        speedMultiplier={1}
      />,
    );
    expect(mouseMoves).toHaveBeenCalledOnce();
    expect(screen.getByTestId('replay-cursor')).toBeInTheDocument();
  });

  it('uses deterministic frame boundaries when no shared playhead is supplied', () => {
    const track = {
      samples: [
        { tMs: 0, x: 10, y: 20, insideFrame: true },
        { tMs: 600, x: 70, y: 80, insideFrame: true },
      ],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const { rerender } = render(
      <ReplayCursorLayer track={track} frameIndex={0} isPlaying={true} speedMultiplier={4} />,
    );

    expect(screen.getByTestId('replay-cursor')).toHaveStyle('transform: translate3d(10px, 20px, 0)');

    rerender(<ReplayCursorLayer track={track} frameIndex={1} isPlaying={true} speedMultiplier={0.5} />);

    expect(screen.getByTestId('replay-cursor')).toHaveStyle('transform: translate3d(70px, 80px, 0)');
  });

  it('uses an optional shared playhead instead of the deterministic frame boundary', () => {
    const track = {
      samples: [
        { tMs: 0, x: 10, y: 20, insideFrame: true },
        { tMs: 600, x: 70, y: 80, insideFrame: true },
      ],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const { rerender } = render(
      <ReplayCursorLayer track={track} frameIndex={1} isPlaying={false} speedMultiplier={1} playheadMs={300} />,
    );

    expect(screen.getByTestId('replay-cursor')).toHaveStyle('transform: translate3d(10px, 20px, 0)');

    rerender(<ReplayCursorLayer track={track} frameIndex={0} isPlaying={false} speedMultiplier={1} playheadMs={600} />);

    expect(screen.getByTestId('replay-cursor')).toHaveStyle('transform: translate3d(70px, 80px, 0)');
  });
});
