// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureKeybind } from '../../input/keybindCapture';
import { __resetKeyStateForTest, isKeyHeld } from '../../input/keyState';
import { deleteSetting, saveSetting } from '../../util/storage';
import { DEFAULT_KEYBINDS, saveKeybindingChanges, UNIFIED_KEYBINDS_KEY } from '../keybindStore';
import { useAppHotkeys } from '../useAppHotkeys';
import { ESC_PRIORITY, useEscapeLayer } from '../useEscapeLayer';
import { useGamePanelShortcuts } from '../useGamePanelShortcuts';
import { useZukSetTimer } from '../useZukSetTimer';

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

describe('useEscapeLayer', () => {
  afterEach(() => {
    cleanup();
    __resetKeyStateForTest();
    deleteSetting(UNIFIED_KEYBINDS_KEY);
  });

  it.each([
    'Alt',
    'Control',
    'Meta',
    'AltGraph',
    'Dead',
    'Unidentified',
  ])('does not dismiss using persisted unsupported binding %s', (key) => {
    saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: key } });
    const handler = vi.fn();
    renderHook(() => useEscapeLayer(10, true, handler));
    fireEvent.keyDown(document.body, { key });
    expect(handler).not.toHaveBeenCalled();
  });

  it('dismisses with a Tab binding even though the app swallows Tab on window first', () => {
    renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      }),
    );
    saveKeybindingChanges([{ target: { domain: 'ui', action: 'closeOverlay' }, value: 'Tab' }], true);
    const handler = vi.fn();
    renderHook(() => useEscapeLayer(10, true, handler));
    expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    pressEscape();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('uses the current configured key and stops using Escape after remapping or unbinding', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeLayer(10, true, handler));
    act(() => {
      saveKeybindingChanges([{ target: { domain: 'ui', action: 'closeOverlay' }, value: 'j' }]);
    });
    pressEscape();
    expect(handler).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'J' });
    expect(handler).toHaveBeenCalledOnce();
    act(() => {
      saveKeybindingChanges([{ target: { domain: 'ui', action: 'closeOverlay' }, value: '' }]);
    });
    fireEvent.keyDown(document.body, { key: 'j' });
    pressEscape();
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    true,
    false,
  ])('dismisses before panel actions regardless of registration order (panel first: %s)', (panelFirst) => {
    const tab = vi.fn();
    const close = vi.fn();
    const panel = () => renderHook(() => useGamePanelShortcuts(tab, DEFAULT_KEYBINDS));
    const overlay = () => renderHook(() => useEscapeLayer(10, true, close));
    if (panelFirst) panel();
    const layer = overlay();
    if (!panelFirst) panel();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    expect(tab).not.toHaveBeenCalled();
    layer.unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tab).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'F3' });
    expect(tab).toHaveBeenCalledExactlyOnceWith('inventory');
  });

  it('preserves configured priority and declines for a remapped close key', () => {
    saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: 'j' } });
    const low = vi.fn();
    const high = vi.fn(() => false);
    renderHook(() => useEscapeLayer(10, true, low));
    renderHook(() => useEscapeLayer(20, true, high));
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(high).toHaveBeenCalledOnce();
    expect(low).toHaveBeenCalledOnce();
    expect(high.mock.invocationCallOrder[0]).toBeLessThan(low.mock.invocationCallOrder[0]);
  });

  it('does not switch to Inventory when all layers decline Escape', () => {
    const tab = vi.fn();
    renderHook(() => useGamePanelShortcuts(tab, DEFAULT_KEYBINDS));
    const decline = vi.fn(() => false);
    renderHook(() => useEscapeLayer(10, true, decline));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(decline).toHaveBeenCalledOnce();
    expect(tab).not.toHaveBeenCalled();
  });

  it('suppresses held camera input, repeats and earlier window listeners for the whole consumed press', () => {
    saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: 'j' } });
    isKeyHeld('j');
    const underlying = vi.fn();
    window.addEventListener('keydown', underlying);
    const close = vi.fn();
    const layer = renderHook(() => useEscapeLayer(10, true, close));
    try {
      fireEvent.keyDown(document.body, { key: 'j', code: 'KeyJ' });
      expect(close).toHaveBeenCalledOnce();
      expect(isKeyHeld('j')).toBe(false);
      expect(underlying).not.toHaveBeenCalled();
      layer.unmount();
      fireEvent.keyDown(document.body, { key: 'j', code: 'KeyJ', repeat: true });
      expect(underlying).not.toHaveBeenCalled();
      expect(isKeyHeld('j')).toBe(false);
      fireEvent.keyUp(document.body, { key: 'j', code: 'KeyJ' });
      fireEvent.keyDown(document.body, { key: 'j', code: 'KeyJ' });
      expect(isKeyHeld('j')).toBe(true);
      expect(underlying).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('keydown', underlying);
    }
  });

  it('arbitrates overlay dismissal before a plugin even when the plugin registered first', () => {
    // Imported profiles can contain collisions; dismissal must still own a consumed event.
    saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: 'Escape' }, plugins: { zukSetTimerAdvance: 'Escape' } });
    const timer = renderHook(() => useZukSetTimer({ enabled: true, currentTick: 100 }));
    const close = vi.fn();
    renderHook(() => useEscapeLayer(10, true, close));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    expect(timer.result.current?.timer.status).toBe('idle');
  });

  it.each(['INPUT', 'TEXTAREA', 'DIV'])('does not dismiss on remapped typing keys in %s', (tag) => {
    const close = vi.fn();
    renderHook(() => useEscapeLayer(10, true, close));
    const target = document.createElement(tag);
    if (tag === 'DIV') Object.defineProperty(target, 'isContentEditable', { value: true });
    document.body.append(target);
    try {
      for (const key of ['j', ' ', 'Enter', 'Backspace', 'Delete', 'ArrowLeft', 'Home', 'End']) {
        saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: key } });
        fireEvent.keyDown(target, { key });
      }
      expect(close).not.toHaveBeenCalled();
    } finally {
      target.remove();
    }
  });

  it.each(['INPUT', 'TEXTAREA', 'DIV'])('dismisses with remapped F8 and default Escape inside %s', (tag) => {
    const close = vi.fn();
    renderHook(() => useEscapeLayer(ESC_PRIORITY.QUICK_SEARCH, true, close));
    const target = document.createElement(tag);
    if (tag === 'DIV') Object.defineProperty(target, 'isContentEditable', { value: true });
    document.body.append(target);
    try {
      saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: 'F8' } });
      fireEvent.keyDown(target, { key: 'F8' });
      expect(close).toHaveBeenCalledOnce();

      deleteSetting(UNIFIED_KEYBINDS_KEY);
      fireEvent.keyDown(target, { key: 'Escape' });
      expect(close).toHaveBeenCalledTimes(2);
    } finally {
      target.remove();
    }
  });

  it('ignores repeats and app/browser modifier chords, but matches shifted letter case', () => {
    saveSetting(UNIFIED_KEYBINDS_KEY, { ui: { closeOverlay: 'j' } });
    const close = vi.fn();
    renderHook(() => useEscapeLayer(10, true, close));
    for (const flags of [
      { repeat: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ]) {
      fireEvent.keyDown(document.body, { key: 'j', ...flags });
    }
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'J', shiftKey: true });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    true,
    false,
  ])('does not dismiss or switch panels during capture, even when capture declines (%s)', (takesKey) => {
    const tab = vi.fn();
    const close = vi.fn();
    renderHook(() => useGamePanelShortcuts(tab, DEFAULT_KEYBINDS));
    renderHook(() => useEscapeLayer(10, true, close));
    const capture = vi.fn(() => takesKey);
    const release = captureKeybind(capture);
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(capture).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
      expect(tab).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it('leaves the enclosing layer open when a nested control handles Escape', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeLayer(ESC_PRIORITY.SETTINGS, true, handler));
    render(createElement('input', { onKeyDown: (event) => event.preventDefault() }));

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('dismisses the enclosing layer when a nested control leaves Escape unhandled', () => {
    const handler = vi.fn();
    renderHook(() => useEscapeLayer(ESC_PRIORITY.SETTINGS, true, handler));
    render(createElement('input'));

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('registers an escape handler with a priority', () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() => useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, true, handler));
    pressEscape();

    expect(handler).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('fires the higher priority handler first', () => {
    const lowPriorityHandler = vi.fn();
    const highPriorityHandler = vi.fn();

    const low = renderHook(() => useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, true, lowPriorityHandler));
    const high = renderHook(() => useEscapeLayer(ESC_PRIORITY.ENCOUNTER_PICKER, true, highPriorityHandler));

    pressEscape();

    expect(highPriorityHandler).toHaveBeenCalledTimes(1);
    expect(lowPriorityHandler).not.toHaveBeenCalled();

    high.unmount();
    low.unmount();
  });

  it('unregisters a handler when deactivated', () => {
    const handler = vi.fn();
    const { rerender, unmount } = renderHook(({ active }) => useEscapeLayer(ESC_PRIORITY.SETTINGS, active, handler), {
      initialProps: { active: true },
    });

    pressEscape();
    expect(handler).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    pressEscape();
    expect(handler).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('spends the press on the layer that takes it', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, true, handler));
    const press = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(press);

    expect(handler).toHaveBeenCalledExactlyOnceWith(press);
    expect(press.defaultPrevented).toBe(true);
    unmount();
  });

  it('passes a declined press to the next layer down, and leaves it untouched where none takes it', () => {
    const replay = vi.fn(() => false);
    const panel = vi.fn();
    const replayLayer = renderHook(() => useEscapeLayer(ESC_PRIORITY.REPLAY, true, replay));
    const panelLayer = renderHook(() => useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, true, panel));
    const declinedByPanel = renderHook(() => useEscapeLayer(ESC_PRIORITY.SETTINGS, true, () => false));

    pressEscape();
    expect(panel).toHaveBeenCalledOnce();
    expect(replay).not.toHaveBeenCalled();

    panelLayer.unmount();
    const press = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(press);
    expect(replay).toHaveBeenCalledOnce();
    expect(press.defaultPrevented).toBe(false);

    declinedByPanel.unmount();
    replayLayer.unmount();
  });

  it('handles multiple handlers at different priorities', () => {
    const p10 = vi.fn();
    const p20 = vi.fn();
    const p30 = vi.fn();

    const layer10 = renderHook(() => useEscapeLayer(10, true, p10));
    const layer20 = renderHook(() => useEscapeLayer(20, true, p20));
    const layer30 = renderHook(() => useEscapeLayer(30, true, p30));

    pressEscape();
    expect(p30).toHaveBeenCalledTimes(1);
    expect(p20).not.toHaveBeenCalled();
    expect(p10).not.toHaveBeenCalled();

    layer30.unmount();
    pressEscape();
    expect(p20).toHaveBeenCalledTimes(1);
    expect(p10).not.toHaveBeenCalled();

    layer20.unmount();
    pressEscape();
    expect(p10).toHaveBeenCalledTimes(1);

    layer10.unmount();
  });
});
