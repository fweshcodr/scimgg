// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { onboardingAdvancedTutorial } from '../content/onboarding-advanced';
import { onboardingMainTutorial } from '../content/onboarding-main';
import { pluginsTutorial } from '../content/plugins';
import { filterSpotlightSteps } from '../runtime/SpotlightRunner';
import type { SpotlightStep } from '../types';

function step(overrides: Partial<SpotlightStep>): SpotlightStep {
  return {
    kind: 'spotlight',
    popover: { title: 'test', description: 'test' },
    ...overrides,
  };
}

describe('filterSpotlightSteps — input-capability fork', () => {
  it('is a no-op on devices with a fine pointer even when steps are flagged desktopOnly', () => {
    const steps: SpotlightStep[] = [
      step({ popover: { title: 'A', description: '' } }),
      step({ popover: { title: 'B', description: '' }, desktopOnly: true }),
      step({ popover: { title: 'C', description: '' } }),
    ];

    const result = filterSpotlightSteps(steps, { isTouchOnly: false });

    expect(result.filteredSteps).toHaveLength(3);
    expect(result.filteredToOriginal).toEqual([0, 1, 2]);
    expect(result.originalToFiltered.get(0)).toBe(0);
    expect(result.originalToFiltered.get(1)).toBe(1);
    expect(result.originalToFiltered.get(2)).toBe(2);
  });

  it('drops desktopOnly steps on touch-only devices', () => {
    const steps: SpotlightStep[] = [
      step({ popover: { title: 'A', description: '' } }),
      step({ popover: { title: 'B', description: '' }, desktopOnly: true }),
      step({ popover: { title: 'C', description: '' } }),
      step({ popover: { title: 'D', description: '' }, desktopOnly: true }),
    ];

    const result = filterSpotlightSteps(steps, { isTouchOnly: true });

    expect(result.filteredSteps).toHaveLength(2);
    expect(result.filteredSteps.map((s: SpotlightStep) => s.popover.title)).toEqual(['A', 'C']);
    expect(result.filteredToOriginal).toEqual([0, 2]);
    expect(result.originalToFiltered.get(0)).toBe(0);
    expect(result.originalToFiltered.has(1)).toBe(false);
    expect(result.originalToFiltered.get(2)).toBe(1);
    expect(result.originalToFiltered.has(3)).toBe(false);
  });

  it('omitting options defaults to pointer-capable (no filter) behavior', () => {
    const steps: SpotlightStep[] = [step({ popover: { title: 'A', description: '' }, desktopOnly: true })];
    const result = filterSpotlightSteps(steps);
    expect(result.filteredSteps).toHaveLength(1);
  });
});

describe('filterSpotlightSteps — skipIfMissing composition', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps steps whose element selector resolves', () => {
    document.body.innerHTML = '<div id="here"></div>';
    const steps: SpotlightStep[] = [
      step({ element: '#here', skipIfMissing: true, popover: { title: 'A', description: '' } }),
    ];
    const result = filterSpotlightSteps(steps);
    expect(result.filteredSteps).toHaveLength(1);
  });

  it('drops steps whose element selector is absent from the DOM', () => {
    const steps: SpotlightStep[] = [
      step({ element: '#missing', skipIfMissing: true, popover: { title: 'A', description: '' } }),
    ];
    const result = filterSpotlightSteps(steps);
    expect(result.filteredSteps).toHaveLength(0);
  });

  it('drops a step when both filters match (touch-only AND missing element)', () => {
    const steps: SpotlightStep[] = [
      step({
        element: '#missing',
        skipIfMissing: true,
        desktopOnly: true,
        popover: { title: 'A', description: '' },
      }),
      step({ popover: { title: 'B', description: '' } }),
    ];
    const result = filterSpotlightSteps(steps, { isTouchOnly: true });
    expect(result.filteredSteps).toHaveLength(1);
    expect(result.filteredSteps[0].popover.title).toBe('B');
  });

  it('evaluates desktopOnly BEFORE skipIfMissing so a missing element never blocks the touch drop', () => {
    const steps: SpotlightStep[] = [
      step({
        element: () => {
          throw new Error('should not be evaluated');
        },
        skipIfMissing: true,
        desktopOnly: true,
        popover: { title: 'A', description: '' },
      }),
    ];
    const result = filterSpotlightSteps(steps, { isTouchOnly: true });
    expect(result.filteredSteps).toHaveLength(0);
  });

  it('index maps remain consistent when steps are dropped by either filter', () => {
    document.body.innerHTML = '<div id="visible"></div>';
    const steps: SpotlightStep[] = [
      step({ popover: { title: 'A', description: '' } }),
      step({ popover: { title: 'B', description: '' }, desktopOnly: true }),
      step({ element: '#visible', skipIfMissing: true, popover: { title: 'C', description: '' } }),
      step({ element: '#gone', skipIfMissing: true, popover: { title: 'D', description: '' } }),
      step({ popover: { title: 'E', description: '' } }),
    ];

    const result = filterSpotlightSteps(steps, { isTouchOnly: true });

    expect(result.filteredSteps.map((s: SpotlightStep) => s.popover.title)).toEqual(['A', 'C', 'E']);
    expect(result.filteredToOriginal).toEqual([0, 2, 4]);
    expect(result.originalToFiltered.get(0)).toBe(0);
    expect(result.originalToFiltered.has(1)).toBe(false);
    expect(result.originalToFiltered.get(2)).toBe(1);
    expect(result.originalToFiltered.has(3)).toBe(false);
    expect(result.originalToFiltered.get(4)).toBe(2);
  });
});

describe('filterSpotlightSteps — real tutorial fixtures', () => {
  // The desktop chrome every skipIfMissing step points at (targetSelectors.ts, plugins.ts
  // `pluginsButton`), with the menu pinned open and Settings open.
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="grid-panel"></div>
      <div data-tutorial="game-panel"></div>
      <div data-tutorial="tab-bar"></div>
      <div data-tab="prayer"></div>
      <div data-tab="spellbook"></div>
      <div data-tutorial="minimap"></div>
      <div class="top-chrome__item"><button data-tutorial="practice-launcher"></button></div>
      <div class="top-chrome__item">
        <div class="launcher-menu">
          <button data-menu-item="settings"></button>
          <button data-tutorial="encounters-button"></button>
        </div>
      </div>
      <div class="top-chrome__item"><button data-tutorial="plugins-button"></button></div>
      <div class="controls-overlay open"></div>
      <div data-tutorial="interface-section"></div>
    `;
  });

  it('main onboarding tutorial drops exactly the desktopOnly steps on touch', () => {
    const main = onboardingMainTutorial.steps as SpotlightStep[];
    const desktop = filterSpotlightSteps(main, { isTouchOnly: false });
    const touch = filterSpotlightSteps(main, { isTouchOnly: true });

    // Every skipIfMissing step finds its target, so the touch filter is the only thing dropping any.
    expect(desktop.filteredSteps).toHaveLength(main.length);
    const desktopOnlyCount = main.filter((s: SpotlightStep) => s.desktopOnly).length;
    // Move and resize the game panel, the wrench tab and its Keybinds step, and Quick Search (Ctrl + K).
    expect(desktopOnlyCount).toBe(6);
    expect(desktop.filteredSteps.length - touch.filteredSteps.length).toBe(desktopOnlyCount);
    expect(touch.filteredSteps.every((s: SpotlightStep) => !s.desktopOnly)).toBe(true);
  });

  it('advanced onboarding tutorial drops exactly the desktopOnly steps on touch', () => {
    const adv = onboardingAdvancedTutorial.steps as SpotlightStep[];
    const desktop = filterSpotlightSteps(adv, { isTouchOnly: false });
    const touch = filterSpotlightSteps(adv, { isTouchOnly: true });

    expect(desktop.filteredSteps).toHaveLength(adv.length);
    const desktopOnlyCount = adv.filter((s: SpotlightStep) => s.desktopOnly).length;
    // Open Practice (desktop chrome) and Ctrl + K: prayer and spell filtering open with a touch hold too.
    expect(desktopOnlyCount).toBe(2);
    expect(desktop.filteredSteps.length - touch.filteredSteps.length).toBe(desktopOnlyCount);
    expect(touch.filteredSteps.every((s: SpotlightStep) => !s.desktopOnly)).toBe(true);
  });
});

describe('filterSpotlightSteps — touch copy', () => {
  const gated = (overrides: Partial<SpotlightStep>): SpotlightStep =>
    step({
      popover: { title: 'A', description: 'Right-click it' },
      action: { event: 'e', waitingText: 'Press Esc', completedText: 'Clicked' },
      touch: { description: 'Press and hold it', waitingText: 'Close it' },
      ...overrides,
    });

  it('shows a step’s touch copy on a touch-only device, falling back per field', () => {
    const [shown] = filterSpotlightSteps([gated({})], { isTouchOnly: true }).filteredSteps;

    expect(shown?.popover.title).toBe('A');
    expect(shown?.popover.description).toBe('Press and hold it');
    expect(shown?.action?.waitingText).toBe('Close it');
    expect(shown?.action?.completedText).toBe('Clicked');
  });

  it('shows a touch title where the step names something the Mobile layout lacks', () => {
    const [shown] = filterSpotlightSteps([gated({ touch: { title: 'B' } })], { isTouchOnly: true }).filteredSteps;
    expect(shown?.popover.title).toBe('B');
    expect(shown?.popover.description).toBe('Right-click it');
  });

  it('keeps the default copy elsewhere, and never rewrites the tour’s own steps', () => {
    const source = gated({});
    const [shown] = filterSpotlightSteps([source], { isTouchOnly: false }).filteredSteps;
    filterSpotlightSteps([source], { isTouchOnly: true });

    expect(shown).toBe(source);
    expect(source.popover.description).toBe('Right-click it');
    expect(source.action?.waitingText).toBe('Press Esc');
  });

  /**
   * What a touch user reads must not ask for a mouse or keyboard. "Click or tap" is allowed: it is
   * how a step names the default option, which both take.
   */
  const MOUSE_OR_KEYBOARD =
    /<kbd|\bEsc\b|\bCtrl\b|\bAlt\b|\bShift\b|right-click|\bhover|\bscroll|\bclick(?!s? or tap)/i;

  it.each([
    ['Getting Started', onboardingMainTutorial],
    ['Advanced', onboardingAdvancedTutorial],
    ['Plugins', pluginsTutorial],
  ])('%s asks a touch user for nothing a finger cannot do', (_name, tutorial) => {
    // Every target treated as present: this is about the copy, not about which targets exist.
    const steps = (tutorial.steps as SpotlightStep[]).map((s) => ({ ...s, skipIfMissing: false }));
    const shown = filterSpotlightSteps(steps, { isTouchOnly: true }).filteredSteps;

    const offending = shown.flatMap((s) =>
      [s.popover.title, s.popover.description, s.action?.waitingText, s.action?.completedText]
        .filter((text): text is string => !!text && MOUSE_OR_KEYBOARD.test(text))
        .map((text) => `${s.popover.title}: ${text}`),
    );
    expect(offending).toEqual([]);
  });
});

// Getting Started and Advanced can start with the Plugins drawer already open (the picker leaves it).
// An open-Plugins step pointing only at the button would read as missing while the drawer is open,
// and filtering it out would leave the panel step's guard no step to fall back to once Plugins is
// closed: it would spotlight the closed drawer and complete by itself. So the step stays, pointed at
// the open drawer.
describe.each([
  ['Getting Started', onboardingMainTutorial],
  ['Advanced', onboardingAdvancedTutorial],
])('%s, started with the Plugins drawer open', (_name, tour) => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div class="top-chrome__item"><button data-tutorial="plugins-button">Plugins</button></div>' +
      '<aside class="plugins-overlay open"></aside>';
  });

  it('keeps the open-Plugins step, pointed at the open drawer and already done', () => {
    const { filteredSteps } = filterSpotlightSteps(tour.steps as SpotlightStep[]);
    const open = filteredSteps.find((s) => s.popover.title === 'Plugins');

    expect(open).toBeDefined();
    const target = typeof open?.element === 'function' ? open.element() : null;
    expect(target).toBe(document.querySelector('.plugins-overlay'));
    expect(open?.action?.validate?.(undefined)).toBe(true);
  });

  it('sends the panel step back to it once Plugins is closed', () => {
    const { filteredSteps, originalToFiltered } = filterSpotlightSteps(tour.steps as SpotlightStep[]);
    const openIndex = filteredSteps.findIndex((s) => s.popover.title === 'Plugins');
    const panel = filteredSteps.find((s) => s.popover.title === 'The Plugins Panel');

    document.querySelector('.plugins-overlay')?.classList.remove('open');

    expect(panel?.resumeGuard?.isReady()).toBe(false);
    expect(openIndex).toBeGreaterThanOrEqual(0);
    expect(originalToFiltered.get(panel?.resumeGuard?.fallbackStep ?? -1)).toBe(openIndex);
  });
});
