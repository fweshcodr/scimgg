import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSetting, saveSetting } from '../util/storage';
import { parseStoredPosition, type UIPosition } from './usePersistedSettings';

const STORAGE_KEY = 'osrs-xp-drops';

/** Speed bounds match the useful range of the RuneLite plugin's config. */
const MIN_SPEED = 10;
const MAX_SPEED = 200;

interface XpDropStorage {
  enabled: boolean;
  /** Append the attack's rolled damage as " (N)" — RuneLite "predicted hit". */
  showPredictedHit: boolean;
  /** One merged drop per attack (icons OR'd, amounts summed) vs one drop per skill. */
  grouped: boolean;
  showIcons: boolean;
  /** Upward drift speed in px/s (plugin default: 44). */
  speed: number;
  /**
   * Panel position; null = default slot left of the minimap/orb cluster.
   * Desktop layouts only: the Mobile layout draws this overlay at its native place
   * (osmHud) and never reads or writes it.
   */
  position: UIPosition | null;
}

export const XP_DROP_DEFAULTS: XpDropStorage = {
  enabled: true,
  showPredictedHit: true,
  grouped: true,
  showIcons: true,
  speed: 44,
  position: null,
};

function clampSpeed(speed: number): number {
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
}

function load(): XpDropStorage {
  const stored = loadSetting<Record<string, unknown>>(STORAGE_KEY);
  if (!stored) return XP_DROP_DEFAULTS;

  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : XP_DROP_DEFAULTS.enabled,
    showPredictedHit:
      typeof stored.showPredictedHit === 'boolean' ? stored.showPredictedHit : XP_DROP_DEFAULTS.showPredictedHit,
    grouped: typeof stored.grouped === 'boolean' ? stored.grouped : XP_DROP_DEFAULTS.grouped,
    showIcons: typeof stored.showIcons === 'boolean' ? stored.showIcons : XP_DROP_DEFAULTS.showIcons,
    speed: typeof stored.speed === 'number' ? clampSpeed(stored.speed) : XP_DROP_DEFAULTS.speed,
    // The one stored-position reader (usePersistedSettings).
    position: parseStoredPosition(stored.position) ?? XP_DROP_DEFAULTS.position,
  };
}

export function useXpDropSettings() {
  const [state, setState] = useState<XpDropStorage>(load);
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

  const togglePredictedHit = useCallback(() => {
    setState((prev) => ({ ...prev, showPredictedHit: !prev.showPredictedHit }));
  }, []);

  const toggleGrouped = useCallback(() => {
    setState((prev) => ({ ...prev, grouped: !prev.grouped }));
  }, []);

  const toggleIcons = useCallback(() => {
    setState((prev) => ({ ...prev, showIcons: !prev.showIcons }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed: clampSpeed(speed) }));
  }, []);

  const setPosition = useCallback((position: UIPosition | null) => {
    setState((prev) => ({ ...prev, position }));
  }, []);

  return {
    enabled: state.enabled,
    showPredictedHit: state.showPredictedHit,
    grouped: state.grouped,
    showIcons: state.showIcons,
    speed: state.speed,
    position: state.position,
    toggleEnabled,
    togglePredictedHit,
    toggleGrouped,
    toggleIcons,
    setSpeed,
    setPosition,
  } as const;
}
