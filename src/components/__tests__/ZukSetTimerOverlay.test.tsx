// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReplayPresentationProvider } from '../../contexts/ReplayPresentationContext';
import { resolveReplayZukSetTimerPosition } from '../../core/replayPresentation';
import { DEFAULT_PLUGIN_KEYBINDS } from '../../data/pluginKeybinds';
import { ReplayPresentationStateSchema } from '../../replay/format/presentationFormat';
import { validPresentationSample } from '../../test/helpers/replayFixtures';
import type { ZukSetTimerState } from '../../types/zukSetTimer';
import { ZUK_SET_PERIOD_TICKS } from '../../types/zukSetTimer';
import { TooltipProvider } from '../Tooltip';
import { ZukSetTimerOverlay, zukSetTimerUrgency } from '../ZukSetTimerOverlay';

function renderOverlay(
  timer: ZukSetTimerState | undefined,
  currentTick = 0,
  actual?: { ticksRemaining: number; frozen: boolean },
) {
  // The overlay reads the live UI scale from TooltipContext (it feeds
  // DraggablePanel's layoutScale), so the provider has to wrap it.
  return render(<ZukSetTimerOverlay timer={timer} currentTick={currentTick} actual={actual} />, {
    wrapper: TooltipProvider,
  });
}

const RUNNING: ZukSetTimerState = { status: 'running', expiresAtTick: ZUK_SET_PERIOD_TICKS, phase: 'set' };
const AFTER_JAD: ZukSetTimerState = { status: 'running', expiresAtTick: ZUK_SET_PERIOD_TICKS, phase: 'jad' };
const FROZEN: ZukSetTimerState = { status: 'paused', remainingTicks: 100 };

function readOverlay(): HTMLElement {
  const node = document.querySelector<HTMLElement>('.zuk-set-timer');
  if (!node) throw new Error('Expected the Zuk set timer overlay to be rendered');
  return node;
}

function readCue(): string {
  const cue = document.querySelector<HTMLElement>('.zuk-set-timer__cue');
  if (!cue) throw new Error('Expected the cue row to be rendered');
  return cue.textContent ?? '';
}

describe('ZukSetTimerOverlay', () => {
  it('shows configured keys rather than fixed defaults', () => {
    render(
      <ZukSetTimerOverlay
        timer={{ status: 'idle' }}
        currentTick={0}
        keybinds={{ ...DEFAULT_PLUGIN_KEYBINDS, zukSetTimerAdvance: 'J' }}
      />,
      { wrapper: TooltipProvider },
    );

    expect(readCue()).toBe('JStart on the first set');
  });

  it('replaces an unusable key with a route to its settings', () => {
    render(
      <ZukSetTimerOverlay
        timer={{ status: 'idle' }}
        currentTick={0}
        keybinds={{ ...DEFAULT_PLUGIN_KEYBINDS, zukSetTimerAdvance: '', zukSetTimerReset: '', zukSetTimerReveal: '' }}
      />,
      { wrapper: TooltipProvider },
    );

    expect(readCue()).toBe('Check timer keybindings');
    expect(document.querySelectorAll('.zuk-set-timer__key')).toHaveLength(0);
    expect(screen.getByText('Reset: unavailable')).toBeDefined();
  });
  it('renders nothing while the timer is off', () => {
    renderOverlay(undefined);
    expect(document.querySelector('.zuk-set-timer')).toBeNull();
  });

  it('shows a full period and the first press before the timer is armed', () => {
    renderOverlay({ status: 'idle' });
    expect(screen.getByText('SET TIMER')).toBeTruthy();
    expect(readOverlay().textContent).toContain('3:30');
    expect(readCue()).toBe('ZStart on the first set');
  });

  it('prints all three driving keys on the surface, none of them hidden', () => {
    renderOverlay({ status: 'idle' });
    expect(document.querySelector('.zuk-set-timer__controls')).toBeTruthy();
    expect(screen.getAllByText('Z')).toHaveLength(1);
    expect(screen.getByText('Shift + Z')).toBeTruthy();
    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.getByText('Reset')).toBeTruthy();
    expect(screen.getByText('Actual')).toBeTruthy();
  });

  it('walks the fight routine on the cue row', () => {
    const { unmount } = renderOverlay({ status: 'idle' });
    expect(readOverlay().textContent).toContain('Start on the first set');
    unmount();

    const running = renderOverlay(RUNNING, 0);
    expect(readOverlay().textContent).toContain('Freeze at 600 HP');
    running.unmount();

    const frozen = renderOverlay(FROZEN);
    expect(readOverlay().textContent).toContain('Jad at 480 HP');
    frozen.unmount();

    renderOverlay(AFTER_JAD, 0);
    expect(readOverlay().textContent).toContain('Rolling every 3:30');
  });

  it('hides the encounter countdown until it is revealed', () => {
    const { unmount } = renderOverlay(RUNNING, 0);
    expect(document.querySelector('.zuk-set-timer__actual')).toBeNull();
    unmount();

    renderOverlay(RUNNING, 0, { ticksRemaining: 214, frozen: false });
    expect(document.querySelector('.zuk-set-timer__actual')?.textContent).toContain('2:09');
    expect(screen.getByText('Hide')).toBeTruthy();
  });

  it('marks the encounter countdown frozen during the 600 to 480 window', () => {
    renderOverlay(RUNNING, 0, { ticksRemaining: 259, frozen: true });
    expect(document.querySelector('.zuk-set-timer__actual')?.className).toContain('is-frozen');
  });

  it('leaves the player clock untouched by the reveal', () => {
    // The revealed value shares the readout row; the digits the player is
    // practicing against are still their own clock's.
    renderOverlay(FROZEN, 0, { ticksRemaining: 214, frozen: false });
    expect(document.querySelector('.zuk-set-timer__clock')?.textContent).toBe('1:00');
  });

  it('marks a running clock so the colon can tick, and leaves a stopped one still', () => {
    const { unmount } = renderOverlay(RUNNING, 0);
    expect(readOverlay().className).toContain('zuk-set-timer--running');
    unmount();

    renderOverlay({ status: 'paused', remainingTicks: 100 });
    expect(readOverlay().className).not.toContain('zuk-set-timer--running');
  });

  it('announces state for assistive tech, not color alone', () => {
    renderOverlay({ status: 'paused', remainingTicks: 100 });
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('Next Zuk set in 1:00, frozen for Jad');
  });

  it('names the revealed encounter countdown, which role="timer" would otherwise swallow', () => {
    const { unmount } = renderOverlay(FROZEN, 0, { ticksRemaining: 214, frozen: false });
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(
      'Next Zuk set in 1:00, frozen for Jad, encounter countdown 2:09',
    );
    unmount();

    renderOverlay(FROZEN, 0, { ticksRemaining: 259, frozen: true });
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(
      'Next Zuk set in 1:00, frozen for Jad, encounter countdown 2:36 (frozen)',
    );
  });
});

describe('zukSetTimerUrgency', () => {
  const running: ZukSetTimerState = { status: 'running', expiresAtTick: 0, phase: 'set' };

  it('escalates as the set closes in', () => {
    expect(zukSetTimerUrgency(running, 200)).toBe('normal');
    expect(zukSetTimerUrgency(running, 50)).toBe('warning');
    expect(zukSetTimerUrgency(running, 17)).toBe('danger');
  });

  it('never colors a stopped clock, however little is left on it', () => {
    expect(zukSetTimerUrgency({ status: 'paused', remainingTicks: 5 }, 5)).toBe('idle');
    expect(zukSetTimerUrgency({ status: 'idle' }, 5)).toBe('idle');
  });
});

describe('the routine key hint', () => {
  it('stops advertising the key once the routine has nothing left to advance', () => {
    const { unmount } = renderOverlay(RUNNING, 0);
    expect(readCue()).toBe('ZFreeze at 600 HP');
    unmount();

    renderOverlay(AFTER_JAD, 0);
    // The cue drops its key cap entirely rather than inventing a verb for a
    // press that does nothing; the controls row keeps reset and reveal.
    expect(readCue()).toBe('Rolling every 3:30');
    expect(screen.getByText('Shift + Z')).toBeTruthy();
    expect(screen.getByText('Reset')).toBeTruthy();
    expect(screen.getByText('Actual')).toBeTruthy();
  });
});

describe('ZukSetTimerOverlay default placement', () => {
  function panelTransform(): string {
    let node: HTMLElement | null = readOverlay();
    while (node && !node.style.transform.startsWith('translate3d')) node = node.parentElement;
    if (!node) throw new Error('Expected the overlay inside a positioned panel');
    return node.style.transform;
  }

  it.each([undefined, 2])('draws a null position at the replay default, at its recorded size (%s)', (overlayScale) => {
    const presentation = ReplayPresentationStateSchema.parse({ ...validPresentationSample().state, overlayScale });
    render(
      <ReplayPresentationProvider
        presentation={presentation}
        reportPanelPresentation={() => {}}
        reportMinimapZoom={() => {}}
      >
        <ZukSetTimerOverlay
          timer={{ status: 'idle' }}
          currentTick={0}
          overlayScale={overlayScale ?? 1}
          position={resolveReplayZukSetTimerPosition(presentation)}
          viewportWidth={3840}
          viewportHeight={2160}
        />
      </ReplayPresentationProvider>,
      { wrapper: TooltipProvider },
    );
    const scale = overlayScale ?? 1;
    expect(panelTransform()).toBe(`translate3d(${279 * scale}px, ${74 * scale}px, 0)`);
    expect(document.querySelector<HTMLElement>('[data-tutorial="zuk-set-timer-overlay"]')?.style.width).toBe(
      `${208 * scale}px`,
    );
  });

  it('projects its 1x default from the first viewport when loaded at a larger overlay size', () => {
    // A standalone timer follows the same free-space rule as a saved panel. When
    // a boss bar is registered, the assembly solver owns their attachment instead.
    render(
      <ZukSetTimerOverlay
        timer={{ status: 'idle' }}
        currentTick={0}
        overlayScale={2}
        viewportWidth={3840}
        viewportHeight={2160}
      />,
      { wrapper: TooltipProvider },
    );

    const [left, top] = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(panelTransform())!.slice(1).map(Number);
    expect(left).toBeCloseTo((359 * (3840 - 416)) / (3840 - 208), 9);
    expect(top).toBeCloseTo((74 * (2160 - 268)) / (2160 - 134), 9);
  });
});
