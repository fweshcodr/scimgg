import {
  GAMEPANEL_AUDIO_ID,
  GAMEPANEL_AUDIO_IDS,
  GAMEPANEL_AUDIO_LABELS,
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_ID,
  GAMEPANEL_KEYBINDS_PLUGINS_ID,
  pluginSearchId,
  settingsSearchId,
} from './ids';
import type { SearchEntry, SearchEntryKind } from './types';

/**
 * Every searchable row in the Settings and Plugins sidebars, in panel order (ties rank in this
 * order). Titles are the rows' visible labels, and ids are built from them, so a relabeled row
 * needs its entry updated here too; `resultTitle` qualifies a label too bare to stand alone in the
 * results. Descriptions are one short sentence about the effect: how to use it belongs in the row.
 *
 * Keywords are what a player would type instead of the label: everyday words, RuneLite plugin and
 * config names, OSRS slang. Map a word only to rows that actually do that thing.
 *
 * Development-only rows are left out: the Developer zone's Debug section and the Debug Overlays
 * plugin. So are controls whose bare label would mislead out of context (Camera's zoom "Speed",
 * XP Drops "Speed", the overhead-number "Offset" and "Font Size", Compact Orbs "Layout"): their
 * words are keywords on the plugin row instead.
 */

type Details = Pick<
  SearchEntry,
  'description' | 'keywords' | 'availability' | 'layouts' | 'resultTitle' | 'whenUnavailable' | 'needsKeyboard'
>;

/** A row in Settings. `path` runs from the section to the row, e.g. `['Interface', 'Game window', 'Resolution']`. */
function setting(kind: SearchEntryKind, path: string[], details: Details): SearchEntry {
  return {
    id: settingsSearchId(...path),
    title: path[path.length - 1],
    panel: 'settings',
    breadcrumb: ['Settings', ...path.slice(0, -1)],
    kind,
    ...details,
  };
}

function plugin(key: string, title: string, details: Details): SearchEntry {
  return { id: pluginSearchId(key), title, panel: 'plugins', breadcrumb: ['Plugins'], kind: 'plugin', ...details };
}

/** A control inside a plugin row. `group` is a sub-heading inside the row, shown in the breadcrumb only. */
function pluginOption(key: string, pluginTitle: string, label: string, details: Details, group?: string): SearchEntry {
  return {
    id: pluginSearchId(key, label),
    title: label,
    panel: 'plugins',
    breadcrumb: group ? ['Plugins', pluginTitle, group] : ['Plugins', pluginTitle],
    kind: 'setting',
    ...details,
  };
}

const INTERFACE_SCALE_WORDS = [
  'ui size',
  'ui scale',
  'interface size',
  'bigger interface',
  'smaller interface',
  'make ui bigger',
  'zoom interface',
  'scale',
  'scaling',
  'stretch',
  'stretched',
  'fixed size',
  'gui scale',
  'hud size',
  'dpi',
  '4k',
  'resize',
];

/** The Layout picker: where the player goes to meet a layout requirement themselves. */
const TO_LAYOUT = { label: 'Open Layout settings', target: settingsSearchId('Interface', 'Layout') } as const;
const TO_DEVICE_MODE = {
  label: 'Open Device Mode settings',
  target: settingsSearchId('Interface', 'Device Mode'),
} as const;
const NEEDS_RESIZABLE = { reason: 'Requires a Resizable layout.', route: TO_LAYOUT } as const;
const NEEDS_FIXED = { reason: 'Requires the Fixed layout.', route: TO_LAYOUT } as const;
const NEEDS_MOBILE = { reason: 'Requires the Mobile layout.', route: TO_DEVICE_MODE } as const;
const NEEDS_TOUCH = { reason: 'Requires the Mobile layout or a touch device.', route: TO_DEVICE_MODE } as const;
const DESKTOP_ONLY = { reason: 'Desktop devices only.' } as const;
const DURING_ZUK = { reason: 'Available in the Inferno.' } as const;
/** The encounter plugins' rows show only in these encounters (data/encounterPlugins.ts). */
const IN_INFERNO_OR_COLOSSEUM = {
  whenUnavailable: { reason: 'Available in the Inferno and the Colosseum.' },
  availability: 'In the Inferno and the Colosseum',
} as const;
const IN_INFERNO = {
  whenUnavailable: { reason: 'Available in the Inferno.' },
  availability: 'In the Inferno',
} as const;
const IN_COLOSSEUM = {
  whenUnavailable: { reason: 'Available in the Colosseum.' },
  availability: 'In the Colosseum',
} as const;

/**
 * Inferno Additions' and Colosseum Additions' entries: the same options (PillarAdditionsSettings),
 * each for its own arena's pillars. `pillars` names them in a sentence; `keywords` are the arena's.
 */
function pillarAdditionsEntries(
  key: 'infernoAdditions' | 'colosseumAdditions',
  title: string,
  arena: {
    readonly scope: typeof IN_INFERNO | typeof IN_COLOSSEUM;
    readonly pillars: string;
    readonly keywords: readonly string[];
  },
): SearchEntry[] {
  const { scope, pillars } = arena;
  return [
    plugin(key, title, {
      ...scope,
      description: `Marks the tiles under ${pillars}, and can stop drawing them.`,
      keywords: [
        'tzhaar colo additions',
        'hide pillars',
        'pillar',
        'pillars',
        'safespot',
        'mark pillar tiles',
        ...arena.keywords,
      ],
    }),
    pluginOption(key, title, 'Hide pillars', {
      ...scope,
      description: `Stops drawing ${pillars}. They still block movement and line of sight.`,
      keywords: ['hide pillars', 'invisible pillars', 'safespot', ...arena.keywords],
    }),
    pluginOption(key, title, 'Mark pillar tiles', {
      ...scope,
      description: 'Marks the tiles each standing pillar covers.',
      keywords: ['pillar tiles', 'pillar outline', 'pillar footprint', 'tile marker'],
    }),
    pluginOption(key, title, 'Pillar marker style', {
      ...scope,
      description: 'How pillar tiles are marked: a bordered tile, a filled tile or an outline.',
      keywords: ['bordered tile', 'tile fill', 'line', 'marker style'],
    }),
    pluginOption(key, title, 'Pillar tile color', {
      ...scope,
      description: 'The color pillar tiles are marked in.',
      keywords: ['pillar colour', 'pillar color', 'marker colour', 'marker color'],
    }),
    pluginOption(key, title, 'Opacity', {
      ...scope,
      description: 'How opaque the pillar tile color is.',
      keywords: ['pillar opacity', 'transparency', 'alpha'],
    }),
  ];
}

const SETTINGS_ENTRIES: SearchEntry[] = [
  // The editor for the game's keys, in the game panel (wrench tab → Keybinds), which the Interface
  // section's Keybinds row also leads to. A plugin's own keys (Zuk Set Timer's) stay on its row.
  {
    id: GAMEPANEL_KEYBINDS_ID,
    title: 'Keybinds',
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings'],
    kind: 'section',
    description: 'Changes game-panel and plugin shortcuts, and the key used to close menus or cancel actions.',
    keywords: [
      'keybinds',
      'key bindings',
      'keybindings',
      'rebind',
      'change keys',
      'hotkeys',
      'f keys',
      'function keys',
      'inventory key',
      'close overlay',
      'close or cancel',
      'close menu',
      'cancel action',
      'escape',
      'esc',
      'controls',
      'shortcuts',
    ],
    needsKeyboard: true,
  },
  {
    id: GAMEPANEL_KEYBINDS_CAMERA_ID,
    title: 'Camera',
    resultTitle: 'Camera keys',
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings', 'Keybindings'],
    kind: 'setting',
    description: 'Changes the keys that rotate and zoom the camera.',
    keywords: ['camera keys', 'camera keybinds', 'rotate keys', 'arrow keys', 'wasd', 'zoom keys', 'rebind camera'],
    needsKeyboard: true,
  },
  {
    id: GAMEPANEL_KEYBINDS_PLUGINS_ID,
    title: 'Plugins',
    resultTitle: 'Plugin keys',
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings', 'Keybindings'],
    kind: 'setting',
    description: 'Changes plugin shortcuts, grouped by plugin.',
    keywords: ['plugin keys', 'plugin keybinds', 'plugin shortcuts', 'plugin hotkeys', 'rebind plugins'],
    needsKeyboard: true,
  },
  // The game panel's Audio page (wrench tab → Audio): the simulator's own sound. Listed before the
  // plugins so that, on equal evidence, "volume" leads with these rather than the Tick Audio
  // Metronome's own Volume. There is no music in the simulator; "music" leads here because this is
  // where a player looking for it should land.
  {
    id: GAMEPANEL_AUDIO_ID,
    title: 'Audio',
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings'],
    kind: 'section',
    description: 'Master, sound effect and area sound volumes, and muting in the background.',
    keywords: ['audio', 'sound', 'sounds', 'volume', 'music', 'mute', 'quiet', 'loud', 'sound settings'],
  },
  {
    id: GAMEPANEL_AUDIO_IDS.masterVolume,
    title: GAMEPANEL_AUDIO_LABELS.masterVolume,
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings', 'Audio'],
    kind: 'setting',
    description: 'Sets the volume of every sound in the simulator.',
    keywords: ['volume', 'overall volume', 'sound', 'audio', 'loud', 'louder', 'quiet', 'quieter', 'mute'],
  },
  {
    id: GAMEPANEL_AUDIO_IDS.sfxVolume,
    title: GAMEPANEL_AUDIO_LABELS.sfxVolume,
    resultTitle: 'Sound effects volume',
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings', 'Audio'],
    kind: 'setting',
    description: 'Sets the volume of sound effects.',
    keywords: ['sfx', 'sound effects', 'volume', 'combat sounds', 'loud', 'quiet'],
  },
  {
    id: GAMEPANEL_AUDIO_IDS.areaVolume,
    title: GAMEPANEL_AUDIO_LABELS.areaVolume,
    resultTitle: 'Area sounds volume',
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings', 'Audio'],
    kind: 'setting',
    description: 'Sets the volume of area sounds.',
    keywords: ['area sounds', 'ambient', 'ambience', 'environment sounds', 'volume', 'loud', 'quiet'],
  },
  {
    id: GAMEPANEL_AUDIO_IDS.muteWhenUnfocused,
    title: GAMEPANEL_AUDIO_LABELS.muteWhenUnfocused,
    panel: 'gamepanel',
    breadcrumb: ['Game panel', 'Settings', 'Audio'],
    kind: 'setting',
    description: 'Silences the simulator while its window is in the background.',
    keywords: ['mute', 'silence', 'quiet', 'background', 'alt tab', 'other tab', 'unfocused', 'sound', 'audio'],
  },
  // A reference, not the editor: "shortcuts" finds both, "keybinds" and "rebind" lead with the editor.
  setting('section', ['Keyboard shortcuts reference'], {
    description: 'View shortcuts and current bindings.',
    keywords: ['shortcuts', 'keyboard shortcuts', 'shortcut list', 'cheat sheet', 'keyboard'],
    availability: 'Keyboard devices',
    whenUnavailable: { reason: 'Needs a keyboard.' },
  }),

  // Simulation
  setting('section', ['Simulation'], {
    description: 'Restart, playback speed, input lag, the start of fight countdown and pausing.',
    keywords: ['sim', 'fight', 'gameplay'],
  }),
  setting('setting', ['Simulation', 'Restart Simulation'], {
    description: 'Starts the current fight from the beginning and clears the practice start.',
    keywords: ['restart', 'reset', 'retry', 'start over', 'try again', 'new attempt', 'reset fight'],
  }),
  setting('setting', ['Simulation', 'Playback Speed'], {
    description: 'Runs the simulation at 0.5x, 1x or 2x speed.',
    keywords: [
      'speed',
      'slow motion',
      'slowmo',
      'slow down',
      'half speed',
      'fast forward',
      'speed up',
      'double speed',
      'game speed',
      'tick speed',
      '2x',
      '0.5x',
    ],
  }),
  setting('setting', ['Simulation', 'Input Lag'], {
    description: 'Delays your inputs by up to a second to mimic network latency.',
    keywords: ['lag', 'laggy', 'latency', 'ping', 'high ping', 'delay', 'input delay', 'network', 'server lag'],
  }),
  setting('section', ['Simulation', 'Start of Fight Countdown'], {
    description: 'Counts down before a fight starts, ending with any intro animation.',
    keywords: ['countdown', '3 2 1', 'start timer', 'fight start', 'ready', 'go'],
  }),
  setting('setting', ['Simulation', 'Start of Fight Countdown', 'Countdown'], {
    resultTitle: 'Fight start countdown',
    description: 'Counts down before a fight starts or restarts.',
    keywords: ['countdown', '3 2 1', 'start timer', 'fight start', 'ready', 'go', 'ready go'],
  }),
  setting('setting', ['Simulation', 'Start of Fight Countdown', 'Length'], {
    resultTitle: 'Countdown length',
    description: 'Sets the fight countdown length from 1 to 5 game ticks.',
    keywords: ['countdown length', 'countdown ticks', 'game ticks', 'ticks', 'start timer', 'timer length'],
  }),
  setting('setting', ['Simulation', 'Auto-Advance'], {
    description: 'Runs game ticks on their own instead of one per click.',
    keywords: ['step', 'step mode', 'tick by tick', 'manual tick', 'frame by frame', 'pause', 'freeze', 'advance'],
  }),
  setting('setting', ['Simulation', 'Pause simulator when unfocused'], {
    description: 'Pauses the fight while you are in another tab or window.',
    keywords: ['pause', 'tab out', 'alt tab', 'background', 'unfocused', 'focus', 'afk', 'minimize'],
  }),

  // Graphics & Performance
  setting('section', ['Graphics & Performance'], {
    description: 'View mode, picture adjustments, 3D render scale and frame rate.',
    keywords: [
      'graphics',
      'performance',
      'display',
      'video',
      'visuals',
      'quality',
      'fps',
      'frame rate',
      'lag',
      'laggy',
      'smooth',
      'stutter',
      'choppy',
      'slow',
      'gpu',
    ],
  }),
  setting('setting', ['Graphics & Performance', 'View Mode'], {
    description: 'Switches between the 3D view and the 2D debug view.',
    keywords: ['renderer', '3d', '2d', 'webgl', 'canvas', 'top down', 'debug view', 'graphics mode'],
  }),
  setting('setting', ['Graphics & Performance', 'Smooth Terrain'], {
    description: 'Blends ground colors across tiles instead of flat shading each tile.',
    keywords: ['terrain', 'ground', 'floor', 'blend', 'flat shading', 'smooth shading', 'tiles'],
  }),
  setting('setting', ['Graphics & Performance', 'Brightness'], {
    description: 'Lightens or darkens the 3D view.',
    keywords: ['gamma', 'dark', 'too dark', 'darker', 'dim', 'light', 'lighter', 'bright', 'brighten'],
  }),
  setting('setting', ['Graphics & Performance', 'Contrast'], {
    description: 'Adjusts the contrast of the 3D view.',
    keywords: ['washed out', 'dull', 'punchy', 'picture'],
  }),
  setting('setting', ['Graphics & Performance', 'Saturation'], {
    description: 'Adjusts how vivid the colors of the 3D view are.',
    keywords: ['colour', 'color', 'vivid', 'vibrance', 'vibrant', 'grayscale', 'black and white', 'desaturate'],
  }),
  setting('setting', ['Graphics & Performance', '3D render scale'], {
    description: 'Trades 3D scene sharpness for speed.',
    keywords: [
      'render scale',
      'resolution scale',
      'quality',
      'pixelated',
      'blurry',
      'sharp',
      'crisp',
      'performance',
      'fps',
      'lag',
      'faster',
      'gpu',
      'low end',
      'potato',
    ],
  }),
  setting('setting', ['Graphics & Performance', 'FPS Cap'], {
    description: 'Limits the frame rate, from 30 FPS to uncapped.',
    keywords: [
      'fps',
      'frame rate',
      'framerate',
      'frames per second',
      'fps limit',
      'limit fps',
      'uncapped',
      'unlimited',
      'vsync',
      'refresh rate',
      '60 fps',
      '144hz',
      'battery',
      'performance',
      'smooth',
      'stutter',
      'choppy',
      'lag',
      'laggy',
    ],
  }),
  setting('setting', ['Graphics & Performance', 'Anti-aliasing'], {
    description: 'Smooths jagged 3D edges. Turning it off is faster on weak computers.',
    keywords: [
      'antialiasing',
      'anti aliasing',
      'aa',
      'msaa',
      'jagged',
      'jaggies',
      'edges',
      'smooth',
      'quality',
      'performance',
      'fps',
      'lag',
      'faster',
      'gpu',
      'low end',
      'potato',
    ],
  }),

  // Interface
  setting('section', ['Interface'], {
    description: 'Layout, scaling, keybinds, game window, infoboxes and chatbox.',
    keywords: ['ui', 'hud', 'gui', 'client', 'layout', 'chatbox'],
  }),
  setting('setting', ['Interface', 'Device Mode'], {
    description: 'Overrides phone or tablet detection on this browser.',
    keywords: [
      'device',
      'desktop mode',
      'mobile mode',
      'mobile layout',
      'pc mode',
      'phone mode',
      'desktop version',
      'mobile version',
      'desktop site',
      'force desktop',
      'force mobile',
      'auto detect',
      'wrong mode',
    ],
  }),
  setting('setting', ['Interface', 'Layout'], {
    description: 'Chooses a desktop layout; Mobile mode always uses Mobile.',
    keywords: [
      'layout',
      'fixed',
      'fixed mode',
      'resizable',
      'resizable mode',
      'modern',
      'classic',
      'client layout',
      'interface mode',
      'side panels',
      'bottom bar',
      'stone',
    ],
  }),
  // The Interface scaling row beside Layout only links to Stretched Mode or Mobile's own setting,
  // so its words live on those editors: a result goes straight to where the scale is set.
  setting('setting', ['Interface', 'Transparent side panel'], {
    description: 'Shows the game through the side panel background. Keybinds and Audio stay opaque.',
    keywords: ['opaque', 'semi-transparent', 'transparency', 'inventory background', 'panel background'],
    layouts: ['resizable'],
    whenUnavailable: NEEDS_RESIZABLE,
  }),
  setting('setting', ['Interface', 'Hotkeys close side panel'], {
    description: "Pressing the open panel's key again closes the Modern side panel.",
    keywords: ['hotkey', 'keybind', 'f keys', 'toggle', 'hide panel', 'close inventory'],
    layouts: ['resizable'],
    whenUnavailable: { reason: 'Requires the Resizable Modern layout.', route: TO_LAYOUT },
    needsKeyboard: true,
  }),
  setting('setting', ['Interface', 'Transparent chatbox'], {
    whenUnavailable: NEEDS_RESIZABLE,
    description: 'Shows the game through the chatbox background.',
    keywords: ['transparent chat', 'chat', 'chatbox', 'see through', 'opacity', 'chat background'],
    availability: 'Resizable layouts',
    layouts: ['resizable'],
  }),
  setting('setting', ['Interface', 'Click through transparent chatbox'], {
    whenUnavailable: {
      reason: 'Turn on Transparent chatbox to use this.',
      route: { label: 'Show Transparent chatbox', target: settingsSearchId('Interface', 'Transparent chatbox') },
    },
    description: 'Lets clicks on the transparent chatbox reach the game behind it.',
    keywords: ['click through', 'chat', 'chatbox', 'transparent chat', 'walk under chat'],
    availability: 'Resizable layouts, with Transparent chatbox on',
    layouts: ['resizable'],
  }),
  setting('section', ['Interface', 'Game window'], {
    whenUnavailable: DESKTOP_ONLY,
    description: 'The size of the game view, and popping it out into its own window.',
    keywords: [
      'window',
      'window size',
      'screen size',
      'game size',
      'resolution',
      'viewport',
      'canvas size',
      'aspect ratio',
      'letterbox',
    ],
    availability: 'Desktop devices',
  }),
  setting('setting', ['Interface', 'Game window', 'Resolution'], {
    whenUnavailable: NEEDS_RESIZABLE,
    description: 'Fits the game to the window, or fixes it at a set size.',
    keywords: [
      'viewport',
      'viewport resolution',
      'screen size',
      'window size',
      'custom size',
      'width',
      'height',
      'fit window',
      'pixels',
      '1080p',
      '720p',
      '1920x1080',
      '765x503',
    ],
    availability: 'Resizable layouts',
    layouts: ['resizable'],
  }),
  setting('setting', ['Interface', 'Game window', 'Pop Out Game'], {
    whenUnavailable: DESKTOP_ONLY,
    description: 'Opens the game in a separate window.',
    keywords: [
      'popout',
      'pop out',
      'pop-out',
      'new window',
      'separate window',
      'own window',
      'second monitor',
      'dual monitor',
      'other screen',
      'detach',
      'stream',
      'obs',
    ],
    availability: 'Desktop devices',
  }),
  setting('section', ['Interface', 'Infobox appearance'], {
    description: 'Where infoboxes sit and how their text is drawn.',
    keywords: ['infobox', 'infoboxes', 'info box', 'buff bar', 'timers', 'boxes'],
  }),
  setting('setting', ['Interface', 'Infobox appearance', 'Position'], {
    resultTitle: 'Infobox position',
    description: 'Puts infoboxes above the inventory, above the chatbox, or anywhere.',
    keywords: [
      'infobox position',
      'move infoboxes',
      'above chatbox',
      'above inventory',
      'free',
      'drag infobox',
      'inventory',
      'chatbox',
    ],
  }),
  setting('setting', ['Interface', 'Infobox appearance', 'Text outline'], {
    resultTitle: 'Infobox text outline',
    description: 'Outlines infobox numbers so they stay readable.',
    keywords: ['outline', 'text border', 'text shadow', 'readability', 'legible', 'stroke'],
  }),
  setting('setting', ['Interface', 'Infobox appearance', 'Outline color'], {
    resultTitle: 'Infobox outline color',
    description: 'Sets the color of the infobox text outline.',
    keywords: ['outline colour', 'outline color', 'text colour', 'text color'],
    availability: 'With Text outline on',
    whenUnavailable: {
      reason: 'Turn on Text outline to use this.',
      route: {
        label: 'Show Text outline',
        target: settingsSearchId('Interface', 'Infobox appearance', 'Text outline'),
      },
    },
  }),
  setting('setting', ['Interface', 'Show Shortcut Hints'], {
    description: 'Shows pop-up tips that point out keyboard shortcuts.',
    keywords: ['hints', 'tips', 'toast', 'popups', 'notifications', 'shortcut tips', 'help'],
  }),

  // Mobile (titled Touch on touch devices outside the Mobile layout)
  setting('section', ['Mobile'], {
    whenUnavailable: NEEDS_TOUCH,
    description: "Touch controls and the Mobile layout's own options. Titled Touch outside Mobile.",
    keywords: ['touch', 'phone', 'tablet', 'ipad', 'iphone', 'android', 'touchscreen', 'mobile layout'],
    availability: 'Touch devices or the Mobile layout',
  }),
  setting('setting', ['Mobile', 'Long Tap Delay'], {
    whenUnavailable: NEEDS_TOUCH,
    description: 'How long to hold before a tap opens the menu.',
    keywords: ['long press', 'hold', 'tap and hold', 'press and hold', 'right click', 'touch delay'],
    availability: 'Touch devices or the Mobile layout',
  }),
  setting('setting', ['Mobile', 'Menu Row Height'], {
    whenUnavailable: NEEDS_TOUCH,
    description: 'Height of each row in menus opened by a long tap.',
    keywords: ['menu size', 'bigger menu', 'tap target', 'fat finger', 'context menu', 'right click menu'],
    availability: 'Touch devices or the Mobile layout',
  }),
  setting('setting', ['Mobile', 'Vibrate on long tap'], {
    whenUnavailable: NEEDS_TOUCH,
    description: 'Buzzes when a long tap opens the menu.',
    keywords: ['vibration', 'vibrate', 'haptics', 'haptic', 'buzz', 'rumble', 'feedback'],
    availability: 'Touch devices or the Mobile layout',
  }),
  setting('setting', ['Mobile', 'Interface scaling'], {
    resultTitle: 'Mobile interface scaling',
    whenUnavailable: NEEDS_MOBILE,
    description: "Sizes the Mobile layout's interface.",
    keywords: [
      'interface scaling',
      'ui size',
      'ui scale',
      'bigger interface',
      'smaller interface',
      'scale',
      'zoom interface',
    ],
    availability: 'Mobile layout',
    layouts: ['mobile'],
  }),
  setting('setting', ['Mobile', 'Hotkeys'], {
    resultTitle: 'Mobile hotkeys',
    whenUnavailable: NEEDS_MOBILE,
    description: 'Chooses what each Mobile hotkey slot opens.',
    keywords: ['hotkey', 'slot', 'quick buttons', 'buttons', 'side panel', 'tabs'],
    availability: 'Mobile layout',
    layouts: ['mobile'],
  }),
  setting('setting', ['Mobile', 'Hotkeys open side panels on the left'], {
    whenUnavailable: NEEDS_MOBILE,
    description: 'Opens panels from a hotkey on the left side of the screen.',
    keywords: ['left handed', 'left side', 'panel side'],
    availability: 'Mobile layout',
    layouts: ['mobile'],
  }),
  setting('setting', ['Mobile', 'Edit layout'], {
    whenUnavailable: NEEDS_MOBILE,
    description: 'Lets you move the overlays the Mobile layout locks in place.',
    keywords: ['overlay positions', 'move overlays', 'rearrange', 'reposition', 'drag overlays', 'customize layout'],
    availability: 'Mobile layout',
    layouts: ['mobile'],
  }),
];

const PLUGIN_ENTRIES: SearchEntry[] = [
  // Panel order: the encounter plugins first, then the general list.
  ...pillarAdditionsEntries('colosseumAdditions', 'Colosseum Additions', {
    scope: IN_COLOSSEUM,
    pillars: "the Colosseum's four pillars",
    keywords: ['colosseum', 'colosseum pillars', 'sol heredit', 'fortis'],
  }),
  ...pillarAdditionsEntries('infernoAdditions', 'Inferno Additions', {
    scope: IN_INFERNO,
    pillars: "the Inferno's pillars",
    keywords: ['inferno', 'inferno pillars', 'rocky support', 'zuk'],
  }),
  plugin('tzhaarHpTracker', 'TzHaar HP Tracker', {
    ...IN_INFERNO_OR_COLOSSEUM,
    description: "Shows Inferno and Colosseum monsters' hitpoints over them, and marks them alive or dead.",
    keywords: [
      'tzhaar hp tracker',
      'inferno hp',
      'npc hp',
      'monster hp',
      'hitpoints',
      'health number',
      'dead npcs',
      'hide dead',
      'inferno',
      'colosseum',
    ],
  }),
  pluginOption('tzhaarHpTracker', 'TzHaar HP Tracker', 'Show HP', {
    ...IN_INFERNO_OR_COLOSSEUM,
    description: "Where each monster's hitpoints sit: above its health bar, at its center, at its feet, or off.",
    keywords: ['hp location', 'hp text', 'hitpoints number'],
  }),
  pluginOption('tzhaarHpTracker', 'TzHaar HP Tracker', 'Highlight style', {
    ...IN_INFERNO_OR_COLOSSEUM,
    description: 'Outlines each monster green while alive and red once dead: true tile, south-west tile or clickbox.',
    keywords: ['true tile', 'tile highlight', 'clickbox', 'alive dead colour', 'alive dead color', 'npc highlight'],
  }),
  pluginOption('tzhaarHpTracker', 'TzHaar HP Tracker', 'Dynamic HP color', {
    ...IN_INFERNO_OR_COLOSSEUM,
    description: 'Shades the hitpoints, the highlight or both from red to green by how much HP a monster has left.',
    keywords: [
      'dynamic colour',
      'dynamic color',
      'hp colour',
      'hp color',
      'health colour',
      'health color',
      'gradient',
      'red to green',
    ],
  }),
  pluginOption('tzhaarHpTracker', 'TzHaar HP Tracker', 'Recolor menu', {
    ...IN_INFERNO_OR_COLOSSEUM,
    description: "Colors a monster's name green or red in menus and hover text.",
    keywords: ['menu colour', 'menu color', 'name colour', 'name color', 'hover text', 'recolour menu', 'recolor menu'],
  }),
  pluginOption('tzhaarHpTracker', 'TzHaar HP Tracker', 'Hide dead NPCs', {
    ...IN_INFERNO_OR_COLOSSEUM,
    description: 'Stops drawing dead monsters, except the bosses and their healers.',
    keywords: ['hide dead', 'hide corpses', 'dead monsters'],
  }),

  plugin('setTimer', 'Zuk Set Timer', {
    whenUnavailable: DURING_ZUK,
    description: "Times Zuk's sets by hand.",
    keywords: ['zuk', 'set timer', 'inferno', 'tzkal zuk', 'timer', 'countdown', 'keybind', 'shortcut'],
    availability: 'During Zuk',
  }),
  pluginOption('setTimer', 'Zuk Set Timer', 'Shortcuts', {
    whenUnavailable: DURING_ZUK,
    resultTitle: 'Set timer shortcuts',
    description: 'The keys that advance, reset and reveal the set timer.',
    keywords: ['set timer keys', 'zuk timer keys', 'advance timer', 'reset timer', 'show actual', 'rebind'],
    availability: 'During Zuk',
  }),

  plugin('antiDrag', 'Anti Drag', {
    description: 'Holds an inventory item for a moment before it starts dragging, so a click does not become a drag.',
    keywords: ['drag', 'misclick', 'accidental drag', 'drag delay', 'inventory drag', 'antidrag', 'shift drag'],
  }),
  pluginOption('antiDrag', 'Anti Drag', 'Require Shift to drag', {
    description: 'Items only drag while Shift is held, instead of after a delay.',
    keywords: ['shift drag', 'hold shift'],
  }),
  pluginOption('antiDrag', 'Anti Drag', 'Ctrl to drag immediately', {
    description: 'Holding Ctrl skips the drag delay.',
    keywords: ['control', 'ctrl drag', 'instant drag'],
  }),
  pluginOption('antiDrag', 'Anti Drag', 'Drag delay', {
    description: 'How long to hold an item before it drags, in milliseconds.',
    keywords: ['drag time', 'ms'],
  }),

  plugin('attackTimerMetronome', 'Attack Timer Metronome', {
    description: 'Counts down the ticks until your next attack, as a bar and optionally a number above your head.',
    keywords: [
      'attack timer',
      'attack cycle',
      'attack speed',
      'weapon speed',
      'cooldown',
      'overhead timer',
      'attack bar',
      'tick timer',
      'attack counter',
      'font size',
      'offset',
    ],
  }),
  pluginOption('attackTimerMetronome', 'Attack Timer Metronome', 'Show Attack Bar', {
    description: 'The countdown bar below your health bar.',
    keywords: ['cooldown bar', 'attack timer bar'],
  }),
  pluginOption('attackTimerMetronome', 'Attack Timer Metronome', 'Show Attack Cooldown Ticks', {
    description: 'The ticks left as a number above your head, with its own position and font size.',
    keywords: ['overhead timer', 'overhead number', 'attack cycle', 'font size', 'offset', 'above head'],
  }),

  plugin('bossHealthBar', 'Boss Health Bar', {
    description: 'A movable OSRS-style boss health bar.',
    keywords: ['hp bar', 'health bar', 'boss hp', 'boss health', 'hitpoints', 'life bar'],
  }),
  pluginOption('bossHealthBar', 'Boss Health Bar', 'Show boss name', {
    keywords: ['name', 'boss name'],
  }),
  pluginOption('bossHealthBar', 'Boss Health Bar', 'Show hitpoints', {
    resultTitle: 'Show boss hitpoints',
    keywords: ['hp', 'hp numbers', 'health numbers', 'values'],
  }),
  pluginOption('bossHealthBar', 'Boss Health Bar', 'Show percentage', {
    resultTitle: 'Show hitpoint percentage',
    keywords: ['percent', 'hp percent'],
  }),

  plugin('camera', 'Camera', {
    description: 'Modeled on the RuneLite camera plugin: zoom and pitch limits, camera speed, inverted controls.',
    keywords: [
      'invert camera',
      'camera speed',
      'zoom',
      'zoom limit',
      'zoom out',
      'pitch',
      'yaw',
      'rotate',
      'look around',
      'vertical camera',
      'middle mouse',
      'sensitivity',
      // The Zoom group's bare "Speed" row has no entry of its own: on its own it outranked
      // Playback Speed for "speed".
      'zoom speed',
      'scroll speed',
      'zoom increment',
    ],
  }),
  pluginOption(
    'camera',
    'Camera',
    'Expand pitch limit',
    {
      description: 'Lets the camera tilt further up and down.',
      keywords: ['vertical camera', 'camera angle', 'look up', 'top down', 'pitch'],
    },
    'Rotate',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Invert yaw',
    {
      description: 'Reverses left and right camera rotation.',
      keywords: ['invert camera', 'reverse camera', 'invert horizontal', 'left right'],
    },
    'Rotate',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Invert pitch',
    {
      description: 'Reverses up and down camera rotation.',
      keywords: ['invert camera', 'reverse camera', 'invert vertical', 'invert y', 'up down'],
    },
    'Rotate',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Right-click moves camera',
    {
      description: 'Dragging with the right mouse button rotates the camera.',
      keywords: ['right click drag', 'mouse camera', 'rotate with mouse'],
    },
    'Rotate',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Keyboard speed',
    {
      resultTitle: 'Camera keyboard speed',
      description: 'How fast the arrow keys rotate the camera.',
      keywords: ['camera speed', 'arrow keys', 'rotate speed', 'rotation speed'],
    },
    'Rotate',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Mouse speed',
    {
      resultTitle: 'Camera mouse speed',
      description: 'How fast dragging rotates the camera.',
      keywords: ['camera speed', 'drag speed', 'sensitivity', 'mouse sensitivity', 'middle mouse'],
    },
    'Rotate',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Inner limit',
    {
      resultTitle: 'Zoom inner limit',
      description: 'How far the camera can zoom in.',
      keywords: ['zoom in', 'zoom limit', 'zoom in limit', 'min zoom'],
    },
    'Zoom',
  ),
  pluginOption(
    'camera',
    'Camera',
    'Outer limit',
    {
      resultTitle: 'Zoom outer limit',
      description: 'How far the camera can zoom out.',
      keywords: ['zoom out', 'zoom limit', 'zoom out limit', 'max zoom', 'zoom further'],
    },
    'Zoom',
  ),

  plugin('compactOrbs', 'Compact Orbs', {
    description: 'Hides the minimap and packs the hitpoints, prayer, run and special attack orbs into a block.',
    keywords: [
      'orbs',
      'minimap',
      'hide minimap',
      'orb layout',
      'orb order',
      'hp orb',
      'prayer orb',
      'run orb',
      'spec orb',
      'special attack orb',
      'vertical',
      'horizontal',
    ],
    availability: 'Resizable layouts',
  }),
  pluginOption('compactOrbs', 'Compact Orbs', 'Orb order', {
    whenUnavailable: NEEDS_RESIZABLE,
    resultTitle: 'Compact orb order',
    description: 'Reorders the orbs in the compact block.',
    keywords: ['reorder orbs', 'swap orbs', 'move orbs', 'orb position', 'rearrange orbs'],
    availability: 'Resizable layouts',
    layouts: ['resizable'],
  }),

  plugin('customMenuSwaps', 'Custom Menu Swaps', {
    description: 'Changes which option a left click takes, one option,target rule per line.',
    keywords: [
      'menu entry swapper',
      'mes',
      'left click',
      'left click option',
      'swap option',
      'default option',
      'menu swap',
      'menu swapper',
      'attack option',
      'walk here',
      'right click menu',
      'click priority',
    ],
  }),

  plugin('dpsOverlay', 'DPS Overlay', {
    description: 'A movable panel showing the theoretical DPS of your current attack against your target.',
    keywords: ['dps', 'damage', 'damage per second', 'dps calc', 'dps calculator', 'max hit', 'accuracy'],
  }),
  pluginOption('dpsOverlay', 'DPS Overlay', 'Detailed DPS', {
    description: 'Adds accuracy, max hit, and the attack and defence rolls behind the DPS.',
    keywords: ['max hit', 'accuracy', 'hit chance', 'attack roll', 'defence roll', 'defense roll'],
  }),

  plugin('entityHider', 'Entity Hider', {
    description: 'Stops drawing chosen NPCs, projectiles or your own character, models or 2D overlays.',
    keywords: [
      'hide npcs',
      'hide monsters',
      'hide player',
      'hide myself',
      'hide projectiles',
      'hide dead',
      'hide attackers',
      'invisible',
      'declutter',
      'entity hider',
    ],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide local player', {
    description: 'Stops drawing your own character.',
    keywords: ['hide myself', 'hide self', 'hide player', 'invisible'],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide local player 2D', {
    description: 'Hides your own health bar, hitsplats and overhead prayer.',
    keywords: ['hide hitsplats', 'hide health bar', 'hide overhead prayer', 'my hitsplats'],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide NPCs', {
    description: 'Stops drawing NPC models. They cannot be clicked while hidden.',
    keywords: ['hide monsters', 'hide npc models', 'invisible npcs'],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide NPCs 2D', {
    description: 'Hides NPC health bars, hitsplats, overhead text and highlights.',
    keywords: ['hide hitsplats', 'hide health bars', 'hide hp bars', 'npc overlays'],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide attackers', {
    description: 'Hides the NPCs targeting you, in the layers the NPC options cover when either is on.',
    keywords: ['hide attackers', 'attacking npcs', 'npcs fighting me'],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide projectiles', {
    description: "Stops drawing projectiles in flight, yours and the NPCs'.",
    keywords: ['hide projectiles', 'hide arrows', 'hide spells', 'missiles'],
  }),
  pluginOption('entityHider', 'Entity Hider', 'Hide dead NPCs', {
    description: 'Stops drawing an NPC from the tick it dies, death animation included.',
    keywords: ['hide dead', 'hide corpses', 'death animation', 'dying npcs'],
  }),

  plugin('instantInventory', 'Instant Inventory', {
    description: 'Shows inventory and equipment changes straight away.',
    keywords: ['gear swap', 'item swap', 'instant swap', 'switches', 'responsive', 'inventory delay'],
  }),
  pluginOption('instantInventory', 'Instant Inventory', 'Instant prayer', {
    description: 'Clears conflicting prayer highlights at once instead of on the next tick.',
    keywords: ['prayer switch', 'prayer swap', 'prayer delay'],
  }),

  plugin('inventoryTags', 'Inventory Tags', {
    description: 'Outlines tagged inventory items in color.',
    keywords: ['item tags', 'tag items', 'highlight items', 'item outline', 'inventory highlight', 'gear tags'],
  }),
  pluginOption('inventoryTags', 'Inventory Tags', 'Tagged Items', {
    description: 'How many items are tagged, and Clear All to remove every tag.',
    keywords: ['clear tags', 'remove tags', 'untag', 'delete tags', 'reset tags'],
  }),

  plugin('lineMarkers', 'Line Markers', {
    description: 'Marks lines along tile edges.',
    keywords: ['lines', 'line', 'tile edge', 'tile border', 'presets', 'safespot'],
  }),
  pluginOption('lineMarkers', 'Line Markers', 'Presets', {
    resultTitle: 'Line marker presets',
    description: 'Ready-made lines for the current encounter, each with a switch.',
    keywords: ['line presets', 'encounter lines', 'safespot lines', 'premade lines'],
    availability: 'Encounters with presets',
    whenUnavailable: { reason: 'Available in encounters that have presets.' },
  }),
  pluginOption('lineMarkers', 'Line Markers', 'Your Lines', {
    resultTitle: 'Your line markers',
    description: 'The lines you have marked, to remove one by one or clear all.',
    keywords: ['my lines', 'remove line', 'clear lines', 'delete lines', 'marked lines'],
  }),
  pluginOption('lineMarkers', 'Line Markers', 'Show Labels', {
    resultTitle: 'Show line marker labels',
    keywords: ['labels', 'line labels', 'text'],
  }),
  pluginOption('lineMarkers', 'Line Markers', 'Line width', {
    resultTitle: 'Line marker width',
    keywords: ['thickness', 'line thickness', 'width'],
  }),

  plugin('npcHighlights', 'NPC Highlights', {
    description: 'Highlights chosen NPCs and their true tiles.',
    keywords: [
      'npc indicators',
      'highlight npc',
      'monster highlight',
      'boss highlight',
      'true tile',
      'npc tile',
      'outline npc',
      'hull',
    ],
  }),
  pluginOption('npcHighlights', 'NPC Highlights', 'Highlighted NPCs', {
    description: 'The NPCs you have highlighted and how, to remove one mode, one NPC or all.',
    keywords: ['remove highlight', 'clear highlights', 'unhighlight', 'delete highlight', 'highlighted monsters'],
  }),
  pluginOption('npcHighlights', 'NPC Highlights', 'Color menu and hover text', {
    description: "Colors a highlighted NPC's name in menus and hover text.",
    keywords: ['menu colour', 'menu color', 'name colour', 'name color', 'hover text', 'menu text'],
  }),

  plugin('prayer', 'Prayer', {
    description: 'Sweeps a line across the prayer orb once per game tick, as a flicking aid.',
    keywords: ['prayer flick', 'flicking', 'flick', 'pray flick', 'prayer orb', 'tick sweep', 'quick prayer'],
  }),
  pluginOption('prayer', 'Prayer', 'Pray flick on prayer orb', {
    keywords: ['prayer flick', 'flicking', 'orb sweep'],
  }),
  pluginOption('prayer', 'Prayer', 'Never hide pray flick', {
    description: 'Keeps the sweep showing while no prayer is active.',
    keywords: ['always show', 'always on', 'flicking'],
  }),

  plugin('prayerFlickHelper', 'Prayer Flick Helper', {
    description: 'Draws the last three game ticks as bars and marks where each prayer toggle landed in its tick.',
    keywords: ['prayer flick', 'flicking', 'flick', 'pray flick', '1 tick flick', 'lazy flick', 'prayer timing'],
  }),

  plugin('statusBars', 'Status Bars', {
    description: 'Hitpoints and prayer bars either side of the inventory panel.',
    keywords: ['hp bar', 'health bar', 'hitpoints bar', 'prayer bar', 'side bars'],
  }),
  pluginOption('statusBars', 'Status Bars', 'Show values', {
    resultTitle: 'Show hitpoint and prayer values',
    description: "Writes your current hitpoints and prayer under each bar's icon.",
    keywords: ['numbers', 'hp numbers', 'prayer points'],
  }),

  plugin('stretchedMode', 'Stretched Mode', {
    description: 'Scales the game interface.',
    keywords: ['interface scaling', ...INTERFACE_SCALE_WORDS],
  }),
  pluginOption('stretchedMode', 'Stretched Mode', 'UI scale', {
    whenUnavailable: NEEDS_RESIZABLE,
    description: 'Sizes the game panel, minimap and orbs.',
    keywords: ['ui size', 'interface size', 'bigger interface', 'zoom interface', 'alt scroll', 'percent'],
    availability: 'Resizable layouts',
    layouts: ['resizable'],
  }),
  pluginOption('stretchedMode', 'Stretched Mode', 'Fixed layout scale', {
    whenUnavailable: NEEDS_FIXED,
    description: 'Sizes the Fixed client by a multiple of 765 × 503, fits it to the window, or stretches it to fill.',
    keywords: [
      'fixed size',
      'fixed scale',
      'stretch fixed',
      'stretch to window',
      'stretched',
      'aspect ratio',
      '2x',
      'fit window',
      'bigger fixed',
      'ui size',
      'ui scale',
    ],
    availability: 'Fixed layout only',
    layouts: ['fixed'],
  }),
  pluginOption('stretchedMode', 'Stretched Mode', 'Integer scaling', {
    whenUnavailable: {
      reason: 'Choose Fit Window or Stretch to Window to use this.',
      route: { label: 'Show Fixed layout scale', target: pluginSearchId('stretchedMode', 'Fixed layout scale') },
    },
    description: 'Keeps Fit and Stretch to Window at whole-number multiples of the Fixed client.',
    keywords: ['integer scaling', 'whole number', 'pixel perfect', 'crisp', 'sharp', 'stretch'],
    availability: 'Fixed layout, with Fit or Stretch to Window',
    layouts: ['fixed'],
  }),
  pluginOption('stretchedMode', 'Stretched Mode', 'Auto-size interface and overlays', {
    description: 'Makes the menus, replay bar, panels and plugin overlays larger on bigger screens.',
    keywords: ['overlay size', 'auto scale', 'bigger overlays', 'menu size', 'replay bar', 'high dpi'],
  }),

  plugin('tickAudioMetronome', 'Tick Audio Metronome', {
    description: 'Plays a soft tick-tock on every game tick.',
    keywords: ['sound', 'volume', 'audio', 'tick sound', 'beep', 'click', 'tick tock', 'audio cue', 'metronome'],
  }),
  pluginOption('tickAudioMetronome', 'Tick Audio Metronome', 'Alternate tick and tock', {
    keywords: ['tick tock', 'tock', 'sound'],
  }),
  pluginOption('tickAudioMetronome', 'Tick Audio Metronome', 'Volume', {
    resultTitle: 'Metronome volume',
    description: 'Sets how loud the metronome ticks.',
    keywords: ['sound', 'audio', 'loudness', 'loud', 'quiet', 'mute'],
  }),

  plugin('tickCounter', 'Tick Counter', {
    description: 'Counts game ticks in a repeating cycle, in an infobox, above your head, or both.',
    keywords: [
      'tick count',
      'ticks',
      'game tick',
      'cycle',
      'overhead timer',
      'attack cycle',
      'tick timer',
      'font size',
      'offset',
    ],
  }),
  pluginOption('tickCounter', 'Tick Counter', 'Show Infobox', {
    resultTitle: 'Show tick counter infobox',
    keywords: ['infobox', 'info box'],
  }),
  pluginOption('tickCounter', 'Tick Counter', 'Show Above Head', {
    resultTitle: 'Show tick count above head',
    keywords: ['overhead', 'overhead timer', 'above player', 'font size', 'offset'],
  }),
  pluginOption('tickCounter', 'Tick Counter', 'Cycle Length', {
    resultTitle: 'Tick cycle length',
    description: 'How many ticks the count runs before it restarts.',
    keywords: ['cycle', 'max ticks', 'tick cycle', 'attack cycle'],
  }),
  pluginOption('tickCounter', 'Tick Counter', 'Colors', {
    resultTitle: 'Tick colors',
    description: 'A color for each tick of the cycle.',
    keywords: ['tick colours', 'tick colors', 'colour', 'color'],
  }),

  plugin('tileGrid', 'Tile Grid', {
    description: 'Draws a grid of tile lines on the ground, under your tile markers and outlines.',
    keywords: ['grid', 'tile grid', 'tiles', 'tile lines', 'gridlines', 'grid lines', 'checkerboard', 'count tiles'],
  }),
  pluginOption('tileGrid', 'Tile Grid', 'Color', {
    resultTitle: 'Tile grid color',
    keywords: ['grid colour', 'grid color', 'colour', 'color', 'line color'],
  }),
  pluginOption('tileGrid', 'Tile Grid', 'Opacity', {
    resultTitle: 'Tile grid opacity',
    keywords: ['transparency', 'transparent', 'faint', 'fade', 'alpha'],
  }),
  pluginOption('tileGrid', 'Tile Grid', 'Line width', {
    resultTitle: 'Tile grid line width',
    keywords: ['thickness', 'grid width', 'width'],
  }),

  plugin('tileIndicators', 'Tile Indicators', {
    description: 'Highlights your true tile, destination tile and hovered tile.',
    keywords: ['tile highlight', 'mark tile', 'true tile', 'destination tile', 'hover tile', 'current tile'],
  }),
  pluginOption('tileIndicators', 'Tile Indicators', 'True Tile', {
    description: 'Outlines the tile you are really on, with its own color, width and corners-only style.',
    keywords: ['current tile', 'player tile', 'corners only', 'width', 'colour', 'color'],
  }),
  pluginOption('tileIndicators', 'Tile Indicators', 'Hover Tile', {
    description: 'Outlines the tile under the mouse.',
    keywords: ['mouse tile', 'cursor tile', 'corners only', 'width', 'colour', 'color'],
  }),
  pluginOption('tileIndicators', 'Tile Indicators', 'Destination Tile', {
    description: 'Outlines the tile you are walking to.',
    keywords: ['target tile', 'walk tile', 'click tile', 'corners only', 'width', 'colour', 'color'],
  }),

  plugin('tileMarkers', 'Tile Markers', {
    description: 'Marks and labels tiles, like RuneLite ground markers.',
    keywords: [
      'ground markers',
      'ground marker',
      'tile marker',
      'mark tile',
      'tile highlight',
      'marked tiles',
      'presets',
      'import',
      'export',
      'safespot',
    ],
  }),
  pluginOption('tileMarkers', 'Tile Markers', 'Presets', {
    resultTitle: 'Tile marker presets',
    description: 'Ready-made tile markers for the current encounter, each with a switch and an export.',
    keywords: ['tile presets', 'encounter tiles', 'safespot tiles', 'premade markers', 'export preset'],
    availability: 'Encounters with presets',
    whenUnavailable: { reason: 'Available in encounters that have presets.' },
  }),
  pluginOption('tileMarkers', 'Tile Markers', 'Your Markers', {
    resultTitle: 'Your tile markers',
    description: 'The tiles you have marked, to remove, clear, or import and export as RuneLite ground markers.',
    keywords: ['my markers', 'remove marker', 'clear markers', 'delete markers', 'import', 'export', 'runelite import'],
  }),
  pluginOption('tileMarkers', 'Tile Markers', 'Show Labels', {
    resultTitle: 'Show tile marker labels',
    keywords: ['labels', 'tile labels', 'text'],
  }),
  pluginOption('tileMarkers', 'Tile Markers', 'Border width', {
    resultTitle: 'Tile marker border width',
    keywords: ['thickness', 'outline width', 'width'],
  }),

  plugin('xpDrops', 'XP Drops', {
    description: 'Shows XP drops as you fight, with optional skill icons and a predicted hit.',
    keywords: ['xp', 'exp', 'experience', 'xp drop', 'exp drop', 'damage drop', 'xp tracker'],
  }),
  pluginOption('xpDrops', 'XP Drops', 'Show predicted hit', {
    description: 'Shows the hit your XP drop implies.',
    keywords: ['hit prediction', 'damage', 'predicted damage', 'max hit'],
  }),
  pluginOption('xpDrops', 'XP Drops', 'Group XP drops', {
    keywords: ['combine', 'merge', 'grouped'],
  }),
  pluginOption('xpDrops', 'XP Drops', 'Show skill icons', {
    keywords: ['icons', 'skill icon'],
  }),
];

export const SETTINGS_SEARCH_ENTRIES: readonly SearchEntry[] = [...SETTINGS_ENTRIES, ...PLUGIN_ENTRIES];
