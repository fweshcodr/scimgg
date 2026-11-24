import { TUTORIAL_CLOSE_PANE_EVENT, TUTORIAL_HUD_OPENED_EVENT, TUTORIAL_QUICK_SEARCH_OPENED_EVENT } from '../events';
import { activePanelTabSelector, panelTabSelector, settingsButtonSelector } from '../targetSelectors';
import type { SpotlightStep, Tutorial } from '../types';
import { pluginsPanelSteps } from './plugins';

/**
 * Where the fight's stats and setup are shown: the desktop Practice pane, or the Mobile tool
 * window's Practice pane, which a step pointing at it holds open.
 */
const STATS_BODY = '[data-tutorial="practice-pane"], [data-tutorial="mobile-practice"]';

/**
 * The game panel, while the player can do what the step asks. Fixed and the Mobile layout pin it
 * (DraggablePanel's data-locked / data-scale-locked), and a step that cannot be finished is
 * skipped rather than shown.
 */
const MOVABLE_GAME_PANEL = '[data-tutorial="game-panel"]:not([data-locked])';
const RESIZABLE_GAME_PANEL = '[data-tutorial="game-panel"]:not([data-scale-locked])';

/** The Settings panel's close button, drawn as it looks. */
const CLOSE_GLYPH =
  '<span style="font-size:1.8em; color:var(--color-primary); font-family:\'RuneScape Bold 12\', sans-serif; text-shadow:1px 1px 0 #000; vertical-align:-0.15em">×</span>';

/** What Settings is for, against Plugins (whose step says what they are). */
const SETTINGS_SCOPE =
  'Settings controls how the simulator runs and looks: simulation, graphics, layout, theme and device.';

/** Index of the step that opens Plugins: where the Plugins panel step sends a resume that finds it closed. */
const PLUGINS_OPEN_STEP = 13;

const STEPS: SpotlightStep[] = [
  {
    kind: 'spotlight',
    element: '.grid-panel',
    popover: {
      title: 'The Main Lobby',
      description:
        'This is the Main Lobby, where you choose encounters.<br><br>' +
        '<b>Select an NPC</b> to open its encounter settings.',
      side: 'over',
      align: 'center',
    },
    category: 'navigation',
  },
  {
    kind: 'spotlight',
    element: MOVABLE_GAME_PANEL,
    popover: {
      title: 'Move the Game Panel',
      description:
        'This is your main interface: <b>Inventory</b>, <b>Prayer</b>, <b>Spellbook</b>, and more.<br><br>' +
        'Try dragging it to a spot that feels comfortable.',
      side: 'left',
      align: 'center',
    },
    category: 'combat',
    desktopOnly: true,
    skipIfMissing: true,
    action: {
      event: 'tutorial:panel-moved',
      waitingText: '<kbd class="kbd">Alt + Left-click</kbd> drag to move it around',
      completedText: 'Nice! <kbd class="kbd">Alt + Right-click</kbd> resets its position anytime.',
    },
  },
  {
    kind: 'spotlight',
    element: RESIZABLE_GAME_PANEL,
    popover: {
      title: 'Resize the Game Panel',
      description:
        'The game panel can be resized to fit your screen.<br><br>' +
        'Give it a try and find a size that feels comfortable.',
      side: 'left',
      align: 'center',
    },
    category: 'combat',
    desktopOnly: true,
    skipIfMissing: true,
    action: {
      event: 'tutorial:panel-resized',
      waitingText: '<kbd class="kbd">Alt + Scroll</kbd> to change the size',
      completedText: 'Nice! <kbd class="kbd">Alt + Middle-click</kbd> resets it to the default size.',
    },
  },
  {
    kind: 'spotlight',
    // The wrench itself: in Fixed and Classic the `tab-bar` target is only the upper tab row, and
    // the wrench sits in the lower one. On the Mobile layout's rail it can be folded away behind
    // "Show more", so the rail (which holds that button) stands in.
    element: () =>
      document.querySelector(panelTabSelector('settings')) ?? document.querySelector('[data-tutorial="tab-bar"]'),
    popover: {
      title: 'Keybinds & Audio',
      description: 'Open the <b>wrench tab</b> to review your <b>keybinds</b> and <b>audio</b> settings.',
      side: 'left',
      align: 'center',
    },
    category: 'settings',
    desktopOnly: true,
    action: {
      event: 'tutorial:tab-changed',
      waitingText: 'Click the <b>wrench icon</b> to open it',
      completedText: "Nice! Let's take a look.",
      autoAdvance: true,
      validate: (detail: unknown) => {
        if (detail === undefined) return !!document.querySelector(activePanelTabSelector('settings'));
        return (detail as { tab: string })?.tab === 'settings';
      },
    },
  },
  {
    kind: 'spotlight',
    element: () => document.querySelector('[data-tutorial="game-panel"]'),
    popover: {
      title: 'Keybinds & Audio',
      description:
        'This is where you can customize your <b>keybinds</b> and <b>audio</b> settings.<br><br>' +
        "We recommend setting up keybinds now. They'll make combat much smoother once you're in the arena.",
      side: 'left',
      align: 'center',
    },
    category: 'settings',
    desktopOnly: true,
    resumeGuard: { isReady: () => !!document.querySelector(activePanelTabSelector('settings')), fallbackStep: 3 },
  },
  {
    kind: 'spotlight',
    // What opens the stats: the desktop Practice launcher. The Mobile layout has no launcher row,
    // and its next step brings the Practice pane up by pointing into it. desktopOnly too, so a
    // touch device (always Mobile) does not count a step it never shows.
    element: '[data-tutorial="practice-launcher"]',
    popover: {
      title: 'Open the fight stats',
      description:
        'A quick snapshot of the fight: your damage, your max hit, the tick and both health bars.<br><br>' +
        'They are in <b>Practice</b>.',
      side: 'bottom',
      align: 'start',
    },
    category: 'combat',
    skipIfMissing: true,
    desktopOnly: true,
    action: {
      event: TUTORIAL_HUD_OPENED_EVENT,
      waitingText: 'Select the highlighted button to open it',
      completedText: "Nice! Let's take a look.",
      autoAdvance: true,
    },
  },
  {
    kind: 'spotlight',
    element: STATS_BODY,
    popover: {
      title: 'Fight stats and setup',
      // Practice opens on whichever tab the player last chose, so the copy names both and says
      // where the readouts are rather than switching tabs for them.
      description:
        'On desktop, <b>Practice</b> has two tabs: <b>Setup</b> and <b>Stats</b>. ' +
        '<b>Stats</b> shows your <b>DPS</b> (actual and expected), your <b>max hit</b>, ' +
        'the current <b>tick</b> and both health bars as the fight goes on.<br><br>' +
        "<b>Setup</b> sets the boss's health and phase, turns mechanics like fireballs and waves on or off, " +
        'and holds your aids. Turn mechanics off to practice one part of a fight at a time.<br><br>' +
        'On Mobile, the <b>Practice</b> tab holds the setup.',
      side: 'right',
      align: 'start',
    },
    category: 'combat',
    // The Mobile Practice tab is the setup alone; the boss bar and orbs show the fight.
    touch: {
      title: 'Practice setup',
      description:
        "The <b>Practice</b> tab sets the boss's health and phase, turns mechanics like fireballs and waves on or off, " +
        'and holds your aids. Tap <b>‹ Practice</b> at the top to see all groups, then choose the controls you need. ' +
        'Tap the selected tab or <b>Tools</b> to fold the panel away. <b>Tools</b> brings it back.',
    },
    resumeGuard: {
      isReady: () => !!document.querySelector(STATS_BODY),
      fallbackStep: 5,
    },
    // On desktop the Practice pane took the pinned menu's place: leaving this step closes it, so the
    // menu (with Training and its Exit) is back before the steps that point into it. A drawer jump
    // leaves the step, with the host committing the change, before it moves on, so a jump straight
    // into the menu finds it too.
    onExit: () => window.dispatchEvent(new CustomEvent(TUTORIAL_CLOSE_PANE_EVENT)),
  },
  {
    kind: 'spotlight',
    element: '[data-tutorial="minimap"]',
    popover: {
      title: 'Minimap',
      description:
        'This is the minimap. It shows the ground around you from above, centered on your position ' +
        'and rotating with the camera.<br><br>' +
        'In the Resizable layouts you can move and resize it, like the game panel.',
      side: 'left',
      align: 'start',
    },
    category: 'navigation',
    skipIfMissing: true,
    // Only the Mobile layout runs on a touch device, so the Resizable layouts' option is noise there.
    touch: {
      description:
        'This is the minimap. It shows the ground around you from above, centered on your position ' +
        'and rotating with the camera.',
    },
  },
  {
    kind: 'spotlight',
    popover: {
      title: 'Return to Lobby',
      description:
        'During an encounter, cast <b>Home Teleport</b> from the spellbook to return to the Main Lobby. ' +
        'Use it when you want to switch encounters or adjust your setup.',
    },
    category: 'navigation',
  },
  {
    kind: 'spotlight',
    // The menu's Settings row: the desktop Menu pane (the tour pins it open) or the Mobile Menu tab.
    element: settingsButtonSelector(),
    popover: {
      title: 'Open Main Settings',
      description: 'Open the main Settings panel to see what you can change.',
      side: 'right',
      align: 'start',
    },
    category: 'settings',
    skipIfMissing: true,
    action: {
      event: 'tutorial:settings-opened',
      waitingText: 'Select <b>Settings</b> to open it',
      completedText: "This is where the simulator's main settings live.",
      autoAdvance: true,
      validate: (detail: unknown) => detail !== undefined || !!document.querySelector('.controls-overlay.open'),
    },
  },
  {
    kind: 'spotlight',
    element: () => document.querySelector('.controls-overlay'),
    popover: {
      title: 'Settings',
      description:
        'Adjust <b>game speed</b>, <b>graphics</b> and <b>appearance</b> here. ' +
        'The <b>magnifier</b> at the top searches every setting and plugin.<br><br>' +
        'Your settings are saved locally in this browser.',
      side: 'left',
      align: 'start',
    },
    category: 'settings',
    resumeGuard: { isReady: () => !!document.querySelector('.controls-overlay.open'), fallbackStep: 9 },
  },
  {
    kind: 'spotlight',
    element: '[data-tutorial="interface-section"]',
    popover: {
      title: 'Customize Your Interface',
      description:
        `${SETTINGS_SCOPE}<br><br>` +
        'Expand <b>Interface</b> for the layout, its scaling and how infoboxes look. ' +
        'Under <b>Game window</b>, set the resolution to match your own game so the simulator looks like what you play on.',
      side: 'left',
      align: 'center',
    },
    category: 'settings',
    // No Game window: Controls hides it on phones and tablets (useIsMobileDevice), which are always
    // touch-only devices here (isTouchOnlyDevice includes the device check).
    touch: {
      description: `${SETTINGS_SCOPE}<br><br>Expand <b>Interface</b> for the layout, its scaling and how infoboxes look.`,
    },
    resumeGuard: { isReady: () => !!document.querySelector('.controls-overlay.open'), fallbackStep: 9 },
  },
  {
    kind: 'spotlight',
    element: () => document.querySelector('.controls-overlay'),
    popover: {
      title: 'Close Settings',
      description:
        'You can explore these options any time.<br><br>' +
        `When you're ready, close the Settings panel with the ${CLOSE_GLYPH} at its top, or press <kbd class="kbd">Esc</kbd>.`,
      side: 'left',
      align: 'center',
    },
    category: 'settings',
    skipIfMissing: true,
    touch: {
      description: `You can explore these options any time.<br><br>When you're ready, close the Settings panel with the ${CLOSE_GLYPH} at its top.`,
    },
    action: {
      event: 'tutorial:settings-closed',
      waitingText: 'Close <b>Settings</b> to continue',
      completedText: 'All closed up. Onward!',
      autoAdvance: true,
      validate: (detail: unknown) => detail !== undefined || !document.querySelector('.controls-overlay.open'),
    },
    resumeGuard: { isReady: () => !!document.querySelector('.controls-overlay.open'), fallbackStep: 13 },
  },
  ...pluginsPanelSteps(PLUGINS_OPEN_STEP, {
    open: 'Plugins are optional extras you turn on, each with its options in one place: tile markers, NPC highlights, tick counters, and more.',
    panel:
      'Turn each one on or off here; its caret opens its options.<br><br>' +
      'The <b>Plugins</b> tutorial in <b>Training</b> walks through each one.',
  }),
  {
    kind: 'spotlight',
    // No target: the shortcut works from anywhere. Placed after Plugins, which closes on its own
    // gate, so no resumeGuard index moves. The tour steps aside while the search is open (it is
    // aria-modal) and comes back on the next step when it closes.
    popover: {
      title: 'Quick Search',
      description:
        'Press <kbd class="kbd">Ctrl + K</kbd> anywhere to search encounters, settings, plugins and keybinds. ' +
        'Typos are fine.',
    },
    category: 'navigation',
    desktopOnly: true,
    action: {
      event: TUTORIAL_QUICK_SEARCH_OPENED_EVENT,
      waitingText: 'Press <kbd class="kbd">Ctrl + K</kbd> to try it',
      completedText: 'Nice!',
      autoAdvance: true,
    },
  },
  {
    kind: 'spotlight',
    element: '[data-tutorial="encounters-button"]',
    popover: {
      title: 'Switching Encounters',
      description:
        'Open <b>Encounters</b> to pick an encounter any time, or find one with <kbd class="kbd">Ctrl + K</kbd>.<br><br>' +
        'In the lobby you can also select an NPC directly.',
      side: 'right',
      align: 'start',
    },
    category: 'navigation',
    skipIfMissing: true,
    touch: {
      description:
        'Open <b>Encounters</b> to pick an encounter any time.<br><br>In the lobby you can also select an NPC directly.',
    },
  },
  {
    kind: 'spotlight',
    popover: {
      title: "You're All Set!",
      description:
        "You're ready to jump in. You can replay this guide from <b>Training</b> in the <b>Menu</b>, " +
        "and the <b>Advanced</b> tour is there when you're ready to dig deeper. Good luck in the arena!",
    },
    category: 'info',
  },
];

export const onboardingMainTutorial: Tutorial = {
  id: 'main',
  title: 'Getting Started',
  description:
    'The lobby, the game panel, the minimap, Practice, settings, and keybinds. ' +
    "Best place to start if you're new to the simulator.",
  slug: 'getting-started',
  surface: 'app',
  difficulty: 'beginner',
  estimatedDurationMin: 5,
  steps: STEPS,
};
