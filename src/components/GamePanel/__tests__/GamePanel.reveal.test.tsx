// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReplayPresentationProvider } from '../../../contexts/ReplayPresentationContext';
import type {
  ReplayPanelModes,
  ReplayPanelPresentation,
  ReplayPresentationState,
} from '../../../core/replayPresentation';
import {
  GAMEPANEL_AUDIO_ID,
  GAMEPANEL_AUDIO_IDS,
  GAMEPANEL_AUDIO_LABELS,
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_ID,
  GAMEPANEL_KEYBINDS_PLUGINS_ID,
} from '../../../settingsSearch/ids';
import { defaultOsmFrame } from '../../../test/helpers/osmFrame';
import { createEmptyInventory } from '../../../types/inventory';
import { ContextMenuProvider } from '../../ContextMenu';
import {
  getRevealAvailability,
  REVEAL_REPLAY_AUDIO_REASON,
  REVEAL_REPLAY_REASON,
  REVEAL_UNKNOWN_REASON,
  type RevealStatus,
  revealSetting,
} from '../../settingsReveal';
import { TooltipProvider } from '../../Tooltip';
import { GamePanel } from '../GamePanel';

/**
 * The game panel as a reveal destination: `revealSetting('gamepanel.keybinds…')` takes it to the
 * wrench tab's Keybindings page through its own state, and refuses while a replay owns it.
 */

type GamePanelProps = ComponentProps<typeof GamePanel>;

function Providers({ children, presentation }: { children: ReactNode; presentation?: ReplayPresentationState }) {
  return (
    <TooltipProvider>
      <ContextMenuProvider>
        {presentation ? (
          <ReplayPresentationProvider
            presentation={presentation}
            reportPanelPresentation={() => {}}
            reportMinimapZoom={() => {}}
          >
            {children}
          </ReplayPresentationProvider>
        ) : (
          children
        )}
      </ContextMenuProvider>
    </TooltipProvider>
  );
}

function renderPanel(props: Partial<GamePanelProps> = {}, presentation?: ReplayPresentationState) {
  return render(
    <GamePanel activePrayer={null} onPrayerChange={vi.fn()} inventory={createEmptyInventory()} {...props} />,
    {
      wrapper: ({ children }) => <Providers presentation={presentation}>{children}</Providers>,
    },
  );
}

function reveal(id: string): RevealStatus {
  let status: RevealStatus = { ok: false, reason: 'not run' };
  act(() => {
    status = revealSetting(id);
  });
  return status;
}

const settingsTab = () => screen.getByRole('button', { name: /^Keybinds/ });
const keybindingsPage = () => screen.queryByRole('button', { name: 'Keybindings' });
const categoryTab = (name: 'Panel' | 'Camera' | 'Plugins') =>
  screen.queryByRole('tab', { name: name === 'Panel' ? 'General' : name });

function replayPresentation(
  tab: ReplayPresentationState['variants']['activeGamePanelTab'] = 'prayer',
  modes: Partial<ReplayPanelModes> = {},
): ReplayPresentationState {
  const panelPresentation: ReplayPanelPresentation = {
    filters: {
      prayer: {
        hidden: [],
        order: null,
        filterOptions: { showLowerTiers: true, showTieredOverMultiskill: true, showRapidHealing: true },
      },
      spellbook: { hidden: {}, order: {}, activeCategories: ['combat', 'teleport', 'utility'], filterOptions: {} },
    },
    modes: {
      prayerReordering: false,
      prayerFiltering: false,
      spellReordering: false,
      spellFiltering: false,
      ...modes,
    },
  };
  const position = { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const;
  return {
    clientLayoutMode: 'modern',
    frame: { width: 1280, height: 720 },
    insets: { left: 0, right: 0 },
    uiScale: 1,
    panels: {
      gamePanel: position,
      minimap: { ...position, anchorY: 'top' },
      compactOrbs: { ...position, anchorY: 'top', y: 60 },
      infobox: null,
      zukSetTimer: null,
    },
    variants: {
      activeGamePanelTab: tab,
      compactOrbsEnabled: false,
      compactOrbsLayout: 'vertical',
      compactOrbsOrder: ['hitpoints', 'prayer', 'run', 'special'],
      infoboxPinTarget: 'inventory',
      showCoordinates: false,
      panelPresentation,
    },
  } as ReplayPresentationState;
}

describe('GamePanel as a reveal destination', () => {
  it('opens the wrench tab on Keybindings, Panel group, from any tab', async () => {
    renderPanel();
    expect(settingsTab()).toHaveAttribute('aria-pressed', 'false');

    expect(reveal(GAMEPANEL_KEYBINDS_ID)).toEqual({ ok: true });

    expect(settingsTab()).toHaveAttribute('aria-pressed', 'true');
    expect(keybindingsPage()).toHaveAttribute('aria-pressed', 'true');
    expect(categoryTab('Panel')).toHaveAttribute('aria-selected', 'true');
    const editor = document.querySelector<HTMLElement>(`[data-search-id="${GAMEPANEL_KEYBINDS_ID}"]`);
    await waitFor(() => expect(editor?.dataset.revealHighlight).toBe('on'));
  });

  it('picks the Camera group for the camera id and marks its tab, not the whole editor', async () => {
    renderPanel();
    reveal(GAMEPANEL_KEYBINDS_CAMERA_ID);

    expect(categoryTab('Camera')).toHaveAttribute('aria-selected', 'true');
    const camera = categoryTab('Camera') as HTMLElement;
    await waitFor(() => expect(camera.dataset.revealHighlight).toBe('on'));
    const editor = document.querySelector<HTMLElement>(`[data-search-id="${GAMEPANEL_KEYBINDS_ID}"]`);
    expect(editor?.dataset.revealHighlight).toBeUndefined();
  });

  it('rejects the unknown simulation keybind destination without opening the editor', () => {
    renderPanel();
    expect(reveal('gamepanel.keybinds.simulation')).toEqual({ ok: false, reason: REVEAL_UNKNOWN_REASON });
    expect(keybindingsPage()).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Simulation' })).toBeNull();
  });

  it('reveals plugin keys in Plugins with its groups already open', async () => {
    renderPanel();
    expect(reveal(GAMEPANEL_KEYBINDS_PLUGINS_ID)).toEqual({ ok: true });
    expect(categoryTab('Plugins')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeVisible();
    const plugins = categoryTab('Plugins') as HTMLElement;
    await waitFor(() => expect(plugins.dataset.revealHighlight).toBe('on'));
    reveal(GAMEPANEL_KEYBINDS_ID);
    expect(categoryTab('Panel')).toHaveAttribute('aria-selected', 'true');
  });

  it('switches page and group when already on the wrench tab, and back to Panel for the Panel id', () => {
    renderPanel();
    fireEvent.click(settingsTab());
    expect(keybindingsPage()).toHaveAttribute('aria-pressed', 'false');

    reveal(GAMEPANEL_KEYBINDS_CAMERA_ID);
    expect(categoryTab('Camera')).toHaveAttribute('aria-selected', 'true');
    reveal(GAMEPANEL_KEYBINDS_ID);
    expect(categoryTab('Panel')).toHaveAttribute('aria-selected', 'true');
  });

  it('starts no key recording and moves no focus', () => {
    renderPanel();
    const before = document.activeElement;
    reveal(GAMEPANEL_KEYBINDS_CAMERA_ID);
    expect(document.activeElement).toBe(before);
    expect(screen.queryByText('Press a key. Esc cancels.')).toBeNull();
    expect(screen.getByText('Click a key to change it.')).toBeDefined();
  });

  it('forgets the revealed group once the tab is left, as it forgets the page', () => {
    renderPanel();
    reveal(GAMEPANEL_KEYBINDS_CAMERA_ID);
    fireEvent.click(screen.getByRole('button', { name: /^Inventory/ }));
    fireEvent.click(settingsTab());
    fireEvent.click(keybindingsPage() as HTMLElement);
    expect(categoryTab('Panel')).toHaveAttribute('aria-selected', 'true');
  });

  it('goes through the live tab owner when the tab is controlled, as Grid controls it', () => {
    const onActiveTabChange = vi.fn();
    renderPanel({ activeTab: 'inventory', onActiveTabChange });
    expect(reveal(GAMEPANEL_KEYBINDS_ID)).toEqual({ ok: true });
    expect(onActiveTabChange).toHaveBeenCalledWith('settings');
  });

  it.each([
    GAMEPANEL_KEYBINDS_CAMERA_ID,
    GAMEPANEL_AUDIO_ID,
  ])('reopens the same closed Modern settings tab for %s', (id) => {
    const { container } = renderPanel();
    fireEvent.click(settingsTab());
    fireEvent.click(settingsTab());
    expect(container.querySelector('[data-tutorial="game-panel"]')).toBeNull();

    expect(reveal(id)).toEqual({ ok: true });

    expect(container.querySelector('[data-tutorial="game-panel"]')).not.toBeNull();
    expect(settingsTab()).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector(`[data-search-id="${id}"]`)).not.toBeNull();
  });

  it('opens a closed Mobile side panel', () => {
    const { container } = renderPanel({
      clientLayoutMode: 'mobile',
      mobileFrame: defaultOsmFrame({ width: 844, height: 390 }, { top: 0, right: 0, bottom: 0, left: 0 }),
      viewportWidth: 844,
      viewportHeight: 390,
    });
    const rail = container.querySelector('[data-tutorial="tab-bar"]') as HTMLElement;
    // Tapping the open tab's stone closes the panel.
    fireEvent.click(within(rail).getByRole('button', { name: /^Inventory/ }));
    expect(container.querySelector('[data-tutorial="game-panel"]')).toBeNull();

    reveal(GAMEPANEL_KEYBINDS_CAMERA_ID);

    expect(container.querySelector('[data-tutorial="game-panel"]')).not.toBeNull();
    expect(categoryTab('Camera')).toHaveAttribute('aria-selected', 'true');
  });

  describe('while a replay owns the panel', () => {
    const blocked = { ok: false, reason: REVEAL_REPLAY_REASON };

    it('refuses with the reason and leaves the replayed tab and every panel state alone', () => {
      const onActiveTabChange = vi.fn();
      renderPanel({ replayActiveTab: 'prayer', onActiveTabChange }, replayPresentation());
      expect(getRevealAvailability(GAMEPANEL_KEYBINDS_ID)).toEqual(blocked);

      expect(reveal(GAMEPANEL_KEYBINDS_CAMERA_ID)).toEqual(blocked);
      expect(reveal(GAMEPANEL_KEYBINDS_PLUGINS_ID)).toEqual(blocked);

      expect(onActiveTabChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^Prayer/ })).toHaveAttribute('aria-pressed', 'true');
      expect(categoryTab('Camera')).toBeNull();
    });

    it('also refuses a recording that drives only the tab', () => {
      // Grid hands a replay the tab as a controlled value with no way to change it.
      renderPanel({ activeTab: 'prayer' });
      expect(reveal(GAMEPANEL_KEYBINDS_ID)).toEqual(blocked);
      expect(screen.getByRole('button', { name: /^Prayer/ })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

describe('GamePanel Audio page as a reveal destination', () => {
  const audioPage = () => screen.queryByRole('button', { name: 'Audio' });
  const anchor = (id: string) => document.querySelector<HTMLElement>(`[data-search-id="${id}"]`);
  const controls = Object.entries(GAMEPANEL_AUDIO_IDS) as [keyof typeof GAMEPANEL_AUDIO_IDS, string][];

  it('anchors the page and each control under its id, named by its visible label', () => {
    renderPanel();
    fireEvent.click(settingsTab());
    expect(anchor(GAMEPANEL_AUDIO_ID)).not.toBeNull();
    for (const [key, id] of controls) {
      const control = anchor(id);
      expect(control, id).not.toBeNull();
      expect(control?.textContent, id).toContain(GAMEPANEL_AUDIO_LABELS[key]);
    }
  });

  it('opens the wrench tab on Audio from any tab, and from the Keybindings page', async () => {
    renderPanel();
    expect(reveal(GAMEPANEL_AUDIO_ID)).toEqual({ ok: true });
    expect(settingsTab()).toHaveAttribute('aria-pressed', 'true');
    expect(audioPage()).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(anchor(GAMEPANEL_AUDIO_ID)?.dataset.revealHighlight).toBe('on'));

    fireEvent.click(keybindingsPage() as HTMLElement);
    reveal(GAMEPANEL_AUDIO_IDS.areaVolume);
    expect(audioPage()).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(controls)('marks the %s control itself, not the page', async (_key, id) => {
    renderPanel();
    reveal(id);
    await waitFor(() => expect(anchor(id)?.dataset.revealHighlight).toBe('on'));
    expect(anchor(GAMEPANEL_AUDIO_ID)?.dataset.revealHighlight).toBeUndefined();
  });

  it('changes no setting and moves no focus', () => {
    const onVolumeChange = vi.fn();
    const onMuteWhenUnfocusedChange = vi.fn();
    renderPanel({ onVolumeChange, onMuteWhenUnfocusedChange });
    const before = document.activeElement;
    reveal(GAMEPANEL_AUDIO_IDS.muteWhenUnfocused);
    expect(document.activeElement).toBe(before);
    expect(onVolumeChange).not.toHaveBeenCalled();
    expect(onMuteWhenUnfocusedChange).not.toHaveBeenCalled();
  });

  it('opens a closed Mobile side panel on Audio', () => {
    const { container } = renderPanel({
      clientLayoutMode: 'mobile',
      mobileFrame: defaultOsmFrame({ width: 844, height: 390 }, { top: 0, right: 0, bottom: 0, left: 0 }),
      viewportWidth: 844,
      viewportHeight: 390,
    });
    const rail = container.querySelector('[data-tutorial="tab-bar"]') as HTMLElement;
    fireEvent.click(within(rail).getByRole('button', { name: /^Inventory/ }));
    expect(container.querySelector('[data-tutorial="game-panel"]')).toBeNull();

    reveal(GAMEPANEL_AUDIO_IDS.masterVolume);

    expect(container.querySelector('[data-tutorial="game-panel"]')).not.toBeNull();
    expect(audioPage()).toHaveAttribute('aria-pressed', 'true');
  });

  describe('while a replay owns the panel', () => {
    it('refuses with the Audio reason when the replay shows another tab, changing nothing', () => {
      const onActiveTabChange = vi.fn();
      renderPanel({ replayActiveTab: 'prayer', onActiveTabChange }, replayPresentation('prayer'));
      const blocked = { ok: false, reason: REVEAL_REPLAY_AUDIO_REASON };
      expect(getRevealAvailability(GAMEPANEL_AUDIO_IDS.sfxVolume)).toEqual(blocked);
      expect(reveal(GAMEPANEL_AUDIO_ID)).toEqual(blocked);
      expect(onActiveTabChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: /^Prayer/ })).toHaveAttribute('aria-pressed', 'true');
    });

    it('refuses while the replay shows the Keybindings page', () => {
      renderPanel({ replayActiveTab: 'settings' }, replayPresentation('settings', { settingsSubTab: 'keybinds' }));
      expect(reveal(GAMEPANEL_AUDIO_IDS.masterVolume)).toEqual({ ok: false, reason: REVEAL_REPLAY_AUDIO_REASON });
      expect(keybindingsPage()).toHaveAttribute('aria-pressed', 'true');
    });

    it('refuses Audio while the recording has its Modern settings panel closed', () => {
      renderPanel(
        { replayActiveTab: 'settings' },
        replayPresentation('settings', { settingsSubTab: 'audio', modernPanelOpen: false }),
      );
      expect(reveal(GAMEPANEL_AUDIO_IDS.masterVolume)).toEqual({ ok: false, reason: REVEAL_REPLAY_AUDIO_REASON });
      expect(anchor(GAMEPANEL_AUDIO_ID)).toBeNull();
      expect(settingsTab()).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks a control the replay is already showing, whose volumes stay the viewer’s, without navigating', async () => {
      const onActiveTabChange = vi.fn();
      renderPanel(
        { replayActiveTab: 'settings', onActiveTabChange },
        replayPresentation('settings', { settingsSubTab: 'audio' }),
      );
      expect(reveal(GAMEPANEL_AUDIO_IDS.sfxVolume)).toEqual({ ok: true });
      await waitFor(() => expect(anchor(GAMEPANEL_AUDIO_IDS.sfxVolume)?.dataset.revealHighlight).toBe('on'));
      expect(onActiveTabChange).not.toHaveBeenCalled();
      // The keybind editor stays out of reach: the replay keeps it read-only.
      expect(getRevealAvailability(GAMEPANEL_KEYBINDS_ID)).toEqual({ ok: false, reason: REVEAL_REPLAY_REASON });
    });
  });
});
