// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { installHarnessEnvironment, uninstallHarnessEnvironment } from '../../../harness/ui/harnessEnvironment';
import { HARNESS_DEFAULT_OPTIONS } from '../../../harness/ui/harnessOptions';
import { UiHarnessApp } from '../../../harness/ui/UiHarnessApp';
import { resetDeviceModeForTests, setDeviceMode } from '../../../util/deviceMode';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.body.dataset.harnessReady;
  delete window.uiHarness;
  uninstallHarnessEnvironment();
  resetDeviceModeForTests();
});

it('gives empty quick-prayer feedback and routes Set up through the existing prayer setup view', async () => {
  installHarnessEnvironment();
  setDeviceMode('mobile');
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('game-viewport-frame') ? 844 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('game-viewport-frame') ? 390 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 844, 390));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(844);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(390);
  const toggle = vi.spyOn(SimulationEngine.prototype, 'queueQuickPrayerToggle');
  render(<UiHarnessApp options={{ ...HARNESS_DEFAULT_OPTIONS, chrome: false }} />);
  await waitFor(() => expect(document.body.dataset.harnessReady).toBe('true'), { timeout: 15_000 });
  expect(document.querySelector('[data-tutorial="mobile-hotkeys"]')).not.toBeNull();
  expect(document.querySelector('.osm-tools')).not.toBeNull();
  expect(document.querySelector('nav.launcher-row')).toBeNull();
  // The minimap and Hotkeys share this App callback. GamePanel's suite pins the
  // hotkey binding; use the orb here so the test does not depend on frame measurement.
  const orb = screen.getByRole('img', { name: 'Prayer' }).closest('div')?.querySelector('button');
  expect(orb).toBeTruthy();
  fireEvent.mouseDown(orb as HTMLButtonElement, { button: 0 });
  expect(screen.getByText(/No quick-prayers selected/)).toBeTruthy();
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  expect(toggle).not.toHaveBeenCalled();
}, 20_000);
