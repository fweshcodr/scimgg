import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSetting, saveSetting } from '../util/storage';
import { parseStoredPosition, type UIPosition } from './usePersistedSettings';

const STORAGE_KEY = 'osrs-boss-health-bar';

interface BossHealthBarStorage {
  enabled: boolean;
  showName: boolean;
  showValues: boolean;
  showPercentage: boolean;
  /**
   * Panel position; null = default slot near the top of the viewport.
   * Desktop layouts only: the Mobile layout draws this overlay at its native place
   * (osmHud) and never reads or writes it.
   */
  position: UIPosition | null;
}

export const BOSS_HEALTH_BAR_DEFAULTS: BossHealthBarStorage = {
  enabled: true,
  showName: true,
  showValues: true,
  showPercentage: true,
  position: null,
};

function load(): BossHealthBarStorage {
  const stored = loadSetting<Record<string, unknown>>(STORAGE_KEY);
  if (!stored) return { ...BOSS_HEALTH_BAR_DEFAULTS };

  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : BOSS_HEALTH_BAR_DEFAULTS.enabled,
    showName: typeof stored.showName === 'boolean' ? stored.showName : BOSS_HEALTH_BAR_DEFAULTS.showName,
    showValues: typeof stored.showValues === 'boolean' ? stored.showValues : BOSS_HEALTH_BAR_DEFAULTS.showValues,
    showPercentage:
      typeof stored.showPercentage === 'boolean' ? stored.showPercentage : BOSS_HEALTH_BAR_DEFAULTS.showPercentage,
    // The one stored-position reader (usePersistedSettings).
    position: parseStoredPosition(stored.position) ?? BOSS_HEALTH_BAR_DEFAULTS.position,
  };
}

export function useBossHealthBarSettings() {
  const [state, setState] = useState<BossHealthBarStorage>(load);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    saveSetting(STORAGE_KEY, state);
  }, [state]);

  const toggleEnabled = useCallback(() => {
    setState((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const toggleName = useCallback(() => {
    setState((prev) => ({ ...prev, showName: !prev.showName }));
  }, []);

  const toggleValues = useCallback(() => {
    setState((prev) => ({ ...prev, showValues: !prev.showValues }));
  }, []);

  const togglePercentage = useCallback(() => {
    setState((prev) => ({ ...prev, showPercentage: !prev.showPercentage }));
  }, []);

  const setPosition = useCallback((position: UIPosition | null) => {
    setState((prev) => ({ ...prev, position }));
  }, []);

  return {
    enabled: state.enabled,
    showName: state.showName,
    showValues: state.showValues,
    showPercentage: state.showPercentage,
    position: state.position,
    toggleEnabled,
    toggleName,
    toggleValues,
    togglePercentage,
    setPosition,
  } as const;
}
