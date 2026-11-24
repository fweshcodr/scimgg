// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { TUTORIAL_QUICK_SEARCH_OPENED_EVENT } from '../../events';
import { filterSpotlightSteps } from '../../runtime/SpotlightRunner';
import type { SpotlightStep } from '../../types';
import { onboardingMainTutorial } from '../onboarding-main';

function step(title: string): SpotlightStep {
  const found = onboardingMainTutorial.steps.find(
    (candidate): candidate is SpotlightStep => candidate.kind === 'spotlight' && candidate.popover.title === title,
  );
  if (!found) throw new Error(`no "${title}" step`);
  return found;
}

const target = (title: string): Element | null => {
  const { element } = step(title);
  if (typeof element === 'function') return element();
  return element ? document.querySelector(element) : null;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('onboardingMainTutorial — targets in either layout', () => {
  it('points "Plugins" at the Menu entry in Mobile, and the top chrome button on desktop', () => {
    document.body.innerHTML =
      '<nav class="sidebar-nav sidebar-nav--tools"><button class="controls-toggle-open">Settings</button>' +
      '<button class="controls-toggle-open" data-tutorial="plugins-button">Plugins</button></nav>';
    expect(target('Plugins')?.getAttribute('data-tutorial')).toBe('plugins-button');
    document.body.innerHTML =
      '<div class="top-chrome__item" data-tucked="false"><button class="launcher-btn" data-tutorial="plugins-button">Plugins</button></div>';
    expect(target('Plugins')?.closest('.top-chrome__item')).not.toBeNull();
  });

  it('points "Open Main Settings" at the menu\'s Settings row, desktop or Mobile, never a hidden one', () => {
    const pane = (tucked: boolean) =>
      `<div class="top-chrome__item launcher-pane" data-tucked="${tucked}"><div class="launcher-menu"><button data-menu-item="settings">Settings</button></div></div>`;
    document.body.innerHTML = pane(false);
    expect(target('Open Main Settings')?.textContent).toBe('Settings');
    document.body.innerHTML = pane(true);
    expect(target('Open Main Settings')).toBeNull();
    const entries =
      '<button class="controls-toggle-open" data-tutorial="encounters-button">Encounters</button>' +
      '<button class="controls-toggle-open" data-menu-item="settings">Settings</button>';
    document.body.innerHTML = `<nav class="sidebar-nav sidebar-nav--tools">${entries}</nav>`;
    expect(target('Open Main Settings')?.textContent).toBe('Settings');
    document.body.innerHTML = `<nav class="sidebar-nav sidebar-nav--tools sidebar-nav--tucked">${entries}</nav>`;
    expect(target('Open Main Settings')).toBeNull();
  });

  it('points "Open the fight stats" at the Practice launcher, which only desktop has', () => {
    document.body.innerHTML = '<button class="launcher-btn" data-tutorial="practice-launcher">Practice</button>';
    expect(target('Open the fight stats')?.textContent).toBe('Practice');
    // The Mobile layout has no launcher, and its next step opens Practice by pointing into it.
    document.body.innerHTML = '<button class="osm-tools__tab" data-tool-tab="practice">Practice</button>';
    expect(target('Open the fight stats')).toBeNull();
    expect(step('Open the fight stats').desktopOnly).toBe(true);
  });

  it('points "Fight stats and setup" at the Practice pane, never at the button that opens it', () => {
    // Desktop: the Practice pane, with its launcher beside it.
    document.body.innerHTML =
      '<button data-tutorial="practice-launcher">Practice</button><div class="launcher-pane" data-tutorial="practice-pane"></div>';
    expect(target('Fight stats and setup')).toBe(document.querySelector('.launcher-pane'));
    // Mobile: the tool window's Practice pane, mounted (hidden) while another tab shows.
    document.body.innerHTML =
      '<div class="osm-tools__pane osm-tools__pane--practice" data-tutorial="mobile-practice" hidden></div>' +
      '<button class="osm-tools__tab" data-tool-tab="practice">Practice</button>';
    expect(target('Fight stats and setup')).toBe(document.querySelector('.osm-tools__pane--practice'));
    expect(step('Fight stats and setup').resumeGuard?.isReady()).toBe(true);
    // Its touch copy names the setup alone: Mobile has no Stats.
    expect(step('Fight stats and setup').touch?.title).toBe('Practice setup');
    expect(step('Fight stats and setup').touch?.description).not.toMatch(/HUD|DPS|max hit/);
  });

  it('keeps the Mobile tool-window navigation out of the desktop "Fight stats and setup" copy', () => {
    const { popover, touch } = step('Fight stats and setup');
    expect(popover.description).not.toMatch(/‹ Practice|Tools|HUD/);
    expect(touch?.description).toMatch(/‹ Practice/);
    expect(touch?.description).toMatch(/<b>Tools<\/b>/);
  });

  it('skips moving and resizing the game panel where the layout pins it', () => {
    // Classic and Modern: free to move and resize.
    document.body.innerHTML = '<div data-tutorial="game-panel"></div>';
    expect(target('Move the Game Panel')).not.toBeNull();
    expect(target('Resize the Game Panel')).not.toBeNull();
    // Fixed and the Mobile layout: pinned, so neither step can be finished.
    document.body.innerHTML = '<div data-tutorial="game-panel" data-locked="true" data-scale-locked="true"></div>';
    expect(target('Move the Game Panel')).toBeNull();
    expect(target('Resize the Game Panel')).toBeNull();
    // A panel that moves but cannot be resized keeps only the move step.
    document.body.innerHTML = '<div data-tutorial="game-panel" data-scale-locked="true"></div>';
    expect(target('Move the Game Panel')).not.toBeNull();
    expect(target('Resize the Game Panel')).toBeNull();
    // Skipped, never shown with a target the player cannot act on.
    expect(step('Move the Game Panel').skipIfMissing).toBe(true);
    expect(step('Resize the Game Panel').skipIfMissing).toBe(true);
  });

  it('points "Keybinds & Audio" at the wrench in every layout, never a tab row without it', () => {
    // Fixed and Classic: `tab-bar` is the upper row; the wrench is in the lower one.
    document.body.innerHTML =
      '<div data-tutorial="game-panel"><div data-tutorial="tab-bar"><button data-tab="prayer"></button></div>' +
      '<div><button data-tab="settings"></button></div></div>';
    expect(target('Keybinds & Audio')).toBe(document.querySelector('[data-tab="settings"]'));
    // Modern: one bar holding every tab.
    document.body.innerHTML =
      '<div data-tutorial="tab-bar"><button data-tab="prayer"></button><button data-tab="settings"></button></div>';
    expect(target('Keybinds & Audio')).toBe(document.querySelector('[data-tab="settings"]'));
    // The Mobile rail with its right group folded away: the rail, which holds "Show more".
    document.body.innerHTML = '<div data-tutorial="tab-bar"><button aria-label="Show more"></button></div>';
    expect(target('Keybinds & Audio')).toBe(document.querySelector('[data-tutorial="tab-bar"]'));
  });

  it('does not send players to Settings for encounter mechanics, which live in Practice', () => {
    expect(step('Settings').popover.description).not.toMatch(/mechanics/i);
  });
});

describe('onboardingMainTutorial — Plugins, opened and spotlit like Settings', () => {
  const steps = onboardingMainTutorial.steps as SpotlightStep[];
  const indexOf = (title: string) => steps.findIndex((s) => s.popover.title === title);
  const openPanel = '<aside class="plugins-overlay open"></aside>';
  const closedPanel = '<aside class="plugins-overlay"></aside>';

  it('waits for Plugins to open, then spotlights the open panel rather than the button', () => {
    document.body.innerHTML = `<div class="top-chrome__item"><button data-tutorial="plugins-button"></button></div>${closedPanel}`;
    const open = step('Plugins');
    expect(open.action?.event).toBe('tutorial:plugins-opened');
    expect(open.action?.autoAdvance).toBe(true);
    expect(indexOf('The Plugins Panel')).toBe(indexOf('Plugins') + 1);

    document.body.innerHTML = `<div class="top-chrome__item"><button data-tutorial="plugins-button"></button></div>${openPanel}`;
    expect(target('The Plugins Panel')).toBe(document.querySelector('.plugins-overlay'));
  });

  it('holds the panel step until Plugins closes, and sends a resume with it closed back to opening it', () => {
    const panel = step('The Plugins Panel');
    expect(panel.action?.event).toBe('tutorial:plugins-closed');
    document.body.innerHTML = openPanel;
    expect(panel.action?.validate?.(undefined)).toBe(false);
    expect(panel.resumeGuard?.isReady()).toBe(true);
    document.body.innerHTML = closedPanel;
    expect(panel.action?.validate?.(undefined)).toBe(true);
    expect(panel.resumeGuard?.isReady()).toBe(false);
    expect(panel.resumeGuard?.fallbackStep).toBe(indexOf('Plugins'));
  });

  it('teaches Ctrl + K on desktop after Plugins, moving on once the quick search opens', () => {
    const quick = step('Quick Search');
    expect(indexOf('Quick Search')).toBe(indexOf('The Plugins Panel') + 1);
    expect(quick.desktopOnly).toBe(true);
    expect(quick.element).toBeUndefined();
    expect(quick.popover.description).toBe(
      'Press <kbd class="kbd">Ctrl + K</kbd> anywhere to search encounters, settings, plugins and keybinds. Typos are fine.',
    );
    expect(quick.action?.event).toBe(TUTORIAL_QUICK_SEARCH_OPENED_EVENT);
    expect(quick.action?.autoAdvance).toBe(true);
    expect(quick.action?.validate).toBeUndefined();
  });

  it('still forward-skips a closed Settings panel onto the Plugins step', () => {
    expect(step('Close Settings').resumeGuard?.fallbackStep).toBe(indexOf('Plugins'));
  });

  it('says what Settings is for and what Plugins are, so the two read apart', () => {
    expect(step('Customize Your Interface').popover.description).toMatch(
      /Settings controls how the simulator runs and looks: simulation, graphics, layout, theme and device\./,
    );
    expect(step('Customize Your Interface').touch?.description).toMatch(/^Settings controls how the simulator runs/);
    expect(step('Plugins').popover.description).toMatch(
      /optional extras you turn on, each with its options in one place/,
    );
  });
});

describe('onboardingMainTutorial — Customize Your Interface', () => {
  const interfaceStep = () => {
    document.body.innerHTML = '<div data-tutorial="interface-section"></div>';
    return (touch: boolean) =>
      filterSpotlightSteps([step('Customize Your Interface')], { isTouchOnly: touch }).filteredSteps[0]?.popover
        .description;
  };

  it('recommends matching the Game window resolution where Game window exists', () => {
    expect(interfaceStep()(false)).toMatch(/Under <b>Game window<\/b>, set the resolution to match your own game/);
  });

  it('leaves Game window out on phones and tablets, whose Settings hide it', () => {
    const touchCopy = interfaceStep()(true);
    expect(touchCopy).not.toMatch(/Game window/);
    expect(touchCopy).toMatch(/Expand <b>Interface<\/b>/);
  });
});
