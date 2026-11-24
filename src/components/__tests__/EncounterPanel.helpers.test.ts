import { describe, expect, it } from 'vitest';
import type { MechanicsToggleInfo } from '../../core/encounters/types';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { createEmptyCombatSupplies, type EncounterLoadout } from '../../types/encounterLoadout';
import type { EncounterPreset, PresetRequirements } from '../../types/player';
import { createDefaultStats, createStatsFromBaseLevels } from '../../types/playerState';
import {
  type AutoPresetContext,
  CUSTOM_PRESET_KEY,
  computePresetGating,
  fallbackLoadoutMessage,
  formatUnmetRequirements,
  isPresetBlocked,
  noCompatiblePresetsMessage,
  type PresetEntry,
  presetOptionLabel,
  presetSwitchedMessage,
  resolveAutoPresetKey,
  resolveSelectedPresetKey,
  selectPlayerToggles,
  selectSetupToggles,
} from '../EncounterPanel.helpers';

describe('resolveSelectedPresetKey', () => {
  const yamaEntries = Object.entries(EQUIPMENT_PRESETS.yama_p3);

  /** The complete loadout a preset ships: matching is complete-loadout identity. */
  function loadoutOf(preset: EncounterPreset, overrides?: Partial<EncounterLoadout>): EncounterLoadout {
    return {
      equipment: preset.equipment,
      inventory: preset.inventory,
      supplies: preset.supplies ?? createEmptyCombatSupplies(),
      ...overrides,
    };
  }

  it('returns the matching preset key when the complete loadout matches', () => {
    const learner = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    expect(resolveSelectedPresetKey(yamaEntries, loadoutOf(learner))).toBe('learner-mage');
  });

  it('returns the naked preset key for an empty loadout', () => {
    const naked = EQUIPMENT_PRESETS.yama_p3.naked;
    expect(resolveSelectedPresetKey(yamaEntries, loadoutOf(naked))).toBe('naked');
  });

  it('returns CUSTOM when equipment diverges from every preset (in-fight gear swap)', () => {
    const learner = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    // Swapped to a Saradomin godsword.
    const diverged = loadoutOf(learner, { equipment: { ...learner.equipment, weapon: 11806 } });
    expect(resolveSelectedPresetKey(yamaEntries, diverged)).toBe(CUSTOM_PRESET_KEY);
  });

  it('returns CUSTOM when inventory diverges even if equipment still matches a preset', () => {
    const learner = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    const diverged = loadoutOf(learner, {
      inventory: learner.inventory.map((slot, i) => (i === 0 ? { id: 28810 } : slot)),
    });
    expect(resolveSelectedPresetKey(yamaEntries, diverged)).toBe(CUSTOM_PRESET_KEY);
  });

  it('returns CUSTOM when supplies diverge even if gear and inventory still match', () => {
    const learner = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    const diverged = loadoutOf(learner, { supplies: createEmptyCombatSupplies() });
    expect(resolveSelectedPresetKey(yamaEntries, diverged)).toBe(CUSTOM_PRESET_KEY);
  });

  it('treats a preset that ships no supplies as empty supplies, not a wildcard', () => {
    const naked = EQUIPMENT_PRESETS.yama_p3.naked;
    const stocked = loadoutOf(naked, {
      supplies: { ...createEmptyCombatSupplies(), equippedAmmo: { id: 11212 } },
    });
    expect(resolveSelectedPresetKey(yamaEntries, stocked)).toBe(CUSTOM_PRESET_KEY);
  });

  it('returns CUSTOM when there are no presets to match against', () => {
    const learner = EQUIPMENT_PRESETS.yama_p3['learner-mage'];
    expect(resolveSelectedPresetKey([], loadoutOf(learner))).toBe(CUSTOM_PRESET_KEY);
  });

  describe('rune pouch contents', () => {
    const maxMage = EQUIPMENT_PRESETS.yama_p3['max-mage'];
    const shippedPouch = maxMage.supplies?.runePouch ?? null;
    const naked = EQUIPMENT_PRESETS.yama_p3.naked;

    it('carries a shipped set that packs its own pouch, so the fixture below can drift from it', () => {
      expect(shippedPouch?.kind).toBe('divine');
      expect(shippedPouch?.slots[0]).not.toBeNull();
    });

    it('keeps the set selected while the pouch it ships with is intact', () => {
      expect(resolveSelectedPresetKey(yamaEntries, loadoutOf(maxMage))).toBe('max-mage');
    });

    it('reads a drifted pouch as CUSTOM', () => {
      const drifted = { kind: 'divine', slots: [null, null, null, null] } as const;
      const loadout = loadoutOf(maxMage, {
        supplies: { ...(maxMage.supplies ?? createEmptyCombatSupplies()), runePouch: drifted },
      });
      expect(resolveSelectedPresetKey(yamaEntries, loadout)).toBe(CUSTOM_PRESET_KEY);
    });

    it('treats a set that ships no supplies as one that packs no pouch', () => {
      expect(resolveSelectedPresetKey(yamaEntries, loadoutOf(naked))).toBe('naked');
      const loadout = loadoutOf(naked, {
        supplies: {
          ...createEmptyCombatSupplies(),
          runePouch: { kind: 'standard', slots: [null, null, null] },
        },
      });
      expect(resolveSelectedPresetKey(yamaEntries, loadout)).toBe(CUSTOM_PRESET_KEY);
    });
  });
});

describe('selectSetupToggles', () => {
  it("splices the global Auto-Prepot ahead of the encounter's own marked toggles", () => {
    const encounterToggles: MechanicsToggleInfo[] = [
      { key: 'zukAttacks', label: 'Zuk Attacks' },
      { key: 'zukSetTimer', label: 'Set Timer', group: 'aid', setup: true },
    ];

    expect(selectSetupToggles(encounterToggles).map((toggle) => toggle.key)).toEqual(['autoPrepot', 'zukSetTimer']);
  });

  it('leaves ordinary mechanics, unmarked aids and the infinite cheats to the in-fight panel', () => {
    const encounterToggles: MechanicsToggleInfo[] = [
      { key: 'fireballs', label: 'Fireballs' },
      { key: 'zukShieldSafeTiles', label: 'Shield Safe Tiles', group: 'aid' },
      { key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' },
      { key: 'infiniteSpecialAttack', label: 'Infinite Special Attack', group: 'aid' },
    ];

    expect(selectSetupToggles(encounterToggles).map((toggle) => toggle.key)).toEqual(['autoPrepot']);
  });

  it('keeps marked pickers in encounter order', () => {
    const encounterToggles: MechanicsToggleInfo[] = [
      { key: 'duoSide', label: 'Practice As', setup: true, choices: [{ value: 'player1', label: 'Player 1' }] },
      { key: 'voidFlares', label: 'Void Flares' },
      {
        key: 'fireballStart',
        label: 'Fireball Orientation',
        setup: true,
        choices: [{ value: 'random', label: 'Random' }],
      },
    ];

    expect(selectSetupToggles(encounterToggles).map((toggle) => toggle.key)).toEqual([
      'autoPrepot',
      'duoSide',
      'fireballStart',
    ]);
  });

  it('refuses the rail to a player toggle even when marked, and still files it beside the stats', () => {
    const encounterToggles: MechanicsToggleInfo[] = [
      { key: 'accountThing', label: 'Account Thing', group: 'player', setup: true },
    ];

    expect(selectSetupToggles(encounterToggles).map((toggle) => toggle.key)).toEqual(['autoPrepot']);
    expect(selectPlayerToggles(encounterToggles).map((toggle) => toggle.key)).toContain('accountThing');
  });
});

describe('preset gating helpers', () => {
  const yamaEntries = Object.entries(EQUIPMENT_PRESETS.yama_p3);
  const maxMage = EQUIPMENT_PRESETS.yama_p3['max-mage'];

  it('formatUnmetRequirements renders stat-ordered levels', () => {
    expect(formatUnmetRequirements({ attack: 75, magic: 85 })).toBe('75 Attack, 85 Magic');
    expect(formatUnmetRequirements({})).toBe('');
  });

  it('isPresetBlocked is true only when a requirement is unmet', () => {
    expect(isPresetBlocked(undefined)).toBe(false);
    expect(isPresetBlocked({})).toBe(false);
    expect(isPresetBlocked({ magic: 85 })).toBe(true);
  });

  it('computePresetGating flags the selected preset as incompatible below its requirements', () => {
    const gating = computePresetGating(
      yamaEntries,
      createStatsFromBaseLevels({
        attack: 70,
        strength: 70,
        defence: 70,
        ranged: 70,
        magic: 70,
        prayer: 70,
        hitpoints: 70,
        agility: 99,
      }),
      'max-mage',
    );

    expect(gating.selectedIncompatible).toBe(true);
    expect(isPresetBlocked(gating.unmetByKey.get('max-mage'))).toBe(true);
  });

  it('computePresetGating reports compatibility at max stats', () => {
    const gating = computePresetGating(yamaEntries, createDefaultStats(), 'max-mage');
    expect(gating.selectedIncompatible).toBe(false);
    expect(gating.selectedUnmet).toEqual({});
  });

  it('presetOptionLabel annotates only blocked options', () => {
    expect(presetOptionLabel(maxMage, {})).toBe('Max Mage');
    expect(presetOptionLabel(maxMage, { magic: 85 })).toBe('Max Mage (requires 85 Magic)');
  });

  it('presetSwitchedMessage leads into the unmet requirement chips', () => {
    expect(presetSwitchedMessage('Max Mage', 'No Equipment')).toBe('Switched to No Equipment. Max Mage needs');
  });

  it('noCompatiblePresetsMessage states that nothing matches the configured levels', () => {
    expect(noCompatiblePresetsMessage()).toBe('No equipment sets match your current combat levels.');
  });
});

describe('resolveAutoPresetKey', () => {
  const yamaEntries = Object.entries(EQUIPMENT_PRESETS.yama_p3) as PresetEntry[];
  const realEntries = yamaEntries.filter(([, preset]) => !preset.isFallback);
  const fallbackEntry = yamaEntries.find(([, preset]) => preset.isFallback);

  function gatingMap(blocked: Record<string, PresetRequirements>): Map<string, PresetRequirements> {
    const map = new Map<string, PresetRequirements>();
    for (const [key] of yamaEntries) {
      map.set(key, blocked[key] ?? {});
    }
    return map;
  }

  function ctx(
    selectedPresetKey: string,
    blocked: Record<string, PresetRequirements>,
    overrides?: Partial<AutoPresetContext>,
  ): AutoPresetContext {
    return {
      realPresetEntries: realEntries,
      fallbackEntry,
      unmetByKey: gatingMap(blocked),
      selectedPresetKey,
      selectedPreset: EQUIPMENT_PRESETS.yama_p3[selectedPresetKey],
      ...overrides,
    };
  }

  it('leaves a compatible real selection untouched', () => {
    expect(resolveAutoPresetKey(ctx('max-mage', {}))).toBeNull();
  });

  it('switches an incompatible real preset to the first compatible real preset', () => {
    const target = resolveAutoPresetKey(ctx('melee', { melee: { magic: 80 } }));
    expect(target).toBe('max-mage');
  });

  it('picks the first compatible real preset in declaration order when several qualify', () => {
    // learner-mage blocked; max-mage and melee both compatible -> first declared wins.
    const target = resolveAutoPresetKey(ctx('learner-mage', { 'learner-mage': { magic: 75 } }));
    expect(target).toBe('max-mage');
  });

  it('falls back to No Equipment only when every real preset is blocked', () => {
    const allBlocked: Record<string, PresetRequirements> = {
      'max-mage': { magic: 85 },
      melee: { strength: 75 },
      hybrid: { magic: 85 },
      'learner-mage': { magic: 75 },
    };
    const target = resolveAutoPresetKey(ctx('melee', allBlocked));
    expect(target).toBe('naked');
  });

  it('recovers from the fallback to the first compatible real preset when stats rise', () => {
    const target = resolveAutoPresetKey(ctx('naked', { melee: { strength: 75 } }));
    expect(target).toBe('max-mage');
  });

  it('stays on the fallback while every real preset is still blocked', () => {
    const allBlocked: Record<string, PresetRequirements> = {
      'max-mage': { magic: 85 },
      melee: { strength: 75 },
      hybrid: { magic: 85 },
      'learner-mage': { magic: 75 },
    };
    expect(resolveAutoPresetKey(ctx('naked', allBlocked))).toBeNull();
  });

  it('never touches a custom (non-preset) loadout', () => {
    expect(resolveAutoPresetKey(ctx(CUSTOM_PRESET_KEY, { 'max-mage': { magic: 85 } }))).toBeNull();
  });

  it('leaves a lobby-only fallback group alone (no real presets to recover to)', () => {
    const lobbyEntries = Object.entries(EQUIPMENT_PRESETS.lobby) as PresetEntry[];
    const lobbyFallback = lobbyEntries.find(([, preset]) => preset.isFallback);
    const context: AutoPresetContext = {
      realPresetEntries: [],
      fallbackEntry: lobbyFallback,
      unmetByKey: new Map(),
      selectedPresetKey: 'naked',
      selectedPreset: EQUIPMENT_PRESETS.lobby.naked,
    };
    expect(resolveAutoPresetKey(context)).toBeNull();
  });

  it('fallbackLoadoutMessage explains the temporary No Equipment state', () => {
    expect(fallbackLoadoutMessage()).toMatch(/No Equipment/);
  });
});
