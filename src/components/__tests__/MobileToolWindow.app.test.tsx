// @vitest-environment happy-dom
// The tool window inside the real app (the UI harness): what only the app wires up, the Menu's
// destinations and playback's real enter and exit paths. The window's own rules are tested
// without the app in MobileToolWindow.test.tsx.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installHarnessEnvironment, uninstallHarnessEnvironment } from '../../harness/ui/harnessEnvironment';
import { HARNESS_DEFAULT_OPTIONS } from '../../harness/ui/harnessOptions';
import { UiHarnessApp } from '../../harness/ui/UiHarnessApp';
import { resetDeviceModeForTests, setDeviceMode } from '../../util/deviceMode';
import { loadSetting, saveSetting } from '../../util/storage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.body.dataset.harnessReady;
  delete window.uiHarness;
  uninstallHarnessEnvironment();
  resetDeviceModeForTests();
});

async function mountMobile(
  ticks: number,
  settings: Record<string, unknown> = {},
  /** Runs once the harness has played its ticks, before the window is looked for. */
  afterTicks?: () => void,
  viewport = { width: 844, height: 390 },
) {
  installHarnessEnvironment();
  if (!afterTicks) setDeviceMode('mobile');
  saveSetting('osrs-yama-settings', { ...settings, hideMobileWarning: true });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('game-viewport-frame') ? viewport.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('game-viewport-frame') ? viewport.height : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, viewport.width, viewport.height),
  );
  // Grid lays the Mobile frame out in its container's client box; happy-dom has no layout.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(viewport.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(viewport.height);
  render(<UiHarnessApp options={{ ...HARNESS_DEFAULT_OPTIONS, chrome: false, ticks }} />);
  await waitFor(() => expect(document.body.dataset.harnessReady).toBe('true'), { timeout: 15_000 });
  if (afterTicks) act(afterTicks);
  const toolTab = (tab: string) => document.querySelector<HTMLElement>(`.osm-tools__tab[data-tool-tab="${tab}"]`);
  await waitFor(() => expect(toolTab('menu')).not.toBeNull());
  return { toolTab: (tab: string) => toolTab(tab) as HTMLElement };
}

describe('MobileToolWindow in the app', () => {
  it.each([false, true])('keeps every tab in the aligned left slot with left panels %s', async (left) => {
    vi.stubGlobal('innerWidth', 844);
    vi.stubGlobal('innerHeight', 390);
    const { toolTab } = await mountMobile(12, { mobileHotkeysOpenOnLeft: left });
    const anchor = () => {
      const style = document.querySelector<HTMLElement>('.osm-tools__window')!.style;
      return [style.left, style.top, style.width, style.height];
    };
    const original = anchor();
    expect(original).toEqual(['45px', '156px', '158px', '213px']);
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: 'Hotkeys' })).getByRole('button', { name: 'Prayer Tab' }),
    );
    expect(anchor()).toEqual(original);
    const dockPosition = () => {
      const { left, top, width, height } = document.querySelector<HTMLElement>('.osm-tools__dock')!.style;
      return [left, top, width, height];
    };
    const dock = dockPosition();
    expect(dock).toEqual(['0px', '336px', '45px', '33px']);
    expect(Number.parseFloat(original[1]) + Number.parseFloat(original[3])).toBe(
      Number.parseFloat(dock[1]) + Number.parseFloat(dock[3]),
    );
    for (const name of ['menu', 'replay', 'practice']) {
      fireEvent.click(toolTab(name));
      await waitFor(() => expect(toolTab(name)).toHaveAttribute('aria-pressed', 'true'));
      expect(anchor()).toEqual(original);
      expect(dockPosition()).toEqual(dock);
    }
  });
  it.each([false, true])('protects the actual right-side panel in portrait with left hotkeys %s', async (left) => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    const { toolTab } = await mountMobile(1, { mobileHotkeysOpenOnLeft: left }, undefined, { width: 390, height: 844 });
    const panel = document.querySelector<HTMLElement>('.osm-tools__window')!;
    const toggle = document.querySelector<HTMLElement>('.osm-tools__dock')!;
    const dockBefore = toggle.getAttribute('style');
    // The preference alone must not hide inventory's reservation: actual panel side owns it.
    expect(panel.style.width).toBe('121px');
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: 'Hotkeys' })).getByRole('button', { name: 'Prayer Tab' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open tools' }));
    expect(panel.style.width).toBe(left ? '158px' : '121px');
    for (const name of ['menu', 'practice']) {
      fireEvent.click(toolTab(name));
      expect(panel.style.width).toBe(left ? '158px' : '121px');
      expect(toggle.getAttribute('style')).toBe(dockBefore);
    }
  });
  it('starts practice directly, then takes over later without moving its restart point', async () => {
    const { toolTab } = await mountMobile(12);
    const originalEngine = window.uiHarness?.getEngine();
    const bar = () => within(screen.getByRole('toolbar', { name: 'Replay controls' }));
    fireEvent.click(toolTab('replay'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('12'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Replay tick' }), { target: { value: '8' } });
    fireEvent.click(bar().getByRole('button', { name: 'More replay actions' }));
    fireEvent.click(bar().getByRole('button', { name: 'Practice' }));
    await waitFor(() => expect(document.querySelector('.replay-bar')).toBeNull());
    expect(window.uiHarness?.getEngine()).not.toBe(originalEngine);
    // Practicing tick 8 restores tick 7: 8 is the first tick played, and the point keeps its label.
    expect(window.uiHarness?.getState().currentTick).toBe(7);
    expect(screen.getByRole('group', { name: 'Practice session' })).toHaveTextContent('Restart: 8');
    act(() => {
      window.uiHarness?.tick(4);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('8'));
    expect(screen.getByRole('img', { name: 'Restart: tick 8' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Replay tick' }), { target: { value: '10' } });
    fireEvent.click(bar().getByRole('button', { name: 'More replay actions' }));
    fireEvent.click(bar().getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(document.querySelector('.replay-bar')).toBeNull());
    // Taking over tick 10 forks at 9, after the point's anchor 7, so the point survives.
    expect(window.uiHarness?.getState().currentTick).toBe(9);
    expect(screen.getByRole('group', { name: 'Practice session' })).toHaveTextContent('Restart: 8');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('8'));
    expect(screen.queryByRole('form', { name: 'Practice start' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear restart point' })).toBeNull();
    // Clear belongs to the live session, which leads Practice, not to the replay bar.
    fireEvent.click(toolTab('practice'));
    await waitFor(() => expect(document.querySelector('.replay-bar')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Clear restart point' }));
    expect(screen.queryByRole('group', { name: 'Practice session' })).toBeNull();
    expect(window.uiHarness?.getState().currentTick).toBe(9);
  }, 30_000);

  it('warns before an earlier takeover and clears the discarded point only on success', async () => {
    const { toolTab } = await mountMobile(12);
    const bar = () => within(screen.getByRole('toolbar', { name: 'Replay controls' }));
    fireEvent.click(toolTab('replay'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('12'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Replay tick' }), { target: { value: '8' } });
    fireEvent.click(bar().getByRole('button', { name: 'More replay actions' }));
    fireEvent.click(bar().getByRole('button', { name: 'Practice' }));
    await waitFor(() => expect(document.querySelector('.replay-bar')).toBeNull());
    expect(window.uiHarness?.getState().currentTick).toBe(7);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    // Tick 8 has not run again on this branch yet, so Change shows its retained predecessor.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('7'));
    expect(screen.getByRole('img', { name: 'Restart: tick 8' })).toBeInTheDocument();
    fireEvent.click(bar().getByRole('button', { name: 'More replay actions' }));
    expect(screen.getByText('Clears restart tick 8')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Replay tick' }), { target: { value: '6' } });
    expect(screen.getByText('Clears restart tick 8')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Restart: tick 8' })).toBeInTheDocument();
    fireEvent.click(bar().getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(document.querySelector('.replay-bar')).toBeNull());
    expect(window.uiHarness?.getState().currentTick).toBe(5);
    expect(screen.queryByRole('group', { name: 'Practice session' })).toBeNull();
  }, 30_000);

  it('keeps the player opening it for this page only, and loads closed again', async () => {
    await mountMobile(0, { clientLayoutMode: 'modern' });
    const windowEl = () => document.querySelector('.osm-tools__window');
    fireEvent.click(document.querySelector('.osm-tools__dock-button') as HTMLElement);
    expect(windowEl()).not.toHaveAttribute('hidden');
    const stored = loadSetting<Record<string, unknown>>('osrs-yama-settings') ?? {};
    cleanup();
    uninstallHarnessEnvironment();

    // The next page load, from what this one left stored.
    await mountMobile(0, stored);
    expect(windowEl()).toHaveAttribute('hidden');
  }, 30_000);

  it('lists four destinations in the Menu, Plugins among them, and nothing over the minimap', async () => {
    const { toolTab } = await mountMobile(0);
    fireEvent.click(toolTab('menu'));
    const menu = document.querySelector<HTMLElement>('.osm-tools__menu') as HTMLElement;
    const entries = within(menu)
      .getAllByRole('button')
      .filter(
        (button) =>
          !button.classList.contains('controls-toggle-open--split-right') &&
          !button.classList.contains('osm-tools__browse'),
      )
      .map((button) => button.textContent);
    expect(entries.sort()).toEqual(['Encounters', 'Plugins', 'Settings', 'Training']);
    expect(within(menu).queryByRole('link')).toBeNull();
    // Plugins is the Menu's in Mobile: no button sits over the minimap.
    expect(document.querySelector('.right-nav')).toBeNull();

    fireEvent.click(within(menu).getByRole('button', { name: 'Plugins' }));
    await waitFor(() => expect(document.querySelector('.plugins-overlay.open')).not.toBeNull());
    // The window docks behind the drawer it opened.
    expect(document.querySelector('.osm-tools__window')).toHaveAttribute('hidden');
  }, 20_000);

  it('plays the last fight back on the Replay tab, and ends it on leaving the tab', async () => {
    const { toolTab } = await mountMobile(6);
    fireEvent.click(toolTab('replay'));
    await waitFor(() => expect(document.querySelector('.replay-bar')).not.toBeNull());
    fireEvent.click(toolTab('menu'));
    await waitFor(() => expect(document.querySelector('.replay-bar')).toBeNull());
    expect(document.querySelector('.osm-tools[data-replay-viewer-chrome]')).toBeNull();
    expect(toolTab('menu')).toHaveAttribute('aria-pressed', 'true');
  }, 20_000);
});

// A phone keeps the Mobile tool window as its own chrome while a recording made in a desktop
// layout plays in the frame: the frame changes layout under it, the window (and the Menu
// rendered into it) must not.
describe('MobileToolWindow around a desktop recording on a phone', () => {
  // A fight recorded in the desktop layout, then played back on a phone: the Device setting
  // switches to Mobile once the fight is recorded, which is what a phone opening it sees.
  async function mountPhoneWithDesktopRecording(tab: 'practice' | 'menu' = 'practice') {
    installHarnessEnvironment();
    setDeviceMode('desktop');
    const mounted = await mountMobile(6, { clientLayoutMode: 'modern' }, () => setDeviceMode('mobile'));
    // Every load starts closed on Practice; a tab opens it there.
    if (tab !== 'practice') fireEvent.click(mounted.toolTab(tab));
    return mounted;
  }

  const desktopFrameShown = () =>
    document.querySelector('[data-tutorial="game-panel"]') !== null &&
    document.querySelector('[data-tutorial="mobile-hotkeys"]') === null;
  const replayBar = () => document.querySelector<HTMLElement>('.replay-bar');

  /** The Replay tab, then back to the first tick: playback opens on the last, after the switch. */
  async function playFromStart(toolTab: (tab: string) => HTMLElement) {
    fireEvent.click(toolTab('replay'));
    await waitFor(() => expect(document.querySelector('.osm-tools .replay-bar')).not.toBeNull());
    const seek = document.querySelector('.replay-seek') as HTMLInputElement;
    fireEvent.change(seek, { target: { value: '0' } });
    fireEvent.pointerUp(seek);
    await waitFor(() => expect(desktopFrameShown()).toBe(true));
  }

  it('keeps the tools, their transport and the Menu while it plays', async () => {
    const { toolTab } = await mountPhoneWithDesktopRecording();
    await playFromStart(toolTab);
    // One transport, the window's: no desktop launcher row or floating bar beside it.
    expect(document.querySelectorAll('.replay-bar')).toHaveLength(1);
    expect(document.querySelector('.osm-tools .replay-bar')).toBe(replayBar());
    expect(document.querySelector('nav.launcher-row')).toBeNull();
    expect(document.querySelector('.launcher-stats')).toBeNull();

    const dock = () => document.querySelector('.osm-tools__dock-button') as HTMLElement;
    expect(dock()).toHaveAccessibleName('Close tools');
    fireEvent.click(dock());
    // Docking leaves replay mode, as the native pop-out does.
    await waitFor(() => expect(replayBar()).toBeNull());
    expect(dock()).toHaveAccessibleName('Open tools');
    fireEvent.click(dock());
    expect(dock()).toHaveAccessibleName('Close tools');

    await playFromStart(toolTab);
    // The Menu ends playback and offers the app's destinations.
    fireEvent.click(toolTab('menu'));
    await waitFor(() => expect(replayBar()).toBeNull());
    const menu = () => document.querySelector<HTMLElement>('.osm-tools__menu') as HTMLElement;
    fireEvent.click(within(menu()).getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(document.querySelector('.controls-overlay.open')).not.toBeNull());
    expect(document.querySelector('.osm-tools__window')).toHaveAttribute('hidden');

    fireEvent.click(toolTab('menu'));
    fireEvent.click(within(menu()).getByRole('button', { name: 'Plugins' }));
    await waitFor(() => expect(document.querySelector('.plugins-overlay.open')).not.toBeNull());
  }, 30_000);

  it('returns to Practice when playback ends elsewhere, without starting it again', async () => {
    const { toolTab } = await mountPhoneWithDesktopRecording('menu');
    expect(toolTab('menu')).toHaveAttribute('aria-pressed', 'true');
    await playFromStart(toolTab);
    // The first recorded tick has no predecessor to restore, so take over a later desktop tick.
    fireEvent.click(within(replayBar() as HTMLElement).getByRole('button', { name: 'More replay actions' }));
    expect(
      within(replayBar() as HTMLElement).getByRole('button', {
        name: 'Take over unavailable: This is the first recorded tick. Restart the fight to play it.',
      }),
    ).toBeDisabled();
    const seek = document.querySelector('.replay-seek') as HTMLInputElement;
    fireEvent.change(seek, { target: { value: '3' } });
    fireEvent.pointerUp(seek);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('3'));
    expect(desktopFrameShown()).toBe(true);

    // Ended by the replay rather than by the window: ordinary takeover hands the fight back.
    await waitFor(() =>
      expect(within(replayBar() as HTMLElement).getByRole('button', { name: 'Take over' })).toBeEnabled(),
    );
    fireEvent.click(within(replayBar() as HTMLElement).getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(replayBar()).toBeNull());
    expect(window.uiHarness?.getState().currentTick).toBe(2);
    await waitFor(() => expect(toolTab('practice')).toHaveAttribute('aria-pressed', 'true'));
    expect(document.querySelector('[data-tutorial="mobile-hotkeys"]')).not.toBeNull();
    // Nothing takes the window back into replay mode once the frame is Mobile again.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(replayBar()).toBeNull();
    expect(toolTab('practice')).toHaveAttribute('aria-pressed', 'true');
  }, 30_000);
});

// The other way round: a fight recorded in Mobile, played on a desktop. The tools come and go
// with the recording's layout, so playback can end in the commit that takes them away.
describe('MobileToolWindow around a Mobile recording on a desktop', () => {
  const replayBar = () => document.querySelector<HTMLElement>('.replay-bar');

  it('reopens on the pane it came from, not on a Replay tab with nothing playing', async () => {
    // Recorded in Mobile, then in a desktop layout, which takes the tools away.
    const { toolTab } = await mountMobile(6);
    fireEvent.click(toolTab('menu'));
    const menu = document.querySelector<HTMLElement>('.osm-tools__menu') as HTMLElement;
    fireEvent.click(within(menu).getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(document.querySelector('.controls-overlay.open')).not.toBeNull());
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Device Mode' })).getByRole('radio', { name: 'Desktop' }),
    );
    await waitFor(() => expect(document.querySelector('.osm-tools')).toBeNull());
    act(() => {
      window.uiHarness?.tick(3);
    });

    // Playback opens on the last tick, in the desktop layout; the Mobile part brings the tools up
    // on Replay.
    fireEvent.click(document.querySelector('[data-tutorial="replay-launcher"]') as HTMLElement);
    await waitFor(() => expect(replayBar()).not.toBeNull());
    expect(document.querySelector('.osm-tools')).toBeNull();
    const seek = document.querySelector('.replay-seek') as HTMLInputElement;
    fireEvent.change(seek, { target: { value: '1' } });
    fireEvent.pointerUp(seek);
    await waitFor(() => expect(toolTab('replay')).toHaveAttribute('aria-pressed', 'true'));
    expect(document.querySelectorAll('.replay-bar')).toHaveLength(1);
    expect(document.querySelector('.osm-tools .replay-bar')).toBe(replayBar());

    // Taking over ends playback and returns the desktop frame, taking the tools with it.
    fireEvent.click(within(replayBar() as HTMLElement).getByRole('button', { name: 'More replay actions' }));
    await waitFor(() =>
      expect(within(replayBar() as HTMLElement).getByRole('button', { name: 'Take over' })).toBeEnabled(),
    );
    fireEvent.click(within(replayBar() as HTMLElement).getByRole('button', { name: 'Take over' }));
    await waitFor(() => expect(replayBar()).toBeNull());
    expect(document.querySelector('.osm-tools')).toBeNull();

    // Device Mobile brings them back.
    act(() => setDeviceMode('mobile'));
    await waitFor(() => expect(toolTab('practice')).toHaveAttribute('aria-pressed', 'true'));
    expect(toolTab('replay')).toHaveAttribute('aria-pressed', 'false');
    expect(replayBar()).toBeNull();

    fireEvent.click(toolTab('replay'));
    await waitFor(() => expect(document.querySelector('.osm-tools .replay-bar')).not.toBeNull());
  }, 30_000);
});
