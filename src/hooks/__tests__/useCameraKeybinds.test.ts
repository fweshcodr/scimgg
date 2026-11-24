// @vitest-environment happy-dom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetKeyStateForTest, isKeyHeld } from '../../input/keyState';
import { deleteSetting, loadSetting, saveSetting } from '../../util/storage';
import { saveKeybindingChanges } from '../keybindStore';
import { useAppHotkeys } from '../useAppHotkeys';
import { DEFAULT_CAMERA_KEYBINDS, useCameraKeybinds } from '../useCameraKeybinds';

const STORAGE_KEY = 'osrs-unified-keybinds';

afterEach(() => {
  __resetKeyStateForTest();
  deleteSetting(STORAGE_KEY);
});

describe('useCameraKeybinds', () => {
  it('loads camera keybinds from storage and merges with defaults', () => {
    saveSetting(STORAGE_KEY, { camera: { orbitRotateLeft: 'ArrowLeft', freeformDown: 'Control' } });

    const { result } = renderHook(() => useCameraKeybinds());

    expect(result.current.cameraKeybinds).toEqual({
      ...DEFAULT_CAMERA_KEYBINDS,
      orbitRotateLeft: 'ArrowLeft',
      freeformDown: '',
    });
  });

  it('updates a camera keybind and persists it to storage', () => {
    const { result } = renderHook(() => useCameraKeybinds());

    act(() => {
      saveKeybindingChanges([{ target: { domain: 'camera', action: 'orbitRotateLeft' }, value: 'J' }]);
    });

    expect(result.current.cameraKeybinds.orbitRotateLeft).toBe('J');
    expect(loadSetting(STORAGE_KEY)).toMatchObject({ camera: { orbitRotateLeft: 'J' } });
  });

  it('holds a Tab camera binding through the app Tab swallower', () => {
    renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      }),
    );
    const { result } = renderHook(() => useCameraKeybinds());
    act(() => {
      saveKeybindingChanges([{ target: { domain: 'camera', action: 'orbitRotateLeft' }, value: 'Tab' }], true);
    });
    const key = result.current.cameraKeybinds.orbitRotateLeft;
    expect(key).toBe('Tab');
    expect(isKeyHeld(key)).toBe(false);
    fireEvent.keyDown(document.body, { key: 'Tab', code: 'Tab' });
    expect(isKeyHeld(key)).toBe(true);
    fireEvent.keyUp(document.body, { key: 'Tab', code: 'Tab' });
    expect(isKeyHeld(key)).toBe(false);
  });

  it('uses default keybind values when storage is empty', () => {
    const { result } = renderHook(() => useCameraKeybinds());

    expect(result.current.cameraKeybinds).toEqual(DEFAULT_CAMERA_KEYBINDS);
  });
});
