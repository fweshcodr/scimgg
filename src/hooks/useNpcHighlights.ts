import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_HIGHLIGHT_MENU_ENTRIES,
  DEFAULT_NPC_HIGHLIGHT_COLOR,
  type NpcHighlightEntry,
  type NpcHighlightMode,
  npcHighlightKey,
} from '../types/npcHighlight';
import { loadSetting, saveSetting } from '../util/storage';

const STORAGE_KEY = 'osrs-npc-highlights';

interface NpcHighlightStorage {
  /** All highlight entries (global, not per-encounter) */
  highlights: NpcHighlightEntry[];
  showHighlights: boolean;
  lastColor: string;
  /** Whether a highlighted NPC's right-click entries and hover text take its color. */
  colorMenuEntries: boolean;
  /**
   * NPC type IDs whose default true-tile highlight has already been seeded on
   * first sight (bosses and minions both — see useSeedBossHighlights). Tracked so
   * untagging a seeded NPC persists: one the user dismissed is never re-seeded on
   * the next encounter entry. This is the persisted storage contract; its "Boss"
   * name is narrower than what it holds (minions too) and must NOT be renamed, or
   * every stored untag choice is lost.
   */
  seededBossDefaults: number[];
}

const DEFAULTS: NpcHighlightStorage = {
  highlights: [],
  showHighlights: true,
  lastColor: DEFAULT_NPC_HIGHLIGHT_COLOR,
  colorMenuEntries: DEFAULT_HIGHLIGHT_MENU_ENTRIES,
  seededBossDefaults: [],
};

function normalizeEntry(raw: Partial<NpcHighlightEntry>): NpcHighlightEntry | null {
  if (typeof raw.npcTypeId !== 'number') return null;
  if (typeof raw.npcName !== 'string') return null;
  if (typeof raw.mode !== 'string') return null;
  const validModes: NpcHighlightMode[] = ['trueTile', 'swTile', 'clickbox'];
  if (!validModes.includes(raw.mode as NpcHighlightMode)) return null;

  return {
    npcName: raw.npcName,
    npcTypeId: raw.npcTypeId,
    mode: raw.mode as NpcHighlightMode,
    color: typeof raw.color === 'string' ? raw.color : DEFAULT_NPC_HIGHLIGHT_COLOR,
  };
}

function dedupeEntries(entries: NpcHighlightEntry[]): NpcHighlightEntry[] {
  const byKey = new Map<string, NpcHighlightEntry>();
  for (const entry of entries) {
    byKey.set(npcHighlightKey(entry.npcTypeId, entry.mode), entry);
  }
  return [...byKey.values()];
}

function load(): NpcHighlightStorage {
  const stored = loadSetting<Record<string, unknown>>(STORAGE_KEY);
  if (!stored) return DEFAULTS;

  let highlights: NpcHighlightEntry[] = [];
  if (Array.isArray(stored.highlights)) {
    highlights = dedupeEntries(
      (stored.highlights as Partial<NpcHighlightEntry>[])
        .map(normalizeEntry)
        .filter((e): e is NpcHighlightEntry => e !== null),
    );
  }

  return {
    highlights,
    showHighlights: typeof stored.showHighlights === 'boolean' ? stored.showHighlights : DEFAULTS.showHighlights,
    lastColor: typeof stored.lastColor === 'string' ? stored.lastColor : DEFAULTS.lastColor,
    colorMenuEntries:
      typeof stored.colorMenuEntries === 'boolean' ? stored.colorMenuEntries : DEFAULTS.colorMenuEntries,
    seededBossDefaults: Array.isArray(stored.seededBossDefaults)
      ? (stored.seededBossDefaults as unknown[]).filter((id): id is number => typeof id === 'number')
      : DEFAULTS.seededBossDefaults,
  };
}

export function useNpcHighlights() {
  const [state, setState] = useState<NpcHighlightStorage>(load);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    saveSetting(STORAGE_KEY, state);
  }, [state]);

  const highlights = state.highlights;
  const showHighlights = state.showHighlights;
  const lastColor = state.lastColor;
  const colorMenuEntries = state.colorMenuEntries;

  const toggleHighlight = useCallback((npcName: string, npcTypeId: number, mode: NpcHighlightMode): void => {
    setState((prev) => {
      const key = npcHighlightKey(npcTypeId, mode);
      const existing = prev.highlights.find((h) => npcHighlightKey(h.npcTypeId, h.mode) === key);
      if (existing) {
        return {
          ...prev,
          highlights: prev.highlights.filter((h) => npcHighlightKey(h.npcTypeId, h.mode) !== key),
        };
      }
      return {
        ...prev,
        highlights: [...prev.highlights, { npcName, npcTypeId, mode, color: prev.lastColor }],
      };
    });
  }, []);

  const removeHighlight = useCallback((npcTypeId: number, mode: NpcHighlightMode) => {
    setState((prev) => ({
      ...prev,
      highlights: prev.highlights.filter((h) => !(h.npcTypeId === npcTypeId && h.mode === mode)),
    }));
  }, []);

  const removeAllForNpc = useCallback((npcTypeId: number) => {
    setState((prev) => ({
      ...prev,
      highlights: prev.highlights.filter((h) => h.npcTypeId !== npcTypeId),
    }));
  }, []);

  const updateColor = useCallback((npcTypeId: number, mode: NpcHighlightMode, color: string) => {
    setState((prev) => ({
      ...prev,
      highlights: prev.highlights.map((h) => (h.npcTypeId === npcTypeId && h.mode === mode ? { ...h, color } : h)),
      lastColor: color,
    }));
  }, []);

  const setHighlightColor = useCallback((npcName: string, npcTypeId: number, mode: NpcHighlightMode, color: string) => {
    setState((prev) => {
      const key = npcHighlightKey(npcTypeId, mode);
      const existing = prev.highlights.find((h) => npcHighlightKey(h.npcTypeId, h.mode) === key);
      let newHighlights = prev.highlights;
      if (existing) {
        newHighlights = prev.highlights.map((h) =>
          npcHighlightKey(h.npcTypeId, h.mode) === key ? { ...h, color } : h,
        );
      } else {
        newHighlights = [...prev.highlights, { npcName, npcTypeId, mode, color }];
      }
      return {
        ...prev,
        highlights: newHighlights,
        lastColor: color,
      };
    });
  }, []);

  const setShowHighlights = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showHighlights: show }));
  }, []);

  const setColorMenuEntries = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, colorMenuEntries: enabled }));
  }, []);

  /**
   * Seed the default true-tile highlight for an encounter combat NPC (boss or
   * minion) the first time it is seen, so it arrives pre-tagged. Idempotent: seeds
   * at most once per NPC type and never overwrites an existing highlight for that
   * NPC, so untagging one or giving it a custom color sticks rather than being
   * re-applied on the next entry.
   */
  const seedBossDefault = useCallback((npcTypeId: number, npcName: string) => {
    setState((prev) => {
      if (prev.seededBossDefaults.includes(npcTypeId)) return prev;
      const key = npcHighlightKey(npcTypeId, 'trueTile');
      const alreadyHighlighted = prev.highlights.some((h) => npcHighlightKey(h.npcTypeId, h.mode) === key);
      const entry: NpcHighlightEntry = {
        npcName,
        npcTypeId,
        mode: 'trueTile',
        color: DEFAULT_NPC_HIGHLIGHT_COLOR,
      };
      return {
        ...prev,
        seededBossDefaults: [...prev.seededBossDefaults, npcTypeId],
        highlights: alreadyHighlighted ? prev.highlights : [...prev.highlights, entry],
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => ({ ...prev, highlights: [] }));
  }, []);

  const groupedByNpc = useMemo(() => {
    const groups = new Map<number, { npcName: string; entries: NpcHighlightEntry[] }>();
    for (const h of highlights) {
      const group = groups.get(h.npcTypeId) ?? { npcName: h.npcName, entries: [] };
      group.entries.push(h);
      groups.set(h.npcTypeId, group);
    }
    return groups;
  }, [highlights]);

  return {
    highlights,
    showHighlights,
    colorMenuEntries,
    lastColor,
    groupedByNpc,
    toggleHighlight,
    removeHighlight,
    removeAllForNpc,
    updateColor,
    setHighlightColor,
    setShowHighlights,
    setColorMenuEntries,
    seedBossDefault,
    clearAll,
  } as const;
}
