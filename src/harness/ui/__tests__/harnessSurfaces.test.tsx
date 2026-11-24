// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPageActivityForTests } from '../../../hooks/pageActivity';
import { setMobileLayoutEditing } from '../../../layout/mobileLayoutEdit';
import { resetDeviceModeForTests } from '../../../util/deviceMode';
import { installHarnessEnvironment, uninstallHarnessEnvironment } from '../harnessEnvironment';
import { HARNESS_DEFAULT_OPTIONS, parseHarnessOptions } from '../harnessOptions';
import { HARNESS_SURFACES, type HarnessSurface, type HarnessSurfaceEntry, harnessGpuStatus } from '../harnessSurfaces';
import { UiHarnessApp } from '../UiHarnessApp';
import { registerMountedAppEnvironment } from './mountedAppEnvironment';

describe('harnessGpuStatus', () => {
  it('reports hardware unless a GPU surface is asked for', () => {
    expect(harnessGpuStatus([]).status).toBe('hardware');
    expect(harnessGpuStatus(['death']).status).toBe('hardware');
    expect(harnessGpuStatus(['hardware-warning'])).toMatchObject({ status: 'software', renderer: expect.any(String) });
    expect(harnessGpuStatus(['webgl2-gate', 'hardware-warning']).status).toBe('no-webgl2');
  });
});

describe('UiHarnessApp boot surfaces (?open=)', () => {
  const { glContexts, requests } = registerMountedAppEnvironment();

  const boot = async (open: string[], encounter = 'yama_p3') => {
    // An earlier test's window blur would leave the page unfocused, which holds the live loop.
    resetPageActivityForTests();
    installHarnessEnvironment(open);
    render(<UiHarnessApp options={{ ...HARNESS_DEFAULT_OPTIONS, encounter, open }} />);
    await waitFor(
      () => expect(document.body.dataset.harnessReady ?? document.body.dataset.harnessError).toBeDefined(),
      { timeout: 15000 },
    );
  };
  const status = () => screen.queryByTestId('harness-status')?.textContent ?? '';
  afterEach(() => {
    delete document.body.dataset.harnessError;
    setMobileLayoutEditing(false);
    resetDeviceModeForTests();
    // Release the Alt the hint bar's route holds. Not a blur: that would leave the app's
    // window-focus state unfocused for the next test, which pauses its live loop.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft' }));
    // driver.js mounts the tour's popover on <body>, outside the rendered tree.
    for (const node of document.querySelectorAll('.driver-popover, .driver-overlay')) node.remove();
  });

  // The encounter each surface needs, where the default yama_p3 will not do.
  const ENCOUNTER: Partial<Record<HarnessSurface, string>> = { modifiers: 'sol_heredit' };

  it.each([
    'death',
    'victory',
  ] as const)('opens the %s dialog through the same terminal fixture as ?outcome=', async (surface) => {
    await boot([surface]);
    expect(status(), status()).not.toMatch(/failed/);
    expect(document.body.dataset.harnessReady).toBe('true');
    const state = window.uiHarness?.getState();
    // The fixture's authored ending at its fixed tick, not a fight run to an arbitrary one.
    expect(state?.currentTick).toBe(12);
    if (surface === 'death') expect(state?.failedCondition).not.toBeNull();
    else expect(state?.encounterOutcome.phase).toBe('victory');
    expect(document.querySelector(`.${surface}-modal-overlay`)).not.toBeNull();
    expect(glContexts).toEqual([]);
    expect(requests).toEqual([]);
  }, 20000);

  it('fails clearly outside the base Yama encounter, as the fixture does', async () => {
    await boot(['death'], 'zuk');
    expect(document.body.dataset.harnessError).toBe('true');
    expect(screen.getByTestId('harness-status').textContent).toMatch(/settled base Yama encounter/);
  }, 20000);

  // Each has its own boot test here (the terminal dialogs, and the combination), with these checks.
  const BOOTED_ELSEWHERE: readonly HarnessSurface[] = ['death', 'victory', 'settings', 'plugins'];

  it.each(
    (Object.keys(HARNESS_SURFACES) as HarnessSurface[]).filter((surface) => !BOOTED_ELSEWHERE.includes(surface)),
  )('?open=%s mounts its surface', async (surface) => {
    await boot([surface], ENCOUNTER[surface]);
    expect(status(), status()).not.toMatch(/failed/);
    expect(document.body.dataset.harnessReady).toBe('true');
    // A transient surface was on screen when `open` resolved (it waits for it); it may be gone now.
    const entry: HarnessSurfaceEntry = HARNESS_SURFACES[surface];
    if (!entry.transient) expect(entry.find()).not.toBeNull();
    // Every route stays GL-free and offline.
    expect(glContexts).toEqual([]);
    expect(requests).toEqual([]);
  }, 30000);

  it('combines the death fixture with the seeded GPU warning', async () => {
    await boot(['death', 'hardware-warning']);
    expect(window.uiHarness?.getState().failedCondition).not.toBeNull();
    expect(document.querySelector('.death-modal-overlay')).not.toBeNull();
    expect(screen.getByText(/SwiftShader/)).toBeInTheDocument();
  }, 30000);

  it.each([
    { outcome: 'death', open: ['death'], message: /'death' is listed twice/ },
    { outcome: 'death', open: ['victory'], message: /'death' and 'victory' cannot be open together/ },
  ] as const)('treats ?outcome=$outcome as the same surface as ?open=$open', async ({ outcome, open, message }) => {
    resetPageActivityForTests();
    installHarnessEnvironment([...open]);
    render(<UiHarnessApp options={{ ...HARNESS_DEFAULT_OPTIONS, outcome, open }} />);
    await waitFor(() => expect(document.body.dataset.harnessError).toBe('true'), { timeout: 15000 });
    expect(status()).toMatch(message);
  }, 30000);

  it('opens a combination in order, and a named lesson', async () => {
    await boot(['settings', 'plugins']);
    expect(status(), status()).not.toMatch(/failed/);
    expect(document.body.dataset.harnessReady).toBe('true');
    for (const surface of ['settings', 'plugins'] as const) {
      expect(HARNESS_SURFACES[surface].find()).not.toBeNull();
    }
    expect(glContexts).toEqual([]);
    expect(requests).toEqual([]);
    const controls = window.uiHarness;
    if (!controls) throw new TypeError('Missing UI harness');
    await controls.open('tutorial:yama-waves');
    expect(document.querySelector('.tutorial-overlay')?.textContent).toMatch(/wave/i);
  }, 30000);

  it('shows the WebGL2 gate alone, ready without a control API', async () => {
    await boot(['webgl2-gate']);
    expect(document.querySelector('.game-viewport-frame')).toBeNull();
    expect(window.uiHarness).toBeUndefined();
  }, 30000);

  // Behind the gate no bridge ever runs, so the shell has to reject the list itself.
  it.each([
    { outcome: null, open: ['webgl2-gate', 'settings'], message: /opens alone/ },
    { outcome: null, open: ['webgl2-gate', 'nonsense'], message: /Unknown UI harness surface 'nonsense'/ },
    { outcome: 'death', open: ['webgl2-gate'], message: /opens alone/ },
  ] as const)('fails a gated boot clearly for ?outcome=$outcome&open=$open', async ({ outcome, open, message }) => {
    resetPageActivityForTests();
    installHarnessEnvironment([...open]);
    render(<UiHarnessApp options={{ ...HARNESS_DEFAULT_OPTIONS, outcome, open }} />);
    await waitFor(() => expect(document.body.dataset.harnessError).toBe('true'), { timeout: 15000 });
    expect(document.querySelector('.webgl2-gate')).not.toBeNull();
    expect(document.body.dataset.harnessReady).toBeUndefined();
    expect(status()).toMatch(message);
  }, 30000);

  it('lets a user action cancel an async route without the route undoing it', async () => {
    // `tick-timing` runs the live loop until it has samples, then stops it. The user turning the
    // loop on meanwhile cancels the boot, and the route must leave the loop running.
    resetPageActivityForTests();
    installHarnessEnvironment(['tick-timing']);
    render(<UiHarnessApp options={{ ...HARNESS_DEFAULT_OPTIONS, open: ['tick-timing'] }} />);
    // The route has the loop running: ticks advance without anyone stepping them.
    await waitFor(() => expect(window.uiHarness?.getEngine().getState().currentTick ?? 0).toBeGreaterThan(0), {
      timeout: 15000,
    });
    const controls = window.uiHarness;
    if (!controls) throw new TypeError('Missing UI harness');
    await controls.setAutoAdvance(true);
    const tick = controls.getEngine().getState().currentTick;
    // Past the point the route would have found its samples and stopped the loop.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(controls.getEngine().getState().currentTick).toBeGreaterThan(tick + 1);
    // A canceled boot reports neither outcome; setup is not reapplied.
    expect(document.body.dataset.harnessReady).toBeUndefined();
    expect(document.body.dataset.harnessError).toBeUndefined();
    await controls.setAutoAdvance(false);
  }, 30000);

  it.each([
    { open: ['nonsense'], message: /Unknown UI harness surface 'nonsense'/ },
    { open: ['menu', 'practice'], message: /'menu' and 'practice' cannot be open together/ },
    { open: ['replay', 'death'], message: /'replay' and 'death' cannot be open together/ },
    // A fresh entry into the fight replaces the terminal ending, so it is refused up front.
    { open: ['death', 'title-card'], message: /'death' and 'title-card' cannot be open together/ },
    { open: ['victory', 'countdown'], message: /'victory' and 'countdown' cannot be open together/ },
    { open: ['settings', 'viewport-size-warning'], message: /cannot be open together/ },
    { open: ['mobile', 'menu'], message: /cannot be open together/ },
    { open: ['settings', 'settings'], message: /listed twice/ },
    { open: ['settings:x'], message: /takes no argument/ },
    { open: ['tutorial:main'], message: /'main' is not a lesson/ },
    { open: ['modifiers'], message: /no run modifiers\. Encounters with them: sol_heredit/ },
    // Quick search closes the modals it would sit over, so the list cannot all be up at once.
    { open: ['shortcuts', 'quick-search'], message: /'shortcuts' closed while the rest/ },
  ])('fails the boot clearly for ?open=$open', async ({ open, message }) => {
    await boot(open);
    expect(document.body.dataset.harnessError).toBe('true');
    expect(status()).toMatch(message);
  }, 30000);

  it('keeps its address and surface across a reload', async () => {
    // The app's router must not treat the harness page as a route: rewriting it to `/` or an
    // encounter path would make the reload boot the full app instead of the harness.
    const address = '/ui-harness.html?encounter=yama_p3&open=settings';
    window.history.replaceState(null, '', address);
    try {
      for (const load of ['first load', 'reload']) {
        // Each load boots as the entry does: options from the address, a fresh environment.
        const options = parseHarnessOptions(window.location.search);
        resetPageActivityForTests();
        installHarnessEnvironment(options.open);
        const { unmount } = render(<UiHarnessApp options={options} />);
        await waitFor(() => expect(document.body.dataset.harnessReady, status()).toBe('true'), { timeout: 15000 });
        expect(document.querySelector('.controls-overlay.open'), load).not.toBeNull();
        expect(`${window.location.pathname}${window.location.search}`, load).toBe(address);
        unmount();
        delete document.body.dataset.harnessReady;
        delete window.uiHarness;
        uninstallHarnessEnvironment();
      }
    } finally {
      window.history.replaceState(null, '', '/');
    }
  }, 40000);

  it('keeps boot surfaces out of the live API', async () => {
    await boot([]);
    await expect(window.uiHarness?.open('hardware-warning')).rejects.toThrow(
      /load the page with \?open=hardware-warning/,
    );
  }, 30000);
});
