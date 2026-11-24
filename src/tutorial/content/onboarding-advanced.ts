import { TUTORIAL_CLOSE_PANE_EVENT, TUTORIAL_HUD_OPENED_EVENT, TUTORIAL_REPLAY_ENTERED_EVENT } from '../events';
import { panelTabSelector } from '../targetSelectors';
import type { SpotlightStep, Tutorial } from '../types';
import { pluginsPanelSteps } from './plugins';

/**
 * Practice's setup: the desktop Practice pane (open on whichever tab the player last chose), or the
 * Mobile tool window's Practice pane, which a step pointing at it holds open.
 */
const PRACTICE_SETUP = '[data-tutorial="practice-pane"], [data-tutorial="mobile-practice"]';

const REPLAY_CONTROLS = '[data-tutorial="replay-controls"]';

/** Index of the step that opens Plugins: where the Plugins panel step sends a resume that finds it closed. */
const PLUGINS_OPEN_STEP = 6;

const STEPS: SpotlightStep[] = [
  {
    kind: 'spotlight',
    // The Replay launcher, or the Mobile tool window's Replay tab (choosing it plays back).
    element: () =>
      document.querySelector('[data-tutorial="replay-launcher"], .osm-tools__tab[data-tool-tab="replay"]') ??
      document.querySelector('.replay-bar'),
    popover: {
      title: 'Enter Replay',
      description: '<b>Replay</b> plays back your most recent fight. Open it to enter replay mode.',
      side: 'bottom',
      align: 'start',
    },
    category: 'combat',
    action: {
      event: TUTORIAL_REPLAY_ENTERED_EVENT,
      waitingText: 'Select <b>Replay</b> to enter replay mode',
      completedText: "You're in replay mode!",
      autoAdvance: true,
      validate: (detail: unknown) => detail !== undefined || !!document.querySelector('.replay-bar'),
    },
  },
  {
    kind: 'spotlight',
    // The transport's box (desktop dock or Mobile Replay tab), whose class stays put while the bar's
    // changes; a spotlit element losing Driver's class leaves its buttons unclickable.
    element: REPLAY_CONTROLS,
    popover: {
      title: 'Replay Controls',
      // Kept short: on a landscape phone, opening More grows the transport upwards, and a taller
      // popover no longer fits above it and drops over the Exit button it is asking for.
      description:
        'Step through the fight tick by tick, or play and scrub. ' +
        'Replays also show your recorded inputs and camera.',
      side: 'top',
      align: 'center',
    },
    category: 'combat',
    resumeGuard: { isReady: () => !!document.querySelector(REPLAY_CONTROLS), fallbackStep: 0 },
    action: {
      event: 'tutorial:replay-exited',
      waitingText: 'Press <kbd class="kbd">Esc</kbd> or <b>Exit</b> (under <b>More</b> in the Mobile layout) to leave',
      completedText: 'Back to the lobby.',
      autoAdvance: true,
    },
    // The Mobile Replay tab keeps Exit behind its labeled More button.
    touch: { waitingText: 'Open <b>More</b>, then <b>Exit</b> to leave' },
  },
  {
    kind: 'spotlight',
    element: panelTabSelector('prayer'),
    popover: {
      title: 'Prayer Filtering',
      description:
        'Right-click this <b>Prayer tab icon</b> to open the prayer filter.<br><br>' +
        "Hide prayers you don't use to keep the prayer book focused on what matters for the encounter.",
      side: 'top',
      align: 'center',
    },
    category: 'combat',
    skipIfMissing: true,
    // A touch hold opens the same menu (bindContextMenu).
    touch: {
      description:
        'Press and hold this <b>Prayer tab icon</b> to open the prayer filter.<br><br>' +
        "Hide prayers you don't use to keep the prayer book focused on what matters for the encounter.",
    },
  },
  {
    kind: 'spotlight',
    element: panelTabSelector('spellbook'),
    popover: {
      title: 'Spell Filtering & Reordering',
      description:
        'Right-clicking the <b>Prayer</b> or <b>Spellbook</b> tab icon opens the same menu, ' +
        'with toggles for both filtering and reordering. Give it a try after the tutorial.',
      side: 'top',
      align: 'center',
    },
    category: 'combat',
    skipIfMissing: true,
    touch: {
      description:
        'Pressing and holding the <b>Prayer</b> or <b>Spellbook</b> tab icon opens the same menu, ' +
        'with toggles for both filtering and reordering. Give it a try after the tutorial.',
    },
  },
  {
    kind: 'spotlight',
    // The launcher row is desktop chrome: the Mobile layout has none, and its next step brings the
    // Practice tab up by pointing into it. desktopOnly too, so a touch device (always Mobile) does
    // not count a step it never shows.
    element: '[data-tutorial="practice-launcher"]',
    popover: {
      title: 'Open Practice',
      description: 'Mechanics toggles and aids like <b>Infinite Health</b> are in <b>Practice</b>.',
      side: 'bottom',
      align: 'start',
    },
    category: 'combat',
    skipIfMissing: true,
    desktopOnly: true,
    action: {
      event: TUTORIAL_HUD_OPENED_EVENT,
      waitingText: 'Select <b>Practice</b> to open it',
      completedText: "Let's look at the setup.",
      autoAdvance: true,
      validate: (detail: unknown) => detail !== undefined || !!document.querySelector(PRACTICE_SETUP),
    },
  },
  {
    kind: 'spotlight',
    element: PRACTICE_SETUP,
    popover: {
      title: 'Mechanics & Aids',
      description:
        'In an encounter, <b>Practice</b> turns its mechanics on or off so you can practice one part of a fight at a time.<br><br>' +
        'Under <b>Practice aids</b>, <b>Infinite Health</b> lets you learn the patterns without dying.<br><br>' +
        'On desktop these are on the <b>Setup</b> tab; switch to it if <b>Stats</b> is showing.',
      side: 'right',
      align: 'start',
    },
    category: 'combat',
    resumeGuard: { isReady: () => !!document.querySelector(PRACTICE_SETUP), fallbackStep: 4 },
    // The Mobile Practice tab has no Stats tab to switch from.
    touch: {
      description:
        'In an encounter, <b>Practice</b> turns its mechanics on or off so you can practice one part of a fight at a time.<br><br>' +
        'Tap <b>‹ Practice</b> at the top, then choose <b>Practice aids</b>. ' +
        '<b>Infinite Health</b> lets you learn the patterns without dying.',
    },
    // Closing the desktop Practice pane puts back the menu the tour pins, as in Getting Started.
    onExit: () => window.dispatchEvent(new CustomEvent(TUTORIAL_CLOSE_PANE_EVENT)),
  },
  ...pluginsPanelSteps(PLUGINS_OPEN_STEP, {
    open: 'Plugins are optional extras you turn on, each with its options in one place: tile markers, NPC highlights, XP drops, and more.',
    panel: 'The <b>Plugins</b> tutorial in <b>Training</b> walks through each one.',
  }),
  {
    kind: 'spotlight',
    element: '.grid-panel',
    popover: {
      title: 'Quick Encounter Switch',
      description:
        'Press <kbd class="kbd">Ctrl + K</kbd> at any time and type an encounter, such as <b>zuk</b> or <b>inferno</b>.<br><br>' +
        'Choosing it opens it in <b>Encounters</b>, ready to set up or enter, without returning to the lobby.',
      side: 'over',
      align: 'center',
    },
    category: 'navigation',
    desktopOnly: true,
  },
  {
    kind: 'spotlight',
    popover: {
      title: "You're All Set!",
      description:
        'That covers the advanced tools. You can re-run any tutorial from <b>Training</b> in the <b>Menu</b>.<br><br>' +
        'Good luck in the arena.',
    },
    category: 'navigation',
  },
];

export const onboardingAdvancedTutorial: Tutorial = {
  id: 'advanced',
  title: 'Advanced',
  description: 'Replays, prayer filtering, spell reordering, and mechanics toggles.',
  slug: 'advanced',
  surface: 'app',
  difficulty: 'intermediate',
  estimatedDurationMin: 6,
  prerequisites: ['main'],
  steps: STEPS,
};
