// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLUGIN_KEYBINDS } from '../../data/pluginKeybinds';
import { deleteSetting, loadSetting, saveSetting } from '../../util/storage';
import * as keybindStore from '../keybindStore';

afterEach(() => {
  vi.restoreAllMocks();
  deleteSetting(keybindStore.UNIFIED_KEYBINDS_KEY);
});

describe('keybindStore', () => {
  it('strips unknown local plugin and UI keys, preserves supported custom bindings and persists the result', () => {
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      gamePanel: { prayer: 'p' },
      camera: { orbitRotateLeft: 'j' },
      ui: { closeOverlay: 'q', unknownNumber: '1', unknownEmpty: '', unknownMixedCase: 'ctrl+h' },
      plugins: {
        unknownCustom: 'Alt+J',
        unknownEmpty: '',
        unknownMixedCase: 'ctrl+shift+z',
        zukSetTimerAdvance: 'Alt+H',
      },
    });
    const store = keybindStore.loadUnifiedKeybindStore();
    expect(store.ui).toEqual({ closeOverlay: 'q' });
    expect(store.plugins).toEqual({ ...DEFAULT_PLUGIN_KEYBINDS, zukSetTimerAdvance: 'Alt+H' });
    expect(store.gamePanel.prayer).toBe('p');
    expect(store.camera.orbitRotateLeft).toBe('j');
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(store);
    expect(keybindStore.loadUnifiedKeybindStore()).toEqual(store);
  });

  it('rewrites a fully populated store when unknown keys are the only differences', () => {
    const current = keybindStore.loadUnifiedKeybindStore();
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      ...current,
      plugins: { ...current.plugins, unknownEmpty: '', unknownMixedCase: 'ctrl+shift+z' },
      ui: { ...current.ui, unknownNumber: '1', unknownCustom: 'Alt+H' },
    });
    expect(keybindStore.loadUnifiedKeybindStore()).toEqual(current);
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(current);
  });

  const advance: keybindStore.KeybindingTarget = { domain: 'plugins', action: 'zukSetTimerAdvance' };
  const closeOverlay: keybindStore.KeybindingTarget = { domain: 'ui', action: 'closeOverlay' };

  it.each([
    null,
    42,
    { key: 'F3' },
    false,
  ])('sanitizes unchecked unified JSON binding value %j without losing valid neighbors', (value) => {
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      gamePanel: { inventory: value, prayer: 'q' },
      camera: { orbitRotateLeft: value, freeformDown: 'Shift' },
      plugins: { zukSetTimerAdvance: value, zukSetTimerReveal: 'Ctrl+J' },
      ui: { closeOverlay: value },
    });
    const store = keybindStore.loadUnifiedKeybindStore();
    expect(store).toMatchObject({
      gamePanel: { inventory: '', prayer: 'q' },
      camera: { orbitRotateLeft: '', freeformDown: 'Shift' },
      plugins: { zukSetTimerAdvance: '', zukSetTimerReveal: 'Ctrl+J' },
      ui: { closeOverlay: '' },
    });
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(store);
  });

  it.each([
    { domain: 'gamePanel', action: 'prayer' },
    { domain: 'ui', action: 'closeOverlay' },
    { domain: 'camera', action: 'orbitRotateLeft' },
    { domain: 'plugins', action: 'zukSetTimerAdvance' },
  ] as const)('rejects unsupported single-key saves in $domain without collateral reassignment', (target) => {
    const before = keybindStore.loadUnifiedKeybindStore();
    for (const value of ['Alt', 'Control', 'Ctrl', 'Meta', 'Command', 'AltGraph', 'Dead', 'Unidentified']) {
      const result = keybindStore.saveKeybindingChanges(
        [
          { target, value },
          { target: { domain: 'gamePanel', action: 'equipment' }, value: 'F5' },
        ],
        true,
      );
      expect(result.saved).toBe(false);
      expect(result.unbound).toEqual([]);
      expect(result.conflicts).toContainEqual({ binding: null, label: 'Invalid shortcut', value });
      expect(result.store).toEqual(before);
      expect(keybindStore.loadUnifiedKeybindStore()).toEqual(before);
    }
  });

  it.each([
    'Alt',
    'Control',
    'Ctrl',
    'Meta',
    'Command',
    'AltGraph',
    'Dead',
    'Unidentified',
  ])('unbinds persisted unsupported key %s across every domain without changing valid bindings', (value) => {
    const before = keybindStore.loadUnifiedKeybindStore();
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      ...before,
      gamePanel: { ...before.gamePanel, prayer: value },
      camera: { ...before.camera, orbitRotateLeft: value, toggleFreeform: value },
      plugins: { ...before.plugins, zukSetTimerAdvance: value },
      ui: { closeOverlay: value },
    });
    const normalized = keybindStore.loadUnifiedKeybindStore();
    expect(normalized).toEqual({
      ...before,
      gamePanel: { ...before.gamePanel, prayer: '' },
      camera: { ...before.camera, orbitRotateLeft: '', toggleFreeform: '' },
      plugins: { ...before.plugins, zukSetTimerAdvance: '' },
      ui: { ...before.ui, closeOverlay: '' },
    });
    expect(normalized.camera.freeformDown).toBe('Shift');
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(normalized);
  });

  it.each([
    { target: { domain: 'gamePanel', action: 'prayer' }, value: 'Tab' },
    { target: { domain: 'ui', action: 'closeOverlay' }, value: 'Tab' },
    { target: { domain: 'camera', action: 'orbitRotateLeft' }, value: 'Tab' },
    { target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'Tab' },
    { target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value: 'Shift+Tab' },
  ] as const)('saves and reloads $value for $target.domain', ({ target, value }) => {
    const result = keybindStore.saveKeybindingChanges([{ target, value }], true);
    expect(result.saved).toBe(true);
    expect(keybindStore.getKeybindingValue(result.store, target)).toBe(value);
    const reloaded = keybindStore.loadUnifiedKeybindStore();
    expect(keybindStore.getKeybindingValue(reloaded, target)).toBe(value);
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(reloaded);
  });

  it('keeps persisted Tab bindings as valid in every domain', () => {
    const before = keybindStore.loadUnifiedKeybindStore();
    const persisted = {
      ...before,
      gamePanel: { ...before.gamePanel, prayer: 'Tab' },
      camera: { ...before.camera, toggleFreeform: 'Tab' },
      plugins: { ...before.plugins, zukSetTimerAdvance: 'Shift+Tab' },
      ui: { closeOverlay: 'Tab' },
    };
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, persisted);
    expect(keybindStore.loadUnifiedKeybindStore()).toEqual(persisted);
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(persisted);
  });

  it.each([
    ['Ctrl+Tab', 'Browser shortcut'],
    ['Meta+Tab', 'Browser shortcut'],
    ['Alt+Tab', 'Browser or system shortcut'],
  ])('still rejects the reserved plugin chord %s', (value, label) => {
    const before = keybindStore.loadUnifiedKeybindStore();
    const result = keybindStore.saveKeybindingChanges(
      [{ target: { domain: 'plugins', action: 'zukSetTimerAdvance' }, value }],
      true,
    );
    expect(result.saved).toBe(false);
    expect(result.conflicts).toContainEqual({ binding: null, label, value });
    expect(keybindStore.loadUnifiedKeybindStore()).toEqual(before);
  });

  it('defaults Inventory to F3 and reserves default Escape for dismissal', () => {
    expect(keybindStore.loadUnifiedKeybindStore()).toMatchObject({
      gamePanel: { inventory: 'F3' },
      ui: { closeOverlay: 'Escape' },
    });
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, { gamePanel: { inventory: 'I' } });
    expect(keybindStore.loadUnifiedKeybindStore()).toMatchObject({
      gamePanel: { inventory: 'I' },
      ui: { closeOverlay: 'Escape' },
    });
  });

  it.each(['F8', ''])('preserves a custom Inventory Escape with dismissal mapped to %j', (closeOverlay) => {
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      gamePanel: { inventory: 'Escape', prayer: 'F3' },
      ui: { closeOverlay },
    });
    expect(keybindStore.loadUnifiedKeybindStore()).toMatchObject({
      gamePanel: { inventory: 'Escape', prayer: 'F3' },
      ui: { closeOverlay },
    });
  });

  it.each(['q', ''])('persists the overlay close mapping %j, including an explicit unbind', (value) => {
    expect(keybindStore.saveKeybindingChanges([{ target: closeOverlay, value }], true).saved).toBe(true);
    expect(keybindStore.loadUnifiedKeybindStore().ui.closeOverlay).toBe(value);
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toMatchObject({ ui: { closeOverlay: value } });
  });

  it('uses normal reassignment to free Escape for a plugin, leaving Inventory on F3', () => {
    const blocked = keybindStore.saveKeybindingChanges([{ target: advance, value: 'Escape' }]);
    expect(blocked.saved).toBe(false);
    expect(blocked.conflicts.map(({ binding }) => binding?.domain)).toEqual(['ui']);
    const reassigned = keybindStore.saveKeybindingChanges([{ target: advance, value: 'Escape' }], true);
    expect(reassigned.saved).toBe(true);
    expect(reassigned.store).toMatchObject({
      gamePanel: { inventory: 'F3' },
      ui: { closeOverlay: '' },
      plugins: { zukSetTimerAdvance: 'Escape' },
    });
    expect(keybindStore.getEffectivePluginKeybinds(keybindStore.loadUnifiedKeybindStore()).zukSetTimerAdvance).toBe(
      'Escape',
    );
  });

  it.each([
    { domain: 'camera', action: 'orbitRotateLeft' },
    { domain: 'gamePanel', action: 'prayer' },
  ] as const)('frees Escape for $domain.$action', (target) => {
    const result = keybindStore.saveKeybindingChanges([{ target, value: 'Escape' }], true);
    expect(result.saved).toBe(true);
    expect(result.store.ui.closeOverlay).toBe('');
    expect(result.store.gamePanel.inventory).toBe('F3');
    expect(keybindStore.getKeybindingValue(result.store, target)).toBe('Escape');
  });

  it('resets panel and UI groups to independent F3 and Escape defaults', () => {
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      gamePanel: { inventory: 'Escape' },
      ui: { closeOverlay: '' },
    });
    const panelReset = keybindStore.saveKeybindingChanges(
      keybindStore.KEYBINDING_DEFINITIONS.filter((binding) => binding.domain === 'gamePanel').map((target) => ({
        target,
        value: target.defaultKey,
      })),
      true,
    );
    expect(panelReset.unbound).toEqual([]);
    expect(panelReset.store.gamePanel.inventory).toBe('F3');
    const uiReset = keybindStore.saveKeybindingChanges([{ target: closeOverlay, value: 'Escape' }], true);
    expect(uiReset.unbound).toEqual([]);
    expect(uiReset.store).toMatchObject({ gamePanel: { inventory: 'F3' }, ui: { closeOverlay: 'Escape' } });
  });

  it('uses ordinary conflicts when Inventory explicitly takes Escape or dismissal takes it back', () => {
    const inventory: keybindStore.KeybindingTarget = { domain: 'gamePanel', action: 'inventory' };
    const custom = keybindStore.saveKeybindingChanges([{ target: inventory, value: 'Escape' }], true);
    expect(custom.unbound.map(({ domain }) => domain)).toEqual(['ui']);
    expect(keybindStore.loadUnifiedKeybindStore()).toMatchObject({
      gamePanel: { inventory: 'Escape' },
      ui: { closeOverlay: '' },
    });
    const reset = keybindStore.saveKeybindingChanges([{ target: closeOverlay, value: 'Escape' }], true);
    expect(reset.unbound.map(({ action }) => action)).toEqual(['inventory']);
    expect(reset.store.gamePanel.inventory).toBe('');
  });
  it('preserves the existing owner when a key is reassigned without confirmation', () => {
    const before = keybindStore.loadUnifiedKeybindStore();

    const result = keybindStore.saveKeybindingChanges([
      { target: { domain: 'gamePanel', action: 'prayer' }, value: 'F1' },
    ]);

    expect(result.saved).toBe(false);
    expect(result.store).toEqual(before);
  });

  it('includes editable timer defaults when loading existing saved bindings', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { prayer: 'q' }, camera: {} });

    const store = keybindStore.loadUnifiedKeybindStore();

    expect(store).toMatchObject({
      gamePanel: { prayer: 'q' },
      plugins: { zukSetTimerAdvance: 'Z', zukSetTimerReset: 'Shift+Z', zukSetTimerReveal: 'X' },
    });
  });

  it('finds modifier overlap with bare game keys using case-insensitive matching', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { prayer: 'q' } });
    const store = keybindStore.loadUnifiedKeybindStore();

    const conflicts = keybindStore.getKeybindingConflicts(store, [{ target: advance, value: 'Alt+Q' }]);

    expect(conflicts).toEqual([
      expect.objectContaining({ binding: expect.objectContaining({ domain: 'gamePanel', action: 'prayer' }) }),
    ]);
  });

  it('preserves previously saved timer bindings instead of replacing them with new defaults', () => {
    const plugins = { zukSetTimerAdvance: 'Q', zukSetTimerReset: 'Shift+Q', zukSetTimerReveal: 'E' };
    saveSetting('osrs-unified-keybinds', { plugins });

    expect(keybindStore.loadUnifiedKeybindStore().plugins).toEqual({ ...DEFAULT_PLUGIN_KEYBINDS, ...plugins });
  });

  it('keeps different plugin modifier combinations independent', () => {
    const store = keybindStore.loadUnifiedKeybindStore();

    const conflicts = keybindStore.getKeybindingConflicts(store, [{ target: advance, value: 'Ctrl+Shift+J' }]);

    expect(conflicts).toEqual([]);
  });

  it('finds exact plugin-to-plugin collisions', () => {
    const store = keybindStore.loadUnifiedKeybindStore();

    const conflicts = keybindStore.getKeybindingConflicts(store, [{ target: advance, value: 'shift+z' }]);

    expect(conflicts).toEqual([
      expect.objectContaining({ binding: expect.objectContaining({ action: 'zukSetTimerReset' }) }),
    ]);
  });

  it('reassigns only the conflicting bindings after confirmation', () => {
    const store = keybindStore.loadUnifiedKeybindStore();
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    const result = keybindStore.saveKeybindingChanges([{ target: advance, value: 'F5' }], true);

    expect(result.saved).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.unbound).toEqual([
      { domain: 'gamePanel', action: 'prayer', label: 'Prayer', group: 'Panel', defaultKey: 'F5' },
    ]);
    expect(result.store.gamePanel).toEqual({ ...store.gamePanel, prayer: '' });
    expect(keybindStore.loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('F5');
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(result.store);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: keybindStore.KEYBINDS_UPDATED_EVENT }),
    );
  });

  it('returns the original plugin owner definition when another plugin takes its shortcut', () => {
    const owner = keybindStore.KEYBINDING_DEFINITIONS.find(
      (binding) => binding.domain === 'plugins' && binding.action === 'zukSetTimerReset',
    );

    const result = keybindStore.saveKeybindingChanges([{ target: advance, value: 'Shift+Z' }], true);

    expect(result.saved).toBe(true);
    expect(result.unbound).toEqual([owner]);
    expect(result.unbound[0]).toBe(owner);
    expect(result.store.plugins).toEqual({
      ...DEFAULT_PLUGIN_KEYBINDS,
      zukSetTimerAdvance: 'Shift+Z',
      zukSetTimerReset: '',
      zukSetTimerReveal: 'X',
    });
  });

  it('deduplicates displaced owners when resetting a group produces repeated conflicts', () => {
    saveSetting(keybindStore.UNIFIED_KEYBINDS_KEY, {
      gamePanel: { prayer: 'z', equipment: 'x' },
      plugins: { zukSetTimerAdvance: 'J', zukSetTimerReset: 'K', zukSetTimerReveal: 'L' },
    });
    const before = keybindStore.loadUnifiedKeybindStore();
    const changes = keybindStore.KEYBINDING_DEFINITIONS.filter((binding) => binding.domain === 'plugins').map(
      (target) => ({
        target,
        value: target.defaultKey,
      }),
    );

    const result = keybindStore.saveKeybindingChanges(changes, true);

    expect(result.saved).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.unbound).toEqual([
      { domain: 'gamePanel', action: 'prayer', label: 'Prayer', group: 'Panel', defaultKey: 'F5' },
      { domain: 'gamePanel', action: 'equipment', label: 'Equipment', group: 'Panel', defaultKey: 'F4' },
    ]);
    expect(result.store).toEqual({
      ...before,
      gamePanel: { ...before.gamePanel, prayer: '', equipment: '' },
      plugins: DEFAULT_PLUGIN_KEYBINDS,
    });
  });

  it('returns no displaced owners or mutations when a conflict is saved without reassignment', () => {
    const before = keybindStore.loadUnifiedKeybindStore();
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    const result = keybindStore.saveKeybindingChanges([{ target: advance, value: 'F5' }]);

    expect(result.saved).toBe(false);
    expect(result.unbound).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.store).toEqual(before);
    expect(keybindStore.loadUnifiedKeybindStore()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves every binding unchanged when a reassignment batch mixes a collision and a reserved shortcut', () => {
    const before = keybindStore.loadUnifiedKeybindStore();
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    const result = keybindStore.saveKeybindingChanges(
      [
        { target: advance, value: 'F5' },
        { target: { domain: 'plugins', action: 'zukSetTimerReset' }, value: 'Ctrl+R' },
      ],
      true,
    );

    expect(result.saved).toBe(false);
    expect(result.unbound).toEqual([]);
    expect(result.conflicts).toEqual([
      expect.objectContaining({ binding: expect.objectContaining({ domain: 'gamePanel', action: 'prayer' }) }),
      { binding: null, label: 'Restart simulation', value: 'Ctrl+R' },
    ]);
    expect(result.store).toEqual(before);
    expect(loadSetting(keybindStore.UNIFIED_KEYBINDS_KEY)).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects app-reserved shortcuts even with reassignment requested', () => {
    const before = keybindStore.loadUnifiedKeybindStore();

    const result = keybindStore.saveKeybindingChanges([{ target: advance, value: 'Ctrl+R' }], true);

    expect(result.saved).toBe(false);
    expect(result.store).toEqual(before);
    expect(result.conflicts[0].binding).toBeNull();
    expect(result.unbound).toEqual([]);
  });

  it('allows keys shared by mutually exclusive camera modes', () => {
    const store = keybindStore.loadUnifiedKeybindStore();

    const conflicts = keybindStore.getKeybindingConflicts(store, [
      { target: { domain: 'camera', action: 'orbitRotateLeft' }, value: 'A' },
    ]);

    expect(conflicts).toEqual([]);
  });

  it('detects a camera toggle colliding with movement', () => {
    const store = keybindStore.loadUnifiedKeybindStore();

    const conflicts = keybindStore.getKeybindingConflicts(store, [
      { target: { domain: 'camera', action: 'toggleFreeform' }, value: 'a' },
    ]);

    expect(conflicts).toHaveLength(2);
  });

  it('suppresses only colliding plugin actions without changing the saved keys', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { prayer: 'z' } });
    const store = keybindStore.loadUnifiedKeybindStore();

    const effective = keybindStore.getEffectivePluginKeybinds(store);

    expect(effective).toEqual({
      ...DEFAULT_PLUGIN_KEYBINDS,
      zukSetTimerAdvance: '',
      zukSetTimerReset: '',
    });
    expect(store.plugins.zukSetTimerAdvance).toBe('Z');
  });

  it.each(['J', ''])('persists %j without displaced owners when the shortcut has no conflicts', (value) => {
    keybindStore.loadUnifiedKeybindStore();

    const result = keybindStore.saveKeybindingChanges([{ target: advance, value }]);

    expect(result.saved).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(result.unbound).toEqual([]);
    expect(keybindStore.loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe(value);
  });
});
