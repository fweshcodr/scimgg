// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildZukControls } from '../../encounters/zuk/controls';
import { loadUnifiedKeybindStore } from '../../hooks/keybindStore';
import { ANTI_DRAG_DEFAULTS } from '../../hooks/useAntiDrag';
import { BOSS_HEALTH_BAR_DEFAULTS } from '../../hooks/useBossHealthBarSettings';
import { PERSISTED_SETTINGS_DEFAULTS } from '../../hooks/usePersistedSettings';
import { XP_DROP_DEFAULTS } from '../../hooks/useXpDropSettings';
import { isCapturingKeybind } from '../../input/keybindCapture';
import { SETTINGS_SEARCH_ENTRIES } from '../../settingsSearch/entries';
import { pluginSearchId } from '../../settingsSearch/ids';
import { DEFAULT_COMPACT_ORBS_ORDER } from '../../types/compactOrbs';
import { DEFAULT_HIGHLIGHT_MENU_ENTRIES } from '../../types/npcHighlight';
import { DEFAULT_TILE_INDICATOR_CONFIG } from '../../types/tileIndicators';
import { DEFAULT_TILE_MARKER_WIDTH } from '../../types/tileMarkers';
import { deleteSetting } from '../../util/storage';
import { PluginsPanel } from '../PluginsPanel';
import { getRevealAvailability, revealSetting } from '../settingsReveal';

/** A stand-in Settings drawer holding `id`'s anchor, so a link into Settings has somewhere to land. */
function SettingsDestination({ id }: { id: string }) {
  return (
    <aside className="controls-overlay">
      <div data-search-id={id} />
    </aside>
  );
}

const noop = () => {};
const settingsEntryById = (id: string) => SETTINGS_SEARCH_ENTRIES.find((entry) => entry.id === id);

const baseProps: React.ComponentProps<typeof PluginsPanel> = {
  visible: true,
  onClose: noop,
  encounterKind: 'lobby',
  showTickCounter: PERSISTED_SETTINGS_DEFAULTS.showTickCounter,
  onShowTickCounterToggle: noop,
  showTickCounterOverhead: PERSISTED_SETTINGS_DEFAULTS.showTickCounterOverhead,
  onShowTickCounterOverheadToggle: noop,
  tickCounterAbovePrayerIcon: PERSISTED_SETTINGS_DEFAULTS.tickCounterAbovePrayerIcon,
  onTickCounterAbovePrayerIconToggle: noop,
  showTickCounterInfobox: PERSISTED_SETTINGS_DEFAULTS.showTickCounterInfobox,
  onShowTickCounterInfoboxToggle: noop,
  tickCounterMax: PERSISTED_SETTINGS_DEFAULTS.tickCounterMax,
  onTickCounterMaxChange: noop,
  tickCounterFontSize: PERSISTED_SETTINGS_DEFAULTS.tickCounterFontSize,
  onTickCounterFontSizeChange: noop,
  tickCounterColors: PERSISTED_SETTINGS_DEFAULTS.tickCounterColors,
  onTickCounterColorsChange: noop,
  tickCounterOffsetX: PERSISTED_SETTINGS_DEFAULTS.tickCounterOffsetX,
  tickCounterOffsetY: PERSISTED_SETTINGS_DEFAULTS.tickCounterOffsetY,
  onTickCounterOffsetChange: noop,
  showNpcClickbox: PERSISTED_SETTINGS_DEFAULTS.showNpcClickbox,
  onShowNpcClickboxToggle: noop,
  showCoordinates: PERSISTED_SETTINGS_DEFAULTS.showCoordinates,
  onShowCoordinatesToggle: noop,
  npcAttackTimerMetronomeEnabled: PERSISTED_SETTINGS_DEFAULTS.npcAttackTimerMetronomeEnabled,
  onNpcAttackTimerMetronomeToggle: noop,
  showTickTiming: PERSISTED_SETTINGS_DEFAULTS.showTickTiming,
  onShowTickTimingToggle: noop,
  showDetailedDps: PERSISTED_SETTINGS_DEFAULTS.showDetailedDps,
  onShowDetailedDpsToggle: noop,
  dpsOverlayShowDetails: PERSISTED_SETTINGS_DEFAULTS.dpsOverlayShowDetails,
  onDpsOverlayShowDetailsToggle: noop,
  showSoundDebug: PERSISTED_SETTINGS_DEFAULTS.showSoundDebug,
  onShowSoundDebugToggle: noop,
  showCameraDebug: PERSISTED_SETTINGS_DEFAULTS.showCameraDebug,
  onShowCameraDebugToggle: noop,
  showModifierKeys: PERSISTED_SETTINGS_DEFAULTS.showModifierKeys,
  onShowModifierKeysToggle: noop,
  hideHardwareAccelWarning: PERSISTED_SETTINGS_DEFAULTS.hideHardwareAccelWarning,
  onHideHardwareAccelWarningToggle: noop,
  encounterDebugFlags: {},
  onSetEncounterDebugFlag: noop,
  tileMarkers: [],
  showTileMarkers: true,
  onToggleShowTileMarkers: noop,
  showTileMarkerLabels: true,
  onToggleShowTileMarkerLabels: noop,
  tileMarkerWidth: DEFAULT_TILE_MARKER_WIDTH,
  onTileMarkerWidthChange: noop,
  onRemoveMarker: noop,
  onClearAllMarkers: noop,
  lineMarkers: [],
  showLineMarkers: true,
  onToggleShowLineMarkers: noop,
  showLineMarkerLabels: true,
  onToggleShowLineMarkerLabels: noop,
  lineMarkerWidth: 1,
  onLineMarkerWidthChange: noop,
  availableLinePresets: [],
  activeLinePresetIds: [],
  onToggleLinePreset: noop,
  onDeactivateAllLinePresets: noop,
  onRemoveLineMarker: noop,
  onClearAllLineMarkers: noop,
  npcHighlights: [],
  showNpcHighlights: true,
  onToggleShowNpcHighlights: noop,
  onRemoveNpcHighlight: noop,
  onRemoveAllNpcHighlightsForNpc: noop,
  onClearAllNpcHighlights: noop,
  antiDragEnabled: ANTI_DRAG_DEFAULTS.enabled,
  onAntiDragToggle: noop,
  dragOnShiftOnly: ANTI_DRAG_DEFAULTS.onShiftOnly,
  onDragOnShiftOnlyToggle: noop,
  antiDragDelay: ANTI_DRAG_DEFAULTS.dragDelay,
  onAntiDragDelayChange: noop,
  antiDragCtrlToDrag: ANTI_DRAG_DEFAULTS.ctrlToDrag,
  onAntiDragCtrlToDragToggle: noop,
  xpDropsEnabled: XP_DROP_DEFAULTS.enabled,
  onXpDropsToggle: noop,
  xpDropsShowPredictedHit: XP_DROP_DEFAULTS.showPredictedHit,
  onXpDropsPredictedHitToggle: noop,
  xpDropsGrouped: XP_DROP_DEFAULTS.grouped,
  onXpDropsGroupedToggle: noop,
  xpDropsShowIcons: XP_DROP_DEFAULTS.showIcons,
  onXpDropsShowIconsToggle: noop,
  xpDropsSpeed: XP_DROP_DEFAULTS.speed,
  onXpDropsSpeedChange: noop,
  bossHealthBarEnabled: BOSS_HEALTH_BAR_DEFAULTS.enabled,
  onBossHealthBarToggle: noop,
  bossHealthBarShowName: BOSS_HEALTH_BAR_DEFAULTS.showName,
  onBossHealthBarShowNameToggle: noop,
  bossHealthBarShowValues: BOSS_HEALTH_BAR_DEFAULTS.showValues,
  onBossHealthBarShowValuesToggle: noop,
  bossHealthBarShowPercentage: BOSS_HEALTH_BAR_DEFAULTS.showPercentage,
  onBossHealthBarShowPercentageToggle: noop,
  showInventoryTags: false,
  onToggleShowInventoryTags: noop,
  inventoryTagCount: 0,
  onClearAllInventoryTags: noop,
  availablePresets: [],
  activePresetIds: [],
  onTogglePreset: noop,
  onDeactivateAllPresets: noop,
  onImportMarkers: noop,
  onExportMarkers: noop,
  onExportPreset: noop,
  tileIndicatorsEnabled: false,
  onTileIndicatorsToggle: noop,
  tileIndicatorConfig: DEFAULT_TILE_INDICATOR_CONFIG,
  onTileIndicatorStyleChange: noop,
  cameraPluginEnabled: PERSISTED_SETTINGS_DEFAULTS.cameraPluginEnabled,
  onCameraPluginToggle: noop,
  cameraVerticalCamera: PERSISTED_SETTINGS_DEFAULTS.cameraVerticalCamera,
  onCameraVerticalCameraToggle: noop,
  cameraInvertYaw: PERSISTED_SETTINGS_DEFAULTS.cameraInvertYaw,
  onCameraInvertYawToggle: noop,
  cameraInvertPitch: PERSISTED_SETTINGS_DEFAULTS.cameraInvertPitch,
  onCameraInvertPitchToggle: noop,
  cameraInnerZoomLevel: PERSISTED_SETTINGS_DEFAULTS.cameraInnerZoomLevel,
  onCameraInnerZoomLevelChange: noop,
  cameraOuterZoomLimit: PERSISTED_SETTINGS_DEFAULTS.cameraOuterZoomLimit,
  onCameraOuterZoomLimitChange: noop,
  cameraSpeed: PERSISTED_SETTINGS_DEFAULTS.cameraSpeed,
  cameraDragSpeed: PERSISTED_SETTINGS_DEFAULTS.cameraDragSpeed,
  onCameraDragSpeedChange: noop,
  onCameraSpeedChange: noop,
  cameraRightClickMovesCamera: PERSISTED_SETTINGS_DEFAULTS.cameraRightClickMovesCamera,
  onCameraRightClickMovesCameraToggle: noop,
  cameraZoomIncrement: PERSISTED_SETTINGS_DEFAULTS.cameraZoomIncrement,
  onCameraZoomIncrementChange: noop,
  attackTimerMetronomeEnabled: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeEnabled,
  onAttackTimerMetronomeToggle: noop,
  attackTimerMetronomeShowBar: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeShowBar,
  onAttackTimerMetronomeShowBarToggle: noop,
  attackTimerMetronomeShowTicks: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeShowTicks,
  onAttackTimerMetronomeShowTicksToggle: noop,
  attackTimerMetronomeFontSize: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeFontSize,
  onAttackTimerMetronomeFontSizeChange: noop,
  attackTimerMetronomeAbovePrayerIcon: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeAbovePrayerIcon,
  onAttackTimerMetronomeAbovePrayerIconToggle: noop,
  attackTimerMetronomeOffsetX: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeOffsetX,
  attackTimerMetronomeOffsetY: PERSISTED_SETTINGS_DEFAULTS.attackTimerMetronomeOffsetY,
  onAttackTimerMetronomeOffsetChange: noop,
  instantInventoryEnabled: PERSISTED_SETTINGS_DEFAULTS.instantInventoryEnabled,
  onInstantInventoryToggle: noop,
  instantPrayerEnabled: PERSISTED_SETTINGS_DEFAULTS.instantPrayerEnabled,
  onInstantPrayerToggle: noop,
  prayerEnabled: PERSISTED_SETTINGS_DEFAULTS.prayerEnabled,
  onPrayerToggle: noop,
  prayerFlickOrbEnabled: PERSISTED_SETTINGS_DEFAULTS.prayerFlickOrbEnabled,
  onPrayerFlickOrbToggle: noop,
  prayerFlickAlwaysOn: PERSISTED_SETTINGS_DEFAULTS.prayerFlickAlwaysOn,
  onPrayerFlickAlwaysOnToggle: noop,
  prayerFlickEnabled: PERSISTED_SETTINGS_DEFAULTS.prayerFlickEnabled,
  onPrayerFlickToggle: noop,
  tickAudioMetronomeEnabled: PERSISTED_SETTINGS_DEFAULTS.tickAudioMetronomeEnabled,
  onTickAudioMetronomeToggle: noop,
  tickAudioMetronomeTock: PERSISTED_SETTINGS_DEFAULTS.tickAudioMetronomeTock,
  onTickAudioMetronomeTockToggle: noop,
  tickAudioMetronomeVolume: PERSISTED_SETTINGS_DEFAULTS.tickAudioMetronomeVolume,
  onTickAudioMetronomeVolumeChange: noop,
  tileGridEnabled: PERSISTED_SETTINGS_DEFAULTS.tileGridEnabled,
  onTileGridToggle: noop,
  tileGridColor: PERSISTED_SETTINGS_DEFAULTS.tileGridColor,
  onTileGridColorChange: noop,
  tileGridOpacity: PERSISTED_SETTINGS_DEFAULTS.tileGridOpacity,
  onTileGridOpacityChange: noop,
  tileGridWidth: PERSISTED_SETTINGS_DEFAULTS.tileGridWidth,
  onTileGridWidthChange: noop,
  statusBarsEnabled: PERSISTED_SETTINGS_DEFAULTS.statusBarsEnabled,
  onStatusBarsToggle: noop,
  statusBarsShowValues: PERSISTED_SETTINGS_DEFAULTS.statusBarsShowValues,
  onStatusBarsShowValuesToggle: noop,
  entityHiderEnabled: PERSISTED_SETTINGS_DEFAULTS.entityHiderEnabled,
  onEntityHiderToggle: noop,
  entityHider: PERSISTED_SETTINGS_DEFAULTS.entityHider,
  onEntityHiderOptionToggle: noop,
  tzhaarHpTrackerEnabled: PERSISTED_SETTINGS_DEFAULTS.tzhaarHpTrackerEnabled,
  onTzhaarHpTrackerToggle: noop,
  tzhaarHpTracker: PERSISTED_SETTINGS_DEFAULTS.tzhaarHpTracker,
  onTzhaarHpTrackerChange: noop,
  infernoAdditionsEnabled: PERSISTED_SETTINGS_DEFAULTS.infernoAdditionsEnabled,
  onInfernoAdditionsToggle: noop,
  infernoAdditions: PERSISTED_SETTINGS_DEFAULTS.infernoAdditions,
  onInfernoAdditionsChange: noop,
  colosseumAdditionsEnabled: PERSISTED_SETTINGS_DEFAULTS.colosseumAdditionsEnabled,
  onColosseumAdditionsToggle: noop,
  colosseumAdditions: PERSISTED_SETTINGS_DEFAULTS.colosseumAdditions,
  onColosseumAdditionsChange: noop,
  uiScale: PERSISTED_SETTINGS_DEFAULTS.uiScale,
  onUiScaleChange: noop,
  stretchedModePluginEnabled: PERSISTED_SETTINGS_DEFAULTS.stretchedModePluginEnabled,
  onStretchedModePluginToggle: noop,
  autoOverlayScaleEnabled: PERSISTED_SETTINGS_DEFAULTS.autoOverlayScaleEnabled,
  onAutoOverlayScaleToggle: noop,
  customMenuSwapsEnabled: PERSISTED_SETTINGS_DEFAULTS.customMenuSwapsEnabled,
  onCustomMenuSwapsToggle: noop,
  customMenuSwaps: PERSISTED_SETTINGS_DEFAULTS.customMenuSwaps,
  onCustomMenuSwapsChange: noop,
  npcHighlightColorMenuEntries: DEFAULT_HIGHLIGHT_MENU_ENTRIES,
  onToggleNpcHighlightColorMenuEntries: noop,
  compactOrbsEnabled: true,
  onCompactOrbsToggle: noop,
  compactOrbsLayout: 'horizontal',
  onCompactOrbsLayoutChange: noop,
  compactOrbsOrder: [...DEFAULT_COMPACT_ORBS_ORDER].reverse(),
  onCompactOrbsOrderChange: noop,
  fixedLayoutScale: PERSISTED_SETTINGS_DEFAULTS.fixedLayoutScale,
  onFixedLayoutScaleChange: noop,
  fixedLayoutIntegerScaling: PERSISTED_SETTINGS_DEFAULTS.fixedLayoutIntegerScaling,
  onFixedLayoutIntegerScalingChange: noop,
};

function compactOrbsRow(container: HTMLElement): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.plugin-row')).find(
    (candidate) => candidate.querySelector('.plugin-name')?.textContent === 'Compact Orbs',
  );
  if (!row) throw new Error('Compact Orbs row not found');
  return row;
}

function expandCompactOrbs(container: HTMLElement): HTMLElement {
  const row = compactOrbsRow(container);
  const titleButton = row.querySelector<HTMLButtonElement>('.plugin-title-btn');
  if (!titleButton) throw new Error('Compact Orbs title button not found');
  fireEvent.click(titleButton);
  return row;
}

function expandTileMarkers(container: HTMLElement): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.plugin-row')).find(
    (candidate) => candidate.querySelector('.plugin-name')?.textContent === 'Tile Markers',
  );
  if (!row) throw new Error('Tile Markers row not found');
  const titleButton = row.querySelector<HTMLButtonElement>('.plugin-title-btn');
  if (!titleButton) throw new Error('Tile Markers title button not found');
  fireEvent.click(titleButton);
  return row;
}

function settingInput(row: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(row.querySelectorAll('.plugin-setting-label')).find(
    (candidate) => candidate.textContent === labelText,
  );
  const input = label?.parentElement?.querySelector<HTMLInputElement>('input');
  if (!input) throw new Error(`${labelText} input not found`);
  return input;
}

function borderWidthInput(row: HTMLElement): HTMLInputElement {
  return settingInput(row, 'Border width:');
}

function expandStretchedMode(container: HTMLElement): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.plugin-row')).find(
    (candidate) => candidate.querySelector('.plugin-name')?.textContent === 'Stretched Mode',
  );
  if (!row) throw new Error('Stretched Mode row not found');
  const titleButton = row.querySelector<HTMLButtonElement>('.plugin-title-btn');
  if (!titleButton) throw new Error('Stretched Mode title button not found');
  fireEvent.click(titleButton);
  return row;
}

function expandPluginRow(container: HTMLElement, label: string): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.plugin-row')).find(
    (candidate) => candidate.querySelector('.plugin-name')?.textContent === label,
  );
  if (!row) throw new Error(`${label} row not found`);
  const titleButton = row.querySelector<HTMLButtonElement>('.plugin-title-btn');
  if (!titleButton) throw new Error(`${label} title button not found`);
  fireEvent.click(titleButton);
  return row;
}

afterEach(() => {
  cleanup();
});

describe('PluginsPanel Custom Menu Swaps guidance', () => {
  it('keeps the example syntax outside the empty rules editor', () => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    const row = expandPluginRow(container, 'Custom Menu Swaps');
    const input = row.querySelector<HTMLTextAreaElement>('.menu-swaps-input');
    const format = row.querySelector<HTMLElement>('.menu-swaps-format');
    if (!input) throw new Error('Custom Menu Swaps textarea not found');
    if (!format) throw new Error('Custom Menu Swaps format guide not found');

    expect(input.value).toBe('');
    // An example in the placeholder reads as a rule that is already active.
    expect(input.placeholder).not.toContain(',');
    expect(format.textContent).toContain('option,target');
    expect(format.textContent).toContain('attack,void flare*');
    expect(format.contains(input)).toBe(false);
  });
});

describe('PluginsPanel encounter debug flags', () => {
  it('does not list the Ancestral Glyph safe tiles mechanic under Debug Overlays', () => {
    const onSetEncounterDebugFlag = vi.fn();
    const view = render(
      <PluginsPanel
        {...baseProps}
        encounterDebugSectionTitle="TzKal-Zuk"
        encounterDebugFlagsInfo={buildZukControls().debugFlags}
        onSetEncounterDebugFlag={onSetEncounterDebugFlag}
      />,
    );
    const row = expandPluginRow(view.container, 'Debug Overlays');
    expect(row.textContent).not.toContain('Shield Safe Tiles');
  });
});

describe('PluginsPanel NPC Attack Timer Metronome', () => {
  it('lists the checkbox under Debug Overlays, off by default, and reports its toggle', () => {
    const onNpcAttackTimerMetronomeToggle = vi.fn();
    const view = render(
      <PluginsPanel {...baseProps} onNpcAttackTimerMetronomeToggle={onNpcAttackTimerMetronomeToggle} />,
    );
    const row = expandPluginRow(view.container, 'Debug Overlays');
    const checkbox = checkboxByLabel(row, 'NPC Attack Timer Metronome');

    expect(PERSISTED_SETTINGS_DEFAULTS.npcAttackTimerMetronomeEnabled).toBe(false);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(checkbox);

    expect(onNpcAttackTimerMetronomeToggle).toHaveBeenCalledOnce();
  });

  it('marks the row as modified only once it leaves its default, and resets it back', () => {
    const onNpcAttackTimerMetronomeToggle = vi.fn();
    const { container, rerender } = render(
      <PluginsPanel {...baseProps} onNpcAttackTimerMetronomeToggle={onNpcAttackTimerMetronomeToggle} />,
    );
    const row = expandPluginRow(container, 'Debug Overlays');
    const settingRow = checkboxByLabel(row, 'NPC Attack Timer Metronome').closest('.setting-row');
    if (!settingRow) throw new Error('NPC Attack Timer Metronome setting row not found');
    const reset = settingRow.querySelector<HTMLButtonElement>('.setting-row__reset');
    if (!reset) throw new Error('NPC Attack Timer Metronome reset button not found');

    expect(settingRow.classList.contains('setting-row--modified')).toBe(false);
    fireEvent.click(reset);
    expect(onNpcAttackTimerMetronomeToggle).not.toHaveBeenCalled();

    rerender(
      <PluginsPanel
        {...baseProps}
        npcAttackTimerMetronomeEnabled
        onNpcAttackTimerMetronomeToggle={onNpcAttackTimerMetronomeToggle}
      />,
    );
    expect(checkboxByLabel(row, 'NPC Attack Timer Metronome').getAttribute('aria-checked')).toBe('true');
    expect(settingRow.classList.contains('setting-row--modified')).toBe(true);

    fireEvent.click(reset);

    expect(onNpcAttackTimerMetronomeToggle).toHaveBeenCalledOnce();
  });
});

describe('PluginsPanel DPS Overlay', () => {
  it('names the DPS Overlay switch after its row and reports the current setting', () => {
    const view = render(<PluginsPanel {...baseProps} showDetailedDps />);

    expect(view.getByRole('switch', { name: 'DPS Overlay' }).getAttribute('aria-checked')).toBe('true');

    view.rerender(<PluginsPanel {...baseProps} showDetailedDps={false} />);

    expect(view.getByRole('switch', { name: 'DPS Overlay' }).getAttribute('aria-checked')).toBe('false');
  });

  it('reports a toggle through the standalone switch', () => {
    const onShowDetailedDpsToggle = vi.fn();
    const view = render(<PluginsPanel {...baseProps} onShowDetailedDpsToggle={onShowDetailedDpsToggle} />);

    fireEvent.click(view.getByRole('switch', { name: 'DPS Overlay' }));

    expect(onShowDetailedDpsToggle).toHaveBeenCalledOnce();
  });

  it('offers Detailed DPS behind the row caret, off by default, and does not sit under Debug Overlays', () => {
    const view = render(<PluginsPanel {...baseProps} />);
    const row = view.getByRole('switch', { name: 'DPS Overlay' }).closest<HTMLElement>('.plugin-row');
    if (!row) throw new Error('DPS Overlay row not found');

    expect(row.querySelector('svg.plugin-caret')).not.toBeNull();
    expect(row.querySelector('.plugin-body')).toBeNull();

    expandPluginRow(view.container, 'DPS Overlay');

    expect(PERSISTED_SETTINGS_DEFAULTS.dpsOverlayShowDetails).toBe(false);
    expect(checkboxByLabel(row, 'Detailed DPS').getAttribute('aria-checked')).toBe('false');

    const debugLabels = Array.from(
      expandPluginRow(view.container, 'Debug Overlays').querySelectorAll('.osrs-checkbox__label'),
      (label) => label.textContent,
    );
    expect(debugLabels).not.toContain('Detailed DPS');
  });

  it('reports the current Detailed DPS setting and toggles it through the checkbox', () => {
    const onDpsOverlayShowDetailsToggle = vi.fn();
    const view = render(
      <PluginsPanel
        {...baseProps}
        dpsOverlayShowDetails
        onDpsOverlayShowDetailsToggle={onDpsOverlayShowDetailsToggle}
      />,
    );
    const row = expandPluginRow(view.container, 'DPS Overlay');
    const checkbox = checkboxByLabel(row, 'Detailed DPS');

    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(checkbox);

    expect(onDpsOverlayShowDetailsToggle).toHaveBeenCalledOnce();
  });

  it('marks Detailed DPS as modified only once it leaves its default, and resets it back', () => {
    const onDpsOverlayShowDetailsToggle = vi.fn();
    const { container, rerender } = render(
      <PluginsPanel
        {...baseProps}
        dpsOverlayShowDetails={PERSISTED_SETTINGS_DEFAULTS.dpsOverlayShowDetails}
        onDpsOverlayShowDetailsToggle={onDpsOverlayShowDetailsToggle}
      />,
    );
    const row = expandPluginRow(container, 'DPS Overlay');
    const settingRow = checkboxByLabel(row, 'Detailed DPS').closest('.setting-row');
    if (!settingRow) throw new Error('Detailed DPS setting row not found');

    expect(settingRow.classList.contains('setting-row--modified')).toBe(false);
    fireEvent.click(settingRow.querySelector<HTMLButtonElement>('.setting-row__reset') as HTMLButtonElement);
    expect(onDpsOverlayShowDetailsToggle).not.toHaveBeenCalled();

    rerender(
      <PluginsPanel
        {...baseProps}
        dpsOverlayShowDetails={!PERSISTED_SETTINGS_DEFAULTS.dpsOverlayShowDetails}
        onDpsOverlayShowDetailsToggle={onDpsOverlayShowDetailsToggle}
      />,
    );
    expect(settingRow.classList.contains('setting-row--modified')).toBe(true);

    const reset = settingRow.querySelector<HTMLButtonElement>('.setting-row__reset');
    if (!reset) throw new Error('Detailed DPS reset button not found');
    fireEvent.click(reset);

    expect(onDpsOverlayShowDetailsToggle).toHaveBeenCalledOnce();
  });

  // The Plugins tour opens this row by its `expandedPlugins` key, so the key the
  // tutorial dispatches and the key the panel reads must stay the same string.
  it('expands the row settings for the tutorial under the dpsOverlay key', () => {
    const view = render(<PluginsPanel {...baseProps} />);
    const row = view.getByRole('switch', { name: 'DPS Overlay' }).closest<HTMLElement>('.plugin-row');
    if (!row) throw new Error('DPS Overlay row not found');

    act(() => {
      window.dispatchEvent(
        new CustomEvent('tutorial:plugin-settings', { detail: { pluginKey: 'dpsOverlay', expanded: true } }),
      );
    });

    expect(checkboxByLabel(row, 'Detailed DPS')).toBeDefined();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('tutorial:plugin-settings', { detail: { pluginKey: 'dpsOverlay', expanded: false } }),
      );
    });

    expect(row.querySelector('.plugin-body')).toBeNull();
  });

  // The tour expands the row Driver has spotlit. Rewriting the className would drop Driver's
  // `driver-active-element`, and `.driver-active *` then makes the row's controls unclickable.
  it("keeps Driver's spotlight class on the row through a tutorial expand and collapse", () => {
    const view = render(<PluginsPanel {...baseProps} />);
    const row = view.getByRole('switch', { name: 'DPS Overlay' }).closest<HTMLElement>('.plugin-row');
    if (!row) throw new Error('DPS Overlay row not found');
    row.classList.add('driver-active-element');

    const dispatch = (expanded: boolean) =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent('tutorial:plugin-settings', { detail: { pluginKey: 'dpsOverlay', expanded } }),
        );
      });

    dispatch(true);
    expect(row.getAttribute('data-expanded')).toBe('true');
    expect(row.classList.contains('driver-active-element')).toBe(true);

    dispatch(false);
    expect(row.hasAttribute('data-expanded')).toBe(false);
    expect(row.classList.contains('driver-active-element')).toBe(true);
  });
});

describe('PluginsPanel Compact Orbs availability', () => {
  it('keeps the Compact Orbs controls available outside the fixed layout', () => {
    const { container } = render(<PluginsPanel {...baseProps} fixedLayout={false} />);
    const row = expandCompactOrbs(container);

    expect(row.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(false);
    expect(row.querySelector('.plugin-unavailable-note')).toBeNull();
    const segmentButtons = row.querySelectorAll<HTMLButtonElement>('.compact-orbs-segment');
    expect(segmentButtons).toHaveLength(3);
    for (const button of segmentButtons) {
      expect(button.disabled).toBe(false);
    }
    const slotButtons = row.querySelectorAll<HTMLButtonElement>('.compact-orbs-slot');
    expect(slotButtons).toHaveLength(4);
    for (const button of slotButtons) {
      expect(button.disabled).toBe(false);
    }
    expect(row.querySelectorAll('.setting-row__reset')).toHaveLength(2);
    expect(row.querySelector('.compact-orbs-hint')).not.toBeNull();
  });

  it('makes every Compact Orbs control unavailable in the fixed layout', () => {
    const { container } = render(<PluginsPanel {...baseProps} fixedLayout />);
    const row = expandCompactOrbs(container);

    expect(row.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    expect(row.querySelector('.plugin-unavailable-note')?.textContent).toBe(
      "Fixed mode keeps the client's own orb arrangement.",
    );
    const segmentButtons = row.querySelectorAll<HTMLButtonElement>('.compact-orbs-segment');
    expect(segmentButtons).toHaveLength(3);
    for (const button of segmentButtons) {
      expect(button.disabled).toBe(true);
    }
    const slotButtons = row.querySelectorAll<HTMLButtonElement>('.compact-orbs-slot');
    expect(slotButtons).toHaveLength(4);
    for (const button of slotButtons) {
      expect(button.disabled).toBe(true);
    }
    expect(row.querySelector('.setting-row__reset')).toBeNull();
    expect(row.querySelector('.compact-orbs-hint')).toBeNull();
  });

  it('makes every Compact Orbs control unavailable in the Mobile layout, which keeps its own orbs', () => {
    const { container } = render(<PluginsPanel {...baseProps} mobileLayout />);
    const row = expandCompactOrbs(container);

    expect(row.querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    expect(row.querySelector('.plugin-unavailable-note')?.textContent).toBe(
      "Mobile keeps the client's own orb arrangement.",
    );
    const controls = row.querySelectorAll<HTMLButtonElement>('.compact-orbs-segment, .compact-orbs-slot');
    expect(controls).toHaveLength(7);
    for (const button of controls) expect(button.disabled).toBe(true);
    expect(row.querySelector('.setting-row__reset')).toBeNull();
    expect(row.querySelector('.compact-orbs-hint')).toBeNull();
  });

  it('clears a pending orb swap when switching into the fixed layout', () => {
    const { container, rerender } = render(<PluginsPanel {...baseProps} fixedLayout={false} />);
    const row = expandCompactOrbs(container);
    const firstSlot = row.querySelector<HTMLButtonElement>('.compact-orbs-slot');
    if (!firstSlot) throw new Error('Compact Orbs slot not found');
    fireEvent.click(firstSlot);
    expect(firstSlot.classList.contains('is-selected')).toBe(true);
    expect(firstSlot.getAttribute('aria-pressed')).toBe('true');

    rerender(<PluginsPanel {...baseProps} fixedLayout />);
    rerender(<PluginsPanel {...baseProps} fixedLayout={false} />);

    expect(row.querySelector('.compact-orbs-slot.is-selected')).toBeNull();
    for (const slot of row.querySelectorAll('.compact-orbs-slot')) {
      expect(slot.getAttribute('aria-pressed')).toBe('false');
    }
  });
});

// A chord is one key press, so it gets one cap. Splitting it back into
// `<kbd>Shift</kbd>+Right-click` leaves the second half as unstyled prose.
describe('PluginsPanel keybind hints', () => {
  it.each([
    'Inventory Tags',
    'Line Markers',
    'NPC Highlights',
    'Tile Markers',
  ])('renders the %s shortcut as one shared keycap', (label) => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    const caps = expandPluginRow(container, label).querySelectorAll('kbd.kbd');

    expect(caps).toHaveLength(1);
    expect(caps[0]?.textContent).toBe('Shift + Right-click');
  });
});

describe('PluginsPanel plugin toggle names', () => {
  it('names the Status Bars switch after its row and reports the current setting', () => {
    const view = render(<PluginsPanel {...baseProps} statusBarsEnabled />);

    expect(view.getByRole('switch', { name: 'Status Bars' }).getAttribute('aria-checked')).toBe('true');

    view.rerender(<PluginsPanel {...baseProps} statusBarsEnabled={false} />);

    expect(view.getByRole('switch', { name: 'Status Bars' }).getAttribute('aria-checked')).toBe('false');
  });
});

it('does not present simulation restart controls as a plugin', () => {
  render(<PluginsPanel {...baseProps} />);
  expect(screen.queryByText('Replay Practice')).toBeNull();
  expect(screen.queryByRole('spinbutton', { name: 'Ticks to go back' })).toBeNull();
});

describe('PluginsPanel Status Bars values', () => {
  it('offers Show values behind the row caret, reporting and toggling the setting', () => {
    const onStatusBarsShowValuesToggle = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        statusBarsEnabled
        statusBarsShowValues
        onStatusBarsShowValuesToggle={onStatusBarsShowValuesToggle}
      />,
    );
    const row = expandPluginRow(container, 'Status Bars');
    const checkbox = checkboxByLabel(row, 'Show values');

    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(checkbox);

    expect(onStatusBarsShowValuesToggle).toHaveBeenCalledOnce();
  });

  it('marks Show values as modified only once it leaves its default, and resets it back', () => {
    const onStatusBarsShowValuesToggle = vi.fn();
    const { container, rerender } = render(
      <PluginsPanel
        {...baseProps}
        statusBarsShowValues={PERSISTED_SETTINGS_DEFAULTS.statusBarsShowValues}
        onStatusBarsShowValuesToggle={onStatusBarsShowValuesToggle}
      />,
    );
    const row = expandPluginRow(container, 'Status Bars');
    const settingRow = checkboxByLabel(row, 'Show values').closest('.setting-row');
    if (!settingRow) throw new Error('Show values setting row not found');

    expect(settingRow.classList.contains('setting-row--modified')).toBe(false);

    rerender(
      <PluginsPanel
        {...baseProps}
        statusBarsShowValues={!PERSISTED_SETTINGS_DEFAULTS.statusBarsShowValues}
        onStatusBarsShowValuesToggle={onStatusBarsShowValuesToggle}
      />,
    );
    expect(settingRow.classList.contains('setting-row--modified')).toBe(true);

    const reset = settingRow.querySelector<HTMLButtonElement>('.setting-row__reset');
    if (!reset) throw new Error('Show values reset button not found');
    fireEvent.click(reset);

    expect(onStatusBarsShowValuesToggle).toHaveBeenCalledOnce();
  });
});

describe('PluginsPanel Entity Hider', () => {
  it('lists the RuneLite options in config order, all off, toggling one by key', () => {
    const onEntityHiderOptionToggle = vi.fn();
    const { container } = render(<PluginsPanel {...baseProps} onEntityHiderOptionToggle={onEntityHiderOptionToggle} />);
    const row = expandPluginRow(container, 'Entity Hider');
    const labels = [
      'Hide local player',
      'Hide local player 2D',
      'Hide NPCs',
      'Hide NPCs 2D',
      'Hide attackers',
      'Hide projectiles',
      'Hide dead NPCs',
    ];

    for (const label of labels) expect(checkboxByLabel(row, label).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(checkboxByLabel(row, 'Hide attackers'));

    expect(onEntityHiderOptionToggle).toHaveBeenCalledExactlyOnceWith('hideAttackers');
  });
});

describe('PluginsPanel TzHaar HP Tracker', () => {
  it('starts at the plugin defaults and reports a changed option with the others kept', () => {
    const onTzhaarHpTrackerChange = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} encounterKind="inferno" onTzhaarHpTrackerChange={onTzhaarHpTrackerChange} />,
    );
    const row = expandPluginRow(container, 'TzHaar HP Tracker');
    const showHp = within(row).getByRole('combobox', { name: 'Show HP' }) as HTMLSelectElement;
    const highlight = within(row).getByRole('combobox', { name: 'Highlight style' }) as HTMLSelectElement;

    expect(showHp.value).toBe('aboveHpBar');
    expect(highlight.value).toBe('none');
    expect(checkboxByLabel(row, 'Recolor menu').getAttribute('aria-checked')).toBe('true');
    expect(checkboxByLabel(row, 'Hide dead NPCs').getAttribute('aria-checked')).toBe('false');

    const dynamic = within(row).getByRole('combobox', { name: 'Dynamic HP color' }) as HTMLSelectElement;
    expect(dynamic.value).toBe('off');

    fireEvent.change(showHp, { target: { value: 'center' } });
    fireEvent.change(dynamic, { target: { value: 'hp' } });

    expect(onTzhaarHpTrackerChange.mock.calls).toEqual([
      [{ ...PERSISTED_SETTINGS_DEFAULTS.tzhaarHpTracker, showHp: 'center' }],
      [{ ...PERSISTED_SETTINGS_DEFAULTS.tzhaarHpTracker, dynamicColor: 'hp' }],
    ]);
  });
});

describe('PluginsPanel Inferno and Colosseum Additions', () => {
  it.each([
    ['Inferno Additions', 'inferno', 'onInfernoAdditionsChange', 'infernoAdditions'],
    ['Colosseum Additions', 'sol_heredit', 'onColosseumAdditionsChange', 'colosseumAdditions'],
  ] as const)('%s starts at its defaults and reports one changed option with the others kept', (label, encounterKind, callback, key) => {
    const onChange = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} encounterKind={encounterKind} {...{ [callback]: onChange }} />,
    );
    const row = expandPluginRow(container, label);
    const style = within(row).getByRole('combobox', { name: 'Pillar marker style' }) as HTMLSelectElement;

    // Pillars stay drawn until hiding is opted into; their tiles are marked.
    expect(
      ['Hide pillars', 'Mark pillar tiles'].map((option) => checkboxByLabel(row, option).getAttribute('aria-checked')),
    ).toEqual(['false', 'true']);
    expect(style.value).toBe('borderedTile');
    expect((within(row).getByRole('spinbutton') as HTMLInputElement).value).toBe('60');

    fireEvent.click(checkboxByLabel(row, 'Hide pillars'));
    fireEvent.change(style, { target: { value: 'line' } });

    expect(onChange.mock.calls).toEqual([
      [{ ...PERSISTED_SETTINGS_DEFAULTS[key], hidePillars: true }],
      [{ ...PERSISTED_SETTINGS_DEFAULTS[key], pillarMarkerStyle: 'line' }],
    ]);
  });

  it("shows each arena's own options and reports them to its own plugin", () => {
    const onColosseumAdditionsChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        encounterKind="sol_heredit"
        colosseumAdditions={{ ...PERSISTED_SETTINGS_DEFAULTS.colosseumAdditions, hidePillars: true }}
        infernoAdditions={{ ...PERSISTED_SETTINGS_DEFAULTS.infernoAdditions, markPillarTiles: false }}
        onColosseumAdditionsChange={onColosseumAdditionsChange}
      />,
    );
    const row = expandPluginRow(container, 'Colosseum Additions');

    expect(checkboxByLabel(row, 'Hide pillars').getAttribute('aria-checked')).toBe('true');
    expect(checkboxByLabel(row, 'Mark pillar tiles').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(checkboxByLabel(row, 'Mark pillar tiles'));
    expect(onColosseumAdditionsChange).toHaveBeenCalledExactlyOnceWith({
      ...PERSISTED_SETTINGS_DEFAULTS.colosseumAdditions,
      hidePillars: true,
      markPillarTiles: false,
    });
  });
});

function scalePicker(row: HTMLElement): HTMLElement {
  const picker = row.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Interface scaling"]');
  if (!picker) throw new Error('Interface scaling picker not found');
  return picker;
}

function scaleOption(picker: HTMLElement, label: string): HTMLButtonElement {
  const option = Array.from(picker.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
    (candidate) => candidate.textContent === label,
  );
  if (!option) throw new Error(`Scale option ${label} not found`);
  return option;
}

describe('PluginsPanel Stretched Mode scale', () => {
  it('renders each resize shortcut as one shared keycap', () => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    const row = expandStretchedMode(container);
    const caps = row.querySelectorAll('kbd.kbd');

    // Only the UI scale resizes by hand; nothing that follows Auto offers a shortcut.
    expect(caps).toHaveLength(1);
    expect(caps[0]?.textContent).toBe('Alt + Scroll');
    expect(caps[0]?.parentElement?.textContent).toBe('Alt + Scroll over the game UI');
  });

  it('offers the Fixed layout scale in place of the UI scale in the Fixed layout', () => {
    const onFixedLayoutScaleChange = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} fixedLayout onFixedLayoutScaleChange={onFixedLayoutScaleChange} />,
    );
    const row = expandStretchedMode(container);

    expect(within(row).queryByRole('spinbutton', { name: 'UI scale' })).toBeNull();
    expect(row.querySelector('[role="radiogroup"][aria-label="Interface scaling"]')).toBeNull();
    fireEvent.change(within(row).getByLabelText('Fixed layout scale'), { target: { value: '2' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith(2);
    // Auto-size still applies in Fixed.
    expect(within(row).getByRole('checkbox', { name: 'Auto-size interface and overlays' })).toBeDefined();
  });

  it('offers Stretch to Window and Integer scaling in the Fixed layout', () => {
    const onFixedLayoutScaleChange = vi.fn();
    const onFixedLayoutIntegerScalingChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        fixedLayout
        fixedLayoutScale="stretch"
        onFixedLayoutScaleChange={onFixedLayoutScaleChange}
        onFixedLayoutIntegerScalingChange={onFixedLayoutIntegerScalingChange}
      />,
    );
    const row = expandStretchedMode(container);

    expect((within(row).getByLabelText('Fixed layout scale') as HTMLSelectElement).value).toBe('stretch');
    fireEvent.click(within(row).getByRole('checkbox', { name: 'Integer scaling' }));
    expect(onFixedLayoutIntegerScalingChange).toHaveBeenCalledWith(true);
    fireEvent.change(within(row).getByLabelText('Fixed layout scale'), { target: { value: 'fit' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith('fit');
  });

  it('points the Mobile layout at its own Interface scaling in Settings instead of a dead control', () => {
    const listener = vi.fn();
    window.addEventListener('settings:reveal', listener);
    try {
      const { container } = render(
        <>
          <PluginsPanel {...baseProps} mobileLayout />
          <SettingsDestination id="settings.mobile.interface-scaling" />
        </>,
      );
      const row = expandStretchedMode(container);

      expect(row.querySelector('.stretched-mode-hint')?.textContent).toBe('Edit mobile interface size in Settings');
      expect(within(row).queryByRole('spinbutton', { name: 'UI scale' })).toBeNull();
      expect(row.querySelector('kbd.kbd')).toBeNull();
      fireEvent.click(within(row).getByRole('button', { name: 'Edit mobile interface size in Settings' }));
      expect(listener.mock.calls[0]?.[0].detail).toEqual({
        id: 'settings.mobile.interface-scaling',
        surface: 'settings',
      });
    } finally {
      window.removeEventListener('settings:reveal', listener);
    }
  });

  it('keeps non-default emphasis on the active scale selector', () => {
    const { container } = render(<PluginsPanel {...baseProps} uiScale={3 / 2} />);
    const row = expandStretchedMode(container);

    expect(row.querySelector('.setting-row--modified')).toBeNull();
    expect(scalePicker(row).querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
  });

  it('only offers scales from 100 through 300 percent', () => {
    const { container } = render(<PluginsPanel {...baseProps} uiScale={0.85} />);
    const row = expandStretchedMode(container);
    const labels = Array.from(scalePicker(row).querySelectorAll<HTMLButtonElement>('[role="radio"]'), (option) =>
      Number(option.textContent),
    );

    expect(labels[0]).toBe(100);
    expect(labels.at(-1)).toBe(300);
    expect(labels.every((label) => label >= 100 && label <= 300)).toBe(true);
  });

  it('accepts a custom percentage without allowing values above 300', () => {
    const onUiScaleChange = vi.fn();
    const { container, getByRole, rerender } = render(
      <PluginsPanel {...baseProps} uiScale={2} onUiScaleChange={onUiScaleChange} />,
    );
    expandStretchedMode(container);

    const input = getByRole('spinbutton', { name: 'UI scale' });
    fireEvent.change(input, { target: { value: '225' } });
    expect(onUiScaleChange).toHaveBeenLastCalledWith(2.25);

    rerender(<PluginsPanel {...baseProps} uiScale={2.25} onUiScaleChange={onUiScaleChange} />);
    expect(input).toHaveValue(225);

    fireEvent.change(input, { target: { value: '301' } });
    expect(onUiScaleChange).toHaveBeenCalledTimes(1);
  });

  it('edits the shared UI scale', () => {
    const onUiScaleChange = vi.fn();
    const { container, rerender } = render(
      <PluginsPanel {...baseProps} uiScale={3 / 2} onUiScaleChange={onUiScaleChange} />,
    );
    const row = expandStretchedMode(container);
    const picker = scalePicker(row);

    expect(picker.querySelector('[aria-checked="true"]')?.textContent).toBe('150');

    fireEvent.click(scaleOption(picker, '167'));
    expect(onUiScaleChange).toHaveBeenCalledWith(5 / 3);

    rerender(<PluginsPanel {...baseProps} uiScale={5 / 3} onUiScaleChange={onUiScaleChange} />);
    expect(picker.querySelector('[aria-checked="true"]')?.textContent).toBe('167');
  });
});

describe('PluginsPanel Stretched Mode switch', () => {
  it('switches the plugin from its row, on by default', () => {
    const onStretchedModePluginToggle = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} onStretchedModePluginToggle={onStretchedModePluginToggle} />,
    );
    const row = expandStretchedMode(container);
    const toggle = row.querySelector<HTMLElement>('.plugin-header [role="switch"]');
    if (!toggle) throw new Error('Stretched Mode switch not found');

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onStretchedModePluginToggle).toHaveBeenCalledOnce();
  });

  const AUTO_SENTENCE = 'Makes the menus, replay bar, panels and plugin overlays larger on bigger screens.';

  it('keeps its settings readable and editable while off, and says when they apply', () => {
    const onUiScaleChange = vi.fn();
    const onStretchedModePluginToggle = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        stretchedModePluginEnabled={false}
        onUiScaleChange={onUiScaleChange}
        onStretchedModePluginToggle={onStretchedModePluginToggle}
      />,
    );
    const row = expandStretchedMode(container);
    const body = row.querySelector<HTMLElement>('.plugin-body');

    // No dimming: opacity below 1 would also cost the text its LCD antialiasing.
    expect(body?.style.opacity).toBe('');
    expect(body?.querySelector('.plugin-off-note')?.textContent).toBe('Plugin is off. Changes apply when enabled.');
    fireEvent.click(scaleOption(scalePicker(row), '150'));
    expect(onUiScaleChange).toHaveBeenCalledWith(3 / 2);
    // Never turned on for the player.
    expect(onStretchedModePluginToggle).not.toHaveBeenCalled();
  });

  it('drops the off note once the plugin is on', () => {
    const { container } = render(<PluginsPanel {...baseProps} stretchedModePluginEnabled />);
    expect(expandStretchedMode(container).querySelector('.plugin-off-note')).toBeNull();
  });

  it('keeps the explanations in tooltips, leaving one heading, one hint line and one checkbox', () => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    const row = expandStretchedMode(container);

    const heading = row.querySelector('.stretched-mode-heading .plugin-group-label');
    expect(heading?.textContent).toBe('UI scale');
    expect(heading?.getAttribute('title')).toBe(
      'Sizes the game panel, minimap and orbs. Infoboxes, tooltips and menus grow less.',
    );
    expect(row.querySelector('.overlay-size-setting')?.getAttribute('title')).toBe(AUTO_SENTENCE);
    expect(row.querySelectorAll('p')).toHaveLength(1);
    // One checkbox, nothing else: no size to pick, no per-surface sizes, no percentages.
    expect(row.querySelector('.overlay-size-setting')?.textContent).not.toMatch(/%/);
    expect(row.querySelector('[role="radiogroup"][aria-label="Overlay size"]')).toBeNull();
    expect(within(row).queryByRole('spinbutton', { name: /overlay size/i })).toBeNull();
    expect(row.querySelector('.tile-marker-section')).toBeNull();
  });

  it('switches Auto sizing from a checkbox, on by default', () => {
    const onAutoOverlayScaleToggle = vi.fn();
    const { container, rerender } = render(
      <PluginsPanel {...baseProps} onAutoOverlayScaleToggle={onAutoOverlayScaleToggle} />,
    );
    const row = expandStretchedMode(container);
    const checkbox = within(row).getByRole('checkbox', { name: 'Auto-size interface and overlays' });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    expect(row.querySelector('.overlay-size-setting .setting-row--modified')).toBeNull();
    fireEvent.click(checkbox);
    expect(onAutoOverlayScaleToggle).toHaveBeenCalledOnce();

    rerender(
      <PluginsPanel
        {...baseProps}
        autoOverlayScaleEnabled={false}
        onAutoOverlayScaleToggle={onAutoOverlayScaleToggle}
      />,
    );
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    expect(row.querySelector('.overlay-size-setting .setting-row--modified')).not.toBeNull();
    // It works in the Fixed layout too, beside the Fixed layout scale.
    rerender(<PluginsPanel {...baseProps} fixedLayout autoOverlayScaleEnabled={false} />);
    expect(within(row).getByRole('checkbox', { name: 'Auto-size interface and overlays' })).not.toBeDisabled();
  });
});

describe('PluginsPanel Camera right-click movement', () => {
  it('toggles right-click camera movement from the Rotate group', () => {
    const onCameraRightClickMovesCameraToggle = vi.fn();
    const view = render(
      <PluginsPanel
        {...baseProps}
        cameraRightClickMovesCamera={false}
        onCameraRightClickMovesCameraToggle={onCameraRightClickMovesCameraToggle}
      />,
    );
    const cameraRow = Array.from(view.container.querySelectorAll<HTMLElement>('.plugin-row')).find(
      (candidate) => candidate.querySelector('.plugin-name')?.textContent === 'Camera',
    );
    if (!cameraRow) throw new Error('Camera row not found');
    const titleButton = cameraRow.querySelector<HTMLButtonElement>('.plugin-title-btn');
    if (!titleButton) throw new Error('Camera title button not found');
    fireEvent.click(titleButton);

    fireEvent.click(view.getByRole('checkbox', { name: 'Right-click moves camera' }));

    expect(onCameraRightClickMovesCameraToggle).toHaveBeenCalledOnce();
  });
});

describe('PluginsPanel tile marker width', () => {
  it('shows the current width and commits a value inside the range', () => {
    const onTileMarkerWidthChange = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} tileMarkerWidth={2} onTileMarkerWidthChange={onTileMarkerWidthChange} />,
    );
    const input = borderWidthInput(expandTileMarkers(container));

    expect(input.value).toBe('2');

    fireEvent.change(input, { target: { value: '4.5' } });

    expect(onTileMarkerWidthChange).toHaveBeenCalledWith(4.5);
  });

  // The draft holds what was typed so the field stays editable, but a value the
  // scale cannot represent must never reach the renderer.
  it('keeps an out-of-range or partial entry out of the committed value', () => {
    const onTileMarkerWidthChange = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} tileMarkerWidth={2} onTileMarkerWidthChange={onTileMarkerWidthChange} />,
    );
    const input = borderWidthInput(expandTileMarkers(container));

    for (const typed of ['', '0.', '0', '99']) {
      fireEvent.change(input, { target: { value: typed } });
      expect(input.value).toBe(typed);
      expect(onTileMarkerWidthChange).not.toHaveBeenCalled();
    }

    // A number input cannot hold non-numeric text at all, so it reports empty.
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('');
    expect(onTileMarkerWidthChange).not.toHaveBeenCalled();
  });

  it('offers a reset only once the width leaves its default', () => {
    const onTileMarkerWidthChange = vi.fn();
    const { container, rerender } = render(
      <PluginsPanel
        {...baseProps}
        tileMarkerWidth={DEFAULT_TILE_MARKER_WIDTH}
        onTileMarkerWidthChange={onTileMarkerWidthChange}
      />,
    );
    const row = expandTileMarkers(container);
    const settingRow = borderWidthInput(row).closest('.setting-row');
    if (!settingRow) throw new Error('Border width setting row not found');

    expect(settingRow.classList.contains('setting-row--modified')).toBe(false);

    rerender(<PluginsPanel {...baseProps} tileMarkerWidth={5} onTileMarkerWidthChange={onTileMarkerWidthChange} />);
    expect(settingRow.classList.contains('setting-row--modified')).toBe(true);

    const reset = settingRow.querySelector<HTMLButtonElement>('.setting-row__reset');
    if (!reset) throw new Error('Reset button not found');
    fireEvent.click(reset);

    expect(onTileMarkerWidthChange).toHaveBeenCalledWith(DEFAULT_TILE_MARKER_WIDTH);
  });

  it('makes the width read-only while a replay owns the markers', () => {
    const { container } = render(<PluginsPanel {...baseProps} markersReadOnly />);

    expect(borderWidthInput(expandTileMarkers(container)).disabled).toBe(true);
  });
});

function expandTickCounter(container: HTMLElement): HTMLElement {
  const row = Array.from(container.querySelectorAll<HTMLElement>('.plugin-row')).find(
    (candidate) => candidate.querySelector('.plugin-name')?.textContent === 'Tick Counter',
  );
  if (!row) throw new Error('Tick Counter row not found');
  const titleButton = row.querySelector<HTMLButtonElement>('.plugin-title-btn');
  if (!titleButton) throw new Error('Tick Counter title button not found');
  fireEvent.click(titleButton);
  return row;
}

function checkboxByLabel(row: HTMLElement, label: string): HTMLButtonElement {
  const box = Array.from(row.querySelectorAll<HTMLButtonElement>('.osrs-checkbox')).find(
    (candidate) => candidate.querySelector('.osrs-checkbox__label')?.textContent === label,
  );
  if (!box) throw new Error(`Checkbox "${label}" not found`);
  return box;
}

describe('PluginsPanel Tick Counter colors', () => {
  it('renders one chip per tick in the cycle behind the All handle', () => {
    const { container } = render(<PluginsPanel {...baseProps} tickCounterMax={6} />);
    const row = expandTickCounter(container);

    expect(row.querySelectorAll('.tick-color-chip')).toHaveLength(6);
    expect(row.querySelectorAll('.tick-color-all')).toHaveLength(1);
    expect(Array.from(row.querySelectorAll('.tick-color-chip__glyph')).map((g) => g.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
  });

  // The picker streams `input` for every pixel of drag. Persisting those would
  // write a setting per frame, so only the native `change` may commit.
  it('previews an input event without persisting it, and commits once on change', () => {
    const onTickCounterColorsChange = vi.fn();
    const { container } = render(
      <PluginsPanel {...baseProps} tickCounterMax={4} onTickCounterColorsChange={onTickCounterColorsChange} />,
    );
    const row = expandTickCounter(container);
    const input = row.querySelectorAll<HTMLInputElement>('.tick-color-chip input[type="color"]')[1];

    fireEvent.input(input, { target: { value: '#00ff00' } });
    expect(onTickCounterColorsChange).not.toHaveBeenCalled();
    expect(row.querySelectorAll<HTMLElement>('.tick-color-chip__glyph')[1].style.color).toBe('#00ff00');

    fireEvent.change(input, { target: { value: '#00ff00' } });
    expect(onTickCounterColorsChange).toHaveBeenCalledTimes(1);
    expect(onTickCounterColorsChange).toHaveBeenCalledWith({ '2': '#00ff00' });
  });

  it('replaces the whole map from the All handle rather than merging into it', () => {
    const onTickCounterColorsChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        tickCounterMax={3}
        tickCounterColors={{ '1': '#ff0000', '9': '#ff0000' }}
        onTickCounterColorsChange={onTickCounterColorsChange}
      />,
    );
    const row = expandTickCounter(container);
    const allInput = row.querySelector<HTMLInputElement>('.tick-color-all input[type="color"]');
    if (!allInput) throw new Error('All handle input not found');

    fireEvent.change(allInput, { target: { value: '#00ff00' } });

    expect(onTickCounterColorsChange).toHaveBeenCalledWith({ '1': '#00ff00', '2': '#00ff00', '3': '#00ff00' });
  });

  it('clears one override on right-click and ignores a right-click on a gradient tick', () => {
    const onTickCounterColorsChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        tickCounterMax={4}
        tickCounterColors={{ '2': '#00ff00' }}
        onTickCounterColorsChange={onTickCounterColorsChange}
      />,
    );
    const row = expandTickCounter(container);
    const chips = row.querySelectorAll<HTMLElement>('.tick-color-chip');

    fireEvent.contextMenu(chips[0]);
    expect(onTickCounterColorsChange).not.toHaveBeenCalled();

    fireEvent.contextMenu(chips[1]);
    expect(onTickCounterColorsChange).toHaveBeenCalledWith({});
  });

  // An accent on all twenty at once stops reading as a selection, and SettingRow's
  // modified bar is already reporting the row.
  it('marks partly-overridden chips but drops the accent once every tick is custom', () => {
    const partial = render(<PluginsPanel {...baseProps} tickCounterMax={3} tickCounterColors={{ '1': '#00ff00' }} />);
    expect(expandTickCounter(partial.container).querySelectorAll('.tick-color-chip.is-custom')).toHaveLength(1);
    cleanup();

    const full = render(
      <PluginsPanel
        {...baseProps}
        tickCounterMax={3}
        tickCounterColors={{ '1': '#00ff00', '2': '#00ff00', '3': '#00ff00' }}
      />,
    );
    expect(expandTickCounter(full.container).querySelectorAll('.tick-color-chip.is-custom')).toHaveLength(0);
  });

  it('takes the uniform color on the All label only when every tick shares one', () => {
    const mixed = render(
      <PluginsPanel {...baseProps} tickCounterMax={2} tickCounterColors={{ '1': '#00ff00', '2': '#ff0000' }} />,
    );
    expect(expandTickCounter(mixed.container).querySelector<HTMLElement>('.tick-color-all__label')?.style.color).toBe(
      '',
    );
    cleanup();

    const uniform = render(
      <PluginsPanel {...baseProps} tickCounterMax={2} tickCounterColors={{ '1': '#00ff00', '2': '#00ff00' }} />,
    );
    expect(expandTickCounter(uniform.container).querySelector<HTMLElement>('.tick-color-all__label')?.style.color).toBe(
      '#00ff00',
    );
  });
});

describe('PluginsPanel Tick Counter offset', () => {
  const offsetInputs = (row: HTMLElement) =>
    row.querySelectorAll<HTMLInputElement>('.tick-offset-fields input[type="number"]');

  it('reports each axis separately', () => {
    const onTickCounterOffsetChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        showTickCounterOverhead={true}
        onTickCounterOffsetChange={onTickCounterOffsetChange}
      />,
    );
    const inputs = offsetInputs(expandTickCounter(container));

    fireEvent.change(inputs[0], { target: { value: '12' } });
    fireEvent.change(inputs[1], { target: { value: '-30' } });

    expect(onTickCounterOffsetChange).toHaveBeenNthCalledWith(1, 'x', 12);
    expect(onTickCounterOffsetChange).toHaveBeenNthCalledWith(2, 'y', -30);
  });

  it.each([
    ['', 'a partial entry'],
    ['abc', 'a non-number'],
  ])('rejects %s (%s) rather than committing NaN', (value) => {
    const onTickCounterOffsetChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        showTickCounterOverhead={true}
        onTickCounterOffsetChange={onTickCounterOffsetChange}
      />,
    );

    fireEvent.change(offsetInputs(expandTickCounter(container))[0], { target: { value } });

    expect(onTickCounterOffsetChange).not.toHaveBeenCalled();
  });

  it('rejects a value past the offset limit', () => {
    const onTickCounterOffsetChange = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        showTickCounterOverhead={true}
        onTickCounterOffsetChange={onTickCounterOffsetChange}
      />,
    );

    fireEvent.change(offsetInputs(expandTickCounter(container))[0], { target: { value: '5000' } });

    expect(onTickCounterOffsetChange).not.toHaveBeenCalled();
  });

  // Both controls only move the OVERHEAD counter, so neither can do anything
  // while it is switched off.
  it('grays out the offset and the prayer-icon placement when the counter is not shown above the head', () => {
    const { container } = render(<PluginsPanel {...baseProps} showTickCounterOverhead={false} />);
    const row = expandTickCounter(container);

    for (const input of offsetInputs(row)) {
      expect(input.disabled).toBe(true);
    }
    expect(row.querySelector('.tick-offset-fields')?.classList.contains('is-disabled')).toBe(true);
    expect(checkboxByLabel(row, 'Show Above Prayer Icon').disabled).toBe(true);
  });

  it('enables both once the counter is shown above the head', () => {
    const { container } = render(<PluginsPanel {...baseProps} showTickCounterOverhead={true} />);
    const row = expandTickCounter(container);

    for (const input of offsetInputs(row)) {
      expect(input.disabled).toBe(false);
    }
    expect(row.querySelector('.tick-offset-fields')?.classList.contains('is-disabled')).toBe(false);
    expect(checkboxByLabel(row, 'Show Above Prayer Icon').disabled).toBe(false);
  });
});

describe('PluginsPanel groups', () => {
  /** The panel's headings and rows in document order: `# Heading` or a row's name. */
  function outline(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.plugins-group-label, .plugin-name'), (el) =>
      el.classList.contains('plugins-group-label') ? `# ${el.textContent}` : (el.textContent ?? ''),
    );
  }
  const setTimer = { enabled: false, readOnly: false, onToggle: noop };

  it('leads the Inferno with its plugins under its name, each saying where it acts, then the general list', () => {
    const { container } = render(<PluginsPanel {...baseProps} encounterKind="inferno" setTimer={setTimer} />);
    const items = outline(container);
    expect(items.slice(0, 5)).toEqual([
      '# Inferno',
      'Inferno Additions',
      'TzHaar HP Tracker',
      'Zuk Set Timer',
      '# General',
    ]);
    expect(items.filter((item) => item.startsWith('# '))).toHaveLength(2);
    expect(items).not.toContain('Colosseum Additions');
    expect(items.at(-1)).toBe('Debug Overlays');

    // The scope line describes the row; the button's name stays the plugin's alone.
    const described = (name: string) => within(container).getByRole('button', { name });
    expect(described('Inferno Additions')).toHaveAccessibleDescription('Inferno');
    expect(described('TzHaar HP Tracker')).toHaveAccessibleDescription('Inferno, Colosseum');
    expect(described('Zuk Set Timer')).toHaveAccessibleDescription('Inferno, Zuk wave');
    expect(Array.from(container.querySelectorAll('.plugin-scope'), (el) => el.textContent)).toEqual([
      'Inferno',
      'Inferno, Colosseum',
      'Inferno, Zuk wave',
    ]);
    // General plugins carry no scope line.
    expect(within(container).getByRole('button', { name: 'Anti Drag' })).not.toHaveAttribute('aria-describedby');
  });

  it('shows the Colosseum, under its name, only the plugins that act there', () => {
    const { container } = render(<PluginsPanel {...baseProps} encounterKind="sol_heredit" setTimer={setTimer} />);
    const items = outline(container);
    expect(items.slice(0, 4)).toEqual(['# Colosseum', 'Colosseum Additions', 'TzHaar HP Tracker', '# General']);
    expect(Array.from(container.querySelectorAll('.plugin-scope'), (el) => el.textContent)).toEqual([
      'Colosseum',
      'Inferno, Colosseum',
    ]);
    expect(items).not.toContain('Inferno Additions');
    expect(items).not.toContain('Zuk Set Timer');
  });

  it.each([
    'lobby',
    'yama_p3',
    'yama_p3_bloodied',
    null,
  ])('lists no encounter plugins and no group headings in %s', (encounterKind) => {
    const { container } = render(<PluginsPanel {...baseProps} encounterKind={encounterKind} setTimer={setTimer} />);
    const items = outline(container);
    expect(items[0]).toBe('Anti Drag');
    expect(items.some((item) => item.startsWith('# '))).toBe(false);
    for (const name of ['Colosseum Additions', 'Inferno Additions', 'TzHaar HP Tracker', 'Zuk Set Timer']) {
      expect(items).not.toContain(name);
    }
  });

  it('keeps a hidden plugin out of reach of search, which says where it is instead', () => {
    const { rerender } = render(<PluginsPanel {...baseProps} />);
    expect(getRevealAvailability(pluginSearchId('tzhaarHpTracker')).ok).toBe(false);
    expect(getRevealAvailability(pluginSearchId('colosseumAdditions', 'Mark pillar tiles')).ok).toBe(false);
    expect(settingsEntryById(pluginSearchId('tzhaarHpTracker'))?.whenUnavailable?.reason).toBe(
      'Available in the Inferno and the Colosseum.',
    );
    expect(settingsEntryById(pluginSearchId('infernoAdditions', 'Hide pillars'))?.whenUnavailable?.reason).toBe(
      'Available in the Inferno.',
    );
    expect(settingsEntryById(pluginSearchId('colosseumAdditions'))?.whenUnavailable?.reason).toBe(
      'Available in the Colosseum.',
    );

    rerender(<PluginsPanel {...baseProps} encounterKind="sol_heredit" />);
    expect(getRevealAvailability(pluginSearchId('tzhaarHpTracker'))).toEqual({ ok: true });
    expect(getRevealAvailability(pluginSearchId('colosseumAdditions', 'Mark pillar tiles'))).toEqual({ ok: true });
    // The other arena's plugin stays out of reach.
    expect(getRevealAvailability(pluginSearchId('infernoAdditions', 'Mark pillar tiles')).ok).toBe(false);
  });
});

describe('PluginsPanel Zuk Set Timer', () => {
  afterEach(() => {
    deleteSetting('osrs-unified-keybinds');
  });

  it('omits the encounter-only row when no Zuk Set Timer context is provided', () => {
    const view = render(<PluginsPanel {...baseProps} />);
    expect(view.queryByRole('button', { name: 'Zuk Set Timer' })).toBeNull();
    expect(view.queryByRole('switch', { name: 'Zuk Set Timer' })).toBeNull();
  });

  it('keeps shortcuts editable while the timer is off and reports conflicts', () => {
    const onToggle = vi.fn();
    const view = render(
      <PluginsPanel {...baseProps} encounterKind="inferno" setTimer={{ enabled: false, readOnly: false, onToggle }} />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Zuk Set Timer' }));
    const field = view.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' });
    expect(field).toBeEnabled();

    fireEvent.click(field);
    fireEvent.keyDown(view.getByRole('button', { name: 'Record shortcut' }), { key: 'F5' });

    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('F5');
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('');
    expect(view.getByRole('status')).toHaveTextContent(/Panel.*Prayer/);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('switch', { name: 'Zuk Set Timer' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('keeps replay controls readable but prevents changing the timer or its bindings', () => {
    const onToggle = vi.fn();
    const view = render(
      <PluginsPanel {...baseProps} encounterKind="inferno" setTimer={{ enabled: true, readOnly: true, onToggle }} />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Zuk Set Timer' }));
    expect(view.getByRole('switch', { name: 'Zuk Set Timer' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeDisabled();
    expect(view.getByText('Exit replay to edit bindings.')).toBeVisible();
    expect(isCapturingKeybind()).toBe(false);
  });

  it('releases capture and preserves bindings when leaving the encounter hides the row', () => {
    const view = render(
      <PluginsPanel
        {...baseProps}
        encounterKind="inferno"
        setTimer={{ enabled: true, readOnly: false, onToggle: vi.fn() }}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Zuk Set Timer' }));
    fireEvent.click(view.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' }));
    expect(isCapturingKeybind()).toBe(true);

    view.rerender(<PluginsPanel {...baseProps} />);

    expect(view.queryByRole('button', { name: 'Zuk Set Timer' })).toBeNull();
    expect(isCapturingKeybind()).toBe(false);
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('Z');
  });
});

describe('PluginsPanel and Infobox appearance', () => {
  it('has no Infobox appearance row: the editor is in Settings', () => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    const names = Array.from(container.querySelectorAll('.plugin-name'), (name) => name.textContent);
    expect(names).not.toContain('Infobox appearance');
    expect(names.at(-1)).toBe('Debug Overlays');
  });

  it('links from the Tick Counter, the plugin that shows an infobox, to the editor in Settings', () => {
    const listener = vi.fn();
    window.addEventListener('settings:reveal', listener);
    try {
      const { container } = render(
        <>
          <PluginsPanel {...baseProps} />
          <SettingsDestination id="settings.interface.infobox-appearance" />
        </>,
      );
      const row = expandPluginRow(container, 'Tick Counter');
      fireEvent.click(within(row).getByRole('button', { name: 'Infobox position and appearance' }));
      expect(listener.mock.calls[0]?.[0].detail).toEqual({
        id: 'settings.interface.infobox-appearance',
        surface: 'settings',
      });
    } finally {
      window.removeEventListener('settings:reveal', listener);
    }
  });
});

describe('PluginsPanel header and pinned rows', () => {
  it('names a plugin row remove icon without a native title', async () => {
    const { container } = render(
      <PluginsPanel {...baseProps} tileMarkers={[{ x: 10, y: 20, color: '#ffffff', opacity: 1 }]} />,
    );
    fireEvent.click(within(container).getByRole('button', { name: 'Tile Markers' }));
    const button = screen.getByRole('button', { name: 'Remove marker' });
    expect(button).toHaveAttribute('title', '');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent('Remove marker');
  });

  it('puts the search behind a magnifier in the header, beside close', async () => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    const actions = Array.from(container.querySelectorAll('.panel-header-icons > :is(a, button)'), (el) =>
      el.getAttribute('aria-label'),
    );
    expect(actions).toEqual(['Search settings and plugins', 'Close plugins']);
    // Close stands apart past a rule, and an X needs no hover hint.
    expect(container.querySelector('.panel-header-divider + .panel-close-button')).not.toBeNull();
    // Hovered first and never left: by the time Search's hint shows, a close hint would have too.
    fireEvent.pointerEnter(within(container).getByRole('button', { name: 'Close plugins' }), { pointerType: 'mouse' });
    fireEvent.pointerEnter(within(container).getByRole('button', { name: 'Search settings and plugins' }), {
      pointerType: 'mouse',
    });
    await screen.findByRole('tooltip');
    expect(screen.getAllByRole('tooltip').map((card) => card.textContent)).toEqual(['Search']);
    expect(within(container).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(container).getByRole('button', { name: 'Search settings and plugins' }));
    expect(within(container).getByRole('textbox', { name: 'Search settings and plugins' })).toBeDefined();
  });

  it("pins an open row's header, with its switch, above the options scrolling under it", () => {
    const css = readFileSync(join(__dirname, '../PluginsPanel.css'), 'utf8');
    const rule = css.match(/\.plugin-row\[data-expanded="true"\] > \.plugin-header \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*sticky/);
    // Opaque: a stuck header is a layer of its own, and a translucent one loses LCD text.
    expect(rule).toMatch(/background:\s*color-mix\(in srgb, rgb\(10 8 5\) 50%, var\(--color-bg-solid\)\)/);

    const { container } = render(<PluginsPanel {...baseProps} stretchedModePluginEnabled={false} />);
    const row = expandStretchedMode(container);
    const header = row.querySelector(':scope > .plugin-header');
    expect(header?.querySelector('[role="switch"]')).not.toBeNull();
  });
});

describe('PluginsPanel reveal anchors', () => {
  it('says an encounter without presets has none to reveal, while the rows stay collapsed', () => {
    const tilePresets = pluginSearchId('tileMarkers', 'Presets');
    const linePresets = pluginSearchId('lineMarkers', 'Presets');
    const view = render(<PluginsPanel {...baseProps} />);
    expect(getRevealAvailability(tilePresets).ok).toBe(false);
    expect(getRevealAvailability(linePresets).ok).toBe(false);
    // The rest of a collapsed row stays reachable: it mounts its options when it opens.
    expect(getRevealAvailability(pluginSearchId('tileMarkers', 'Show Labels'))).toEqual({ ok: true });

    const preset = { id: 'p', name: 'Preset', description: '', encounterKind: 'yama_p3' };
    view.rerender(
      <PluginsPanel
        {...baseProps}
        availablePresets={[{ ...preset, markers: [] }]}
        availableLinePresets={[{ ...preset, lines: [] }]}
      />,
    );
    expect(getRevealAvailability(tilePresets)).toEqual({ ok: true });
    expect(getRevealAvailability(linePresets)).toEqual({ ok: true });
  });

  it('anchors every row under its own plugins.<key> id', () => {
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        encounterKind="inferno"
        setTimer={{ enabled: false, readOnly: false, onToggle: noop }}
      />,
    );
    const ids = Array.from(container.querySelectorAll<HTMLElement>('.plugin-row'), (row) => row.dataset.searchId);
    expect(ids.every((id) => id?.startsWith('plugins.'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('plugins.setTimer');
    expect(ids).not.toContain('plugins.infobox-appearance');
  });

  it('opens the row holding a revealed option and marks the option', async () => {
    const { container } = render(<PluginsPanel {...baseProps} />);
    act(() => revealSetting(pluginSearchId('tickCounter', 'Show Infobox')));

    const row = container.querySelector<HTMLElement>('[data-search-id="plugins.tickCounter"]');
    expect(row?.dataset.expanded).toBe('true');
    const target = container.querySelector<HTMLElement>('[data-search-id="plugins.tickCounter.show-infobox"]');
    await waitFor(() => expect(target?.dataset.revealHighlight).toBe('on'));
  });

  it('lands a reveal inside an off plugin without turning it on, its switch and note in view', () => {
    const onStretchedModePluginToggle = vi.fn();
    const { container } = render(
      <PluginsPanel
        {...baseProps}
        stretchedModePluginEnabled={false}
        onStretchedModePluginToggle={onStretchedModePluginToggle}
      />,
    );
    act(() => revealSetting(pluginSearchId('stretchedMode', 'UI scale')));
    const row = container.querySelector<HTMLElement>('[data-search-id="plugins.stretchedMode"]');
    expect(row?.dataset.expanded).toBe('true');
    expect(row?.querySelector('.plugin-off-note')).not.toBeNull();
    expect(row?.querySelector('.plugin-header [role="switch"]')).toHaveAttribute('aria-checked', 'false');
    expect(onStretchedModePluginToggle).not.toHaveBeenCalled();
  });

  it('ignores reveals meant for the Settings drawer', () => {
    const { container } = render(
      <>
        <PluginsPanel {...baseProps} />
        <SettingsDestination id="settings.interface.layout" />
      </>,
    );
    act(() => {
      expect(revealSetting('settings.interface.layout')).toEqual({ ok: true });
    });
    expect(container.querySelector('.plugin-row[data-expanded="true"]')).toBeNull();
  });
});

describe('PluginsPanel settings-search anchors', () => {
  /** Every anchor the panel renders across the layouts and encounters that change what it shows. */
  function renderedAnchors(): Set<string> {
    const anchors = new Set<string>();
    const collect = (container: HTMLElement) => {
      // Expand every row so the options inside are rendered.
      for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>('.plugin-title-btn'))) {
        if (button.closest('.plugin-row')?.getAttribute('data-expanded') !== 'true') fireEvent.click(button);
      }
      for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-search-id]'))) {
        if (el.dataset.searchId) anchors.add(el.dataset.searchId);
      }
      cleanup();
    };
    const setTimer = { enabled: true, readOnly: false, onToggle: noop };
    const preset = { id: 'p', name: 'Preset', description: '', encounterKind: 'yama_p3' };
    // The encounter plugins (the Inferno's, then Colosseum Additions), Zuk's timer, an encounter's
    // presets, and the outline color are shown only some of the time;
    // the UI scale shows in the resizable layouts and the Fixed layout scale in Fixed.
    collect(
      render(
        <PluginsPanel
          {...baseProps}
          encounterKind="inferno"
          setTimer={setTimer}
          availablePresets={[{ ...preset, markers: [] }]}
          availableLinePresets={[{ ...preset, lines: [] }]}
        />,
      ).container,
    );
    collect(render(<PluginsPanel {...baseProps} encounterKind="sol_heredit" fixedLayout />).container);
    return anchors;
  }

  it('has an anchor for every Plugins entry in the search index', () => {
    const anchors = renderedAnchors();
    const missing = SETTINGS_SEARCH_ENTRIES.filter((entry) => entry.panel === 'plugins' && !anchors.has(entry.id));
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it('indexes every anchor it renders, except the ones search leaves out on purpose', () => {
    const indexed = new Set(SETTINGS_SEARCH_ENTRIES.map((entry) => entry.id));
    const unindexed = [...renderedAnchors()].filter((id) => !indexed.has(id)).sort();
    expect(unindexed).toEqual(
      [
        // Development tooling (entries.ts leaves Debug Overlays out).
        ...[
          '',
          'Camera Debug',
          'Coordinate Overlay',
          'Hide HW Accel Warning',
          'Input Display',
          'NPC Attack Timer Metronome',
          'NPC Clickbox',
          'Sound Debug',
          'Tick Timing',
        ].map((label) => (label ? pluginSearchId('debugOverlays', label) : pluginSearchId('debugOverlays'))),
        // Bare labels that mislead out of their row; their words are keywords on the row instead.
        pluginSearchId('camera', 'Speed'),
        pluginSearchId('xpDrops', 'Speed'),
        pluginSearchId('compactOrbs', 'Layout'),
        ...['attackTimerMetronome', 'tickCounter'].flatMap((key) =>
          ['Show Above Prayer Icon', 'Offset', 'Font Size'].map((label) => pluginSearchId(key, label)),
        ),
        // The row itself is the editor.
        pluginSearchId('customMenuSwaps', 'Rules'),
      ].sort(),
    );
  });
});
