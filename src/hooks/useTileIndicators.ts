import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_TILE_INDICATOR_CONFIG,
  type TileIndicatorConfig,
  type TileIndicatorStyle,
} from '../types/tileIndicators';
import { loadSetting, saveSetting } from '../util/storage';

const STORAGE_KEY = 'osrs-tile-indicators';

interface TileIndicatorStorage {
  enabled: boolean;
  config: TileIndicatorConfig;
}

const DEFAULTS: TileIndicatorStorage = {
  enabled: true,
  config: DEFAULT_TILE_INDICATOR_CONFIG,
};

type TileType = keyof TileIndicatorConfig;

function load(): TileIndicatorStorage {
  const stored = loadSetting<Partial<TileIndicatorStorage>>(STORAGE_KEY);
  if (!stored) return { ...DEFAULTS };

  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULTS.enabled,
    config: {
      trueTile: mergeStyle(stored.config?.trueTile, DEFAULTS.config.trueTile),
      hoverTile: mergeStyle(stored.config?.hoverTile, DEFAULTS.config.hoverTile),
      destinationTile: mergeStyle(stored.config?.destinationTile, DEFAULTS.config.destinationTile),
    },
  };
}

function mergeStyle(
  partial: Partial<TileIndicatorStyle> | undefined,
  defaults: TileIndicatorStyle,
): TileIndicatorStyle {
  if (!partial) return { ...defaults };
  return {
    enabled: typeof partial.enabled === 'boolean' ? partial.enabled : defaults.enabled,
    color: typeof partial.color === 'string' ? partial.color : defaults.color,
    opacity: typeof partial.opacity === 'number' ? clamp01(partial.opacity) : defaults.opacity,
    width: typeof partial.width === 'number' ? Math.max(0.5, Math.min(10, partial.width)) : defaults.width,
    cornerOnly: typeof partial.cornerOnly === 'boolean' ? partial.cornerOnly : defaults.cornerOnly,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function useTileIndicators() {
  const [state, setState] = useState<TileIndicatorStorage>(load);
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

  const updateTileStyle = useCallback(
    <K extends keyof TileIndicatorStyle>(tileType: TileType, key: K, value: TileIndicatorStyle[K]) => {
      setState((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          [tileType]: {
            ...prev.config[tileType],
            [key]: value,
          },
        },
      }));
    },
    [],
  );

  const effectiveConfig = useMemo<TileIndicatorConfig>(() => {
    if (state.enabled) return state.config;
    return {
      trueTile: { ...state.config.trueTile, enabled: false },
      hoverTile: { ...state.config.hoverTile, enabled: false },
      destinationTile: { ...state.config.destinationTile, enabled: false },
    };
  }, [state.enabled, state.config]);

  return {
    enabled: state.enabled,
    config: effectiveConfig,
    toggleEnabled,
    updateTileStyle,
  } as const;
}
