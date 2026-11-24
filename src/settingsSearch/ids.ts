/**
 * Search ids double as the sidebars' `data-search-id` anchors, so the index and the UI must build
 * them with these same functions. An id is the panel followed by the slugs of the labels on the
 * way to the row: `settings.interface.game-window.resolution`, `plugins.camera.invert-yaw`.
 * Plugin rows are keyed by the PluginsPanel expand key (`stretchedMode`, `setTimer`), which stays
 * put when a plugin's label changes.
 */

/** Kebab-case of a label: `'Graphics & Performance'` → `'graphics-performance'`, `'3D render scale'` → `'3d-render-scale'`. */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `settingsSearchId('Interface', 'Game window')` → `'settings.interface.game-window'`. */
export function settingsSearchId(...labels: string[]): string {
  return ['settings', ...labels.map(slugify)].join('.');
}

/** `pluginSearchId('camera', 'Invert yaw')` → `'plugins.camera.invert-yaw'`. The key is used verbatim. */
export function pluginSearchId(pluginKey: string, ...optionLabels: string[]): string {
  return ['plugins', pluginKey, ...optionLabels.map(slugify)].join('.');
}

/**
 * The Keyboard Shortcuts reference: the Settings header's keyboard icon is its anchor, but a search
 * result opens the reference itself (App registers it with `useRevealAction`).
 */
export const KEYBOARD_SHORTCUTS_REFERENCE_ID = settingsSearchId('Keyboard shortcuts reference');

/**
 * The game panel's keybind editor (wrench tab → Keybindings), on its Panel group. Not a sidebar
 * row: `revealSetting` opens the panel's own tab and subtab instead of a drawer.
 */
export const GAMEPANEL_KEYBINDS_ID = 'gamepanel.keybinds';
/** The same editor on its Camera group. */
export const GAMEPANEL_KEYBINDS_CAMERA_ID = 'gamepanel.keybinds.camera';
/** The same editor on its Plugins group. */
export const GAMEPANEL_KEYBINDS_PLUGINS_ID = 'gamepanel.keybinds.plugins';

/** The game panel's Audio page (wrench tab → Audio), revealed like the keybind editor. */
export const GAMEPANEL_AUDIO_ID = 'gamepanel.audio';

/** `gamePanelAudioSearchId('Sound Effects')` → `'gamepanel.audio.sound-effects'`: one control on the Audio page. */
function gamePanelAudioSearchId(label: string): string {
  return `${GAMEPANEL_AUDIO_ID}.${slugify(label)}`;
}

/** The Audio page's controls, by their visible labels. */
export const GAMEPANEL_AUDIO_LABELS = {
  masterVolume: 'Master Volume',
  muteWhenUnfocused: 'Mute when unfocused',
  sfxVolume: 'Sound Effects',
  areaVolume: 'Area Sounds',
} as const;

/** The Audio page's control ids: `gamepanel.audio.master-volume`, `.mute-when-unfocused`, `.sound-effects`, `.area-sounds`. */
export const GAMEPANEL_AUDIO_IDS = {
  masterVolume: gamePanelAudioSearchId(GAMEPANEL_AUDIO_LABELS.masterVolume),
  muteWhenUnfocused: gamePanelAudioSearchId(GAMEPANEL_AUDIO_LABELS.muteWhenUnfocused),
  sfxVolume: gamePanelAudioSearchId(GAMEPANEL_AUDIO_LABELS.sfxVolume),
  areaVolume: gamePanelAudioSearchId(GAMEPANEL_AUDIO_LABELS.areaVolume),
} as const;
