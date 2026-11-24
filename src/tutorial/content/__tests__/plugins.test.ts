// @vitest-environment happy-dom
// The auto-expand hooks below dispatch a real CustomEvent on `window`, which the
// default node environment does not have.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ENCOUNTER_PLUGINS } from '../../../data/encounterPlugins';
import { pluginsButton, pluginsTutorial } from '../plugins';

/**
 * Keeps the Plugins tutorial in lockstep with the Plugins panel.
 *
 * When you add a plugin (a `<PluginRow label="...">` in PluginsPanel.tsx), this
 * suite FAILS until you add a matching `pluginStep('<label>', '...')` to
 * `src/tutorial/content/plugins.ts` — in panel order.
 */

/** Panel rows intentionally NOT covered by the tour (dev-only tooling). */
const TOUR_EXCLUSIONS = ['Debug Overlays'];

function panelPluginLabels(): string[] {
  const src = readFileSync(join(__dirname, '../../../components/PluginsPanel.tsx'), 'utf8');
  // `\slabel=` keeps aria-label/plugin-setting-label matches out.
  return [...src.matchAll(/<PluginRow[\s\S]*?\slabel="([^"]+)"/g)].map((m) => m[1] as string);
}

const steps = pluginsTutorial.steps;
// STEPS shape: [open panel, how plugins work, ...one step per plugin, close panel, done].
const pluginTourSteps = steps.slice(2, -2);
const tourTitles = pluginTourSteps.map((s) => (s.kind === 'spotlight' ? s.popover.title : ''));

describe('pluginsTutorial — stays in sync with the Plugins panel', () => {
  const expectedLabels = panelPluginLabels().filter((label) => !TOUR_EXCLUSIONS.includes(label));

  it('found the panel rows (regex sanity check)', () => {
    expect(expectedLabels.length).toBeGreaterThanOrEqual(10);
  });

  it('covers every Plugins panel row with a tour step', () => {
    const missing = expectedLabels.filter((label) => !tourTitles.includes(label));
    expect(
      missing,
      `New plugin row(s) missing from the Plugins tutorial tour. Add pluginStep('<label>', '...') to src/tutorial/content/plugins.ts (in panel order) — see the add-plugin skill.`,
    ).toEqual([]);
  });

  it('has no tour step for a renamed/removed panel row', () => {
    const stale = tourTitles.filter((title) => !expectedLabels.includes(title));
    expect(
      stale,
      `Tour step(s) no longer matching any PluginRow label. Update the pluginStep title in src/tutorial/content/plugins.ts to the new label.`,
    ).toEqual([]);
  });

  it('lists tour steps in panel order', () => {
    expect(tourTitles).toEqual(expectedLabels);
  });
});

function pluginSettingsEvents(title: string): unknown[] {
  const step = pluginTourSteps.find((s) => s.kind === 'spotlight' && s.popover.title === title);
  if (step?.kind !== 'spotlight') throw new Error(`${title} tour step not found`);

  const details: unknown[] = [];
  const listener = (event: Event) => {
    if (event instanceof CustomEvent) details.push(event.detail);
  };
  window.addEventListener('tutorial:plugin-settings', listener);
  step.onEnter?.();
  step.onExit?.();
  window.removeEventListener('tutorial:plugin-settings', listener);
  return details;
}

describe('pluginsTutorial — structural invariants', () => {
  it('every plugin spotlight is skipIfMissing so a missing row degrades gracefully', () => {
    for (const step of pluginTourSteps) {
      expect(step.kind).toBe('spotlight');
      if (step.kind === 'spotlight') expect(step.skipIfMissing).toBe(true);
    }
  });

  it('auto-expand hooks come in pairs (a step with onEnter must collapse via onExit)', () => {
    for (const step of pluginTourSteps) {
      if (step.kind === 'spotlight') expect(Boolean(step.onEnter)).toBe(Boolean(step.onExit));
    }
  });

  it('opens the Status Bars row settings on entry and closes them on the way out', () => {
    expect(pluginSettingsEvents('Status Bars')).toEqual([
      { pluginKey: 'statusBars', expanded: true },
      { pluginKey: 'statusBars', expanded: false },
    ]);
  });

  it('does not include simulation restart controls in the plugin tour', () => {
    expect(
      pluginTourSteps.some((entry) => entry.kind === 'spotlight' && entry.popover.title === 'Replay Practice'),
    ).toBe(false);
  });

  it('opens Zuk Set Timer settings when the encounter-specific row is available', () => {
    expect(pluginSettingsEvents('Zuk Set Timer')).toEqual([
      { pluginKey: 'setTimer', expanded: true },
      { pluginKey: 'setTimer', expanded: false },
    ]);
  });

  // The tour runs in the lobby, where the encounter plugins' rows are missing; the picker's step
  // count leaves out only the steps marked conditional.
  it('marks exactly the encounter plugins steps conditional', () => {
    const conditional = steps.filter((s) => s.kind === 'spotlight' && s.conditional);
    const panel = readFileSync(join(__dirname, '../../../components/PluginsPanel.tsx'), 'utf8');
    const encounterKeys = Object.keys(ENCOUNTER_PLUGINS);
    // The labels of the rows whose pluginKey is an encounter plugin, in panel order.
    const encounterLabels = [...panel.matchAll(/<PluginRow\s+label="([^"]+)"\s+pluginKey="([^"]+)"/g)]
      .filter((m) => encounterKeys.includes(m[2] as string))
      .map((m) => m[1]);
    expect(encounterLabels).toHaveLength(encounterKeys.length);
    expect(conditional.map((s) => (s.kind === 'spotlight' ? s.popover.title : ''))).toEqual(encounterLabels);
    for (const step of conditional) if (step.kind === 'spotlight') expect(step.skipIfMissing).toBe(true);
  });

  it('opens the DPS Overlay row settings under the key the panel reads', () => {
    expect(pluginSettingsEvents('DPS Overlay')).toEqual([
      { pluginKey: 'dpsOverlay', expanded: true },
      { pluginKey: 'dpsOverlay', expanded: false },
    ]);
  });

  it('the Close step forward-skips to the final step (computed index)', () => {
    const closeStep = steps[steps.length - 2];
    expect(closeStep.kind).toBe('spotlight');
    if (closeStep.kind === 'spotlight') {
      expect(closeStep.popover.title).toBe('Close Plugins');
      expect(closeStep.resumeGuard?.fallbackStep).toBe(steps.length - 1);
    }
  });
});

describe('pluginsTutorial — the Plugins button in either layout', () => {
  const openStep = steps[0];
  const target = () =>
    openStep?.kind === 'spotlight' && typeof openStep.element === 'function' ? openStep.element() : null;

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('points at the desktop button in the top chrome', () => {
    document.body.innerHTML =
      '<div class="top-chrome__item" data-tucked="false"><button class="launcher-btn" data-tutorial="plugins-button">Plugins</button></div>';
    expect(target()?.textContent).toBe('Plugins');
    expect(pluginsButton()).toBe(target());
  });

  it('points at the Mobile tool window’s Menu entry, where Mobile keeps Plugins', () => {
    document.body.innerHTML =
      '<nav class="sidebar-nav sidebar-nav--tools"><button class="controls-toggle-open">Settings</button>' +
      '<button class="controls-toggle-open" data-tutorial="plugins-button">Plugins</button></nav>';
    expect(target()?.getAttribute('data-tutorial')).toBe('plugins-button');
  });

  it('points at the open panel instead of a button hidden behind it', () => {
    document.body.innerHTML =
      '<div class="top-chrome__item" data-tucked="true"><button data-tutorial="plugins-button">Plugins</button></div>' +
      '<nav class="sidebar-nav sidebar-nav--tools"><button data-tutorial="plugins-button">Plugins</button></nav>' +
      '<div class="plugins-overlay open"></div>';
    expect(pluginsButton()).toBeNull();
    expect(target()).toBe(document.querySelector('.plugins-overlay'));
  });

  it('points at the open panel, not the desktop button beside it that would close it again', () => {
    document.body.innerHTML =
      '<div class="top-chrome__item" data-tucked="false"><button class="launcher-btn is-open" aria-pressed="true" data-tutorial="plugins-button">Plugins</button></div>' +
      '<div class="plugins-overlay open"></div>';
    expect(pluginsButton()).toBeNull();
    expect(target()).toBe(document.querySelector('.plugins-overlay'));
  });
});
