// @vitest-environment happy-dom

import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReplayModifierSample } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { __resetKeyStateForTest, MODIFIER_BIT, MOUSE_BUTTON_BIT } from '../../input/keyState';
import { freshReplayCapture } from '../../replay/format/capture';
import { ModifierKeysOverlay } from '../ModifierKeysOverlay';

afterEach(() => {
  __resetKeyStateForTest();
});

const TRACK: readonly ReplayModifierSample[] = [
  { tMs: 0, mask: 0, buttons: 0 },
  { tMs: 100, mask: MODIFIER_BIT.shift, buttons: 0 },
  { tMs: 400, mask: MODIFIER_BIT.shift | MODIFIER_BIT.ctrl, buttons: 0 },
  { tMs: 900, mask: 0, buttons: 0 },
];

function held(): string[] {
  return screen
    .getAllByText(/Shift|Ctrl|Alt|Meta/)
    .filter((el) => el.getAttribute('data-held') === 'true')
    .map((el) => el.getAttribute('data-modifier') ?? '');
}

function heldButtons(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-mouse-button]')]
    .filter((el) => el.getAttribute('data-held') === 'true')
    .map((el) => el.getAttribute('data-mouse-button') ?? '');
}

function renderAt(playheadMs: number, isReplaying: boolean, track = TRACK) {
  const store = new ReplayFrameStore();
  store.set(playheadMs, undefined);
  return render(<ModifierKeysOverlay isReplaying={isReplaying} modifierTrack={track} replayFrameStore={store} />);
}

describe('ModifierKeysOverlay', () => {
  it('does not show stale held keys after modifier capture stops', () => {
    const store = new ReplayFrameStore();
    store.setHistory([], [], {
      ...freshReplayCapture(),
      modifierSamples: { provenance: 'bounded-v1', stoppedAtMs: 200, reason: 'entry-limit' },
    });
    store.set(150, undefined);
    render(<ModifierKeysOverlay isReplaying modifierTrack={TRACK} replayFrameStore={store} />);
    expect(held()).toEqual(['shift']);

    act(() => store.set(200, undefined));

    expect(screen.queryByText('Input (replay)')).toBeNull();
    expect(screen.queryByText('Shift')).toBeNull();
  });
  it('reports what the recorder believed at the playhead, not the viewer keyboard', () => {
    renderAt(200, true);
    expect(held()).toEqual(['shift']);
  });

  it('follows the track across a transition inside a single tick', () => {
    renderAt(500, true);
    // Two transitions land inside tick 0 (600ms); a per-tick field could not carry this.
    expect(held()).toEqual(['shift', 'ctrl']);
  });

  it('reports nothing held before the first sample', () => {
    const { container } = renderAt(0, true, [{ tMs: 300, mask: MODIFIER_BIT.alt, buttons: MOUSE_BUTTON_BIT.left }]);
    expect(held()).toEqual([]);
    expect(heldButtons(container)).toEqual([]);
  });

  it('reports nothing held for an empty track', () => {
    const { container } = renderAt(5_000, true, []);
    expect(held()).toEqual([]);
    expect(heldButtons(container)).toEqual([]);
  });

  it('labels itself as replay only while replaying', () => {
    const { unmount } = renderAt(200, true);
    expect(screen.getByText('Input (replay)')).toBeTruthy();
    unmount();

    renderAt(200, false);
    expect(screen.getByText('Input')).toBeTruthy();
  });

  it('follows the live keyboard when not replaying, ignoring the recorded track', () => {
    renderAt(500, false);
    expect(held()).toEqual([]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    });
    expect(held()).toEqual(['alt']);
  });

  it('lights the button the live mouse is holding', () => {
    const { container } = renderAt(500, false);
    expect(heldButtons(container)).toEqual([]);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.right }));
    });
    expect(heldButtons(container)).toEqual(['right']);

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { buttons: 0 }));
    });
    expect(heldButtons(container)).toEqual([]);
  });

  it('draws the recorded mouse with nothing held while the viewer holds a button', () => {
    const { container } = renderAt(200, true);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.left }));
    });
    expect(container.querySelectorAll('[data-mouse-button]').length).toBeGreaterThan(0);
    expect(heldButtons(container)).toEqual([]);
  });

  it('reports the buttons the recorder held, not the viewer own', () => {
    const track: readonly ReplayModifierSample[] = [
      { tMs: 0, mask: 0, buttons: 0 },
      { tMs: 100, mask: 0, buttons: MOUSE_BUTTON_BIT.left },
      { tMs: 900, mask: 0, buttons: 0 },
    ];
    const { container, unmount } = renderAt(500, true, track);
    act(() => {
      window.dispatchEvent(new MouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.right }));
    });
    expect(heldButtons(container)).toEqual(['left']);
    unmount();

    // The hold ends at 900, so a playhead past it must show the button released —
    // this is the read that says whether someone held a click too long.
    const after = renderAt(1_000, true, track);
    expect(heldButtons(after.container)).toEqual([]);
  });
});
