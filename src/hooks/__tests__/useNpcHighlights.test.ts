// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NPC_HIGHLIGHT_COLOR, type NpcHighlightEntry } from '../../types/npcHighlight';
import { useNpcHighlights } from '../useNpcHighlights';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

function makeEntry(
  npcTypeId: number,
  mode: 'trueTile' | 'swTile' | 'clickbox',
  overrides?: Partial<NpcHighlightEntry>,
): NpcHighlightEntry {
  return { npcName: `NPC ${npcTypeId}`, npcTypeId, mode, color: '#00ffff', ...overrides };
}

describe('useNpcHighlights', () => {
  beforeEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
    storageMocks.loadSetting.mockReturnValue(null);
  });

  describe('loading and initialization', () => {
    it('returns defaults when loadSetting returns null', () => {
      const { result } = renderHook(() => useNpcHighlights());

      expect(result.current.highlights).toEqual([]);
      expect(result.current.showHighlights).toBe(true);
      expect(result.current.lastColor).toBe(DEFAULT_NPC_HIGHLIGHT_COLOR);
      expect(result.current.groupedByNpc.size).toBe(0);
    });

    it('loads valid highlights from storage', () => {
      const storedHighlights = [
        makeEntry(101, 'trueTile', { color: '#ff00ff' }),
        makeEntry(101, 'swTile', { color: '#112233' }),
      ];
      storageMocks.loadSetting.mockReturnValue({
        highlights: storedHighlights,
        showHighlights: false,
        lastColor: '#abcdef',
      });

      const { result } = renderHook(() => useNpcHighlights());

      expect(result.current.highlights).toEqual(storedHighlights);
      expect(result.current.showHighlights).toBe(false);
      expect(result.current.lastColor).toBe('#abcdef');
      expect(result.current.groupedByNpc.get(101)?.entries).toEqual(storedHighlights);
    });

    it('filters out invalid entries from storage', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [
          makeEntry(10, 'trueTile'),
          { npcName: 'Missing type', mode: 'swTile', color: '#123456' },
          { npcTypeId: 10, mode: 'swTile', color: '#123456' },
          { npcName: 'Invalid mode', npcTypeId: 10, mode: 'bad', color: '#123456' },
          { npcName: 'Missing mode', npcTypeId: 10, color: '#123456' },
        ],
      });

      const { result } = renderHook(() => useNpcHighlights());

      expect(result.current.highlights).toEqual([makeEntry(10, 'trueTile')]);
    });

    it('deduplicates entries by npcTypeId+mode and keeps the last one', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [
          makeEntry(55, 'clickbox', { color: '#111111' }),
          makeEntry(55, 'swTile', { color: '#222222' }),
          makeEntry(55, 'clickbox', { color: '#333333' }),
        ],
      });

      const { result } = renderHook(() => useNpcHighlights());

      expect(result.current.highlights).toEqual([
        makeEntry(55, 'clickbox', { color: '#333333' }),
        makeEntry(55, 'swTile', { color: '#222222' }),
      ]);
    });

    it('uses default color when stored entry does not provide color', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [{ npcName: 'No Color', npcTypeId: 77, mode: 'trueTile' }],
      });

      const { result } = renderHook(() => useNpcHighlights());

      expect(result.current.highlights).toEqual([
        {
          npcName: 'No Color',
          npcTypeId: 77,
          mode: 'trueTile',
          color: DEFAULT_NPC_HIGHLIGHT_COLOR,
        },
      ]);
    });
  });

  describe('actions', () => {
    it('toggleHighlight adds highlight with lastColor when missing', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [],
        lastColor: '#123abc',
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.toggleHighlight('Abyssal demon', 415, 'trueTile');
      });

      expect(result.current.highlights).toEqual([
        {
          npcName: 'Abyssal demon',
          npcTypeId: 415,
          mode: 'trueTile',
          color: '#123abc',
        },
      ]);
    });

    it('toggleHighlight removes highlight when existing', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(415, 'trueTile')],
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.toggleHighlight('NPC 415', 415, 'trueTile');
      });

      expect(result.current.highlights).toEqual([]);
    });

    it('removeHighlight removes only matching npcTypeId+mode', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(33, 'trueTile'), makeEntry(33, 'swTile'), makeEntry(44, 'trueTile')],
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.removeHighlight(33, 'swTile');
      });

      expect(result.current.highlights).toEqual([makeEntry(33, 'trueTile'), makeEntry(44, 'trueTile')]);
    });

    it('removeHighlight does nothing when combination does not exist', () => {
      const initial = [makeEntry(33, 'trueTile')];
      storageMocks.loadSetting.mockReturnValue({ highlights: initial });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.removeHighlight(33, 'swTile');
      });

      expect(result.current.highlights).toEqual(initial);
    });

    it('removeAllForNpc removes every mode for one npc and keeps others', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(10, 'trueTile'), makeEntry(10, 'swTile'), makeEntry(11, 'clickbox')],
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.removeAllForNpc(10);
      });

      expect(result.current.highlights).toEqual([makeEntry(11, 'clickbox')]);
    });

    it('setHighlightColor updates existing highlight and lastColor', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(20, 'swTile', { color: '#aaaaaa' })],
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.setHighlightColor('NPC 20', 20, 'swTile', '#fedcba');
      });

      expect(result.current.highlights).toEqual([makeEntry(20, 'swTile', { color: '#fedcba' })]);
      expect(result.current.lastColor).toBe('#fedcba');
    });

    it('setHighlightColor adds missing highlight and updates lastColor', () => {
      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.setHighlightColor('Kraken', 496, 'clickbox', '#ff8800');
      });

      expect(result.current.highlights).toEqual([
        {
          npcName: 'Kraken',
          npcTypeId: 496,
          mode: 'clickbox',
          color: '#ff8800',
        },
      ]);
      expect(result.current.lastColor).toBe('#ff8800');
    });

    it('updateColor changes existing highlight color and updates lastColor', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(60, 'trueTile', { color: '#101010' })],
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.updateColor(60, 'trueTile', '#202020');
      });

      expect(result.current.highlights).toEqual([makeEntry(60, 'trueTile', { color: '#202020' })]);
      expect(result.current.lastColor).toBe('#202020');
    });

    it('setShowHighlights toggles the visibility flag', () => {
      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.setShowHighlights(false);
      });

      expect(result.current.showHighlights).toBe(false);
    });

    it('seedBossDefault adds a true-tile highlight for a boss once', () => {
      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.seedBossDefault(14176, 'Yama');
      });

      expect(result.current.highlights).toEqual([
        { npcName: 'Yama', npcTypeId: 14176, mode: 'trueTile', color: DEFAULT_NPC_HIGHLIGHT_COLOR },
      ]);

      act(() => {
        result.current.seedBossDefault(14176, 'Yama');
      });

      expect(result.current.highlights).toHaveLength(1);
    });

    it('seedBossDefault does not re-add a boss the user has removed', () => {
      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.seedBossDefault(14176, 'Yama');
      });
      act(() => {
        result.current.removeHighlight(14176, 'trueTile');
      });
      act(() => {
        result.current.seedBossDefault(14176, 'Yama');
      });

      expect(result.current.highlights).toEqual([]);
    });

    it('seedBossDefault does not overwrite an existing highlight for the boss', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(14176, 'trueTile', { color: '#123456' })],
      });
      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.seedBossDefault(14176, 'Yama');
      });

      expect(result.current.highlights).toEqual([makeEntry(14176, 'trueTile', { color: '#123456' })]);
    });

    it('clearAll removes all highlights', () => {
      storageMocks.loadSetting.mockReturnValue({
        highlights: [makeEntry(80, 'trueTile'), makeEntry(81, 'swTile')],
      });

      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.highlights).toEqual([]);
      expect(result.current.groupedByNpc.size).toBe(0);
    });
  });

  describe('persistence', () => {
    it('does not save on initial mount', () => {
      renderHook(() => useNpcHighlights());
      expect(storageMocks.saveSetting).not.toHaveBeenCalled();
    });

    it('saves after state changes', () => {
      const { result } = renderHook(() => useNpcHighlights());

      act(() => {
        result.current.toggleHighlight('NPC 90', 90, 'trueTile');
      });

      expect(storageMocks.saveSetting).toHaveBeenCalledTimes(1);
      expect(storageMocks.saveSetting).toHaveBeenCalledWith(
        'osrs-npc-highlights',
        expect.objectContaining({
          highlights: [
            {
              npcName: 'NPC 90',
              npcTypeId: 90,
              mode: 'trueTile',
              color: DEFAULT_NPC_HIGHLIGHT_COLOR,
            },
          ],
        }),
      );
    });
  });
});
