import type { SpotlightStep, Tutorial } from '../types';

/**
 * Kept in lockstep with PluginsPanel.tsx by plugins.test.ts: a new plugin row needs a matching step
 * here, in panel order.
 */

function pluginRow(name: string): () => Element | null {
  return () =>
    [...document.querySelectorAll('.plugins-overlay .plugin-row')].find(
      (row) => row.querySelector('.plugin-name')?.textContent === name,
    ) ?? null;
}

const pluginsPanelOpen = () => !!document.querySelector('.plugins-overlay.open');

/**
 * The Plugins button that opens the panel: desktop's, in the top chrome's right corner, or the
 * Mobile tool window's Menu entry. Null once the panel is open, so a step falls back to the panel:
 * desktop's button stays beside the open panel, but pressed it would close it again, and the Menu
 * entry stays in the docked window, out of sight.
 */
export function pluginsButton(): Element | null {
  if (pluginsPanelOpen()) return null;
  return (
    document.querySelector('.top-chrome__item:not([data-tucked="true"]) [data-tutorial="plugins-button"]') ??
    document.querySelector('.sidebar-nav--tools [data-tutorial="plugins-button"]')
  );
}

/**
 * What an open-Plugins step points at: the button, or the panel once it is open. Never the button
 * alone: a tour can start with the panel already open, and a step pointing only at the button then
 * reads as missing and is dropped, leaving the steps that fall back to it nowhere to go.
 */
function pluginsOpenTarget(): Element | null {
  return pluginsButton() ?? document.querySelector('.plugins-overlay');
}

/**
 * Getting Started and Advanced point at Plugins the way they point at Settings: one step opens the
 * panel, the next looks at it and waits for it to close. Without the second, opening Plugins from
 * the first left the spotlight on the button and the panel dimmed and inert behind the overlay.
 *
 * `openStep` is the opening step's index in the host tour: the panel step sends a resume, a jump
 * or Back there when it finds the panel closed.
 */
export function pluginsPanelSteps(openStep: number, copy: { open: string; panel: string }): SpotlightStep[] {
  return [
    {
      kind: 'spotlight',
      element: pluginsOpenTarget,
      popover: { title: 'Plugins', description: copy.open, side: 'left', align: 'start' },
      category: 'settings',
      skipIfMissing: true,
      action: {
        event: 'tutorial:plugins-opened',
        waitingText: 'Open <b>Plugins</b> to take a look',
        completedText: 'Here they are.',
        autoAdvance: true,
        validate: (detail: unknown) => detail !== undefined || pluginsPanelOpen(),
      },
    },
    {
      kind: 'spotlight',
      element: () => document.querySelector('.plugins-overlay'),
      popover: { title: 'The Plugins Panel', description: copy.panel, side: 'left', align: 'start' },
      category: 'settings',
      action: {
        event: 'tutorial:plugins-closed',
        waitingText: 'Close <b>Plugins</b> to continue',
        completedText: 'Onward!',
        autoAdvance: true,
        validate: (detail: unknown) => detail !== undefined || !pluginsPanelOpen(),
      },
      resumeGuard: { isReady: pluginsPanelOpen, fallbackStep: openStep },
    },
  ];
}

/** The event name must match TUTORIAL_PLUGIN_SETTINGS_EVENT in PluginsPanel.tsx. */
function dispatchPluginSettings(pluginKey: string, expanded: boolean): void {
  window.dispatchEvent(new CustomEvent('tutorial:plugin-settings', { detail: { pluginKey, expanded } }));
}

/** `settingsKey` is the PluginsPanel `expandedPlugins` key: the row's settings expand while the step is highlighted and collapse on leave. */
function pluginStep(name: string, description: string, settingsKey?: string): SpotlightStep {
  const step: SpotlightStep = {
    kind: 'spotlight',
    element: pluginRow(name),
    popover: {
      title: name,
      description,
      side: 'left',
      align: 'center',
    },
    category: 'settings',
    skipIfMissing: true,
    resumeGuard: { isReady: pluginsPanelOpen, fallbackStep: 0 },
  };
  if (settingsKey) {
    step.onEnter = () => dispatchPluginSettings(settingsKey, true);
    step.onExit = () => dispatchPluginSettings(settingsKey, false);
  }
  return step;
}

const STEPS: SpotlightStep[] = [
  {
    kind: 'spotlight',
    element: pluginsOpenTarget,
    popover: {
      title: 'Plugins',
      description:
        'Plugins add overlays and quality-of-life tools, modeled on RuneLite plugins.<br><br>' +
        "Open the panel and we'll walk through what each one does.",
      side: 'left',
      align: 'start',
    },
    category: 'settings',
    action: {
      event: 'tutorial:plugins-opened',
      waitingText: 'Open <b>Plugins</b> to continue',
      completedText: "Let's take a look inside.",
      autoAdvance: true,
      validate: (detail: unknown) => detail !== undefined || pluginsPanelOpen(),
    },
  },
  {
    kind: 'spotlight',
    element: () => document.querySelector('.plugins-overlay'),
    popover: {
      title: 'How Plugins Work',
      description:
        "Most plugins have a toggle to turn them on or off. A <b>caret</b> expands settings, including tools without a toggle. We'll open each one as we reach it, so feel free to change things as we go.<br><br>" +
        'Inside an encounter, any plugins made for it are listed first, under the encounter’s name.<br><br>' +
        'Everything saves automatically. The <b>magnifier</b> at the top searches every plugin and setting.',
      side: 'left',
      align: 'start',
    },
    category: 'settings',
    resumeGuard: { isReady: pluginsPanelOpen, fallbackStep: 0 },
    skipIfMissing: true,
  },
  // The loaded encounter's plugins lead the panel, then the general list; each group is alphabetical. Their rows
  // exist only in their encounters (data/encounterPlugins.ts), and the tour runs in the lobby, so
  // these steps are usually skipped.
  {
    ...pluginStep(
      'Colosseum Additions',
      'Marks the tiles the Colosseum’s four <b>pillars</b> stand on, and can stop drawing the pillars themselves. A hidden pillar still blocks your movement and line of sight.',
      'colosseumAdditions',
    ),
    conditional: true,
  },
  {
    ...pluginStep(
      'Inferno Additions',
      'Marks the tiles the Inferno’s <b>pillars</b> stand on, and can stop drawing the pillars themselves. A hidden pillar still blocks your movement and line of sight, and keeps its health bar.',
      'infernoAdditions',
    ),
    conditional: true,
  },
  {
    ...pluginStep(
      'TzHaar HP Tracker',
      'In the Inferno and the Colosseum, writes each monster’s <b>hitpoints</b> over it and can mark it green while alive and red once dead, in a highlight and in its menu. <b>Hide dead NPCs</b> stops drawing the dead, except Jad, Zuk and their healers.',
      'tzhaarHpTracker',
    ),
    conditional: true,
  },
  {
    ...pluginStep(
      'Zuk Set Timer',
      'Available during Zuk. Shows a manual set timer, with configurable shortcuts to advance, reset and reveal the actual countdown.',
      'setTimer',
    ),
    conditional: true,
    // Its controls are keyboard shortcuts.
    desktopOnly: true,
  },
  {
    ...pluginStep(
      'Anti Drag',
      'Holds an inventory item for a moment before it starts dragging, so a click does not become a drag. Hold Ctrl to drag immediately, or switch to requiring Shift instead of the delay.',
      'antiDrag',
    ),
    // Mouse drags only: a finger's drag starts once it moves (InventoryContent's touch drag).
    desktopOnly: true,
  },
  pluginStep(
    'Attack Timer Metronome',
    'A bar below your health bar that counts down the ticks until your next attack. <b>Show Attack Cooldown Ticks</b> adds the count as a number above your head, placed like the Tick Counter number and stacked with it when both are shown.',
    'attackTimerMetronome',
  ),
  {
    ...pluginStep(
      'Boss Health Bar',
      'A movable OSRS-style boss health bar, with optional name, hitpoints, and percentage display.',
      'bossHealthBar',
    ),
    // The Mobile layout keeps the client's own bar where it is; Edit layout frees only the aids.
    touch: { description: 'An OSRS-style boss health bar, with optional name, hitpoints, and percentage display.' },
  },
  pluginStep(
    'Camera',
    'Modeled on the RuneLite camera plugin. Expand the zoom and pitch limits, change camera speed, or invert yaw and pitch.',
    'camera',
  ),
  pluginStep(
    'Compact Orbs',
    'Hides the minimap and packs the hitpoints, prayer, run and special attack orbs into a compact block. Pick a vertical, horizontal or wide layout, and reorder the orbs. The Fixed and Mobile layouts keep their own orbs.',
    'compactOrbs',
  ),
  pluginStep(
    'Custom Menu Swaps',
    'Changes the default option, the one a left click or tap takes. Write one rule per line as <b>option,target</b>, with <b>*</b> as a wildcard: <b>attack,*</b> makes Attack the default, <b>walk here,,attack,*</b> makes it walk instead. Later lines win.',
    'customMenuSwaps',
  ),
  {
    ...pluginStep(
      'DPS Overlay',
      'A movable panel showing the theoretical DPS of your current attack against your target. Turn on <b>Detailed DPS</b> to add the <b>accuracy</b>, <b>max hit</b>, and attack and defence rolls behind it. Use <kbd class="kbd">Alt + Drag</kbd> to move it; on Mobile, use <b>Edit layout</b> in Settings.',
      'dpsOverlay',
    ),
    touch: {
      description:
        'A panel showing the theoretical DPS of your current attack against your target. Turn on <b>Detailed DPS</b> to add the <b>accuracy</b>, <b>max hit</b>, and attack and defence rolls behind it. To move it, use <b>Edit layout</b> in Settings.',
    },
  },
  pluginStep(
    'Entity Hider',
    'Stops drawing what you choose: NPCs, their <b>2D</b> health bars and hitsplats, projectiles, dead NPCs, or yourself. <b>Hide attackers</b> narrows the NPC options to the NPCs fighting you, as in RuneLite.',
    'entityHider',
  ),
  pluginStep(
    'Instant Inventory',
    'Shows inventory and equipment changes straight away. Purely visual: the action still happens on the next game tick, as usual. <b>Instant prayer</b> immediately clears conflicting prayer highlights instead of waiting for server receipt.',
    'instantInventory',
  ),
  // Tags, line markers and NPC highlights are made with Shift + right-click alone: a touch hold
  // opens the menu without shift, which leaves their entries out (contextMenuBuilders).
  {
    ...pluginStep(
      'Inventory Tags',
      '<kbd class="kbd">Shift + Right-click</kbd> an item to tag it with a colored outline.',
      'inventoryTags',
    ),
    desktopOnly: true,
  },
  {
    ...pluginStep(
      'Line Markers',
      '<kbd class="kbd">Shift + Right-click</kbd> to mark a line along the closest tile edge.',
      'lineMarkers',
    ),
    desktopOnly: true,
  },
  {
    ...pluginStep(
      'NPC Highlights',
      '<kbd class="kbd">Shift + Right-click</kbd> an NPC to highlight it, including <b>true tile</b> highlighting for bosses.',
      'npcHighlights',
    ),
    desktopOnly: true,
  },
  pluginStep(
    'Prayer',
    'Sweeps a line across the <b>prayer orb</b> once per game tick, tracing the orb as it goes. It hides while no prayer is active, unless you turn that off here.',
    'prayer',
  ),
  pluginStep(
    'Prayer Flick Helper',
    'Draws the last three game ticks as bars, newest at the top. Each prayer you toggle is marked where it landed inside its tick: <b>above</b> the line for a prayer going on, <b>below</b> it for one going off. With input lag configured, a trail runs back to where you toggled it.',
  ),
  pluginStep(
    'Status Bars',
    'Adds a hitpoints bar and a prayer bar either side of the inventory panel. The prayer bar brightens while a prayer is active, and <b>Show values</b> writes your current hitpoints and prayer under each icon.',
    'statusBars',
  ),
  {
    ...pluginStep(
      'Stretched Mode',
      '<b>UI scale</b> sizes the game panel, minimap and orbs; <kbd class="kbd">Alt + Scroll</kbd> over either changes it too. In the Fixed layout, <b>Fixed layout scale</b> sizes the whole client instead. <b>Auto-size interface and overlays</b> makes the menus, replay bar, panels and plugin overlays larger on bigger screens; untick it to keep them at 100%. Turn the plugin off for everything at 100%.',
      'stretchedMode',
    ),
    touch: {
      description:
        '<b>UI scale</b> sizes the game panel, minimap and orbs in the Resizable layouts, and <b>Fixed layout scale</b> sizes the Fixed client. The Mobile layout uses its own Interface scaling in Settings. <b>Auto-size interface and overlays</b> makes the menus, replay bar, panels and plugin overlays larger on bigger screens; untick it to keep them at 100%. Turn the plugin off for everything at 100%.',
    },
  },
  pluginStep(
    'Tick Audio Metronome',
    'Plays a soft tick-tock on every game tick; untick <b>Alternate tick and tock</b> for a plain tick. Its <b>Volume</b> is set separately and also follows the master volume.',
    'tickAudioMetronome',
  ),
  pluginStep(
    'Tick Counter',
    'Counts game ticks in a repeating cycle, four ticks long by default. Show it in an infobox, above your head, or both.',
    'tickCounter',
  ),
  pluginStep(
    'Tile Grid',
    'Draws a grid of tile lines on the ground so you can count tiles. It sits under your tile markers and outlines, and you can set its color, opacity and line width.',
    'tileGrid',
  ),
  {
    ...pluginStep(
      'Tile Indicators',
      'Highlights your <b>true tile</b>, destination tile, and hovered tile.',
      'tileIndicators',
    ),
    // A finger never hovers.
    touch: { description: 'Highlights your <b>true tile</b> and destination tile.' },
  },
  {
    ...pluginStep(
      'Tile Markers',
      '<kbd class="kbd">Shift + Right-click</kbd> a tile to mark or label it, like RuneLite ground markers. The settings also carry ready-made <b>presets</b> for the encounters that have them.',
      'tileMarkers',
    ),
    // Marking a tile needs Shift + right-click; the presets need neither.
    touch: {
      description:
        'Marks tiles on the ground, like RuneLite ground markers. The settings carry ready-made <b>presets</b> for the encounters that have them. Marking your own tiles needs a mouse and keyboard.',
    },
  },
  {
    ...pluginStep(
      'XP Drops',
      'Shows XP drops as you fight, with optional skill icons and a <b>predicted hit</b> readout. Use <kbd class="kbd">Alt + Drag</kbd> to move it anywhere. Mobile keeps it in its native place.',
      'xpDrops',
    ),
    touch: {
      description:
        'Shows XP drops as you fight, with optional skill icons and a <b>predicted hit</b> readout. The Mobile layout keeps it in its native place.',
    },
  },
  {
    kind: 'spotlight',
    element: () => document.querySelector('.plugins-overlay'),
    popover: {
      title: 'Close Plugins',
      description: "That's the tour. Close the panel when you're ready.",
      side: 'left',
      align: 'center',
    },
    category: 'settings',
    skipIfMissing: true,
    action: {
      event: 'tutorial:plugins-closed',
      waitingText: 'Close <b>Plugins</b> to continue',
      completedText: 'All set.',
      autoAdvance: true,
      validate: (detail: unknown) => detail !== undefined || !pluginsPanelOpen(),
    },
  },
  {
    kind: 'spotlight',
    popover: {
      title: 'Your Setup',
      description:
        'Enable or disable whatever you want. Plugin settings are saved.<br><br>' +
        'You can revisit this tour any time from <b>Training</b> in the <b>Menu</b>.',
    },
    category: 'info',
  },
];

// Compute the forward-skip index so inserting plugin steps cannot break it.
const closeStep = STEPS[STEPS.length - 2];
if (closeStep) closeStep.resumeGuard = { isReady: pluginsPanelOpen, fallbackStep: STEPS.length - 1 };

export const pluginsTutorial: Tutorial = {
  id: 'plugins',
  title: 'Plugins',
  description: 'A tour of the plugins in the Plugins panel and what each one does.',
  slug: 'plugins',
  surface: 'app',
  difficulty: 'beginner',
  estimatedDurationMin: 4,
  prerequisites: ['main'],
  steps: STEPS,
};
