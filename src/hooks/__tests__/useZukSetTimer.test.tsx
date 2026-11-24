// @vitest-environment happy-dom

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLUGIN_KEYBINDS } from '../../data/pluginKeybinds';
import { captureKeybind } from '../../input/keybindCapture';
import { __resetKeyStateForTest } from '../../input/keyState';
import { ZUK_SET_PERIOD_TICKS, ZUK_SET_TIMER_JAD_BONUS_TICKS } from '../../types/zukSetTimer';
import { deleteSetting, saveSetting } from '../../util/storage';
import {
  DEFAULT_CAMERA_KEYBINDS,
  DEFAULT_KEYBINDS,
  loadUnifiedKeybindStore,
  saveKeybindingChanges,
} from '../keybindStore';
import { useAppHotkeys } from '../useAppHotkeys';
import { useGamePanelShortcuts } from '../useGamePanelShortcuts';
import { useZukSetTimer } from '../useZukSetTimer';

function press(key: string, options: { shift?: boolean; ctrl?: boolean; repeat?: boolean; target?: EventTarget } = {}) {
  act(() => {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey: options.shift ?? false,
      ctrlKey: options.ctrl ?? false,
      repeat: options.repeat ?? false,
      bubbles: true,
      cancelable: true,
    });
    (options.target ?? document.body).dispatchEvent(event);
  });
}

function renderTimer(enabled = true, currentTick = 100) {
  return renderHook(
    ({ isEnabled, tick }: { isEnabled: boolean; tick: number }) =>
      useZukSetTimer({ enabled: isEnabled, currentTick: tick }),
    { initialProps: { isEnabled: enabled, tick: currentTick } },
  );
}

describe('useZukSetTimer', () => {
  afterEach(() => {
    __resetKeyStateForTest();
    deleteSetting('osrs-unified-keybinds');
  });

  it('leaves Escape consumed by a nested non-text control alone', () => {
    saveKeybindingChanges([{ target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'Escape' }], true);
    const { result } = renderTimer();
    render(
      <button type="button" onKeyDown={(event) => event.preventDefault()}>
        Nested control
      </button>,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Nested control' }), { key: 'Escape' });
    expect(result.current?.timer.status).toBe('idle');
    press('Escape');
    expect(result.current?.timer.status).toBe('running');
  });

  it.each([
    'Alt',
    'Control',
    'Meta',
    'AltGraph',
    'Dead',
    'Unidentified',
  ])('does not run a persisted unsupported plugin binding %s', (key) => {
    saveSetting('osrs-unified-keybinds', { plugins: { zukSetTimerAdvance: key } });
    const { result } = renderTimer();
    press(key);
    expect(result.current?.timer.status).toBe('idle');
    expect(result.current?.keybinds.zukSetTimerAdvance).toBe('');
  });

  it('runs Tab and Shift+Tab plugin bindings even though the app swallows Tab on window first', () => {
    renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      }),
    );
    saveKeybindingChanges(
      [
        { target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'Tab' },
        { target: { domain: 'plugins', action: 'zukSetTimerReset' }, value: 'Shift+Tab' },
      ],
      true,
    );
    const { result } = renderTimer();
    press('Tab');
    expect(result.current?.timer.status).toBe('running');
    press('Tab', { shift: true });
    expect(result.current?.timer.status).toBe('idle');
    press('Tab', { ctrl: true });
    expect(result.current?.timer.status).toBe('idle');
  });

  it('runs an Escape plugin binding after normal reassignment and leaves captures alone', () => {
    saveKeybindingChanges([{ target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'Escape' }], true);
    const { result } = renderTimer();
    const release = captureKeybind(() => false);
    try {
      press('Escape');
      expect(result.current?.timer.status).toBe('idle');
    } finally {
      release();
    }
    press('Escape');
    expect(result.current?.timer.status).toBe('running');
    press('Escape', { repeat: true });
    expect(result.current?.timer.status).toBe('running');
    press('Escape', { shift: true });
    expect(result.current?.timer.status).toBe('running');
  });

  it('leaves a colliding game binding working without advancing the timer', () => {
    const gamePanel = { ...DEFAULT_KEYBINDS, prayer: 'z' };
    saveSetting('osrs-unified-keybinds', { gamePanel, camera: DEFAULT_CAMERA_KEYBINDS });
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, gamePanel));
    const { result } = renderTimer();

    press('z');

    expect(onTabChange).toHaveBeenCalledWith('prayer');
    expect(result.current?.timer).toEqual({ status: 'idle' });
  });

  it('switches to a newly configured key without resetting a running clock', () => {
    const { result } = renderTimer();
    press('z');
    const running = result.current?.timer;

    act(() => {
      saveKeybindingChanges([{ target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'J' }]);
    });

    expect(result.current?.timer).toBe(running);
    press('z');
    expect(result.current?.timer).toBe(running);
    press('j');
    expect(result.current?.timer.status).toBe('paused');
  });

  it('leaves configured camera keys alone', () => {
    saveSetting('osrs-unified-keybinds', { camera: { orbitRotateLeft: 'z' } });
    const listener = vi.fn();
    window.addEventListener('keydown', listener);
    const { result } = renderTimer();
    try {
      press('z');
      expect(listener).toHaveBeenCalledOnce();
      expect(result.current?.timer.status).toBe('idle');
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });

  it('arms a full period from the current tick on the routine key', () => {
    const { result } = renderTimer();
    expect(result.current?.timer).toEqual({ status: 'idle' });

    press('z');

    expect(result.current?.timer).toEqual({
      status: 'running',
      expiresAtTick: 100 + ZUK_SET_PERIOD_TICKS,
      phase: 'set',
    });
  });

  it('walks the fight routine: freeze at 600, then Jad releases it with 1:45 added', () => {
    const { result, rerender } = renderTimer();
    press('z');

    rerender({ isEnabled: true, tick: 150 });
    press('z');
    expect(result.current?.timer).toEqual({ status: 'paused', remainingTicks: ZUK_SET_PERIOD_TICKS - 50 });

    // Releasing re-anchors to NOW, so the freeze ate none of the set, and the
    // interlude is added on top.
    rerender({ isEnabled: true, tick: 400 });
    press('z');
    expect(result.current?.timer).toEqual({
      status: 'running',
      expiresAtTick: 400 + ZUK_SET_PERIOD_TICKS - 50 + ZUK_SET_TIMER_JAD_BONUS_TICKS,
      phase: 'jad',
    });

    // The routine is over; further presses must not disturb the rolling clock.
    const afterJad = result.current?.timer;
    press('z');
    expect(result.current?.timer).toBe(afterJad);
  });

  it('resets to a fresh, stopped clock on the reset key', () => {
    const { result } = renderTimer();
    press('z');

    press('z', { shift: true });

    expect(result.current?.timer).toEqual({ status: 'idle' });
  });

  it('matches modifiers exactly, so the reset chord never also advances', () => {
    const { result } = renderTimer();

    press('z', { shift: true });
    expect(result.current?.timer).toEqual({ status: 'idle' });

    press('z', { ctrl: true });
    expect(result.current?.timer).toEqual({ status: 'idle' });
  });

  it('toggles the encounter countdown on the reveal key without touching the clock', () => {
    const { result } = renderTimer();
    press('z');
    const armed = result.current?.timer;
    expect(result.current?.showActual).toBe(false);

    press('x');
    expect(result.current?.showActual).toBe(true);
    // Revealing the answer must never disturb the clock being practiced with.
    expect(result.current?.timer).toBe(armed);

    // A toggle, not a hold: the second press puts the answer away again.
    press('x');
    expect(result.current?.showActual).toBe(false);
  });

  it('ignores repeated routine-key events instead of advancing another stage', () => {
    const { result } = renderTimer();

    press('z');
    const armed = result.current?.timer;
    press('z', { repeat: true });

    expect(result.current?.timer).toBe(armed);
  });

  it('ignores repeated reveal-key events instead of toggling the answer', () => {
    const { result } = renderTimer();

    press('x');
    press('x', { repeat: true });

    expect(result.current?.showActual).toBe(true);
  });

  it('owns matched keys before another global key listener can act on them', () => {
    const competingListener = vi.fn();
    window.addEventListener('keydown', competingListener);
    const { result } = renderTimer();

    press('z');

    expect(result.current?.timer).toMatchObject({ status: 'running' });
    expect(competingListener).not.toHaveBeenCalled();
    window.removeEventListener('keydown', competingListener);
  });

  it('listens for nothing while the mechanics toggle is off', () => {
    // The toggle owns the whole feature: with it off the keys belong to the
    // rest of the app, and the overlay has no state to render.
    const { result } = renderTimer(false);

    press('z');
    press('x');

    expect(result.current).toBeUndefined();
  });

  it('preserves custom bindings through activation, disablement and timeline changes', () => {
    saveKeybindingChanges([{ target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'J' }], true);
    const saved = loadUnifiedKeybindStore();
    const { result, rerender } = renderTimer(false);

    rerender({ isEnabled: true, tick: 100 });
    press('j');
    expect(result.current?.timer.status).toBe('running');
    rerender({ isEnabled: false, tick: 100 });
    rerender({ isEnabled: true, tick: 0 });

    expect(loadUnifiedKeybindStore()).toEqual(saved);
    expect(result.current?.keybinds.zukSetTimerAdvance).toBe('J');
  });

  it('drops a countdown anchored to an older timeline when the tick rewinds', () => {
    // Encounter reset rewinds the tick counter; a surviving anchor would read
    // minutes too high.
    const { result, rerender } = renderTimer();
    press('z');
    expect(result.current?.timer).toMatchObject({ status: 'running' });

    rerender({ isEnabled: true, tick: 0 });

    expect(result.current?.timer).toEqual({ status: 'idle' });
  });

  it('leaves keys typed into a text field alone', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const { result } = renderTimer();

    press('z', { target: input });
    press('x', { target: input });

    expect(result.current?.timer).toEqual({ status: 'idle' });
    expect(result.current?.showActual).toBe(false);
    input.remove();
  });

  it('resets and releases its keys when replay disables an active timer', () => {
    const competingListener = vi.fn();
    window.addEventListener('keydown', competingListener);
    const { result, rerender } = renderTimer();
    press('z');
    press('x');

    rerender({ isEnabled: false, tick: 100 });
    press('z');

    expect(result.current).toBeUndefined();
    expect(competingListener).toHaveBeenCalledOnce();

    rerender({ isEnabled: true, tick: 100 });
    // Re-enabling starts the whole feature over, reveal included: the answer
    // must never come back up on its own beside a clock that was reset.
    expect(result.current).toEqual({ timer: { status: 'idle' }, showActual: false, keybinds: DEFAULT_PLUGIN_KEYBINDS });
    window.removeEventListener('keydown', competingListener);
  });
});
