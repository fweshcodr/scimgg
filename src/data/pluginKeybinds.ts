export const PLUGIN_KEYBINDS = {
  zukSetTimerAdvance: { label: 'Advance timer', group: 'Zuk Set Timer', setting: 'zukSetTimer', defaultKey: 'Z' },
  zukSetTimerReset: { label: 'Reset timer', group: 'Zuk Set Timer', setting: 'zukSetTimer', defaultKey: 'Shift+Z' },
  zukSetTimerReveal: { label: 'Show actual', group: 'Zuk Set Timer', setting: 'zukSetTimer', defaultKey: 'X' },
} as const;

export type PluginKeybindAction = keyof typeof PLUGIN_KEYBINDS;
export type PluginKeybindMap = Record<PluginKeybindAction, string>;
export const PLUGIN_KEYBIND_ACTIONS = ['zukSetTimerAdvance', 'zukSetTimerReset', 'zukSetTimerReveal'] as const;
export const DEFAULT_PLUGIN_KEYBINDS: PluginKeybindMap = {
  zukSetTimerAdvance: PLUGIN_KEYBINDS.zukSetTimerAdvance.defaultKey,
  zukSetTimerReset: PLUGIN_KEYBINDS.zukSetTimerReset.defaultKey,
  zukSetTimerReveal: PLUGIN_KEYBINDS.zukSetTimerReveal.defaultKey,
};

export const PLUGIN_KEYBIND_HELP: Readonly<Record<string, string>> = {
  'Zuk Set Timer': 'Active during Zuk while Set Timer is on. Changes save immediately.',
};
