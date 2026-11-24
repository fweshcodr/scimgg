// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { deleteSetting, saveSetting } from '../../util/storage';
import { getShortcutCategories } from '../shortcuts';

afterEach(() => {
  deleteSetting('osrs-unified-keybinds');
});

describe('getShortcutCategories', () => {
  it('lists only fixed Ctrl+R for restart and omits stored Simulation shortcuts', () => {
    saveSetting('osrs-unified-keybinds', {
      ui: { restartSimulation: 'Ctrl+J', setPracticeStart: 'Alt+H' },
      plugins: { replayPracticeRetry: 'Ctrl+Z', replayPracticeSetStart: 'Ctrl+Shift+Z' },
    });
    const categories = getShortcutCategories();
    expect(categories.find(({ title }) => title === 'Replay Practice')).toBeUndefined();
    expect(categories.find(({ title }) => title === 'Simulation')).toBeUndefined();
    expect(
      categories.flatMap(({ shortcuts }) => shortcuts).some(({ keys }) => /Ctrl\+J|Alt\+H|Ctrl\+Z/.test(keys)),
    ).toBe(false);
    expect(categories.find(({ title }) => title === 'General')?.shortcuts).toContainEqual({
      keys: 'Ctrl+R',
      description: 'Restart from practice start, else retry the current Inferno wave, else restart the fight',
    });
  });
  it('shows the current independent Inventory and dismissal defaults', () => {
    const categories = getShortcutCategories();
    expect(categories.find(({ title }) => title === 'Game Panel Tabs')?.shortcuts).toContainEqual({
      keys: 'F3',
      description: 'Inventory',
    });
    expect(categories.find(({ title }) => title === 'General')?.shortcuts).toContainEqual({
      keys: 'Esc',
      description: 'Close or cancel',
    });
    expect(categories.find(({ title }) => title === 'Replay')?.shortcuts).toContainEqual({
      keys: 'Esc',
      description: 'Exit replay',
    });
  });

  it.each([
    { value: 'F8', display: 'F8' },
    { value: 'j', display: 'J' },
    { value: ' ', display: 'Space' },
    { value: '', display: 'Unbound' },
  ])('shows configured dismissal $value as $display for both close and replay', ({ value, display }) => {
    saveSetting('osrs-unified-keybinds', { ui: { closeOverlay: value } });
    const categories = getShortcutCategories();
    expect(categories.find(({ title }) => title === 'General')?.shortcuts).toContainEqual({
      keys: display,
      description: 'Close or cancel',
    });
    expect(categories.find(({ title }) => title === 'Replay')?.shortcuts).toContainEqual({
      keys: display,
      description: 'Exit replay',
    });
  });

  it('formats custom panel/camera keys and explicit unbinds consistently', () => {
    saveSetting('osrs-unified-keybinds', {
      gamePanel: { prayer: 'p', inventory: '' },
      camera: { orbitRotateLeft: '', orbitRotateRight: 'Escape' },
    });
    const categories = getShortcutCategories();
    expect(categories.find(({ title }) => title === 'Game Panel Tabs')?.shortcuts).toContainEqual({
      keys: 'P',
      description: 'Prayer',
    });
    expect(categories.find(({ title }) => title === 'Game Panel Tabs')?.shortcuts).toContainEqual({
      keys: 'Unbound',
      description: 'Inventory',
    });
    expect(categories.find(({ title }) => title === 'Camera')?.shortcuts).toContainEqual({
      keys: 'Unbound / Esc',
      description: 'Rotate left / right',
    });
  });
  it('includes the Skills tab shortcut in Game Panel Tabs', () => {
    const gamePanelCategory = getShortcutCategories().find((category) => category.title === 'Game Panel Tabs');

    expect(gamePanelCategory?.shortcuts).toContainEqual({ keys: 'F2', description: 'Skills' });
  });

  it('lists Ctrl+K as the quick search', () => {
    const general = getShortcutCategories().find((category) => category.title === 'General');

    expect(general?.shortcuts).toContainEqual({ keys: 'Ctrl+K', description: 'Quick search' });
  });
});
