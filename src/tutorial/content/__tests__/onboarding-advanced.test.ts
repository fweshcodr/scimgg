// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { TUTORIAL_REPLAY_ENTERED_EVENT } from '../../events';
import type { SpotlightStep } from '../../types';
import { onboardingAdvancedTutorial } from '../onboarding-advanced';

function step(title: string): SpotlightStep {
  const found = onboardingAdvancedTutorial.steps.find(
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

describe('onboardingAdvancedTutorial — targets in the Mobile layout', () => {
  it('points "Enter Replay" at the Replay tab, which is replay mode in Mobile', () => {
    document.body.innerHTML =
      '<button class="osm-tools__tab" data-tool-tab="practice">Practice</button>' +
      '<button class="osm-tools__tab" data-tool-tab="replay">Replay</button>';
    expect(target('Enter Replay')?.getAttribute('data-tool-tab')).toBe('replay');
  });

  it('points "Enter Replay" at the Replay launcher on desktop', () => {
    document.body.innerHTML = '<button class="launcher-btn" data-tutorial="replay-launcher">Replay</button>';
    expect(target('Enter Replay')).toBe(document.querySelector('[data-tutorial="replay-launcher"]'));
  });

  it('points "Replay Controls" at the transport\'s box, whose class the bar\'s More cannot rewrite', () => {
    document.body.innerHTML =
      '<div class="osm-tools__transport" data-tutorial="replay-controls"><div class="replay-bar"></div></div>';
    expect(target('Replay Controls')).toBe(document.querySelector('.osm-tools__transport'));
    expect(step('Replay Controls').resumeGuard?.isReady()).toBe(true);
  });

  it('sends Mobile to Exit through the labeled More button, not an ellipsis', () => {
    const { action, touch } = step('Replay Controls');
    expect(action?.waitingText).toContain('under <b>More</b> in the Mobile layout');
    expect(touch?.waitingText).toBe('Open <b>More</b>, then <b>Exit</b> to leave');
    expect(`${action?.waitingText}${touch?.waitingText}`).not.toContain('···');
  });

  it('points "Open Practice" at the Practice launcher, which only desktop has', () => {
    document.body.innerHTML = '<button class="launcher-btn" data-tutorial="practice-launcher">Practice</button>';
    expect(target('Open Practice')?.textContent).toBe('Practice');
    document.body.innerHTML = '<button class="osm-tools__tab" data-tool-tab="practice">Practice</button>';
    expect(target('Open Practice')).toBeNull();
    expect(step('Open Practice').skipIfMissing).toBe(true);
  });

  it('points "Mechanics & Aids" at Practice\'s setup, desktop pane or Mobile tab', () => {
    document.body.innerHTML =
      '<button data-tutorial="practice-launcher">Practice</button><div class="launcher-pane" data-tutorial="practice-pane"></div>';
    expect(target('Mechanics & Aids')).toBe(document.querySelector('.launcher-pane'));
    // Mobile: the Practice pane, mounted (hidden) while another tab shows; pointing there opens it.
    // The pane, not its controls, which a replay swaps for a note.
    document.body.innerHTML =
      '<div class="osm-tools__pane osm-tools__pane--practice" data-tutorial="mobile-practice" hidden></div>';
    expect(target('Mechanics & Aids')).toBe(document.querySelector('.osm-tools__pane--practice'));
    expect(step('Mechanics & Aids').resumeGuard?.isReady()).toBe(true);
    document.body.innerHTML = '';
    expect(step('Mechanics & Aids').resumeGuard?.isReady()).toBe(false);
  });

  it('points "Plugins" at the Menu entry in Mobile, and the top chrome button on desktop', () => {
    document.body.innerHTML =
      '<nav class="sidebar-nav sidebar-nav--tools"><button data-tutorial="plugins-button">Plugins</button></nav>';
    expect(target('Plugins')?.closest('.sidebar-nav--tools')).not.toBeNull();
    document.body.innerHTML =
      '<div class="top-chrome__item" data-tucked="false"><button data-tutorial="plugins-button">Plugins</button></div>';
    expect(target('Plugins')?.closest('.top-chrome__item')).not.toBeNull();
  });
});

describe('onboardingAdvancedTutorial — step order', () => {
  const spotlights = onboardingAdvancedTutorial.steps as SpotlightStep[];
  const indexOf = (title: string) => spotlights.findIndex((candidate) => candidate.popover.title === title);

  it('falls back from each guarded step to the step that puts its UI on screen', () => {
    expect(step('Replay Controls').resumeGuard?.fallbackStep).toBe(indexOf('Enter Replay'));
    expect(step('Mechanics & Aids').resumeGuard?.fallbackStep).toBe(indexOf('Open Practice'));
    expect(indexOf('Open Practice')).toBe(indexOf('Mechanics & Aids') - 1);
    expect(step('The Plugins Panel').resumeGuard?.fallbackStep).toBe(indexOf('Plugins'));
    expect(indexOf('Plugins')).toBe(indexOf('The Plugins Panel') - 1);
  });

  it('spotlights the Plugins panel once it opens, and waits for it to close', () => {
    expect(step('Plugins').action?.event).toBe('tutorial:plugins-opened');
    expect(step('The Plugins Panel').action?.event).toBe('tutorial:plugins-closed');
    document.body.innerHTML = '<aside class="plugins-overlay open"></aside>';
    expect(target('The Plugins Panel')).toBe(document.querySelector('.plugins-overlay'));
  });

  it('waits for the replay to be playing, not just requested, before pointing at its controls', () => {
    expect(step('Enter Replay').action?.event).toBe(TUTORIAL_REPLAY_ENTERED_EVENT);
  });

  it('takes no detour through Settings', () => {
    for (const candidate of spotlights) {
      const element = typeof candidate.element === 'string' ? candidate.element : String(candidate.element ?? '');
      expect(element, candidate.popover.title).not.toMatch(/controls-overlay|data-menu-item/);
      expect(candidate.action?.event ?? '', candidate.popover.title).not.toMatch(/settings-(opened|closed)/);
    }
  });
});
