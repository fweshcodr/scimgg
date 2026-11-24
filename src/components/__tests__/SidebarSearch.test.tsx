// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsTouchOnly } from '../../hooks/useIsTouchOnly';
import { GAMEPANEL_KEYBINDS_ID, pluginSearchId, settingsSearchId } from '../../settingsSearch/ids';
import type { SearchLayout } from '../../settingsSearch/types';
import {
  closeDrawerForNavigation,
  type DrawerPanel,
  resetLastSearchForTests,
  SidebarSearchBar,
  SidebarSearchResults,
  SidebarSearchToggle,
  useSearchIds,
  useSidebarSearch,
} from '../SidebarSearch';
import { REVEAL_NO_GAME_PANEL_REASON, revealSetting, useGamePanelRevealDestination } from '../settingsReveal';

vi.mock('../../hooks/useIsTouchOnly', () => ({ useIsTouchOnly: vi.fn(() => false) }));

/** A stand-in game panel: the keybind editor's destination, as GamePanel registers it. */
function GamePanelDestination() {
  useGamePanelRevealDestination(
    () => null,
    () => {},
  );
  return <div data-search-id={GAMEPANEL_KEYBINDS_ID} />;
}

/**
 * Two stand-in drawers carrying the real search, laid out as the sidebars lay it out: a header with
 * the magnifier, the bar under it, then the body the results cover. Their anchors decide what
 * counts as available right now.
 */
function Drawer({
  panel,
  anchors,
  layout = 'resizable',
}: {
  panel: DrawerPanel;
  anchors: string[];
  layout?: SearchLayout;
}) {
  const [visible, setVisible] = useState(true);
  const search = useSidebarSearch(panel, visible);
  const { fieldId, resultsId } = useSearchIds();
  return (
    <aside className={panel === 'settings' ? 'controls-overlay' : 'plugins-overlay'} data-testid={panel}>
      <div className="panel-header">
        <SidebarSearchToggle search={search} fieldId={fieldId} />
        <button type="button" onClick={() => setVisible((v) => !v)}>
          Toggle {panel}
        </button>
      </div>
      <SidebarSearchBar search={search} fieldId={fieldId} resultsId={resultsId} />
      <div className="drawer-search-body">
        <div className="drawer-content" inert={search.active ? true : undefined}>
          {anchors.map((id) => (
            <div key={id} data-search-id={id} />
          ))}
        </div>
        {search.active && <SidebarSearchResults search={search} id={resultsId} layout={layout} />}
      </div>
    </aside>
  );
}

const SETTINGS_ANCHORS = [
  settingsSearchId('Interface'),
  settingsSearchId('Interface', 'Layout'),
  settingsSearchId('Interface', 'Transparent chatbox'),
];
const PLUGIN_ANCHORS = [
  'tickAudioMetronome',
  'attackTimerMetronome',
  'stretchedMode',
  'tileMarkers',
  'bossHealthBar',
  'statusBars',
].map((key) => pluginSearchId(key));

function renderDrawers({
  layout = 'resizable',
  settingsAnchors = SETTINGS_ANCHORS,
}: {
  layout?: SearchLayout;
  settingsAnchors?: string[];
} = {}) {
  render(
    <>
      <Drawer panel="settings" anchors={settingsAnchors} layout={layout} />
      <Drawer panel="plugins" anchors={PLUGIN_ANCHORS} layout={layout} />
    </>,
  );
  const settings = screen.getByTestId('settings');
  const plugins = screen.getByTestId('plugins');
  return { settings, plugins };
}

/** Presses a drawer's magnifier with `pointerType` and returns its field. */
function openSearch(drawer: HTMLElement, pointerType = 'mouse'): HTMLInputElement {
  const toggle = within(drawer).getByRole('button', { name: 'Search settings and plugins' });
  fireEvent.pointerDown(toggle, { pointerType });
  fireEvent.click(toggle);
  return within(drawer).getByRole('textbox', { name: 'Search settings and plugins' }) as HTMLInputElement;
}

function searchFor(drawer: HTMLElement, query: string): HTMLInputElement {
  const field =
    (within(drawer).queryByRole('textbox', { name: 'Search settings and plugins' }) as HTMLInputElement | null) ??
    openSearch(drawer, 'touch');
  fireEvent.change(field, { target: { value: query } });
  return field;
}

function resultTitles(drawer: HTMLElement): string[] {
  return Array.from(drawer.querySelectorAll('.drawer-search-result__title'), (title) => title.textContent ?? '');
}

function row(drawer: HTMLElement, title: string): HTMLElement {
  const found = Array.from(drawer.querySelectorAll<HTMLElement>('.drawer-search-result')).find(
    (candidate) => candidate.querySelector('.drawer-search-result__title')?.textContent === title,
  );
  if (!found) throw new Error(`No result titled ${title}`);
  return found;
}

function revealsDuring(action: () => void): unknown[] {
  const details: unknown[] = [];
  const listener = (event: Event) => details.push((event as CustomEvent).detail);
  window.addEventListener('settings:reveal', listener);
  try {
    action();
  } finally {
    window.removeEventListener('settings:reveal', listener);
  }
  return details;
}

afterEach(() => {
  cleanup();
  resetLastSearchForTests();
  vi.mocked(useIsTouchOnly).mockReturnValue(false);
});

describe('SidebarSearch: the header magnifier', () => {
  it('keeps the field hidden until the magnifier is pressed', () => {
    const { settings } = renderDrawers();
    expect(within(settings).queryByRole('textbox')).toBeNull();
    expect(settings.querySelector('.drawer-search-bar')).toBeNull();
    const toggle = within(settings).getByRole('button', { name: 'Search settings and plugins' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.querySelector('svg[data-glyph="search"]')).not.toBeNull();
  });

  it('names itself at once on mouse hover with the app hover card, never the browser tooltip', async () => {
    const { settings } = renderDrawers();
    const toggle = within(settings).getByRole('button', { name: 'Search settings and plugins' });
    // HoverHintButton's empty title: it also blocks a native tooltip inherited from an ancestor.
    expect(toggle.getAttribute('title')).toBe('');
    fireEvent.pointerEnter(toggle, { pointerType: 'mouse' });
    expect((await waitFor(() => screen.getByRole('tooltip'))).textContent).toBe('Search');
  });

  it('shows no hint for a finger, whose tap belongs to the button', () => {
    const { settings } = renderDrawers();
    const toggle = within(settings).getByRole('button', { name: 'Search settings and plugins' });
    fireEvent.pointerEnter(toggle, { pointerType: 'touch' });
    fireEvent.pointerDown(toggle, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('puts the caret in the field for a mouse, but not for a finger', () => {
    const mouse = renderDrawers();
    const mouseField = openSearch(mouse.settings, 'mouse');
    expect(document.activeElement).toBe(mouseField);
    cleanup();
    const touch = renderDrawers();
    const touchField = openSearch(touch.settings, 'touch');
    expect(document.activeElement).not.toBe(touchField);
  });

  it('hides again from the magnifier, the X, Escape, or leaving it empty', () => {
    const { settings } = renderDrawers();
    const toggle = within(settings).getByRole('button', { name: 'Search settings and plugins' });

    openSearch(settings);
    fireEvent.click(toggle);
    expect(within(settings).queryByRole('textbox')).toBeNull();

    searchFor(settings, 'camera');
    fireEvent.click(within(settings).getByRole('button', { name: 'Close search' }));
    expect(within(settings).queryByRole('textbox')).toBeNull();

    const field = searchFor(settings, 'camera');
    // Spent here, so the sidebar's own Escape layer leaves the sidebar open.
    expect(fireEvent.keyDown(field, { key: 'Escape' })).toBe(false);
    expect(within(settings).queryByRole('textbox')).toBeNull();

    const empty = openSearch(settings);
    fireEvent.blur(empty);
    expect(within(settings).queryByRole('textbox')).toBeNull();
  });

  it('lets Ctrl+K through to the app while it has the keys', () => {
    const { settings } = renderDrawers();
    const field = openSearch(settings);
    const appHotkey = vi.fn();
    window.addEventListener('keydown', appHotkey);
    try {
      fireEvent.keyDown(field, { key: 'k' });
      expect(appHotkey).not.toHaveBeenCalled();
      fireEvent.keyDown(field, { key: 'k', ctrlKey: true });
      expect(appHotkey).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('keydown', appHotkey);
    }
  });

  it('keeps typed keys from the game while the field has them, and leaves Tab to the app', () => {
    const { settings } = renderDrawers();
    const field = openSearch(settings);
    // Not empty, so the blur Enter causes leaves the field open for the next key.
    fireEvent.change(field, { target: { value: 'x' } });
    const gameHotkey = vi.fn();
    window.addEventListener('keydown', gameHotkey);
    try {
      // F-keys go on to the app, which keeps them from the browser (QuickSearch.test.tsx); the game's
      // panel keys ignore a key typed into a field.
      for (const key of ['a', ' ', 'ArrowLeft', '1', 'Enter']) fireEvent.keyDown(field, { key });
      expect(gameHotkey).not.toHaveBeenCalled();
      fireEvent.keyDown(field, { key: 'Tab' });
      expect(gameHotkey).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('keydown', gameHotkey);
    }
  });
});

describe('SidebarSearch: results', () => {
  it('finds rows from both sidebars, typos included, and says where each lives', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'metronme');
    expect(resultTitles(settings).slice(0, 2)).toEqual(['Attack Timer Metronome', 'Tick Audio Metronome']);
    expect(row(settings, 'Attack Timer Metronome').querySelector('.drawer-search-result__crumb')?.textContent).toBe(
      'Plugins',
    );
    expect(settings.querySelector('.drawer-search-result__match')?.textContent).toBe('Metronome');

    searchFor(settings, 'fixed mode');
    expect(row(settings, 'Layout').querySelector('.drawer-search-result__crumb')?.textContent).toBe(
      'Settings › Interface',
    );
  });

  it('titles a bare label by what it belongs to', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'metronome volume');
    expect(resultTitles(settings)).toContain('Metronome volume');
  });

  it('covers the panel body while there is a query', () => {
    const { settings } = renderDrawers();
    const body = settings.querySelector('.drawer-content');
    searchFor(settings, 'grond markers');
    expect(body?.hasAttribute('inert')).toBe(true);
    expect(resultTitles(settings)[0]).toBe('Tile Markers');
  });

  it('marks actionable rows with a chevron and lists the rest as information', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'zuk');
    const usable = row(settings, 'Zuk Set Timer');
    expect(usable.tagName).toBe('DIV');
    expect(usable.querySelector('.drawer-search-result__chevron')).toBeNull();

    searchFor(settings, 'fixed mode');
    const layout = row(settings, 'Layout');
    expect(layout.tagName).toBe('BUTTON');
    expect(layout.querySelector('.drawer-search-result__chevron')).not.toBeNull();
  });

  it('shows the first 12, then the rest on request', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'show');
    const total = Number(settings.querySelector('.drawer-search-results__heading')?.textContent?.match(/^\d+/)?.[0]);
    expect(total).toBeGreaterThan(12);
    expect(settings.querySelectorAll('.drawer-search-result')).toHaveLength(12);
    fireEvent.click(within(settings).getByRole('button', { name: `Show remaining ${total - 12} results` }));
    expect(settings.querySelectorAll('.drawer-search-result')).toHaveLength(total);
  });
});

describe('SidebarSearch: matches that cannot be shown now', () => {
  it('lists them under "Available elsewhere", each with one specific reason', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'zuk');
    expect(within(settings).getByText('Available elsewhere')).toBeDefined();
    const timer = row(settings, 'Zuk Set Timer');
    expect(timer.querySelector('.drawer-search-result__reason')?.textContent).toBe('Available in the Inferno.');
    // Nothing the player can change: information only, no route and no inert button.
    expect(within(timer).queryByRole('button')).toBeNull();
    expect(revealsDuring(() => fireEvent.click(timer))).toEqual([]);
  });

  it('offers the prerequisite when the player can change it, and never changes it for them', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'click through');
    const clickThrough = row(settings, 'Click through transparent chatbox');
    expect(clickThrough.querySelector('.drawer-search-result__reason')?.textContent).toBe(
      'Turn on Transparent chatbox to use this.',
    );
    expect(
      revealsDuring(() =>
        fireEvent.click(within(clickThrough).getByRole('button', { name: /Show Transparent chatbox/ })),
      ),
    ).toEqual([{ id: settingsSearchId('Interface', 'Transparent chatbox'), surface: 'settings' }]);
  });

  it("explains the prerequisite's own requirement when that is not available either", () => {
    // Fixed: no transparent chatbox to turn on, so the layout is what is needed.
    const { settings } = renderDrawers({
      layout: 'fixed',
      settingsAnchors: SETTINGS_ANCHORS.filter((id) => !id.endsWith('transparent-chatbox')),
    });
    searchFor(settings, 'click through');
    const clickThrough = row(settings, 'Click through transparent chatbox');
    expect(clickThrough.querySelector('.drawer-search-result__reason')?.textContent).toBe(
      'Requires a Resizable layout.',
    );
    expect(within(clickThrough).getByRole('button', { name: /Open Layout settings/ })).toBeDefined();
  });

  it('says when an option belongs to another layout', () => {
    const { settings } = renderDrawers({ layout: 'resizable' });
    searchFor(settings, 'fixed layout scale');
    expect(row(settings, 'Fixed layout scale').querySelector('.drawer-search-result__reason')?.textContent).toBe(
      'Requires the Fixed layout.',
    );
  });
});

describe('SidebarSearch: nothing found', () => {
  it('says so plainly for nonsense, with no padded suggestions', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'xyzzy');
    expect(within(settings).getByRole('heading').textContent).toBe('No settings found for “xyzzy”.');
    expect(within(settings).getByText(/Try a feature or effect/)).toBeDefined();
    expect(settings.querySelectorAll('.drawer-search-result')).toHaveLength(0);
  });

  it('offers credible near misses as possible matches', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'resolushun');
    expect(within(settings).getByRole('heading').textContent).toBe('Possible matches');
    expect(resultTitles(settings)).toEqual(['Resolution']);
  });

  it('shows the normal panel for a blank query', () => {
    const { settings } = renderDrawers();
    searchFor(settings, '   ');
    expect(settings.querySelector('.drawer-search-results')).toBeNull();
  });
});

describe('SidebarSearch: going to a result, and back', () => {
  it('reveals the row in the sidebar that owns it and hides both searches', () => {
    const { settings, plugins } = renderDrawers();
    const field = searchFor(settings, 'ui size');
    field.focus();
    expect(revealsDuring(() => fireEvent.click(row(settings, 'UI scale')))).toEqual([
      { id: 'plugins.stretchedMode.ui-scale', surface: 'plugins' },
    ]);
    expect(within(settings).queryByRole('textbox')).toBeNull();
    // The game gets its keys back.
    expect(document.activeElement).not.toBe(field);
    expect(within(plugins).queryByRole('textbox')).toBeNull();
  });

  it('offers the way back in the destination sidebar, restoring the query and where it was', () => {
    const { settings, plugins } = renderDrawers();
    searchFor(settings, 'show');
    const results = settings.querySelector<HTMLElement>('.drawer-search-results');
    if (!results) throw new Error('no results');
    results.scrollTop = 120;
    act(() => {
      fireEvent.click(row(settings, 'Show hitpoint percentage'));
    });

    expect(within(settings).queryByRole('button', { name: /Results for/ })).toBeNull();
    const back = within(plugins).getByRole('button', { name: 'Results for “show”' });
    fireEvent.click(back);
    expect(within(plugins).getByRole('textbox')).toHaveValue('show');
    expect(plugins.querySelector<HTMLElement>('.drawer-search-results')?.scrollTop).toBe(120);
    // Used once: it does not linger under the restored search.
    expect(within(plugins).queryByRole('button', { name: /Results for/ })).toBeNull();
  });

  it('brings the way back with its full list showing before it scrolls back', () => {
    const { settings, plugins } = renderDrawers();
    searchFor(settings, 'show');
    fireEvent.click(within(settings).getByRole('button', { name: /^Show remaining/ }));
    const total = settings.querySelectorAll('.drawer-search-result').length;
    expect(total).toBeGreaterThan(12);
    const results = settings.querySelector<HTMLElement>('.drawer-search-results');
    if (!results) throw new Error('no results');
    results.scrollTop = 480;
    act(() => {
      fireEvent.click(row(settings, 'Show hitpoint percentage'));
    });
    fireEvent.click(within(plugins).getByRole('button', { name: 'Results for “show”' }));
    expect(plugins.querySelectorAll('.drawer-search-result')).toHaveLength(total);
    expect(within(plugins).queryByRole('button', { name: /^Show remaining/ })).toBeNull();
    expect(plugins.querySelector<HTMLElement>('.drawer-search-results')?.scrollTop).toBe(480);
  });

  it('keeps the way back when the app closes its sidebar on the way to the result', () => {
    render(<GamePanelDestination />);
    const { settings } = renderDrawers();
    searchFor(settings, 'rebind');
    fireEvent.click(row(settings, 'Keybinds'));
    // What App does for a game-panel reveal: the drawer over the panel goes, for navigation.
    closeDrawerForNavigation('settings');
    fireEvent.click(within(settings).getByRole('button', { name: 'Toggle settings' }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Toggle settings' }));
    expect(within(settings).getByRole('button', { name: 'Results for “rebind”' })).toBeDefined();
    // The player closing it themselves ends it.
    fireEvent.click(within(settings).getByRole('button', { name: 'Toggle settings' }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Toggle settings' }));
    expect(within(settings).queryByRole('button', { name: /Results for/ })).toBeNull();
  });

  it('forgets the way back on a new search', () => {
    const { settings, plugins } = renderDrawers();
    searchFor(settings, 'hp bar');
    fireEvent.click(row(settings, 'Boss Health Bar'));
    expect(within(plugins).getByRole('button', { name: 'Results for “hp bar”' })).toBeDefined();
    searchFor(settings, 'camera');
    expect(within(plugins).queryByRole('button', { name: /Results for/ })).toBeNull();
  });

  it('forgets the way back when its sidebar is closed', () => {
    const { settings, plugins } = renderDrawers();
    searchFor(settings, 'hp bar');
    fireEvent.click(row(settings, 'Boss Health Bar'));
    fireEvent.click(within(plugins).getByRole('button', { name: 'Toggle plugins' }));
    fireEvent.click(within(plugins).getByRole('button', { name: 'Toggle plugins' }));
    expect(within(plugins).queryByRole('button', { name: /Results for/ })).toBeNull();
  });

  it('clears its own search when a reveal lands in its sidebar', () => {
    const { plugins } = renderDrawers();
    searchFor(plugins, 'camera');
    act(() => revealSetting(pluginSearchId('tileMarkers')));
    expect(within(plugins).queryByRole('textbox')).toBeNull();
    expect(plugins.querySelector('.drawer-search-results')).toBeNull();
  });
});

describe('SidebarSearch: keybinds in the game panel', () => {
  it('explains a keybind row with no game panel to go to', () => {
    const { settings } = renderDrawers();
    searchFor(settings, 'keybinds');
    const keybinds = row(settings, 'Keybinds');
    expect(keybinds.classList.contains('is-unavailable')).toBe(true);
    expect(keybinds.querySelector('.drawer-search-result__reason')?.textContent).toBe(REVEAL_NO_GAME_PANEL_REASON);
  });

  it('takes the player to the editor, and keeps the way back in the sidebar they searched from', () => {
    render(<GamePanelDestination />);
    const { settings } = renderDrawers();
    searchFor(settings, 'rebind');
    const keybinds = row(settings, 'Keybinds');
    expect(keybinds.querySelector('.drawer-search-result__crumb')?.textContent).toBe('Game panel › Settings');
    expect(revealsDuring(() => fireEvent.click(keybinds))).toEqual([
      { id: GAMEPANEL_KEYBINDS_ID, surface: 'gamepanel' },
    ]);
    expect(within(settings).getByRole('button', { name: 'Results for “rebind”' })).toBeDefined();
  });

  it('says a keybind row needs a keyboard on a touch-only device', () => {
    vi.mocked(useIsTouchOnly).mockReturnValue(true);
    render(<GamePanelDestination />);
    const { settings } = renderDrawers();
    searchFor(settings, 'keybinds');
    const keybinds = row(settings, 'Keybinds');
    expect(keybinds.querySelector('.drawer-search-result__reason')?.textContent).toBe('Needs a keyboard.');
    expect(revealsDuring(() => fireEvent.click(keybinds))).toEqual([]);
  });
});
