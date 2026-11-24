import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSetting, saveSetting } from '../util/storage';

const STORAGE_KEY = 'osrs-inventory-tags';

interface InventoryTagStorage {
  tags: Record<string, string>;
  showTags: boolean;
  lastColor: string;
}

const DEFAULTS: InventoryTagStorage = {
  tags: {},
  showTags: true,
  lastColor: '#ff0000',
};

function load(): InventoryTagStorage {
  const stored = loadSetting<Record<string, unknown>>(STORAGE_KEY);
  if (!stored) return DEFAULTS;

  const tags: Record<string, string> = {};
  if (stored.tags && typeof stored.tags === 'object' && !Array.isArray(stored.tags)) {
    for (const [key, value] of Object.entries(stored.tags as Record<string, unknown>)) {
      if (typeof value === 'string') tags[key] = value;
    }
  }

  return {
    tags,
    showTags: typeof stored.showTags === 'boolean' ? stored.showTags : DEFAULTS.showTags,
    lastColor: typeof stored.lastColor === 'string' ? stored.lastColor : DEFAULTS.lastColor,
  };
}

export function useInventoryTags() {
  const [state, setState] = useState<InventoryTagStorage>(load);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    saveSetting(STORAGE_KEY, state);
  }, [state]);

  const setTag = useCallback((itemId: number, color: string) => {
    setState((prev) => ({
      ...prev,
      tags: {
        ...prev.tags,
        [itemId.toString()]: color,
      },
      lastColor: color,
    }));
  }, []);

  const removeTag = useCallback((itemId: number) => {
    setState((prev) => {
      const nextTags = { ...prev.tags };
      delete nextTags[itemId.toString()];
      return {
        ...prev,
        tags: nextTags,
      };
    });
  }, []);

  const getTag = useCallback((itemId: number): string | undefined => state.tags[itemId.toString()], [state.tags]);

  const clearAll = useCallback(() => {
    setState((prev) => ({ ...prev, tags: {} }));
  }, []);

  const toggleShowTags = useCallback(() => {
    setState((prev) => ({ ...prev, showTags: !prev.showTags }));
  }, []);

  return {
    tags: state.tags,
    showTags: state.showTags,
    lastColor: state.lastColor,
    setTag,
    removeTag,
    getTag,
    clearAll,
    toggleShowTags,
  } as const;
}
