import { loadUnifiedKeybindStore } from '../hooks/keybindStore';
import { formatKeyName } from '../hooks/useGamePanelShortcuts';

export interface Shortcut {
  keys: string;
  description: string;
}

export interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

function formatShortcutKey(key: string): string {
  return key ? formatKeyName(key) : 'Unbound';
}

export function getShortcutCategories(): ShortcutCategory[] {
  const { gamePanel, camera, ui } = loadUnifiedKeybindStore();
  const closeKey = formatShortcutKey(ui.closeOverlay);
  return [
    {
      title: 'General',
      shortcuts: [
        { keys: 'Ctrl+K', description: 'Quick search' },
        {
          keys: 'Ctrl+R',
          description: 'Restart from practice start, else retry the current Inferno wave, else restart the fight',
        },
        { keys: closeKey, description: 'Close or cancel' },
        { keys: 'Ctrl+Shift+R', description: 'Reload the page' },
      ],
    },
    {
      title: 'Game Panel Tabs',
      shortcuts: [
        { keys: formatShortcutKey(gamePanel.inventory), description: 'Inventory' },
        { keys: formatShortcutKey(gamePanel.combat), description: 'Combat' },
        { keys: formatShortcutKey(gamePanel.skills), description: 'Skills' },
        { keys: formatShortcutKey(gamePanel.equipment), description: 'Equipment' },
        { keys: formatShortcutKey(gamePanel.prayer), description: 'Prayer' },
        { keys: formatShortcutKey(gamePanel.spellbook), description: 'Spellbook' },
        { keys: formatShortcutKey(gamePanel.settings), description: 'Settings' },
      ],
    },
    {
      title: 'Camera',
      shortcuts: [
        {
          keys: `${formatShortcutKey(camera.orbitRotateLeft)} / ${formatShortcutKey(camera.orbitRotateRight)}`,
          description: 'Rotate left / right',
        },
        {
          keys: `${formatShortcutKey(camera.orbitTiltUp)} / ${formatShortcutKey(camera.orbitTiltDown)}`,
          description: 'Tilt up / down',
        },
      ],
    },
    {
      title: 'Replay',
      shortcuts: [
        { keys: 'Space', description: 'Play / pause' },
        { keys: '\u2190 / \u2192', description: 'Step backward / forward' },
        { keys: 'Home / End', description: 'Jump to start / end' },
        { keys: closeKey, description: 'Exit replay' },
      ],
    },
    {
      title: 'Mouse Shortcuts',
      shortcuts: [
        { keys: 'Ctrl+Click', description: 'Invert walk/run' },
        { keys: 'Shift+Right-click', description: 'Extended context menu' },
        { keys: 'Alt+Drag', description: 'Move UI panels' },
        { keys: 'Alt+Scroll', description: 'Resize UI panels' },
        { keys: 'Alt+Right-click', description: 'Reset panel position' },
        { keys: 'Alt+Middle-click', description: 'Reset panel scale' },
      ],
    },
  ];
}
