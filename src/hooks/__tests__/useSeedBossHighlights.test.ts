// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NpcTypeLoader } from '../../rs/config/npctype/NpcTypeLoader';
import type { NpcSnapshot } from '../../types/simulation';
import { useSeedBossHighlights } from '../useSeedBossHighlights';

function npc(overrides: Partial<NpcSnapshot> & Pick<NpcSnapshot, 'npcTypeId' | 'role'>): NpcSnapshot {
  return {
    id: `npc-${overrides.npcTypeId}`,
    archetypeId: 'test-archetype',
    alive: true,
    position: [0, 0],
    previousPosition: [0, 0],
    facingAngle: 0,
    size: 5,
    hp: 100,
    maxHp: 100,
    ...overrides,
  };
}

function makeLoader(name: string | undefined, opts?: { throws?: boolean }): NpcTypeLoader {
  return {
    load: vi.fn((_id: number) => {
      if (opts?.throws) throw new Error('type not loaded yet');
      return { name };
    }),
  } as unknown as NpcTypeLoader;
}

describe('useSeedBossHighlights', () => {
  it('seeds a boss-role NPC with its resolved name', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'yama_p3',
        npcs: [npc({ npcTypeId: 14176, role: 'boss' })],
        npcTypeLoader: makeLoader('Yama'),
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).toHaveBeenCalledTimes(1);
    expect(seedBossDefault).toHaveBeenCalledWith(14176, 'Yama');
  });

  it('seeds minion-role combat NPCs alongside bosses', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'yama_p3',
        npcs: [npc({ npcTypeId: 14176, role: 'boss' }), npc({ npcTypeId: 14179, role: 'minion' })],
        npcTypeLoader: makeLoader('Void flare'),
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).toHaveBeenCalledWith(14176, 'Void flare');
    expect(seedBossDefault).toHaveBeenCalledWith(14179, 'Void flare');
  });

  it("ignores npc-role scenery such as Zuk's glyph shield", () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'zuk',
        npcs: [npc({ npcTypeId: 7707, role: 'npc' }), npc({ npcTypeId: 7706, role: 'boss' })],
        npcTypeLoader: makeLoader('Zuk'),
        seedBossDefault,
      }),
    );

    // The glyph shield (role 'npc') is scenery; only the boss is seeded.
    expect(seedBossDefault).toHaveBeenCalledTimes(1);
    expect(seedBossDefault).toHaveBeenCalledWith(7706, 'Zuk');
  });

  it('does not seed in the lobby', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'lobby',
        npcs: [npc({ npcTypeId: 14176, role: 'boss' })],
        npcTypeLoader: makeLoader('Yama'),
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).not.toHaveBeenCalled();
  });

  it('does not seed when the NPC type loader is unavailable', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'yama_p3',
        npcs: [npc({ npcTypeId: 14176, role: 'boss' })],
        npcTypeLoader: undefined,
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).not.toHaveBeenCalled();
  });

  it('falls back to a generic name when the type cannot be resolved', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'yama_p3',
        npcs: [npc({ npcTypeId: 14176, role: 'boss' })],
        npcTypeLoader: makeLoader(undefined, { throws: true }),
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).toHaveBeenCalledWith(14176, 'NPC 14176');
  });

  it('seeds each distinct boss type once', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'yama_p3',
        npcs: [npc({ npcTypeId: 14176, role: 'boss' }), npc({ npcTypeId: 14176, role: 'boss', id: 'dup' })],
        npcTypeLoader: makeLoader('Yama'),
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).toHaveBeenCalledTimes(1);
    expect(seedBossDefault).toHaveBeenCalledWith(14176, 'Yama');
  });

  it('seeds a minion that arrives after the encounter starts', () => {
    const seedBossDefault = vi.fn();
    const loader = {
      load: vi.fn((id: number) => ({ name: id === 14179 ? 'Void flare' : 'Yama' })),
    } as unknown as NpcTypeLoader;
    const { rerender } = renderHook(
      ({ npcs }: { npcs: NpcSnapshot[] }) =>
        useSeedBossHighlights({ encounterKind: 'yama_p3', npcs, npcTypeLoader: loader, seedBossDefault }),
      { initialProps: { npcs: [npc({ npcTypeId: 14176, role: 'boss' })] } },
    );

    expect(seedBossDefault).toHaveBeenCalledWith(14176, 'Yama');
    expect(seedBossDefault).not.toHaveBeenCalledWith(14179, expect.anything());

    // A void flare spawns mid-fight; the changed type-id set re-fires seeding.
    rerender({ npcs: [npc({ npcTypeId: 14176, role: 'boss' }), npc({ npcTypeId: 14179, role: 'minion' })] });
    expect(seedBossDefault).toHaveBeenCalledWith(14179, 'Void flare');
  });

  it('seeds each distinct minion type once despite multiple instances', () => {
    const seedBossDefault = vi.fn();
    renderHook(() =>
      useSeedBossHighlights({
        encounterKind: 'zuk',
        npcs: [
          npc({ npcTypeId: 7704, role: 'minion', id: 'jad-a' }),
          npc({ npcTypeId: 7704, role: 'minion', id: 'jad-b' }),
        ],
        npcTypeLoader: makeLoader('Jad'),
        seedBossDefault,
      }),
    );

    expect(seedBossDefault).toHaveBeenCalledTimes(1);
    expect(seedBossDefault).toHaveBeenCalledWith(7704, 'Jad');
  });
});
