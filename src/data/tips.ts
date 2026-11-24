/**
 * A loading-screen "Did you know?" tip.
 *
 * `device` limits a tip to the input it describes: `'desktop'` for mouse and keyboard (shortcuts,
 * right-click, Alt gestures, layouts a touch device never gets) and `'touch'` for touch-only
 * devices. Without it the tip shows everywhere, so its wording must not assume either input.
 * "Touch-only" is `isTouchOnlyDevice` (util/mobileDetection): touchscreen laptops count as desktop.
 */
export interface Tip {
  readonly text: string;
  readonly device?: 'desktop' | 'touch';
}

export const TIPS: readonly Tip[] = [
  { text: 'Press Ctrl+K to search for anything.', device: 'desktop' },
  { text: 'Use the magnifying glass in Settings or Plugins to search every option.' },
  {
    text: 'Hold Alt and drag to move the game panel, minimap and overlays. In Fixed, only the overlays move.',
    device: 'desktop',
  },
  { text: 'Hold Alt and scroll over a movable panel to resize it.', device: 'desktop' },
  { text: "Hold Alt and Right-click to reset a panel's position to default.", device: 'desktop' },
  { text: "Hold Alt and Middle-click to reset a panel's size to default.", device: 'desktop' },
  { text: 'Open an encounter straight from its URL, for example /yama.' },
  { text: "Change your panel and camera keys in the game panel's wrench tab, under Keybindings.", device: 'desktop' },
  { text: 'Use WASD to rotate and tilt the camera, or press F10 to switch to the free camera.', device: 'desktop' },
  { text: 'Right-click NPCs, tiles and items for more options.', device: 'desktop' },
  { text: 'Long tap NPCs, tiles and items for more options.', device: 'touch' },
  { text: 'Shift+Right-click a tile to mark, label or color it.', device: 'desktop' },
  { text: 'Some encounters have tile marker presets. Turn them on in Plugins > Tile Markers.' },
  { text: 'After a fight, open Replay to step through it tick by tick.' },
  { text: 'Open Settings from the Menu to change playback speed, graphics and the interface.' },
  { text: 'Turn on extras like tile markers, NPC highlights, tick counters and XP drops in Plugins.' },
  { text: 'In an encounter, open Practice to switch mechanics on or off. Infinite Health is under Practice aids.' },
  { text: 'New here? Training in the Menu has guided tours: Getting Started and Advanced Tools.' },
  { text: 'Pick a preset loadout when you set up an encounter, or save your own.' },
  { text: 'Ctrl+click a tile to flip run on or off for that one move.', device: 'desktop' },
  { text: 'In the lobby, select a portal or NPC to set up its encounter.' },
  { text: 'Press Esc to close the topmost window. With nothing open, it shows your inventory.', device: 'desktop' },
  { text: 'Use the Stretched Mode plugin to make the interface bigger or smaller.', device: 'desktop' },
  { text: 'In the Mobile layout, Settings > Mobile > Edit layout lets you move the overlays.', device: 'touch' },
  {
    text: "Set the game window to your own client's size in Settings > Interface > Game window.",
    device: 'desktop',
  },
];

/** The tips for this device: every tip without a `device`, plus its own. */
export function tipsForDevice(isTouchOnly: boolean): readonly Tip[] {
  const device = isTouchOnly ? 'touch' : 'desktop';
  return TIPS.filter((tip) => tip.device === undefined || tip.device === device);
}
