// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSS_HEALTH_BAR_DEFAULTS, useBossHealthBarSettings } from '../useBossHealthBarSettings';
import type { UIPosition } from '../usePersistedSettings';

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

function renderBossHealthBarSettings() {
  return renderHook(() => useBossHealthBarSettings());
}

describe('useBossHealthBarSettings', () => {
  beforeEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
    storageMocks.loadSetting.mockReturnValue(null);
  });

  it('uses defaults when nothing is stored', () => {
    const { result } = renderBossHealthBarSettings();

    expect(result.current.enabled).toBe(BOSS_HEALTH_BAR_DEFAULTS.enabled);
    expect(result.current.showName).toBe(BOSS_HEALTH_BAR_DEFAULTS.showName);
    expect(result.current.showValues).toBe(BOSS_HEALTH_BAR_DEFAULTS.showValues);
    expect(result.current.showPercentage).toBe(BOSS_HEALTH_BAR_DEFAULTS.showPercentage);
    expect(result.current.position).toBe(BOSS_HEALTH_BAR_DEFAULTS.position);
  });

  it('merges partial stored values with defaults', () => {
    storageMocks.loadSetting.mockReturnValue({
      enabled: true,
      showValues: false,
    });

    const { result } = renderBossHealthBarSettings();

    expect(result.current.enabled).toBe(true);
    expect(result.current.showName).toBe(BOSS_HEALTH_BAR_DEFAULTS.showName);
    expect(result.current.showValues).toBe(false);
    expect(result.current.showPercentage).toBe(BOSS_HEALTH_BAR_DEFAULTS.showPercentage);
    expect(result.current.position).toBe(BOSS_HEALTH_BAR_DEFAULTS.position);
  });

  it('reads its position through the shared reader: the current shape exactly, an anchorless one refused', () => {
    const exact = { x: 17.5, y: 3, anchorX: 'right', anchorY: 'bottom' } as const;
    storageMocks.loadSetting
      .mockReturnValueOnce({ position: exact })
      .mockReturnValueOnce({ position: { x: -40, y: 12 } });

    expect(renderBossHealthBarSettings().result.current.position).toEqual(exact);
    expect(renderBossHealthBarSettings().result.current.position).toBe(BOSS_HEALTH_BAR_DEFAULTS.position);
  });

  it('keeps a valid stored position and rejects an invalid one', () => {
    storageMocks.loadSetting.mockReturnValueOnce({ position: VALID_POSITION }).mockReturnValueOnce({
      position: { x: 12, y: 34, anchorX: 'center', anchorY: 'bottom' },
    });

    const validResult = renderBossHealthBarSettings();
    expect(validResult.result.current.position).toEqual(VALID_POSITION);

    const invalidResult = renderBossHealthBarSettings();
    expect(invalidResult.result.current.position).toBe(BOSS_HEALTH_BAR_DEFAULTS.position);
  });

  it('toggles every boolean setting', () => {
    const { result } = renderBossHealthBarSettings();

    act(() => {
      result.current.toggleEnabled();
      result.current.toggleName();
      result.current.toggleValues();
      result.current.togglePercentage();
    });

    expect(result.current.enabled).toBe(!BOSS_HEALTH_BAR_DEFAULTS.enabled);
    expect(result.current.showName).toBe(!BOSS_HEALTH_BAR_DEFAULTS.showName);
    expect(result.current.showValues).toBe(!BOSS_HEALTH_BAR_DEFAULTS.showValues);
    expect(result.current.showPercentage).toBe(!BOSS_HEALTH_BAR_DEFAULTS.showPercentage);
  });

  it('updates and persists the position setter', () => {
    const { result } = renderBossHealthBarSettings();
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
      'osrs-boss-health-bar',
      expect.objectContaining({ position: nextPosition }),
    );
  });

  it('skips saving on the initial mount', () => {
    renderBossHealthBarSettings();

    expect(storageMocks.saveSetting).not.toHaveBeenCalled();
  });

  it('saves later changes after mount', () => {
    const { result } = renderBossHealthBarSettings();

    act(() => {
      result.current.toggleEnabled();
    });

    expect(storageMocks.saveSetting).toHaveBeenCalledWith(
      'osrs-boss-health-bar',
      expect.objectContaining({ enabled: !BOSS_HEALTH_BAR_DEFAULTS.enabled }),
    );
  });
});
