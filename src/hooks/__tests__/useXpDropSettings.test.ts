// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIPosition } from '../usePersistedSettings';
import { useXpDropSettings, XP_DROP_DEFAULTS } from '../useXpDropSettings';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

const VALID_POSITION: UIPosition = {
  x: 84,
  y: 126,
  anchorX: 'right',
  anchorY: 'bottom',
};

function renderXpDropSettings() {
  return renderHook(() => useXpDropSettings());
}

describe('useXpDropSettings', () => {
  beforeEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
    storageMocks.loadSetting.mockReturnValue(null);
  });

  it('uses defaults when nothing is stored', () => {
    const { result } = renderXpDropSettings();

    expect(result.current.enabled).toBe(XP_DROP_DEFAULTS.enabled);
    expect(result.current.showPredictedHit).toBe(XP_DROP_DEFAULTS.showPredictedHit);
    expect(result.current.grouped).toBe(XP_DROP_DEFAULTS.grouped);
    expect(result.current.showIcons).toBe(XP_DROP_DEFAULTS.showIcons);
    expect(result.current.speed).toBe(XP_DROP_DEFAULTS.speed);
    expect(result.current.position).toBe(XP_DROP_DEFAULTS.position);
  });

  it('merges partial stored values with defaults', () => {
    storageMocks.loadSetting.mockReturnValue({
      enabled: false,
      showIcons: false,
    });

    const { result } = renderXpDropSettings();

    expect(result.current.enabled).toBe(false);
    expect(result.current.showPredictedHit).toBe(XP_DROP_DEFAULTS.showPredictedHit);
    expect(result.current.grouped).toBe(XP_DROP_DEFAULTS.grouped);
    expect(result.current.showIcons).toBe(false);
    expect(result.current.speed).toBe(XP_DROP_DEFAULTS.speed);
    expect(result.current.position).toBe(XP_DROP_DEFAULTS.position);
  });

  it('reads its position through the shared reader: the current shape exactly, an anchorless one refused', () => {
    const exact = { x: 17.5, y: 3, anchorX: 'right', anchorY: 'bottom' } as const;
    storageMocks.loadSetting
      .mockReturnValueOnce({ position: exact })
      .mockReturnValueOnce({ position: { x: -40, y: 12 } });

    expect(renderXpDropSettings().result.current.position).toEqual(exact);
    expect(renderXpDropSettings().result.current.position).toBe(XP_DROP_DEFAULTS.position);
  });

  it('keeps a valid stored position and rejects an invalid one', () => {
    storageMocks.loadSetting.mockReturnValueOnce({ position: VALID_POSITION }).mockReturnValueOnce({
      position: { x: 12, y: 34, anchorX: 'center', anchorY: 'bottom' },
    });

    const validResult = renderXpDropSettings();
    expect(validResult.result.current.position).toEqual(VALID_POSITION);

    const invalidResult = renderXpDropSettings();
    expect(invalidResult.result.current.position).toBe(XP_DROP_DEFAULTS.position);
  });

  it('clamps stored speed on load', () => {
    storageMocks.loadSetting.mockReturnValue({ speed: 3 });

    const { result } = renderXpDropSettings();

    expect(result.current.speed).toBe(10);
  });

  it('clamps speed updates from the setter', () => {
    const { result } = renderXpDropSettings();

    act(() => {
      result.current.setSpeed(1);
    });
    expect(result.current.speed).toBe(10);

    act(() => {
      result.current.setSpeed(999);
    });
    expect(result.current.speed).toBe(200);
  });

  it('toggles every boolean setting', () => {
    const { result } = renderXpDropSettings();

    act(() => {
      result.current.toggleEnabled();
      result.current.togglePredictedHit();
      result.current.toggleGrouped();
      result.current.toggleIcons();
    });

    expect(result.current.enabled).toBe(!XP_DROP_DEFAULTS.enabled);
    expect(result.current.showPredictedHit).toBe(!XP_DROP_DEFAULTS.showPredictedHit);
    expect(result.current.grouped).toBe(!XP_DROP_DEFAULTS.grouped);
    expect(result.current.showIcons).toBe(!XP_DROP_DEFAULTS.showIcons);
  });

  it('updates and persists the position setter', () => {
    const { result } = renderXpDropSettings();
    const nextPosition: UIPosition = {
      x: 240,
      y: 18,
      anchorX: 'left',
      anchorY: 'top',
    };

    act(() => {
      result.current.setPosition(nextPosition);
    });

    expect(result.current.position).toEqual(nextPosition);
    expect(storageMocks.saveSetting).toHaveBeenLastCalledWith(
      'osrs-xp-drops',
      expect.objectContaining({ position: nextPosition }),
    );
  });

  it('skips saving on the initial mount', () => {
    renderXpDropSettings();

    expect(storageMocks.saveSetting).not.toHaveBeenCalled();
  });

  it('saves later changes after mount', () => {
    const { result } = renderXpDropSettings();

    act(() => {
      result.current.toggleEnabled();
    });

    expect(storageMocks.saveSetting).toHaveBeenCalledWith(
      'osrs-xp-drops',
      expect.objectContaining({ enabled: !XP_DROP_DEFAULTS.enabled }),
    );
  });
});
