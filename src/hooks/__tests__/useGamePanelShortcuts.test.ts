// @vitest-environment happy-dom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSetting, loadSetting, saveSetting } from '../../util/storage';
import { saveKeybindingChanges } from '../keybindStore';
import { useAppHotkeys } from '../useAppHotkeys';
import { DEFAULT_KEYBINDS, useGamePanelShortcuts, useKeybinds } from '../useGamePanelShortcuts';

afterEach(() => {
  deleteSetting('osrs-unified-keybinds');
});

describe('useGamePanelShortcuts/useKeybinds', () => {
  beforeEach(() => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { inventory: 'I', prayer: 'P' } });
  });

  it('loads keybinds from storage and merges with defaults', () => {
    const { result } = renderHook(() => useKeybinds());

    expect(result.current.keybinds).toEqual({
      ...DEFAULT_KEYBINDS,
      inventory: 'I',
      prayer: 'P',
    });
  });

  it('updates a keybind and persists the new mapping', () => {
    const { result } = renderHook(() => useKeybinds());

    act(() => {
      saveKeybindingChanges([{ target: { domain: 'gamePanel', action: 'combat' }, value: 'K' }]);
    });

    expect(result.current.keybinds.combat).toBe('K');
    expect(loadSetting('osrs-unified-keybinds')).toMatchObject({ gamePanel: { combat: 'K' } });
  });
});

describe('useGamePanelShortcuts', () => {
  it.each([
    'Alt',
    'Control',
    'Meta',
    'AltGraph',
    'Dead',
    'Unidentified',
  ])('does not dispatch unsupported direct panel binding %s', (key) => {
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, { ...DEFAULT_KEYBINDS, prayer: key }));
    fireEvent.keyDown(window, { key });
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('dispatches a Tab panel binding whichever order the app Tab swallower was installed in', () => {
    const appHotkeys = () =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      });
    const before = renderHook(appHotkeys);
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, { ...DEFAULT_KEYBINDS, prayer: 'Tab' }));
    renderHook(appHotkeys);
    const button = document.body.appendChild(document.createElement('button'));
    try {
      button.focus();
      expect(fireEvent.keyDown(button, { key: 'Tab' })).toBe(false);
      expect(onTabChange).toHaveBeenCalledExactlyOnceWith('prayer');
      // Still never a focus move.
      expect(document.activeElement).toBe(document.body);
      before.unmount();
      fireEvent.keyDown(document.body, { key: 'Tab', shiftKey: true });
      expect(onTabChange).toHaveBeenCalledTimes(2);
    } finally {
      button.remove();
    }
  });

  it('uses F3 for Inventory and leaves Escape alone without an overlay', () => {
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, DEFAULT_KEYBINDS));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onTabChange).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'F3' });
    expect(onTabChange).toHaveBeenCalledExactlyOnceWith('inventory');
  });

  it('still routes an explicitly configured Inventory Escape shortcut', () => {
    const onTabChange = vi.fn();
    saveSetting('osrs-unified-keybinds', { gamePanel: { inventory: 'Escape' }, ui: { closeOverlay: '' } });
    renderHook(() => useGamePanelShortcuts(onTabChange, useKeybinds().keybinds));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onTabChange).toHaveBeenCalledExactlyOnceWith('inventory');
  });

  it('ignores repeat, composition and typing in text fields', () => {
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, DEFAULT_KEYBINDS));
    fireEvent.keyDown(window, { key: 'F2', repeat: true });
    fireEvent.keyDown(window, { key: 'F2', isComposing: true });
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    // happy-dom does not compute the inherited editability that browsers expose.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.append(input, textarea, editable);
    try {
      fireEvent.keyDown(input, { key: 'F2' });
      fireEvent.keyDown(textarea, { key: 'F2' });
      fireEvent.keyDown(editable, { key: 'F2' });
      expect(onTabChange).not.toHaveBeenCalled();
    } finally {
      input.remove();
      textarea.remove();
      editable.remove();
    }
  });

  it('defaults the Skills tab to F2', () => {
    expect(DEFAULT_KEYBINDS.skills).toBe('F2');
  });

  it('routes the F2 keydown to the skills tab through the generic shortcut flow', () => {
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, DEFAULT_KEYBINDS));

    act(() => {
      fireEvent.keyDown(window, { key: 'F2' });
    });

    expect(onTabChange).toHaveBeenCalledWith('skills');
  });

  it('routes a letter keybind when Caps Lock changes the reported key case', () => {
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, { ...DEFAULT_KEYBINDS, prayer: 'p' }));

    act(() => {
      fireEvent.keyDown(window, { key: 'P', code: 'KeyP' });
    });

    expect(onTabChange).toHaveBeenCalledWith('prayer');
  });
});
