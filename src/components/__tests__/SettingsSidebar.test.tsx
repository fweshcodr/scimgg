// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_RESOLUTION } from '../../hooks/usePersistedSettings';
import { isMobileLayoutEditing, setMobileLayoutEditing } from '../../layout/mobileLayoutEdit';
import { SETTINGS_SEARCH_ENTRIES } from '../../settingsSearch/entries';
import { GAMEPANEL_KEYBINDS_ID, settingsSearchId } from '../../settingsSearch/ids';
import { SettingsSidebar } from '../SettingsSidebar';
import { REVEAL_NO_GAME_PANEL_REASON, revealSetting, useGamePanelRevealDestination } from '../settingsReveal';

/** A stand-in game panel: the keybind editor's destination, as GamePanel registers it. */
function GamePanelDestination() {
  useGamePanelRevealDestination(
    () => null,
    () => {},
  );
  return <div data-search-id={GAMEPANEL_KEYBINDS_ID} />;
}

import { HotkeyCustomizationProvider, useHotkeyCustomization } from '../TouchControls';

afterEach(() => {
  cleanup();
});

type SettingsSidebarProps = Parameters<typeof SettingsSidebar>[0];

function makeProps(): SettingsSidebarProps {
  return {
    visible: true,
    onClose: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onOpenCredits: vi.fn(),
    simulationControls: {
      onReset: vi.fn(),
      speedMultiplier: 1,
      onSpeedChange: vi.fn(),
      autoAdvance: false,
      onAutoAdvanceToggle: vi.fn(),
      pauseWhenUnfocused: false,
      onPauseWhenUnfocusedChange: vi.fn(),
      inputLagMs: 0,
      onInputLagMsChange: vi.fn(),
      fightStartCountdown: true,
      onFightStartCountdownChange: vi.fn(),
      fightStartCountdownTicks: 3,
      onFightStartCountdownTicksChange: vi.fn(),
    },
    displayControls: {
      smoothTerrain: false,
      onSmoothTerrainToggle: vi.fn(),
      brightness: 0.6,
      onBrightnessChange: vi.fn(),
      contrast: 1,
      onContrastChange: vi.fn(),
      saturation: 1,
      onSaturationChange: vi.fn(),
      selectedRenderer: 'webgl',
      onRendererChange: vi.fn(),
      renderScale: 1,
      onRenderScaleChange: vi.fn(),
      fpsCap: 144,
      onFpsCapChange: vi.fn(),
      antiAliasing: 'auto',
      onAntiAliasingChange: vi.fn(),
      gameResolution: DEFAULT_GAME_RESOLUTION,
      onGameResolutionChange: vi.fn(),
      onOpenPopout: vi.fn(),
      canPopOut: true,
      isPopoutWindow: false,
      viewportSizeWarning: null,
      clientLayoutMode: 'modern' as const,
      onClientLayoutModeChange: vi.fn(),
      interfaceScaling: {
        stretchedModeEnabled: true,
        uiScale: 1,
        fixedLayoutScale: 'fit' as const,
        mobileInterfaceScaling: 400,
      },
      transparentChatbox: false,
      onTransparentChatboxChange: vi.fn(),
      transparentSidePanel: true,
      onTransparentSidePanelChange: vi.fn(),
      hotkeysCloseSidePanel: false,
      onHotkeysCloseSidePanelChange: vi.fn(),
      clickThroughTransparentChatbox: true,
      onClickThroughTransparentChatboxChange: vi.fn(),
    },
    debugSection: {
      activeEncounterKind: 'yama-p3',
      encounterDebugFlags: {},
      onEncounterDebugFlagsChange: vi.fn(),
      onReturnToLobby: vi.fn(),
      logLevel: 'warn',
      onLogLevelChange: vi.fn(),
      onOpenCacheExplorer: vi.fn(),
      onStartBasicTutorial: vi.fn(),
      onStartAdvancedTutorial: vi.fn(),
    },
    infoboxAppearance: {
      clientLayoutMode: 'modern',
      pinTarget: 'inventory',
      onPinTargetChange: vi.fn(),
      textOutlineEnabled: true,
      onTextOutlineEnabledChange: vi.fn(),
      textOutlineColor: '#000000',
      onTextOutlineColorChange: vi.fn(),
    },
    touchControls: {
      touchLongPressMs: 300,
      onTouchLongPressMsChange: vi.fn(),
      touchMenuRowHeight: 28,
      onTouchMenuRowHeightChange: vi.fn(),
      touchHapticsEnabled: true,
      onTouchHapticsEnabledChange: vi.fn(),
      mobileInterfaceScaling: 400,
      onMobileInterfaceScalingChange: vi.fn(),
      mobileHotkeys: [6, 8, 9, 21, 23],
      onMobileHotkeysChange: vi.fn(),
      mobileHotkeysOpenOnLeft: false,
      onMobileHotkeysOpenOnLeftChange: vi.fn(),
    },
  };
}

function renderSidebar() {
  return render(<SettingsSidebar {...makeProps()} />);
}

describe('SettingsSidebar header', () => {
  it('instantly names the header Keyboard shortcuts button on pointer hover', async () => {
    renderSidebar();
    const control = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(control).toHaveAttribute('title', '');
    fireEvent.pointerEnter(control, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent('Keyboard shortcuts');
  });
});

describe('SettingsSidebar title and credits', () => {
  it('names the sidebar Settings, as Plugins is named, in a level-2 heading', () => {
    renderSidebar();
    expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'SCIM.GG' })).toBeNull();
  });

  it('keeps credits in the legal footer with no divider', () => {
    const props = makeProps();
    const { container } = render(<SettingsSidebar {...props} />);
    const credits = screen.getByRole('button', { name: 'Credits' });
    expect(container.querySelector('.settings-legal')?.contains(credits)).toBe(true);
    const actions = container.querySelector('.settings-legal__actions');
    expect(credits.parentElement).toBe(actions);
    expect(within(actions as HTMLElement).queryAllByRole('link')).toEqual([]);
    expect(actions?.querySelector('.panel-header-divider')).toBeNull();
    fireEvent.click(credits);
    expect(props.onOpenCredits).toHaveBeenCalledTimes(1);
  });

  it('keeps every header action in one row with the title', () => {
    const { container } = renderSidebar();
    const header = container.querySelector('.panel-header');
    expect(header?.children).toHaveLength(2);
    const actions = Array.from(header?.querySelectorAll('.panel-header-icons > :is(a, button)') ?? [], (el) =>
      el.getAttribute('aria-label'),
    );
    expect(actions).toEqual(['Search settings and plugins', 'Keyboard shortcuts', 'Close Settings']);
  });
});

describe('SettingsSidebar legal notice', () => {
  it("disclaims affiliation and reserves Jagex Limited's rights", () => {
    // Regression guard for legal copy: this text is the app's only
    // non-affiliation notice, so it must not be dropped or reworded into a
    // weaker claim by a later refactor of the sidebar.
    const { container } = renderSidebar();
    const notice = container.querySelector('.settings-legal');

    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('Not affiliated with Jagex');
    expect(notice?.textContent).toContain('is not endorsed by or affiliated with Jagex Limited');
    expect(notice?.textContent).toContain('trademarks of Jagex Limited');
    expect(notice?.textContent).toContain('all rights reserved');
  });
});

describe('SettingsSidebar touch section', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the same slot editor when Customize is requested, without focusing it', () => {
    const base = makeProps();
    const open = vi.fn();
    function Entry() {
      const { customize } = useHotkeyCustomization();
      return (
        <button type="button" onClick={customize}>
          Customize
        </button>
      );
    }
    render(
      <HotkeyCustomizationProvider onOpenSettings={open}>
        <Entry />
        <SettingsSidebar {...base} displayControls={{ ...base.displayControls, clientLayoutMode: 'mobile' }} />
      </HotkeyCustomizationProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-expanded', 'true');
    const slot = screen.getByRole('combobox', { name: 'Slot 1' });
    expect(document.activeElement).not.toBe(slot);
    fireEvent.change(slot, { target: { value: '22' } });
    expect(base.touchControls.onMobileHotkeysChange).toHaveBeenCalledWith([22, 8, 9, 21, 23]);
  });
  it('appears in the Mobile layout, with Interface scaling and the hotkey rows', () => {
    const base = makeProps();
    render(<SettingsSidebar {...base} displayControls={{ ...base.displayControls, clientLayoutMode: 'mobile' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(screen.getByRole('slider', { name: 'Long Tap Delay' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Vibrate on long tap' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Interface scaling' })).toBeDefined();
    expect(screen.getByText('Slot 1')).toBeDefined();
  });

  it('enters Edit layout from the Mobile Hotkeys section and closes Settings over it', () => {
    const base = makeProps();
    render(<SettingsSidebar {...base} displayControls={{ ...base.displayControls, clientLayoutMode: 'mobile' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Edit layout' }));
      expect(isMobileLayoutEditing()).toBe(true);
      expect(base.onClose).toHaveBeenCalledOnce();
    } finally {
      setMobileLayoutEditing(false);
    }
  });

  it('offers Edit layout only in the Mobile layout', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Edit layout' })).toBeNull();
  });

  it('stays out of the way on a desktop in the other layouts', () => {
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(0);
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Touch' })).toBeNull();
  });

  it('offers touch settings without vibration on a touchscreen desktop', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(10);
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Touch' }));
    expect(screen.getByRole('slider', { name: 'Long Tap Delay' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Menu Row Height' })).toBeDefined();
    expect(screen.queryByRole('checkbox', { name: 'Vibrate on long tap' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Interface scaling' })).toBeNull();
  });

  it('keeps vibration available on a touch-only device outside the Mobile layout', () => {
    vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile');
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Touch' }));
    expect(screen.getByRole('slider', { name: 'Long Tap Delay' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Menu Row Height' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Vibrate on long tap' })).toBeDefined();
  });
});

describe('SettingsSidebar header on a phone', () => {
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops the keyboard shortcuts button and explains the badge with a tappable hint, not a tooltip', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    const { container } = renderSidebar();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts' })).toBeNull();
    const badge = screen.getByText('This device');
    expect(badge.hasAttribute('title')).toBe(false);
    // On the title's own row, so the header stays one row on a phone held sideways.
    expect(container.querySelector('.panel-title-row')?.contains(badge)).toBe(true);
    expect(screen.getByRole('button', { name: 'About Mobile preferences' })).toBeTruthy();
  });

  it('says why Keybinds cannot open there, in place, instead of navigating', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    const listener = vi.fn();
    window.addEventListener('settings:reveal', listener);
    try {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: 'Keybinds' }));
      expect(screen.getByRole('status').textContent).toBe('Needs a keyboard.');
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('settings:reveal', listener);
    }
  });

  it('keeps the shortcuts button and shows no badge on a desktop', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(document.querySelector('.panel-mode-badge')).toBeNull();
  });
});

describe('SettingsSidebar sections', () => {
  it('names the scene settings Graphics & Performance', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Graphics & Performance' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Display' })).toBeNull();
  });

  it('edits Infobox appearance in Interface, its one editor', () => {
    const base = makeProps();
    const { container } = render(<SettingsSidebar {...base} />);
    const group = container.querySelector<HTMLElement>(
      `[data-search-id="${settingsSearchId('Interface', 'Infobox appearance')}"]`,
    );
    if (!group) throw new Error('Infobox appearance not found');
    expect(group.closest('[data-tutorial="interface-section"]')).not.toBeNull();
    expect(group.querySelector('.group-title')?.textContent).toBe('Infobox appearance');
    fireEvent.click(within(group).getByRole('radio', { name: 'Free' }));
    expect(base.infoboxAppearance?.onPinTargetChange).toHaveBeenCalledWith('free');
    fireEvent.click(within(group).getByRole('checkbox', { name: 'Text outline' }));
    expect(base.infoboxAppearance?.onTextOutlineEnabledChange).toHaveBeenCalledWith(false);
    // Not a link out to Plugins.
    expect(screen.queryByRole('button', { name: /^Infoboxes:/ })).toBeNull();
  });

  it('keeps the stored position but shows where infoboxes sit when the layout cannot host it', () => {
    const base = makeProps();
    render(
      <SettingsSidebar
        {...base}
        infoboxAppearance={base.infoboxAppearance && { ...base.infoboxAppearance, clientLayoutMode: 'fixed' }}
      />,
    );
    const picker = screen.getByRole('radiogroup', { name: 'Infobox position' });
    expect(within(picker).getByRole('radio', { name: 'Inventory' })).toBeDisabled();
    expect(within(picker).getByRole('radio', { name: 'Chatbox' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Your Inventory choice is kept for the other layouts\./)).toBeDefined();
  });

  it('orders Interface for playing first and the device override last', () => {
    const { container } = renderSidebar();
    const section = container.querySelector('[data-tutorial="interface-section"] .collapsible-content');
    const titles = Array.from(section?.querySelectorAll(':scope > .control-group') ?? [], (group) => {
      return (
        group.querySelector('.group-title')?.textContent ?? group.querySelector('.setting-link__label')?.textContent
      );
    });
    expect(titles).toEqual([
      'Layout',
      'Keybinds',
      'Game window',
      'Infobox appearance',
      'Side panel',
      'Chatbox',
      undefined, // Show Shortcut Hints: a checkbox of its own
      'Device Mode',
    ]);
  });

  it('offers shared transparency in resizable layouts, with closing hotkeys only in Modern', () => {
    const props = makeProps();
    const view = render(<SettingsSidebar {...props} />);
    expect(
      screen.queryByText('Show the game through the panel background. Keybinds and Audio stay opaque.'),
    ).toBeNull();
    expect(
      screen.getByText("Press the open panel's key again to close it. Clicking its tab always closes it."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transparent side panel' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hotkeys close side panel' }));
    expect(props.displayControls.onTransparentSidePanelChange).toHaveBeenCalledWith(false);
    expect(props.displayControls.onHotkeysCloseSidePanelChange).toHaveBeenCalledWith(true);
    view.rerender(
      <SettingsSidebar {...props} displayControls={{ ...props.displayControls, clientLayoutMode: 'classic' }} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transparent side panel' }));
    expect(props.displayControls.onTransparentSidePanelChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('checkbox', { name: 'Hotkeys close side panel' })).toBeNull();
    for (const mode of ['fixed', 'mobile'] as const) {
      view.rerender(
        <SettingsSidebar {...props} displayControls={{ ...props.displayControls, clientLayoutMode: mode }} />,
      );
      expect(screen.queryByRole('checkbox', { name: 'Transparent side panel' })).toBeNull();
      expect(screen.queryByRole('checkbox', { name: 'Hotkeys close side panel' })).toBeNull();
    }
  });

  it('groups each checkbox explanation with its modified indicator and reset', () => {
    const base = makeProps();
    const modified = {
      ...base,
      displayControls: { ...base.displayControls, hotkeysCloseSidePanel: true },
      infoboxAppearance: { ...base.infoboxAppearance, textOutlineEnabled: false },
    };
    const view = render(<SettingsSidebar {...base} />);
    for (const props of [base, modified]) {
      view.rerender(<SettingsSidebar {...props} />);
      for (const [label, explanation] of [
        [
          'Hotkeys close side panel',
          "Press the open panel's key again to close it. Clicking its tab always closes it.",
        ],
        ['Text outline', 'Outlines infobox values so they stay readable over bright item icons.'],
      ]) {
        const row = screen.getByRole('checkbox', { name: label }).closest('.setting-row');
        expect(row).toContainElement(screen.getByText(explanation));
        expect(row?.classList.contains('setting-row--modified')).toBe(props === modified);
        expect(row?.querySelector('.setting-row__reset')).toHaveAttribute('aria-hidden', String(props === base));
      }
    }
  });

  it('leads Keybinds to the editor in the game panel', () => {
    render(<GamePanelDestination />);
    renderSidebar();
    const listener = vi.fn();
    window.addEventListener('settings:reveal', listener);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Keybinds' }));
      expect(listener.mock.calls[0]?.[0].detail).toEqual({ id: GAMEPANEL_KEYBINDS_ID, surface: 'gamepanel' });
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      window.removeEventListener('settings:reveal', listener);
    }
  });

  it('says why Keybinds cannot go to the editor, in place, when there is no game panel', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Keybinds' }));
    expect(screen.getByRole('status').textContent).toBe(REVEAL_NO_GAME_PANEL_REASON);
  });

  it('opens the section holding a revealed setting and marks it', async () => {
    const { container } = renderSidebar();
    const interfaceHeader = screen.getByRole('button', { name: 'Interface' });
    expect(interfaceHeader).toHaveAttribute('aria-expanded', 'false');

    act(() => revealSetting('settings.interface.game-window'));

    expect(interfaceHeader).toHaveAttribute('aria-expanded', 'true');
    const group = container.querySelector<HTMLElement>('[data-search-id="settings.interface.game-window"]');
    if (!group) throw new Error('Game window group not found');
    expect(within(group).getByText('Game window')).toBeDefined();
    await waitFor(() => expect(group.dataset.revealHighlight).toBe('on'));
  });

  it('opens the Mobile section for its Interface scaling', () => {
    const base = makeProps();
    render(<SettingsSidebar {...base} displayControls={{ ...base.displayControls, clientLayoutMode: 'mobile' }} />);
    act(() => revealSetting('settings.mobile.interface-scaling'));
    expect(screen.getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Interface scaling' })).toBeDefined();
  });

  it('leaves its sections alone for a Plugins reveal', () => {
    renderSidebar();
    // A stand-in Plugins drawer, so the reveal has somewhere to land and is dispatched.
    render(
      <aside className="plugins-overlay">
        <div data-search-id="plugins.stretchedMode" />
      </aside>,
    );
    act(() => {
      expect(revealSetting('plugins.stretchedMode')).toEqual({ ok: true });
    });
    for (const name of ['Simulation', 'Graphics & Performance', 'Interface']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
  });
});

describe('SettingsSidebar settings-search anchors', () => {
  it('shows Simulation controls without a Simulation keys cross-link', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Simulation' }));
    expect(screen.getByRole('button', { name: /^Restart Simulation/ })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Auto-Advance' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Countdown' })).toBeDefined();
    expect(screen.getByRole('button', { name: '2x' })).toBeDefined();
    expect(screen.queryByText('Simulation keys')).toBeNull();
  });

  function renderedAnchors(): Set<string> {
    const anchors = new Set<string>();
    const collect = (container: HTMLElement) => {
      for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-search-id]'))) {
        if (el.dataset.searchId) anchors.add(el.dataset.searchId);
      }
      cleanup();
    };
    const base = makeProps();
    // Collapsed sections keep their content mounted. The Mobile section exists only in Mobile, and
    // click-through only while the chatbox is transparent.
    collect(
      render(<SettingsSidebar {...base} displayControls={{ ...base.displayControls, transparentChatbox: true }} />)
        .container,
    );
    collect(
      render(<SettingsSidebar {...base} displayControls={{ ...base.displayControls, clientLayoutMode: 'mobile' }} />)
        .container,
    );
    return anchors;
  }

  it('has an anchor for every Settings entry in the search index', () => {
    const anchors = renderedAnchors();
    const missing = SETTINGS_SEARCH_ENTRIES.filter((entry) => entry.panel === 'settings' && !anchors.has(entry.id));
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it('indexes every anchor it renders, except the link to a scale edited elsewhere', () => {
    const indexed = new Set(SETTINGS_SEARCH_ENTRIES.map((entry) => entry.id));
    // Interface scaling only points at Stretched Mode or Mobile's own setting, which search lists
    // themselves: one editor, one result.
    expect([...renderedAnchors()].filter((id) => !indexed.has(id))).toEqual([
      settingsSearchId('Interface', 'Interface scaling'),
    ]);
  });

  it('puts every setting row under an anchor of its own, not just its section', () => {
    // SettingRow requires a searchId; a row passing null must sit inside a group that has one.
    // A section's anchor does not count: search would land on the section, not the setting.
    // Left out on purpose: the Developer zone's Debug section, and link rows, whose destination
    // search lists instead.
    const base = makeProps();
    const unanchored: string[] = [];
    for (const displayControls of [
      { ...base.displayControls, transparentChatbox: true },
      { ...base.displayControls, clientLayoutMode: 'mobile' as const },
    ]) {
      const { container } = render(<SettingsSidebar {...base} displayControls={displayControls} />);
      for (const row of Array.from(container.querySelectorAll<HTMLElement>('.setting-row'))) {
        const section = row.closest('.collapsible-section');
        if (section?.querySelector('.section-title')?.textContent === 'Debug' || row.closest('.setting-link')) continue;
        let anchor = row.closest<HTMLElement>('[data-search-id]');
        while (anchor?.classList.contains('collapsible-section')) {
          anchor = anchor.parentElement?.closest<HTMLElement>('[data-search-id]') ?? null;
        }
        if (!anchor) unanchored.push(row.textContent?.trim().slice(0, 40) ?? '');
      }
      cleanup();
    }
    expect(unanchored).toEqual([]);
  });

  function openSearch() {
    fireEvent.click(screen.getByRole('button', { name: 'Search settings and plugins' }));
    return screen.getByRole('textbox', { name: 'Search settings and plugins' });
  }

  it('keeps the search behind the header magnifier, and swaps the panel for results from both sidebars', () => {
    const { container } = renderSidebar();
    expect(screen.queryByRole('textbox', { name: 'Search settings and plugins' })).toBeNull();
    const field = openSearch();
    const body = container.querySelector('.controls-content');

    fireEvent.change(field, { target: { value: 'camera' } });
    expect(body?.hasAttribute('inert')).toBe(true);
    const crumbs = Array.from(container.querySelectorAll('.drawer-search-result__crumb'), (crumb) => crumb.textContent);
    expect(crumbs).toContain('Plugins');

    fireEvent.change(field, { target: { value: '' } });
    expect(body?.hasAttribute('inert')).toBe(false);
  });

  it('starts every visit with the search hidden and empty', () => {
    const props = makeProps();
    const view = render(<SettingsSidebar {...props} />);
    fireEvent.change(openSearch(), { target: { value: 'theme' } });
    view.rerender(<SettingsSidebar {...props} visible={false} />);
    view.rerender(<SettingsSidebar {...props} />);
    expect(screen.queryByRole('textbox', { name: 'Search settings and plugins' })).toBeNull();
    expect(openSearch()).toHaveValue('');
  });
});
