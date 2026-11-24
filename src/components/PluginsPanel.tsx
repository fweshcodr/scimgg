import type React from 'react';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { ENCOUNTER_PLUGINS, encounterPluginSectionName, isEncounterPluginShown } from '../data/encounterPlugins';
import { PLUGIN_KEYBINDS } from '../data/pluginKeybinds';
import { ANTI_DRAG_DEFAULTS } from '../hooks/useAntiDrag';
import { BOSS_HEALTH_BAR_DEFAULTS } from '../hooks/useBossHealthBarSettings';
import { type FixedLayoutScale, PERSISTED_SETTINGS_DEFAULTS } from '../hooks/usePersistedSettings';
import { XP_DROP_DEFAULTS } from '../hooks/useXpDropSettings';
import type { OverheadNumberPlacement } from '../render/overlay/UIOverlayRenderer';
import { INNER_ZOOM_LEVEL_MAX, INNER_ZOOM_LEVEL_MIN } from '../render/projections/Projection3D';
import { MINIMAP } from '../resourcePack';
import { pluginSearchId, settingsSearchId } from '../settingsSearch/ids';
import {
  COMPACT_ORB_LABELS,
  COMPACT_ORBS_LAYOUT_LABELS,
  COMPACT_ORBS_LAYOUTS,
  type CompactOrbId,
  type CompactOrbsLayout,
  DEFAULT_COMPACT_ORBS_LAYOUT,
  DEFAULT_COMPACT_ORBS_ORDER,
  isDefaultCompactOrbsOrder,
  swapCompactOrbs,
} from '../types/compactOrbs';
import {
  DEFAULT_ENTITY_HIDER_OPTIONS,
  ENTITY_HIDER_OPTION_LABELS,
  type EntityHiderOptions,
} from '../types/entityHider';
import {
  DEFAULT_LINE_MARKER_WIDTH,
  LINE_MARKER_WIDTH_MAX,
  LINE_MARKER_WIDTH_MIN,
  LINE_MARKER_WIDTH_STEP,
  type LinePackPreset,
} from '../types/lineMarkers';
import {
  DEFAULT_HIGHLIGHT_MENU_ENTRIES,
  getNpcHighlightMenuColor,
  NPC_HIGHLIGHT_MODES,
  type NpcHighlightEntry,
  type NpcHighlightMode,
} from '../types/npcHighlight';
import {
  DEFAULT_PILLAR_ADDITIONS_OPTIONS,
  PILLAR_MARKER_STYLES,
  type PillarAdditionsOptions,
} from '../types/pillarAdditions';
import { TILE_GRID_WIDTH_MAX, TILE_GRID_WIDTH_MIN, TILE_GRID_WIDTH_STEP } from '../types/tileGrid';
import {
  DEFAULT_TILE_INDICATOR_CONFIG,
  type TileIndicatorConfig,
  type TileIndicatorStyle,
} from '../types/tileIndicators';
import {
  DEFAULT_TILE_MARKER_WIDTH,
  TILE_MARKER_WIDTH_MAX,
  TILE_MARKER_WIDTH_MIN,
  TILE_MARKER_WIDTH_STEP,
  type TilePackPreset,
} from '../types/tileMarkers';
import {
  DEFAULT_TZHAAR_HP_TRACKER_OPTIONS,
  TZHAAR_DYNAMIC_COLORS,
  TZHAAR_HIGHLIGHT_STYLES,
  TZHAAR_HP_LOCATIONS,
  type TzhaarHpTrackerOptions,
} from '../types/tzhaarHpTracker';
import {
  TICK_CYCLE_MAX,
  TICK_CYCLE_MIN,
  TICK_FONT_SIZE_MAX,
  TICK_FONT_SIZE_MIN,
  TICK_OFFSET_LIMIT,
  type TickColorOverrides,
} from '../util/tickColor';
import { FixedLayoutScaleField } from './FixedLayoutScaleField';
import { KeybindingsContent } from './GamePanel/KeybindingsContent';
import { PixelSprite } from './PixelSprite';
import { PANEL_SCALE_STOPS } from './panelScale';
import {
  SidebarSearchBar,
  SidebarSearchResults,
  SidebarSearchToggle,
  useSearchIds,
  useSidebarSearch,
} from './SidebarSearch';
import { useRevealInScroller } from './settingsReveal';
import { TickColorChips } from './TickColorChips';
import { TileIndicatorColorInput } from './TileIndicatorColorInput';
import { HoverHintButton } from './ui/HoverHintControl';
import { OsrsButton } from './ui/OsrsButton';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { OsrsNumberInput } from './ui/OsrsNumberInput';
import { OsrsToggle } from './ui/OsrsToggle';
import { RevealLink } from './ui/RevealLinks';
import { SettingRow } from './ui/SettingRow';
import './PluginsPanel.css';
import { CloseButton } from './ui/CloseButton';
import { sheet } from './ui/mobileSheet';

/**
 * Emitted after plugins panel slide transition ends.
 *
 * Source: PluginsPanel overlay onTransitionEnd
 * Listeners: tutorial advanced plugin-panel flow steps in tutorial/advancedSteps.ts
 */
const TUTORIAL_PLUGINS_OPENED_EVENT = 'tutorial:plugins-opened';
const TUTORIAL_PLUGINS_CLOSED_EVENT = 'tutorial:plugins-closed';
/**
 * Dispatched by the Plugins tutorial (src/tutorial/content/plugins.ts) as the
 * tour reaches / leaves a plugin's step, so the panel auto-expands the row's
 * settings while it is spotlighted. detail: { pluginKey, expanded }.
 */
const TUTORIAL_PLUGIN_SETTINGS_EVENT = 'tutorial:plugin-settings';

export interface PluginSettingsEventDetail {
  pluginKey?: string;
  expanded?: boolean;
}

/**
 * Returns `prev` unchanged (same reference) when the row is already in the requested
 * state, so the panel does not re-render needlessly. Exported for testing.
 */
export function applyPluginSettingsEvent(
  prev: Record<string, boolean>,
  detail: PluginSettingsEventDetail | null | undefined,
): Record<string, boolean> {
  if (!detail?.pluginKey) return prev;
  const { pluginKey, expanded = false } = detail;
  return prev[pluginKey] === expanded ? prev : { ...prev, [pluginKey]: expanded };
}

interface PluginsPanelProps {
  visible: boolean;
  onClose: () => void;
  /** The loaded encounter (or `'lobby'`), which decides the encounter plugins shown (ENCOUNTER_PLUGINS). */
  encounterKind: string | null;
  /** Zuk Set Timer's controls: a mechanics toggle, so App owns it. Shown in its encounters only. */
  setTimer?: {
    readonly enabled: boolean;
    readonly readOnly: boolean;
    readonly onToggle: () => void;
  };
  showTickCounter: boolean;
  onShowTickCounterToggle: () => void;
  showTickCounterOverhead: boolean;
  onShowTickCounterOverheadToggle: () => void;
  tickCounterAbovePrayerIcon: boolean;
  onTickCounterAbovePrayerIconToggle: () => void;
  showTickCounterInfobox: boolean;
  onShowTickCounterInfoboxToggle: () => void;
  tickCounterMax: number;
  onTickCounterMaxChange: (v: number) => void;
  tickCounterFontSize: number;
  onTickCounterFontSizeChange: (v: number) => void;
  tickCounterColors: TickColorOverrides;
  onTickCounterColorsChange: (v: TickColorOverrides) => void;
  tickCounterOffsetX: number;
  tickCounterOffsetY: number;
  onTickCounterOffsetChange: (axis: 'x' | 'y', v: number) => void;
  showNpcClickbox: boolean;
  onShowNpcClickboxToggle: () => void;
  showCoordinates: boolean;
  onShowCoordinatesToggle: () => void;
  npcAttackTimerMetronomeEnabled: boolean;
  onNpcAttackTimerMetronomeToggle: () => void;
  showTickTiming: boolean;
  onShowTickTimingToggle: () => void;
  showDetailedDps: boolean;
  onShowDetailedDpsToggle: () => void;
  dpsOverlayShowDetails: boolean;
  onDpsOverlayShowDetailsToggle: () => void;
  showSoundDebug: boolean;
  onShowSoundDebugToggle: () => void;
  showCameraDebug: boolean;
  onShowCameraDebugToggle: () => void;
  showModifierKeys: boolean;
  onShowModifierKeysToggle: () => void;
  hideHardwareAccelWarning: boolean;
  onHideHardwareAccelWarningToggle: () => void;
  encounterDebugFlags: Record<string, boolean | number>;
  onSetEncounterDebugFlag: (key: string, value: boolean) => void;
  encounterDebugFlagsInfo?: readonly { key: string; label: string }[];
  encounterDebugSectionTitle?: string;
  tileMarkers: Array<{ x: number; y: number; color: string; opacity: number; label?: string }>;
  showTileMarkers: boolean;
  onToggleShowTileMarkers: () => void;
  showTileMarkerLabels: boolean;
  onToggleShowTileMarkerLabels: () => void;
  tileMarkerWidth: number;
  onTileMarkerWidthChange: (width: number) => void;
  onRemoveMarker: (x: number, y: number) => void;
  onClearAllMarkers: () => void;
  lineMarkers: Array<{
    x: number;
    y: number;
    orientation: 'horizontal' | 'vertical';
    color: string;
    opacity: number;
    label?: string;
  }>;
  showLineMarkers: boolean;
  onToggleShowLineMarkers: () => void;
  showLineMarkerLabels: boolean;
  onToggleShowLineMarkerLabels: () => void;
  lineMarkerWidth: number;
  onLineMarkerWidthChange: (width: number) => void;
  availableLinePresets: LinePackPreset[];
  activeLinePresetIds: string[];
  onToggleLinePreset: (presetId: string) => void;
  onDeactivateAllLinePresets: () => void;
  onRemoveLineMarker: (x: number, y: number, orientation: 'horizontal' | 'vertical') => void;
  onClearAllLineMarkers: () => void;
  /**
   * A replay is drawing its recorder's markers, so both marker sections show the
   * viewer's own saved setup while editing it would change nothing on screen — and
   * "Clear All" would wipe it invisibly. The callbacks are separately inert in App;
   * this is what makes that visible instead of swallowing the click.
   */
  markersReadOnly?: boolean;
  npcHighlights: NpcHighlightEntry[];
  showNpcHighlights: boolean;
  onToggleShowNpcHighlights: () => void;
  npcHighlightColorMenuEntries: boolean;
  onToggleNpcHighlightColorMenuEntries: () => void;
  onRemoveNpcHighlight: (npcTypeId: number, mode: NpcHighlightMode) => void;
  onRemoveAllNpcHighlightsForNpc: (npcTypeId: number) => void;
  onClearAllNpcHighlights: () => void;
  antiDragEnabled: boolean;
  onAntiDragToggle: () => void;
  dragOnShiftOnly: boolean;
  onDragOnShiftOnlyToggle: () => void;
  antiDragDelay: number;
  onAntiDragDelayChange: (v: number) => void;
  antiDragCtrlToDrag: boolean;
  onAntiDragCtrlToDragToggle: () => void;
  xpDropsEnabled: boolean;
  onXpDropsToggle: () => void;
  xpDropsShowPredictedHit: boolean;
  onXpDropsPredictedHitToggle: () => void;
  xpDropsGrouped: boolean;
  onXpDropsGroupedToggle: () => void;
  xpDropsShowIcons: boolean;
  onXpDropsShowIconsToggle: () => void;
  xpDropsSpeed: number;
  onXpDropsSpeedChange: (v: number) => void;
  bossHealthBarEnabled: boolean;
  onBossHealthBarToggle: () => void;
  bossHealthBarShowName: boolean;
  onBossHealthBarShowNameToggle: () => void;
  bossHealthBarShowValues: boolean;
  onBossHealthBarShowValuesToggle: () => void;
  bossHealthBarShowPercentage: boolean;
  onBossHealthBarShowPercentageToggle: () => void;
  showInventoryTags: boolean;
  onToggleShowInventoryTags: () => void;
  inventoryTagCount: number;
  onClearAllInventoryTags: () => void;
  availablePresets: TilePackPreset[];
  activePresetIds: string[];
  onTogglePreset: (presetId: string) => void;
  onDeactivateAllPresets: () => void;
  onImportMarkers: () => void;
  onExportMarkers: () => void;
  onExportPreset: (presetId: string) => void;
  importExportStatus?: string;
  tileIndicatorsEnabled: boolean;
  onTileIndicatorsToggle: () => void;
  tileIndicatorConfig: TileIndicatorConfig;
  onTileIndicatorStyleChange: (
    tileType: keyof TileIndicatorConfig,
    key: keyof TileIndicatorStyle,
    value: TileIndicatorStyle[keyof TileIndicatorStyle],
  ) => void;
  cameraPluginEnabled: boolean;
  onCameraPluginToggle: () => void;
  cameraVerticalCamera: boolean;
  onCameraVerticalCameraToggle: () => void;
  cameraInvertYaw: boolean;
  onCameraInvertYawToggle: () => void;
  cameraInvertPitch: boolean;
  onCameraInvertPitchToggle: () => void;
  cameraInnerZoomLevel: number;
  onCameraInnerZoomLevelChange: (value: number) => void;
  cameraOuterZoomLimit: number;
  onCameraOuterZoomLimitChange: (v: number) => void;
  cameraSpeed: number;
  onCameraSpeedChange: (v: number) => void;
  cameraDragSpeed: number;
  onCameraDragSpeedChange: (v: number) => void;
  cameraRightClickMovesCamera: boolean;
  onCameraRightClickMovesCameraToggle: () => void;
  cameraZoomIncrement: number;
  onCameraZoomIncrementChange: (v: number) => void;
  attackTimerMetronomeEnabled: boolean;
  onAttackTimerMetronomeToggle: () => void;
  attackTimerMetronomeShowBar: boolean;
  onAttackTimerMetronomeShowBarToggle: () => void;
  attackTimerMetronomeShowTicks: boolean;
  onAttackTimerMetronomeShowTicksToggle: () => void;
  attackTimerMetronomeFontSize: number;
  onAttackTimerMetronomeFontSizeChange: (value: number) => void;
  attackTimerMetronomeAbovePrayerIcon: boolean;
  onAttackTimerMetronomeAbovePrayerIconToggle: () => void;
  attackTimerMetronomeOffsetX: number;
  attackTimerMetronomeOffsetY: number;
  onAttackTimerMetronomeOffsetChange: (axis: 'x' | 'y', value: number) => void;
  customMenuSwapsEnabled: boolean;
  onCustomMenuSwapsToggle: () => void;
  customMenuSwaps: string;
  onCustomMenuSwapsChange: (rules: string) => void;
  instantInventoryEnabled: boolean;
  onInstantInventoryToggle: () => void;
  instantPrayerEnabled: boolean;
  onInstantPrayerToggle: () => void;
  prayerEnabled: boolean;
  onPrayerToggle: () => void;
  prayerFlickOrbEnabled: boolean;
  onPrayerFlickOrbToggle: () => void;
  prayerFlickAlwaysOn: boolean;
  onPrayerFlickAlwaysOnToggle: () => void;
  prayerFlickEnabled: boolean;
  onPrayerFlickToggle: () => void;
  tickAudioMetronomeEnabled: boolean;
  onTickAudioMetronomeToggle: () => void;
  tickAudioMetronomeTock: boolean;
  onTickAudioMetronomeTockToggle: () => void;
  tickAudioMetronomeVolume: number;
  onTickAudioMetronomeVolumeChange: (volume: number) => void;
  tileGridEnabled: boolean;
  onTileGridToggle: () => void;
  tileGridColor: string;
  onTileGridColorChange: (color: string) => void;
  tileGridOpacity: number;
  onTileGridOpacityChange: (opacity: number) => void;
  tileGridWidth: number;
  onTileGridWidthChange: (width: number) => void;
  statusBarsEnabled: boolean;
  onStatusBarsToggle: () => void;
  statusBarsShowValues: boolean;
  onStatusBarsShowValuesToggle: () => void;
  entityHiderEnabled: boolean;
  onEntityHiderToggle: () => void;
  entityHider: EntityHiderOptions;
  onEntityHiderOptionToggle: (option: keyof EntityHiderOptions) => void;
  tzhaarHpTrackerEnabled: boolean;
  onTzhaarHpTrackerToggle: () => void;
  tzhaarHpTracker: TzhaarHpTrackerOptions;
  onTzhaarHpTrackerChange: (options: TzhaarHpTrackerOptions) => void;
  infernoAdditionsEnabled: boolean;
  onInfernoAdditionsToggle: () => void;
  infernoAdditions: PillarAdditionsOptions;
  onInfernoAdditionsChange: (options: PillarAdditionsOptions) => void;
  colosseumAdditionsEnabled: boolean;
  onColosseumAdditionsToggle: () => void;
  colosseumAdditions: PillarAdditionsOptions;
  onColosseumAdditionsChange: (options: PillarAdditionsOptions) => void;
  uiScale: number;
  onUiScaleChange: (scale: number) => void;
  /** Stretched Mode's size for the Fixed layout, shown in place of the UI scale there. */
  fixedLayoutScale: FixedLayoutScale;
  onFixedLayoutScaleChange: (scale: FixedLayoutScale) => void;
  fixedLayoutIntegerScaling: boolean;
  onFixedLayoutIntegerScalingChange: (enabled: boolean) => void;
  stretchedModePluginEnabled: boolean;
  onStretchedModePluginToggle: () => void;
  autoOverlayScaleEnabled: boolean;
  onAutoOverlayScaleToggle: () => void;
  /** Minimap ignores Compact Orbs here, so this grays the row out rather than offering a dead toggle. */
  fixedLayout?: boolean;
  /**
   * Mobile ignores Compact Orbs too, and sizes its chrome from Interface scaling rather than
   * UI scale, so both are grayed out as in fixed.
   */
  mobileLayout?: boolean;
  compactOrbsEnabled: boolean;
  onCompactOrbsToggle: () => void;
  compactOrbsLayout: CompactOrbsLayout;
  onCompactOrbsLayoutChange: (layout: CompactOrbsLayout) => void;
  compactOrbsOrder: CompactOrbId[];
  onCompactOrbsOrderChange: (order: CompactOrbId[]) => void;
}
interface PluginToggleProps {
  label: string;
  /**
   * The row's settings-search key: its anchor is `plugins.<pluginKey>`, and a reveal of it or of
   * one of its options expands the row under the same key.
   */
  pluginKey: string;
  isOn?: boolean;
  onToggle?: () => void;
  hasSettings?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** Leaves the row readable and expandable, but refuses the toggle. */
  toggleDisabled?: boolean;
  /**
   * Search ids of options this row will not show when it opens (an encounter with no presets),
   * so a reveal can say so while the row is still collapsed and its options unmounted.
   */
  absentOptions?: readonly string[];
  /**
   * Where an encounter plugin acts ("Inferno, Colosseum"), shown under its name. A description,
   * not part of the name: the tour and tests find a row by its exact label.
   */
  scope?: string;
}

const PluginRow: React.FC<PluginToggleProps & { children?: React.ReactNode }> = ({
  label,
  pluginKey,
  isOn,
  onToggle,
  hasSettings,
  expanded,
  onToggleExpand,
  toggleDisabled,
  absentOptions,
  scope,
  children,
}) => {
  const scopeId = useId();
  return (
    // The className stays constant: the Plugins tour expands the row it spotlights, and a className
    // React rewrites drops Driver's `driver-active-element`, leaving the row's controls inert.
    <div
      className="plugin-row"
      data-expanded={expanded ? 'true' : undefined}
      data-search-id={pluginSearchId(pluginKey)}
      data-search-absent={absentOptions?.length ? absentOptions.join(' ') : undefined}
    >
      <div className="plugin-header">
        <button
          type="button"
          className={scope ? 'plugin-title-btn plugin-title-btn--scoped' : 'plugin-title-btn'}
          onClick={hasSettings ? onToggleExpand : toggleDisabled ? undefined : onToggle}
          aria-label={scope ? label : undefined}
          aria-describedby={scope ? scopeId : undefined}
        >
          {hasSettings ? (
            <svg
              className="plugin-caret"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M3 1.5L7 5L3 8.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <span className="plugin-caret" style={{ visibility: 'hidden' }}></span>
          )}
          {scope ? (
            <span className="plugin-title-text">
              <span className="plugin-name">{label}</span>
              <span className="plugin-scope" id={scopeId}>
                {scope}
              </span>
            </span>
          ) : (
            <span className="plugin-name">{label}</span>
          )}
        </button>
        {onToggle && (
          <OsrsToggle
            checked={!!isOn}
            onChange={() => onToggle()}
            disabled={toggleDisabled}
            size="default"
            accessibleLabel={label}
          />
        )}
      </div>
      {hasSettings && expanded && (
        // Full strength while off (dimming would also cost the text its LCD antialiasing): the
        // options stay readable and editable, and the note says when they take effect.
        <div className="plugin-body">
          {onToggle && isOn === false && <p className="plugin-off-note">Plugin is off. Changes apply when enabled.</p>}
          {children}
        </div>
      )}
    </div>
  );
};

function blockNonLeftClick(e: React.MouseEvent) {
  if (e.button !== 0) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/** Placement controls shared by every plugin that draws a number over the player's head. */
function OverheadNumberPlacementRows({
  pluginKey,
  placement,
  defaults,
  disabled,
  onAbovePrayerIconToggle,
  onOffsetChange,
  onFontSizeChange,
}: {
  /** The owning plugin's row key, for the rows' settings-search anchors. */
  pluginKey: string;
  placement: OverheadNumberPlacement;
  defaults: OverheadNumberPlacement;
  disabled: boolean;
  onAbovePrayerIconToggle: () => void;
  onOffsetChange: (axis: 'x' | 'y', value: number) => void;
  onFontSizeChange: (value: number) => void;
}) {
  return (
    <>
      <SettingRow
        searchId={pluginSearchId(pluginKey, 'Show Above Prayer Icon')}
        isModified={placement.abovePrayerIcon !== defaults.abovePrayerIcon}
        onReset={() => {
          if (placement.abovePrayerIcon !== defaults.abovePrayerIcon) onAbovePrayerIconToggle();
        }}
      >
        <OsrsCheckbox
          label="Show Above Prayer Icon"
          checked={placement.abovePrayerIcon}
          onChange={() => onAbovePrayerIconToggle()}
          disabled={disabled}
        />
      </SettingRow>

      <SettingRow
        searchId={pluginSearchId(pluginKey, 'Offset')}
        isModified={placement.offsetX !== defaults.offsetX || placement.offsetY !== defaults.offsetY}
        onReset={() => {
          onOffsetChange('x', defaults.offsetX);
          onOffsetChange('y', defaults.offsetY);
        }}
      >
        <div className="plugin-setting-row">
          <span className="plugin-setting-label">Offset:</span>
          <div className={`tick-offset-fields${disabled ? ' is-disabled' : ''}`}>
            {(
              [
                ['x', placement.offsetX],
                ['y', placement.offsetY],
              ] as const
            ).map(([axis, value]) => (
              <span className="tick-offset-field" key={axis}>
                <span className="tick-offset-axis" aria-hidden="true">
                  {axis}
                </span>
                <OsrsNumberInput
                  min={-TICK_OFFSET_LIMIT}
                  max={TICK_OFFSET_LIMIT}
                  fieldWidth={34}
                  value={value}
                  disabled={disabled}
                  onMouseDown={blockNonLeftClick}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!Number.isNaN(val) && Math.abs(val) <= TICK_OFFSET_LIMIT) {
                      onOffsetChange(axis, val);
                    }
                  }}
                />
              </span>
            ))}
          </div>
        </div>
      </SettingRow>

      <SettingRow
        searchId={pluginSearchId(pluginKey, 'Font Size')}
        isModified={placement.fontSize !== defaults.fontSize}
        onReset={() => onFontSizeChange(defaults.fontSize)}
      >
        <div className="plugin-setting-row">
          <span className="plugin-setting-label">Font Size:</span>
          <OsrsNumberInput
            min={TICK_FONT_SIZE_MIN}
            max={TICK_FONT_SIZE_MAX}
            value={placement.fontSize}
            disabled={disabled}
            onMouseDown={blockNonLeftClick}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!Number.isNaN(val) && val >= TICK_FONT_SIZE_MIN && val <= TICK_FONT_SIZE_MAX) {
                onFontSizeChange(val);
              }
            }}
          />
        </div>
      </SettingRow>
    </>
  );
}

/**
 * Auto sizing, the secondary control under the UI scale. The label says what it sizes; the
 * detail (which surfaces, and that it follows the screen) is in the tooltip.
 */
function AutoOverlaySizeSetting({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div
      className="overlay-size-setting"
      title="Makes the menus, replay bar, panels and plugin overlays larger on bigger screens."
    >
      <SettingRow
        isModified={!enabled}
        onReset={() => !enabled && onToggle()}
        searchId={pluginSearchId('stretchedMode', 'Auto-size interface and overlays')}
      >
        <OsrsCheckbox label="Auto-size interface and overlays" checked={enabled} onChange={onToggle} />
      </SettingRow>
    </div>
  );
}

/**
 * The shape of a compact-orbs layout, drawn as the four orb positions. Reading
 * the arrangement is the whole decision, so the glyph shows it directly rather
 * than framing it in a screen outline.
 */
/** Inferno Additions' and Colosseum Additions' options: the same set, each plugin its own values. */
function PillarAdditionsSettings({
  pluginKey,
  options,
  onChange,
}: {
  pluginKey: 'infernoAdditions' | 'colosseumAdditions';
  options: PillarAdditionsOptions;
  onChange: (options: PillarAdditionsOptions) => void;
}) {
  const defaults = DEFAULT_PILLAR_ADDITIONS_OPTIONS;
  return (
    <>
      {(
        [
          ['hidePillars', 'Hide pillars'],
          ['markPillarTiles', 'Mark pillar tiles'],
        ] as const
      ).map(([key, label]) => (
        <SettingRow
          key={key}
          isModified={options[key] !== defaults[key]}
          onReset={() => onChange({ ...options, [key]: defaults[key] })}
          searchId={pluginSearchId(pluginKey, label)}
        >
          <OsrsCheckbox
            label={label}
            checked={options[key]}
            onChange={() => onChange({ ...options, [key]: !options[key] })}
          />
        </SettingRow>
      ))}
      <div className="plugin-group" data-search-id={pluginSearchId(pluginKey, 'Pillar marker style')}>
        <div className="plugin-group-label">Pillar marker style</div>
        <SettingRow
          // Anchored on its group, so a reveal marks the title with it.
          searchId={null}
          isModified={options.pillarMarkerStyle !== defaults.pillarMarkerStyle}
          onReset={() => onChange({ ...options, pillarMarkerStyle: defaults.pillarMarkerStyle })}
        >
          <select
            value={options.pillarMarkerStyle}
            onChange={(event) => {
              const pillarMarkerStyle = PILLAR_MARKER_STYLES.find(
                (option) => option.value === event.target.value,
              )?.value;
              if (pillarMarkerStyle) onChange({ ...options, pillarMarkerStyle });
            }}
            className="select-input"
            aria-label="Pillar marker style"
          >
            {PILLAR_MARKER_STYLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>
      <SettingRow
        isModified={options.pillarTileColor !== defaults.pillarTileColor}
        onReset={() => onChange({ ...options, pillarTileColor: defaults.pillarTileColor })}
        searchId={pluginSearchId(pluginKey, 'Pillar tile color')}
      >
        <div className="plugin-setting-row">
          <span className="plugin-setting-label">Pillar tile color:</span>
          <TileIndicatorColorInput
            color={options.pillarTileColor}
            onCommit={(color) => onChange({ ...options, pillarTileColor: color.toLowerCase() })}
            onMouseDown={blockNonLeftClick}
          />
        </div>
      </SettingRow>
      <SettingRow
        isModified={options.pillarTileOpacity !== defaults.pillarTileOpacity}
        onReset={() => onChange({ ...options, pillarTileOpacity: defaults.pillarTileOpacity })}
        searchId={pluginSearchId(pluginKey, 'Opacity')}
      >
        <div className="plugin-setting-row">
          <span className="plugin-setting-label">Opacity (%):</span>
          <OsrsNumberInput
            min={0}
            max={100}
            value={Math.round(options.pillarTileOpacity * 100)}
            onMouseDown={blockNonLeftClick}
            onChange={(event) => {
              const percent = parseInt(event.target.value, 10);
              if (!Number.isNaN(percent) && percent >= 0 && percent <= 100) {
                onChange({ ...options, pillarTileOpacity: percent / 100 });
              }
            }}
          />
        </div>
      </SettingRow>
    </>
  );
}

function CompactOrbsLayoutGlyph({ layout }: { layout: CompactOrbsLayout }) {
  const dots: readonly (readonly [number, number])[] =
    layout === 'vertical'
      ? [
          [9, 2.8],
          [9, 7.2],
          [9, 11.6],
          [9, 16],
        ]
      : layout === 'horizontal'
        ? [
            [6.2, 6.2],
            [6.2, 11.8],
            [11.8, 6.2],
            [11.8, 11.8],
          ]
        : [
            [2.8, 9],
            [7.2, 9],
            [11.6, 9],
            [16, 9],
          ];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill="currentColor" />
      ))}
    </svg>
  );
}

const D = PERSISTED_SETTINGS_DEFAULTS;
const AD = ANTI_DRAG_DEFAULTS;
const TID = DEFAULT_TILE_INDICATOR_CONFIG;

const PluginsPanelContent: React.FC<PluginsPanelProps> = ({
  visible,
  onClose,
  encounterKind,
  setTimer,
  showTickCounter,
  onShowTickCounterToggle,
  showTickCounterOverhead,
  onShowTickCounterOverheadToggle,
  tickCounterAbovePrayerIcon,
  onTickCounterAbovePrayerIconToggle,
  showTickCounterInfobox,
  onShowTickCounterInfoboxToggle,
  tickCounterMax,
  onTickCounterMaxChange,
  tickCounterFontSize,
  onTickCounterFontSizeChange,
  tickCounterColors,
  onTickCounterColorsChange,
  tickCounterOffsetX,
  tickCounterOffsetY,
  onTickCounterOffsetChange,
  showNpcClickbox,
  onShowNpcClickboxToggle,
  showCoordinates,
  onShowCoordinatesToggle,
  npcAttackTimerMetronomeEnabled,
  onNpcAttackTimerMetronomeToggle,
  showTickTiming,
  onShowTickTimingToggle,
  showDetailedDps,
  onShowDetailedDpsToggle,
  dpsOverlayShowDetails,
  onDpsOverlayShowDetailsToggle,
  showSoundDebug,
  onShowSoundDebugToggle,
  showCameraDebug,
  onShowCameraDebugToggle,
  showModifierKeys,
  onShowModifierKeysToggle,
  hideHardwareAccelWarning,
  onHideHardwareAccelWarningToggle,
  encounterDebugFlags,
  onSetEncounterDebugFlag,
  encounterDebugFlagsInfo = [],
  encounterDebugSectionTitle,
  tileMarkers,
  showTileMarkers,
  onToggleShowTileMarkers,
  showTileMarkerLabels,
  onToggleShowTileMarkerLabels,
  tileMarkerWidth,
  onTileMarkerWidthChange,
  onRemoveMarker,
  onClearAllMarkers,
  lineMarkers,
  showLineMarkers,
  onToggleShowLineMarkers,
  showLineMarkerLabels,
  onToggleShowLineMarkerLabels,
  lineMarkerWidth,
  onLineMarkerWidthChange,
  availableLinePresets,
  activeLinePresetIds,
  onToggleLinePreset,
  onDeactivateAllLinePresets,
  onRemoveLineMarker,
  onClearAllLineMarkers,
  markersReadOnly = false,
  npcHighlights,
  showNpcHighlights,
  onToggleShowNpcHighlights,
  npcHighlightColorMenuEntries,
  onToggleNpcHighlightColorMenuEntries,
  onRemoveNpcHighlight,
  onRemoveAllNpcHighlightsForNpc,
  onClearAllNpcHighlights,
  antiDragEnabled,
  onAntiDragToggle,
  dragOnShiftOnly,
  onDragOnShiftOnlyToggle,
  antiDragDelay,
  onAntiDragDelayChange,
  antiDragCtrlToDrag,
  onAntiDragCtrlToDragToggle,
  xpDropsEnabled,
  onXpDropsToggle,
  xpDropsShowPredictedHit,
  onXpDropsPredictedHitToggle,
  xpDropsGrouped,
  onXpDropsGroupedToggle,
  xpDropsShowIcons,
  onXpDropsShowIconsToggle,
  xpDropsSpeed,
  onXpDropsSpeedChange,
  bossHealthBarEnabled,
  onBossHealthBarToggle,
  bossHealthBarShowName,
  onBossHealthBarShowNameToggle,
  bossHealthBarShowValues,
  onBossHealthBarShowValuesToggle,
  bossHealthBarShowPercentage,
  onBossHealthBarShowPercentageToggle,
  showInventoryTags,
  onToggleShowInventoryTags,
  inventoryTagCount,
  onClearAllInventoryTags,
  availablePresets,
  activePresetIds,
  onTogglePreset,
  onDeactivateAllPresets,
  onImportMarkers,
  onExportMarkers,
  onExportPreset,
  importExportStatus,
  tileIndicatorsEnabled,
  onTileIndicatorsToggle,
  tileIndicatorConfig,
  onTileIndicatorStyleChange,
  cameraPluginEnabled,
  onCameraPluginToggle,
  cameraVerticalCamera,
  onCameraVerticalCameraToggle,
  cameraInvertYaw,
  onCameraInvertYawToggle,
  cameraInvertPitch,
  onCameraInvertPitchToggle,
  cameraInnerZoomLevel,
  onCameraInnerZoomLevelChange,
  cameraOuterZoomLimit,
  onCameraOuterZoomLimitChange,
  cameraSpeed,
  onCameraSpeedChange,
  cameraDragSpeed,
  onCameraDragSpeedChange,
  cameraRightClickMovesCamera,
  onCameraRightClickMovesCameraToggle,
  cameraZoomIncrement,
  onCameraZoomIncrementChange,
  attackTimerMetronomeEnabled,
  onAttackTimerMetronomeToggle,
  attackTimerMetronomeShowBar,
  onAttackTimerMetronomeShowBarToggle,
  attackTimerMetronomeShowTicks,
  onAttackTimerMetronomeShowTicksToggle,
  attackTimerMetronomeFontSize,
  onAttackTimerMetronomeFontSizeChange,
  attackTimerMetronomeAbovePrayerIcon,
  onAttackTimerMetronomeAbovePrayerIconToggle,
  attackTimerMetronomeOffsetX,
  attackTimerMetronomeOffsetY,
  onAttackTimerMetronomeOffsetChange,
  customMenuSwapsEnabled,
  onCustomMenuSwapsToggle,
  customMenuSwaps,
  onCustomMenuSwapsChange,
  instantInventoryEnabled,
  onInstantInventoryToggle,
  instantPrayerEnabled,
  onInstantPrayerToggle,
  prayerEnabled,
  onPrayerToggle,
  prayerFlickOrbEnabled,
  onPrayerFlickOrbToggle,
  prayerFlickAlwaysOn,
  onPrayerFlickAlwaysOnToggle,
  prayerFlickEnabled,
  onPrayerFlickToggle,
  tickAudioMetronomeEnabled,
  onTickAudioMetronomeToggle,
  tickAudioMetronomeTock,
  onTickAudioMetronomeTockToggle,
  tickAudioMetronomeVolume,
  onTickAudioMetronomeVolumeChange,
  tileGridEnabled,
  onTileGridToggle,
  tileGridColor,
  onTileGridColorChange,
  tileGridOpacity,
  onTileGridOpacityChange,
  tileGridWidth,
  onTileGridWidthChange,
  statusBarsEnabled,
  onStatusBarsToggle,
  statusBarsShowValues,
  onStatusBarsShowValuesToggle,
  entityHiderEnabled,
  onEntityHiderToggle,
  entityHider,
  onEntityHiderOptionToggle,
  tzhaarHpTrackerEnabled,
  onTzhaarHpTrackerToggle,
  tzhaarHpTracker,
  onTzhaarHpTrackerChange,
  infernoAdditionsEnabled,
  onInfernoAdditionsToggle,
  infernoAdditions,
  onInfernoAdditionsChange,
  colosseumAdditionsEnabled,
  onColosseumAdditionsToggle,
  colosseumAdditions,
  onColosseumAdditionsChange,
  uiScale,
  onUiScaleChange,
  fixedLayoutScale,
  onFixedLayoutScaleChange,
  fixedLayoutIntegerScaling,
  onFixedLayoutIntegerScalingChange,
  stretchedModePluginEnabled,
  onStretchedModePluginToggle,
  autoOverlayScaleEnabled,
  onAutoOverlayScaleToggle,
  fixedLayout = false,
  mobileLayout = false,
  compactOrbsEnabled,
  onCompactOrbsToggle,
  compactOrbsLayout,
  onCompactOrbsLayoutChange,
  compactOrbsOrder,
  onCompactOrbsOrderChange,
}) => {
  const [expandedPlugins, setExpandedPlugins] = useState<Record<string, boolean>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const search = useSidebarSearch('plugins', visible);
  const { fieldId, resultsId } = useSearchIds();
  // A reveal of `plugins.<key>` or one of its options opens that row (rows key their expansion by
  // pluginKey), then the shared hook scrolls to the target.
  useRevealInScroller('plugins', contentRef, (id) => {
    const pluginKey = id.split('.')[1];
    if (pluginKey) setExpandedPlugins((prev) => applyPluginSettingsEvent(prev, { pluginKey, expanded: true }));
  });
  const [editingWidth, setEditingWidth] = useState<Record<string, string>>({});
  const [editingLineWidth, setEditingLineWidth] = useState<string | null>(null);
  const [editingTileWidth, setEditingTileWidth] = useState<string | null>(null);
  const [editingGridWidth, setEditingGridWidth] = useState<string | null>(null);
  // The orb awaiting a swap partner, or null when nothing is picked. Keyed by
  // orb id rather than slot index so a layout switch or a cross-tab order
  // update cannot leave the pick aimed at a different orb.
  const [compactOrbSwapPick, setCompactOrbSwapPick] = useState<CompactOrbId | null>(null);
  // Fixed and Mobile size their chrome from the client frame: neither honors Compact Orbs or UI scale.
  const pinnedLayout = fixedLayout || mobileLayout;
  const showHpTracker = isEncounterPluginShown('tzhaarHpTracker', encounterKind);
  const showInfernoAdditions = isEncounterPluginShown('infernoAdditions', encounterKind);
  const showColosseumAdditions = isEncounterPluginShown('colosseumAdditions', encounterKind);
  const showSetTimer = !!setTimer && isEncounterPluginShown('setTimer', encounterKind);
  const hasEncounterPlugins = showHpTracker || showInfernoAdditions || showColosseumAdditions || showSetTimer;
  const encounterSectionName = hasEncounterPlugins ? encounterPluginSectionName(encounterKind) : null;
  // A pick made before the layout changed would otherwise sit armed behind the disabled slots and
  // complete a swap on the first click after switching back.
  useEffect(() => {
    if (pinnedLayout) setCompactOrbSwapPick(null);
  }, [pinnedLayout]);

  const toggleExpand = (plugin: string) => {
    setExpandedPlugins((prev) => ({
      ...prev,
      [plugin]: !prev[plugin],
    }));
  };

  // Let the Plugins tutorial open/close a row's settings as its step is
  // spotlighted, so users see (and can tweak) the settings being described.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PluginSettingsEventDetail>).detail;
      setExpandedPlugins((prev) => applyPluginSettingsEvent(prev, detail));
    };
    window.addEventListener(TUTORIAL_PLUGIN_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(TUTORIAL_PLUGIN_SETTINGS_EVENT, handler);
  }, []);

  const npcHighlightGroups = (() => {
    const groups = new Map<number, { npcName: string; entries: NpcHighlightEntry[] }>();
    for (const highlight of npcHighlights) {
      const group = groups.get(highlight.npcTypeId);
      if (group) {
        group.entries.push(highlight);
      } else {
        groups.set(highlight.npcTypeId, { npcName: highlight.npcName, entries: [highlight] });
      }
    }
    return [...groups.entries()].map(([npcTypeId, group]) => ({ npcTypeId, ...group }));
  })();

  const modeLabelByValue = new Map(NPC_HIGHLIGHT_MODES.map((mode) => [mode.value, mode.label]));

  const compactOrbIcons: Record<CompactOrbId, string> = {
    hitpoints: MINIMAP.orbHitpointsIcon,
    prayer: MINIMAP.orbPrayerIcon,
    run: MINIMAP.orbRunIcon,
    special: MINIMAP.orbSpecialIcon,
  };

  return (
    <>
      {/* Text-free sibling carrying the panel's cast shadow, so .plugins-overlay
          stays a provably-opaque layer and keeps subpixel/bilevel text AA.
          See the note in SettingsSidebar.css. */}
      <div className={`plugins-overlay-shadow ${visible ? 'open' : ''}`} aria-hidden="true" />
      <aside
        className={`plugins-overlay ${visible ? 'open' : ''}`}
        {...sheet.drawer}
        inert={!visible ? true : undefined}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
          window.dispatchEvent(
            new CustomEvent(visible ? TUTORIAL_PLUGINS_OPENED_EVENT : TUTORIAL_PLUGINS_CLOSED_EVENT),
          );
        }}
      >
        <div className="panel-header">
          <h2 className="panel-title">Plugins</h2>
          <div className="panel-header-icons">
            <SidebarSearchToggle search={search} fieldId={fieldId} />
            {/* Dismissing the sidebar is not one of its actions, so it stands apart from them; and
                an X in a header needs no hint. */}
            <span className="panel-header-divider" aria-hidden="true" />
            <CloseButton className="panel-close-button" {...sheet.close} onClick={onClose} aria-label="Close plugins" />
          </div>
        </div>

        <SidebarSearchBar
          search={search}
          fieldId={fieldId}
          resultsId={resultsId}
          className="drawer-search-bar--plugins"
        />

        <div className="drawer-search-body">
          {/* Covered, not unmounted, while searching: clearing returns to the same place. */}
          <div className="plugins-content" ref={contentRef} inert={search.active ? true : undefined}>
            {/* The loaded encounter's plugins lead, under its name; elsewhere neither group is
                labeled. Alphabetical within each group, as the tour follows. */}
            {encounterSectionName && <h3 className="plugins-group-label">{encounterSectionName}</h3>}
            {showColosseumAdditions && (
              <PluginRow
                label="Colosseum Additions"
                pluginKey="colosseumAdditions"
                scope={ENCOUNTER_PLUGINS.colosseumAdditions.label}
                isOn={colosseumAdditionsEnabled}
                onToggle={onColosseumAdditionsToggle}
                hasSettings={true}
                expanded={expandedPlugins.colosseumAdditions}
                onToggleExpand={() => toggleExpand('colosseumAdditions')}
              >
                <PillarAdditionsSettings
                  pluginKey="colosseumAdditions"
                  options={colosseumAdditions}
                  onChange={onColosseumAdditionsChange}
                />
              </PluginRow>
            )}

            {showInfernoAdditions && (
              <PluginRow
                label="Inferno Additions"
                pluginKey="infernoAdditions"
                scope={ENCOUNTER_PLUGINS.infernoAdditions.label}
                isOn={infernoAdditionsEnabled}
                onToggle={onInfernoAdditionsToggle}
                hasSettings={true}
                expanded={expandedPlugins.infernoAdditions}
                onToggleExpand={() => toggleExpand('infernoAdditions')}
              >
                <PillarAdditionsSettings
                  pluginKey="infernoAdditions"
                  options={infernoAdditions}
                  onChange={onInfernoAdditionsChange}
                />
              </PluginRow>
            )}

            {showHpTracker && (
              <PluginRow
                label="TzHaar HP Tracker"
                pluginKey="tzhaarHpTracker"
                scope={ENCOUNTER_PLUGINS.tzhaarHpTracker.label}
                isOn={tzhaarHpTrackerEnabled}
                onToggle={onTzhaarHpTrackerToggle}
                hasSettings={true}
                expanded={expandedPlugins.tzhaarHpTracker}
                onToggleExpand={() => toggleExpand('tzhaarHpTracker')}
              >
                <div className="plugin-group" data-search-id={pluginSearchId('tzhaarHpTracker', 'Show HP')}>
                  <div className="plugin-group-label">Show HP</div>
                  <SettingRow
                    // Anchored on its group, so a reveal marks the title with it.
                    searchId={null}
                    isModified={tzhaarHpTracker.showHp !== DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.showHp}
                    onReset={() =>
                      onTzhaarHpTrackerChange({ ...tzhaarHpTracker, showHp: DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.showHp })
                    }
                  >
                    <select
                      value={tzhaarHpTracker.showHp}
                      onChange={(event) => {
                        const showHp = TZHAAR_HP_LOCATIONS.find((option) => option.value === event.target.value)?.value;
                        if (showHp) onTzhaarHpTrackerChange({ ...tzhaarHpTracker, showHp });
                      }}
                      className="select-input"
                      aria-label="Show HP"
                    >
                      {TZHAAR_HP_LOCATIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                </div>
                <div className="plugin-group" data-search-id={pluginSearchId('tzhaarHpTracker', 'Highlight style')}>
                  <div className="plugin-group-label">Highlight style</div>
                  <SettingRow
                    // Anchored on its group, so a reveal marks the title with it.
                    searchId={null}
                    isModified={tzhaarHpTracker.highlightStyle !== DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.highlightStyle}
                    onReset={() =>
                      onTzhaarHpTrackerChange({
                        ...tzhaarHpTracker,
                        highlightStyle: DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.highlightStyle,
                      })
                    }
                  >
                    <select
                      value={tzhaarHpTracker.highlightStyle}
                      onChange={(event) => {
                        const highlightStyle = TZHAAR_HIGHLIGHT_STYLES.find(
                          (option) => option.value === event.target.value,
                        )?.value;
                        if (highlightStyle) onTzhaarHpTrackerChange({ ...tzhaarHpTracker, highlightStyle });
                      }}
                      className="select-input"
                      aria-label="Highlight style"
                    >
                      {TZHAAR_HIGHLIGHT_STYLES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                </div>
                <div className="plugin-group" data-search-id={pluginSearchId('tzhaarHpTracker', 'Dynamic HP color')}>
                  <div className="plugin-group-label">Dynamic HP color</div>
                  <SettingRow
                    // Anchored on its group, so a reveal marks the title with it.
                    searchId={null}
                    isModified={tzhaarHpTracker.dynamicColor !== DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.dynamicColor}
                    onReset={() =>
                      onTzhaarHpTrackerChange({
                        ...tzhaarHpTracker,
                        dynamicColor: DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.dynamicColor,
                      })
                    }
                  >
                    <select
                      value={tzhaarHpTracker.dynamicColor}
                      onChange={(event) => {
                        const dynamicColor = TZHAAR_DYNAMIC_COLORS.find(
                          (option) => option.value === event.target.value,
                        )?.value;
                        if (dynamicColor) onTzhaarHpTrackerChange({ ...tzhaarHpTracker, dynamicColor });
                      }}
                      className="select-input"
                      aria-label="Dynamic HP color"
                    >
                      {TZHAAR_DYNAMIC_COLORS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                </div>
                <SettingRow
                  isModified={tzhaarHpTracker.recolorMenu !== DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.recolorMenu}
                  onReset={() =>
                    onTzhaarHpTrackerChange({
                      ...tzhaarHpTracker,
                      recolorMenu: DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.recolorMenu,
                    })
                  }
                  searchId={pluginSearchId('tzhaarHpTracker', 'Recolor menu')}
                >
                  <OsrsCheckbox
                    label="Recolor menu"
                    checked={tzhaarHpTracker.recolorMenu}
                    onChange={() =>
                      onTzhaarHpTrackerChange({ ...tzhaarHpTracker, recolorMenu: !tzhaarHpTracker.recolorMenu })
                    }
                  />
                </SettingRow>
                <SettingRow
                  isModified={tzhaarHpTracker.hideDead !== DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.hideDead}
                  onReset={() =>
                    onTzhaarHpTrackerChange({
                      ...tzhaarHpTracker,
                      hideDead: DEFAULT_TZHAAR_HP_TRACKER_OPTIONS.hideDead,
                    })
                  }
                  searchId={pluginSearchId('tzhaarHpTracker', 'Hide dead NPCs')}
                >
                  <OsrsCheckbox
                    label="Hide dead NPCs"
                    checked={tzhaarHpTracker.hideDead}
                    onChange={() =>
                      onTzhaarHpTrackerChange({ ...tzhaarHpTracker, hideDead: !tzhaarHpTracker.hideDead })
                    }
                  />
                </SettingRow>
              </PluginRow>
            )}

            {showSetTimer && setTimer && (
              <PluginRow
                label="Zuk Set Timer"
                pluginKey="setTimer"
                scope={ENCOUNTER_PLUGINS.setTimer.label}
                isOn={setTimer.enabled}
                onToggle={setTimer.onToggle}
                toggleDisabled={setTimer.readOnly}
                hasSettings
                expanded={expandedPlugins.setTimer}
                onToggleExpand={() => toggleExpand('setTimer')}
              >
                <div data-search-id={pluginSearchId('setTimer', 'Shortcuts')}>
                  <KeybindingsContent group={PLUGIN_KEYBINDS.zukSetTimerAdvance.group} readOnly={setTimer.readOnly} />
                </div>
              </PluginRow>
            )}

            {encounterSectionName && <h3 className="plugins-group-label">General</h3>}
            <PluginRow
              label="Anti Drag"
              pluginKey="antiDrag"
              isOn={antiDragEnabled}
              onToggle={onAntiDragToggle}
              hasSettings={true}
              expanded={expandedPlugins.antiDrag}
              onToggleExpand={() => toggleExpand('antiDrag')}
            >
              <SettingRow
                isModified={dragOnShiftOnly !== AD.onShiftOnly}
                onReset={() => {
                  if (dragOnShiftOnly !== AD.onShiftOnly) onDragOnShiftOnlyToggle();
                }}
                searchId={pluginSearchId('antiDrag', 'Require Shift to drag')}
              >
                <OsrsCheckbox
                  label="Require Shift to drag"
                  checked={dragOnShiftOnly}
                  onChange={() => onDragOnShiftOnlyToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={antiDragCtrlToDrag !== AD.ctrlToDrag}
                onReset={() => {
                  if (antiDragCtrlToDrag !== AD.ctrlToDrag) onAntiDragCtrlToDragToggle();
                }}
                searchId={pluginSearchId('antiDrag', 'Ctrl to drag immediately')}
              >
                <OsrsCheckbox
                  label="Ctrl to drag immediately"
                  checked={antiDragCtrlToDrag}
                  onChange={() => onAntiDragCtrlToDragToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={antiDragDelay !== AD.dragDelay}
                onReset={() => onAntiDragDelayChange(AD.dragDelay)}
                searchId={pluginSearchId('antiDrag', 'Drag delay')}
              >
                <div className="plugin-setting-row" style={{ opacity: dragOnShiftOnly ? 0.4 : 1 }}>
                  <span className="plugin-setting-label">Drag delay:</span>
                  <OsrsNumberInput
                    min={0}
                    max={2000}
                    value={antiDragDelay}
                    fieldWidth={40}
                    disabled={dragOnShiftOnly}
                    onMouseDown={blockNonLeftClick}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v) && v >= 0 && v <= 2000) onAntiDragDelayChange(v);
                    }}
                  />
                  <span className="plugin-setting-label" style={{ marginLeft: 2 }}>
                    ms
                  </span>
                </div>
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Attack Timer Metronome"
              pluginKey="attackTimerMetronome"
              isOn={attackTimerMetronomeEnabled}
              onToggle={onAttackTimerMetronomeToggle}
              hasSettings={true}
              expanded={expandedPlugins.attackTimerMetronome}
              onToggleExpand={() => toggleExpand('attackTimerMetronome')}
            >
              <SettingRow
                isModified={attackTimerMetronomeShowBar !== D.attackTimerMetronomeShowBar}
                onReset={() => {
                  if (attackTimerMetronomeShowBar !== D.attackTimerMetronomeShowBar)
                    onAttackTimerMetronomeShowBarToggle();
                }}
                searchId={pluginSearchId('attackTimerMetronome', 'Show Attack Bar')}
              >
                <OsrsCheckbox
                  label="Show Attack Bar"
                  checked={attackTimerMetronomeShowBar}
                  onChange={() => onAttackTimerMetronomeShowBarToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={attackTimerMetronomeShowTicks !== D.attackTimerMetronomeShowTicks}
                onReset={() => {
                  if (attackTimerMetronomeShowTicks !== D.attackTimerMetronomeShowTicks) {
                    onAttackTimerMetronomeShowTicksToggle();
                  }
                }}
                searchId={pluginSearchId('attackTimerMetronome', 'Show Attack Cooldown Ticks')}
              >
                <OsrsCheckbox
                  label="Show Attack Cooldown Ticks"
                  checked={attackTimerMetronomeShowTicks}
                  onChange={() => onAttackTimerMetronomeShowTicksToggle()}
                />
              </SettingRow>
              <OverheadNumberPlacementRows
                pluginKey="attackTimerMetronome"
                placement={{
                  fontSize: attackTimerMetronomeFontSize,
                  abovePrayerIcon: attackTimerMetronomeAbovePrayerIcon,
                  offsetX: attackTimerMetronomeOffsetX,
                  offsetY: attackTimerMetronomeOffsetY,
                }}
                defaults={{
                  fontSize: D.attackTimerMetronomeFontSize,
                  abovePrayerIcon: D.attackTimerMetronomeAbovePrayerIcon,
                  offsetX: D.attackTimerMetronomeOffsetX,
                  offsetY: D.attackTimerMetronomeOffsetY,
                }}
                disabled={!attackTimerMetronomeShowTicks}
                onAbovePrayerIconToggle={onAttackTimerMetronomeAbovePrayerIconToggle}
                onOffsetChange={onAttackTimerMetronomeOffsetChange}
                onFontSizeChange={onAttackTimerMetronomeFontSizeChange}
              />
            </PluginRow>

            <PluginRow
              label="Boss Health Bar"
              pluginKey="bossHealthBar"
              isOn={bossHealthBarEnabled}
              onToggle={onBossHealthBarToggle}
              hasSettings={true}
              expanded={expandedPlugins.bossHealthBar}
              onToggleExpand={() => toggleExpand('bossHealthBar')}
            >
              <SettingRow
                isModified={bossHealthBarShowName !== BOSS_HEALTH_BAR_DEFAULTS.showName}
                onReset={() => {
                  if (bossHealthBarShowName !== BOSS_HEALTH_BAR_DEFAULTS.showName) onBossHealthBarShowNameToggle();
                }}
                searchId={pluginSearchId('bossHealthBar', 'Show boss name')}
              >
                <OsrsCheckbox
                  label="Show boss name"
                  checked={bossHealthBarShowName}
                  onChange={() => onBossHealthBarShowNameToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={bossHealthBarShowValues !== BOSS_HEALTH_BAR_DEFAULTS.showValues}
                onReset={() => {
                  if (bossHealthBarShowValues !== BOSS_HEALTH_BAR_DEFAULTS.showValues)
                    onBossHealthBarShowValuesToggle();
                }}
                searchId={pluginSearchId('bossHealthBar', 'Show hitpoints')}
              >
                <OsrsCheckbox
                  label="Show hitpoints"
                  checked={bossHealthBarShowValues}
                  onChange={() => onBossHealthBarShowValuesToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={bossHealthBarShowPercentage !== BOSS_HEALTH_BAR_DEFAULTS.showPercentage}
                onReset={() => {
                  if (bossHealthBarShowPercentage !== BOSS_HEALTH_BAR_DEFAULTS.showPercentage)
                    onBossHealthBarShowPercentageToggle();
                }}
                searchId={pluginSearchId('bossHealthBar', 'Show percentage')}
              >
                <OsrsCheckbox
                  label="Show percentage"
                  checked={bossHealthBarShowPercentage}
                  onChange={() => onBossHealthBarShowPercentageToggle()}
                />
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Camera"
              pluginKey="camera"
              isOn={cameraPluginEnabled}
              onToggle={onCameraPluginToggle}
              hasSettings={true}
              expanded={expandedPlugins.camera}
              onToggleExpand={() => toggleExpand('camera')}
            >
              {/* Two zones, and the split is by what the camera DOES, not by control type:
              the inverts belong with rotation because they invert its two axes, and
              "Speed" reads as zoom speed only while it sits under the Zoom heading. */}
              <div className="plugin-group">
                <div className="plugin-group-label">Rotate</div>
                <SettingRow
                  isModified={cameraVerticalCamera !== D.cameraVerticalCamera}
                  onReset={() => {
                    if (cameraVerticalCamera !== D.cameraVerticalCamera) onCameraVerticalCameraToggle();
                  }}
                  searchId={pluginSearchId('camera', 'Expand pitch limit')}
                >
                  <OsrsCheckbox
                    label="Expand pitch limit"
                    checked={cameraVerticalCamera}
                    onChange={() => onCameraVerticalCameraToggle()}
                  />
                </SettingRow>
                <SettingRow
                  isModified={cameraInvertYaw !== D.cameraInvertYaw}
                  onReset={() => {
                    if (cameraInvertYaw !== D.cameraInvertYaw) onCameraInvertYawToggle();
                  }}
                  searchId={pluginSearchId('camera', 'Invert yaw')}
                >
                  <OsrsCheckbox
                    label="Invert yaw"
                    checked={cameraInvertYaw}
                    onChange={() => onCameraInvertYawToggle()}
                  />
                </SettingRow>
                <SettingRow
                  isModified={cameraInvertPitch !== D.cameraInvertPitch}
                  onReset={() => {
                    if (cameraInvertPitch !== D.cameraInvertPitch) onCameraInvertPitchToggle();
                  }}
                  searchId={pluginSearchId('camera', 'Invert pitch')}
                >
                  <OsrsCheckbox
                    label="Invert pitch"
                    checked={cameraInvertPitch}
                    onChange={() => onCameraInvertPitchToggle()}
                  />
                </SettingRow>
                <SettingRow
                  isModified={cameraRightClickMovesCamera !== D.cameraRightClickMovesCamera}
                  onReset={() => {
                    if (cameraRightClickMovesCamera !== D.cameraRightClickMovesCamera) {
                      onCameraRightClickMovesCameraToggle();
                    }
                  }}
                  searchId={pluginSearchId('camera', 'Right-click moves camera')}
                >
                  <OsrsCheckbox
                    label="Right-click moves camera"
                    checked={cameraRightClickMovesCamera}
                    onChange={() => onCameraRightClickMovesCameraToggle()}
                  />
                </SettingRow>
                <SettingRow
                  isModified={cameraSpeed !== D.cameraSpeed}
                  onReset={() => onCameraSpeedChange(D.cameraSpeed)}
                  searchId={pluginSearchId('camera', 'Keyboard speed')}
                >
                  <div className="plugin-setting-row">
                    <span className="plugin-setting-label">Keyboard speed:</span>
                    <OsrsNumberInput
                      min={0.1}
                      step={0.1}
                      value={cameraSpeed}
                      onMouseDown={blockNonLeftClick}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v > 0) onCameraSpeedChange(v);
                      }}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  isModified={cameraDragSpeed !== D.cameraDragSpeed}
                  onReset={() => onCameraDragSpeedChange(D.cameraDragSpeed)}
                  searchId={pluginSearchId('camera', 'Mouse speed')}
                >
                  <div className="plugin-setting-row">
                    <span className="plugin-setting-label">Mouse speed:</span>
                    <OsrsNumberInput
                      min={0.1}
                      step={0.1}
                      value={cameraDragSpeed}
                      onMouseDown={blockNonLeftClick}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v > 0) onCameraDragSpeedChange(v);
                      }}
                    />
                  </div>
                </SettingRow>
              </div>

              <div className="plugin-group">
                <div className="plugin-group-label">Zoom</div>
                <SettingRow
                  isModified={cameraInnerZoomLevel !== D.cameraInnerZoomLevel}
                  onReset={() => onCameraInnerZoomLevelChange(D.cameraInnerZoomLevel)}
                  searchId={pluginSearchId('camera', 'Inner limit')}
                >
                  <div className="plugin-setting-row">
                    <span className="plugin-setting-label">Inner limit:</span>
                    <OsrsNumberInput
                      min={INNER_ZOOM_LEVEL_MIN}
                      max={INNER_ZOOM_LEVEL_MAX}
                      value={cameraInnerZoomLevel}
                      onMouseDown={blockNonLeftClick}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v) && v >= INNER_ZOOM_LEVEL_MIN && v <= INNER_ZOOM_LEVEL_MAX) {
                          onCameraInnerZoomLevelChange(v);
                        }
                      }}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  isModified={cameraOuterZoomLimit !== D.cameraOuterZoomLimit}
                  onReset={() => onCameraOuterZoomLimitChange(D.cameraOuterZoomLimit)}
                  searchId={pluginSearchId('camera', 'Outer limit')}
                >
                  <div className="plugin-setting-row">
                    <span className="plugin-setting-label">Outer limit:</span>
                    <OsrsNumberInput
                      min={-400}
                      max={400}
                      value={cameraOuterZoomLimit}
                      onMouseDown={blockNonLeftClick}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isNaN(v) && v >= -400 && v <= 400) onCameraOuterZoomLimitChange(v);
                      }}
                    />
                  </div>
                </SettingRow>
                <SettingRow
                  isModified={cameraZoomIncrement !== D.cameraZoomIncrement}
                  onReset={() => onCameraZoomIncrementChange(D.cameraZoomIncrement)}
                  searchId={pluginSearchId('camera', 'Speed')}
                >
                  <div className="plugin-setting-row">
                    <span className="plugin-setting-label">Speed:</span>
                    <OsrsNumberInput
                      min={1}
                      value={cameraZoomIncrement}
                      onMouseDown={blockNonLeftClick}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v > 0) onCameraZoomIncrementChange(v);
                      }}
                    />
                  </div>
                </SettingRow>
              </div>
            </PluginRow>

            <PluginRow
              label="Compact Orbs"
              pluginKey="compactOrbs"
              isOn={compactOrbsEnabled}
              onToggle={onCompactOrbsToggle}
              hasSettings={true}
              expanded={expandedPlugins.compactOrbs}
              onToggleExpand={() => toggleExpand('compactOrbs')}
              toggleDisabled={pinnedLayout}
            >
              {pinnedLayout && (
                <div className="plugin-unavailable-note">
                  {fixedLayout ? 'Fixed mode' : 'Mobile'} keeps the client's own orb arrangement.
                </div>
              )}
              <SettingRow
                isModified={compactOrbsLayout !== DEFAULT_COMPACT_ORBS_LAYOUT}
                onReset={() => onCompactOrbsLayoutChange(DEFAULT_COMPACT_ORBS_LAYOUT)}
                hideReset={pinnedLayout}
                searchId={pluginSearchId('compactOrbs', 'Layout')}
              >
                <div className="compact-orbs-field">
                  <div className="compact-orbs-field-label">Layout</div>
                  <div className="compact-orbs-segmented" role="radiogroup" aria-label="Compact orbs layout">
                    {COMPACT_ORBS_LAYOUTS.map((option) => (
                      /* biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup; a native radio cannot render the segmented glyph styling. */
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={compactOrbsLayout === option}
                        className={`compact-orbs-segment${compactOrbsLayout === option ? ' is-active' : ''}`}
                        onClick={() => onCompactOrbsLayoutChange(option)}
                        disabled={pinnedLayout}
                      >
                        <CompactOrbsLayoutGlyph layout={option} />
                        <span className="compact-orbs-segment__label">{COMPACT_ORBS_LAYOUT_LABELS[option]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </SettingRow>

              <SettingRow
                isModified={!isDefaultCompactOrbsOrder(compactOrbsOrder)}
                onReset={() => {
                  setCompactOrbSwapPick(null);
                  onCompactOrbsOrderChange([...DEFAULT_COMPACT_ORBS_ORDER]);
                }}
                hideReset={pinnedLayout}
                searchId={pluginSearchId('compactOrbs', 'Orb order')}
              >
                <div className="compact-orbs-field">
                  <div className="compact-orbs-field-label">Orb order</div>
                  <div className={`compact-orbs-slots compact-orbs-slots--${compactOrbsLayout}`}>
                    {compactOrbsOrder.map((orbId, index) => (
                      <HoverHintButton
                        key={orbId}
                        type="button"
                        className={`compact-orbs-slot${compactOrbSwapPick === orbId ? ' is-selected' : ''}`}
                        aria-pressed={compactOrbSwapPick === orbId}
                        aria-label={`${COMPACT_ORB_LABELS[orbId]}, position ${index + 1}`}
                        hint={COMPACT_ORB_LABELS[orbId]}
                        onClick={() => {
                          if (compactOrbSwapPick === null || compactOrbSwapPick === orbId) {
                            setCompactOrbSwapPick(compactOrbSwapPick === orbId ? null : orbId);
                            return;
                          }
                          const from = compactOrbsOrder.indexOf(compactOrbSwapPick);
                          onCompactOrbsOrderChange(swapCompactOrbs(compactOrbsOrder, from, index));
                          setCompactOrbSwapPick(null);
                        }}
                        disabled={pinnedLayout}
                      >
                        <PixelSprite src={compactOrbIcons[orbId]} alt="" aria-hidden width={22} height={22} />
                      </HoverHintButton>
                    ))}
                  </div>
                  {!pinnedLayout && (
                    <div className="compact-orbs-hint">
                      {compactOrbSwapPick === null
                        ? 'Click two orbs to swap their positions.'
                        : `Click another orb to swap it with ${COMPACT_ORB_LABELS[compactOrbSwapPick]}.`}
                    </div>
                  )}
                </div>
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Custom Menu Swaps"
              pluginKey="customMenuSwaps"
              isOn={customMenuSwapsEnabled}
              onToggle={onCustomMenuSwapsToggle}
              hasSettings={true}
              expanded={expandedPlugins.customMenuSwaps}
              onToggleExpand={() => toggleExpand('customMenuSwaps')}
            >
              {/* No SettingRow: its reset would sit one stray click away from wiping every rule the
              user typed, with no undo, and its modified bar would run the full height of the box. */}
              <div className="menu-swaps-field" data-search-id={pluginSearchId('customMenuSwaps', 'Rules')}>
                <span className="menu-swaps-field-label">Rules</span>
                <textarea
                  className="menu-swaps-input"
                  rows={4}
                  spellCheck={false}
                  aria-label="Left-click swaps"
                  aria-describedby="custom-menu-swaps-format"
                  value={customMenuSwaps}
                  placeholder="Enter one rule per line"
                  onChange={(e) => onCustomMenuSwapsChange(e.target.value)}
                />
                <div id="custom-menu-swaps-format" className="menu-swaps-format">
                  <p className="menu-swaps-format-line">
                    <span className="menu-swaps-format-literal">option,target</span>
                    <span>
                      e.g. <span className="menu-swaps-format-literal">attack,void flare*</span>
                    </span>
                  </p>
                  <p className="menu-swaps-format-line">* matches any name. Later lines win.</p>
                </div>
              </div>
            </PluginRow>

            <PluginRow
              label="DPS Overlay"
              pluginKey="dpsOverlay"
              isOn={showDetailedDps}
              onToggle={onShowDetailedDpsToggle}
              hasSettings={true}
              expanded={expandedPlugins.dpsOverlay}
              onToggleExpand={() => toggleExpand('dpsOverlay')}
            >
              <SettingRow
                isModified={dpsOverlayShowDetails !== D.dpsOverlayShowDetails}
                onReset={() => {
                  if (dpsOverlayShowDetails !== D.dpsOverlayShowDetails) onDpsOverlayShowDetailsToggle();
                }}
                searchId={pluginSearchId('dpsOverlay', 'Detailed DPS')}
              >
                <OsrsCheckbox
                  label="Detailed DPS"
                  checked={dpsOverlayShowDetails}
                  onChange={() => onDpsOverlayShowDetailsToggle()}
                />
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Entity Hider"
              pluginKey="entityHider"
              isOn={entityHiderEnabled}
              onToggle={onEntityHiderToggle}
              hasSettings={true}
              expanded={expandedPlugins.entityHider}
              onToggleExpand={() => toggleExpand('entityHider')}
            >
              {ENTITY_HIDER_OPTION_LABELS.map(({ key, label }) => (
                <SettingRow
                  key={key}
                  isModified={entityHider[key] !== DEFAULT_ENTITY_HIDER_OPTIONS[key]}
                  onReset={() => {
                    if (entityHider[key] !== DEFAULT_ENTITY_HIDER_OPTIONS[key]) onEntityHiderOptionToggle(key);
                  }}
                  searchId={pluginSearchId('entityHider', label)}
                >
                  <OsrsCheckbox
                    label={label}
                    checked={entityHider[key]}
                    onChange={() => onEntityHiderOptionToggle(key)}
                  />
                </SettingRow>
              ))}
            </PluginRow>

            <PluginRow
              label="Instant Inventory"
              pluginKey="instantInventory"
              isOn={instantInventoryEnabled}
              onToggle={onInstantInventoryToggle}
              hasSettings={true}
              expanded={expandedPlugins.instantInventory}
              onToggleExpand={() => toggleExpand('instantInventory')}
            >
              <SettingRow
                isModified={instantPrayerEnabled !== D.instantPrayerEnabled}
                onReset={() => {
                  if (instantPrayerEnabled !== D.instantPrayerEnabled) onInstantPrayerToggle();
                }}
                searchId={pluginSearchId('instantInventory', 'Instant prayer')}
              >
                <OsrsCheckbox
                  label="Instant prayer"
                  checked={instantPrayerEnabled}
                  onChange={() => onInstantPrayerToggle()}
                />
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Inventory Tags"
              pluginKey="inventoryTags"
              isOn={showInventoryTags}
              onToggle={onToggleShowInventoryTags}
              hasSettings={true}
              expanded={expandedPlugins.inventoryTags}
              onToggleExpand={() => toggleExpand('inventoryTags')}
            >
              <div className="tile-marker-panel">
                <div className="tile-marker-section">
                  <div className="tile-marker-header" data-search-id={pluginSearchId('inventoryTags', 'Tagged Items')}>
                    <span className="tile-marker-title">Tagged Items</span>
                    <div className="tile-marker-count-badge">{inventoryTagCount}</div>
                  </div>
                  {/* All four of these hints read "<object> to <verb>" and are kept short enough to
                  sit on one line in a 246px chip beside the 102px cap. A longer phrasing wraps
                  to two lines, which reads as a defect next to its single-line siblings. */}
                  <div className="tile-marker-panel-empty">
                    <kbd className="kbd">Shift + Right-click</kbd> an item to tag
                  </div>
                  <div className="tile-marker-panel-actions">
                    <button
                      type="button"
                      className="tile-marker-panel-clear-btn"
                      onClick={onClearAllInventoryTags}
                      disabled={inventoryTagCount === 0}
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            </PluginRow>

            <PluginRow
              label="Line Markers"
              pluginKey="lineMarkers"
              absentOptions={availableLinePresets.length > 0 ? undefined : [pluginSearchId('lineMarkers', 'Presets')]}
              isOn={showLineMarkers}
              onToggle={onToggleShowLineMarkers}
              hasSettings={true}
              expanded={expandedPlugins.lineMarkers}
              onToggleExpand={() => toggleExpand('lineMarkers')}
              toggleDisabled={markersReadOnly}
            >
              <div className="tile-marker-panel">
                {markersReadOnly && (
                  <div className="tile-marker-io-status">This replay is drawing its own markers.</div>
                )}
                {availableLinePresets.length > 0 && (
                  <div className="tile-preset-section">
                    <div className="tile-preset-header" data-search-id={pluginSearchId('lineMarkers', 'Presets')}>
                      <span className="tile-preset-title">Presets</span>
                      <div className="tile-preset-bulk-actions">
                        <OsrsButton
                          variant="small"
                          onClick={onDeactivateAllLinePresets}
                          disabled={
                            markersReadOnly || !availableLinePresets.some((p) => activeLinePresetIds.includes(p.id))
                          }
                        >
                          Clear
                        </OsrsButton>
                      </div>
                    </div>
                    <div className="tile-preset-list">
                      {availableLinePresets.map((preset) => {
                        const isActive = activeLinePresetIds.includes(preset.id);
                        return (
                          <div
                            key={preset.id}
                            className={`tile-preset-item ${isActive ? 'active' : ''}`}
                            title={preset.description}
                          >
                            <button
                              type="button"
                              className="tile-preset-item-toggle"
                              disabled={markersReadOnly}
                              onClick={() => onToggleLinePreset(preset.id)}
                            >
                              <div className="tile-preset-item-info">
                                <span className="tile-preset-item-name">{preset.name}</span>
                                <span className="tile-preset-item-count">
                                  {preset.summary ?? `${preset.lines.length} lines`}
                                </span>
                              </div>
                            </button>
                            <OsrsToggle
                              checked={isActive}
                              onChange={() => onToggleLinePreset(preset.id)}
                              disabled={markersReadOnly}
                              size="small"
                            />
                            {preset.link && (
                              <a
                                href={preset.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tile-preset-item-link"
                                title="Watch tutorial"
                              >
                                <span className="tile-preset-link-icon" aria-hidden="true">
                                  &#9654;
                                </span>
                                <span className="tile-preset-link-text">Tutorial</span>
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="tile-marker-section">
                  <div className="tile-marker-header" data-search-id={pluginSearchId('lineMarkers', 'Your Lines')}>
                    <span className="tile-marker-title">Your Lines</span>
                    <div className="tile-marker-count-badge">{lineMarkers.length}</div>
                  </div>

                  <div className="tile-marker-panel-list">
                    {lineMarkers.length === 0 ? (
                      <div className="tile-marker-panel-empty">
                        <kbd className="kbd">Shift + Right-click</kbd> a tile edge to mark
                      </div>
                    ) : (
                      lineMarkers.map((line) => (
                        <div key={`${line.orientation}:${line.x},${line.y}`} className="tile-marker-panel-item">
                          <span className="tile-marker-panel-item-info">
                            <span
                              className="tile-marker-panel-item-swatch"
                              style={{
                                background: line.color,
                                opacity: line.opacity,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              className="tile-marker-panel-item-text"
                              title={
                                line.label
                                  ? `${line.orientation === 'horizontal' ? 'H' : 'V'} [${line.x}, ${line.y}] "${line.label}"`
                                  : `${line.orientation === 'horizontal' ? 'H' : 'V'} [${line.x}, ${line.y}]`
                              }
                            >
                              {line.orientation === 'horizontal' ? 'H' : 'V'} [{line.x}, {line.y}]
                              {line.label ? ` "${line.label}"` : ''}
                            </span>
                          </span>
                          <HoverHintButton
                            type="button"
                            className="tile-marker-panel-remove-btn"
                            disabled={markersReadOnly}
                            onClick={() => onRemoveLineMarker(line.x, line.y, line.orientation)}
                            aria-label="Remove line"
                          >
                            <span>&times;</span>
                          </HoverHintButton>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="tile-marker-panel-actions">
                    <div className="tile-marker-io-actions">
                      <OsrsButton
                        className="tile-marker-panel-clear-btn"
                        onClick={onClearAllLineMarkers}
                        disabled={markersReadOnly || lineMarkers.length === 0}
                      >
                        Clear All
                      </OsrsButton>
                    </div>
                  </div>
                </div>

                <div className="plugin-section-divider">
                  <span className="plugin-section-title">Options</span>
                </div>
                <div className="plugin-options-stack">
                  <SettingRow
                    isModified={!showLineMarkerLabels}
                    onReset={onToggleShowLineMarkerLabels}
                    searchId={pluginSearchId('lineMarkers', 'Show Labels')}
                  >
                    <OsrsCheckbox
                      label="Show Labels"
                      checked={showLineMarkerLabels}
                      onChange={() => onToggleShowLineMarkerLabels()}
                      disabled={markersReadOnly}
                    />
                  </SettingRow>
                  <SettingRow
                    isModified={Math.abs(lineMarkerWidth - DEFAULT_LINE_MARKER_WIDTH) > 0.01}
                    onReset={() => {
                      onLineMarkerWidthChange(DEFAULT_LINE_MARKER_WIDTH);
                      setEditingLineWidth(null);
                    }}
                    searchId={pluginSearchId('lineMarkers', 'Line width')}
                  >
                    <div className="plugin-setting-row">
                      <span className="plugin-setting-label">Line width:</span>
                      <OsrsNumberInput
                        min={LINE_MARKER_WIDTH_MIN}
                        max={LINE_MARKER_WIDTH_MAX}
                        step={LINE_MARKER_WIDTH_STEP}
                        value={editingLineWidth ?? String(lineMarkerWidth)}
                        disabled={markersReadOnly}
                        onMouseDown={blockNonLeftClick}
                        onChange={(e) => {
                          // Commit as the value changes so stepping the arrows or typing
                          // redraws immediately; the draft only holds values too
                          // incomplete or out of range to apply ("", "0.", "12").
                          const raw = e.target.value;
                          setEditingLineWidth(raw);
                          const v = parseFloat(raw);
                          if (Number.isFinite(v) && v >= LINE_MARKER_WIDTH_MIN && v <= LINE_MARKER_WIDTH_MAX) {
                            onLineMarkerWidthChange(v);
                          }
                        }}
                        onBlur={() => setEditingLineWidth(null)}
                      />
                    </div>
                  </SettingRow>
                </div>
              </div>
            </PluginRow>

            <PluginRow
              label="NPC Highlights"
              pluginKey="npcHighlights"
              isOn={showNpcHighlights}
              onToggle={onToggleShowNpcHighlights}
              hasSettings={true}
              expanded={expandedPlugins.npcHighlights}
              onToggleExpand={() => toggleExpand('npcHighlights')}
            >
              <div className="tile-marker-panel">
                <div className="tile-marker-section">
                  <div
                    className="tile-marker-header"
                    data-search-id={pluginSearchId('npcHighlights', 'Highlighted NPCs')}
                  >
                    <span className="tile-marker-title">Highlighted NPCs</span>
                    <div className="tile-marker-count-badge">{npcHighlightGroups.length}</div>
                  </div>

                  <div className="tile-marker-panel-list">
                    {npcHighlightGroups.length === 0 ? (
                      <div className="tile-marker-panel-empty">
                        <kbd className="kbd">Shift + Right-click</kbd> an NPC to highlight
                      </div>
                    ) : (
                      npcHighlightGroups.map((group) => (
                        <div key={group.npcTypeId} className="tile-marker-panel-item">
                          <span className="tile-marker-panel-item-info">
                            {/* Resolved the same way the menu and hover text resolve it, so the
                            swatch cannot show one color while the NPC's name is painted another. */}
                            <span
                              className="tile-marker-panel-item-swatch"
                              style={{
                                background: getNpcHighlightMenuColor(npcHighlights, group.npcTypeId),
                                flexShrink: 0,
                              }}
                            />
                            <span className="tile-marker-panel-item-text" title={group.npcName}>
                              {group.npcName}
                            </span>
                            <span className="npc-highlight-modes">
                              {group.entries.map((entry) => (
                                <OsrsButton
                                  key={`${entry.npcTypeId}-${entry.mode}`}
                                  variant="small"
                                  className="npc-highlight-chip"
                                  onClick={() => onRemoveNpcHighlight(entry.npcTypeId, entry.mode)}
                                >
                                  {modeLabelByValue.get(entry.mode) ?? entry.mode} &times;
                                </OsrsButton>
                              ))}
                            </span>
                          </span>
                          <HoverHintButton
                            type="button"
                            className="tile-marker-panel-remove-btn"
                            onClick={() => onRemoveAllNpcHighlightsForNpc(group.npcTypeId)}
                            aria-label="Remove all highlight modes for this NPC"
                            hint="Remove NPC highlights"
                          >
                            <span>&times;</span>
                          </HoverHintButton>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="tile-marker-panel-actions">
                    <OsrsButton
                      className="tile-marker-panel-clear-btn"
                      onClick={onClearAllNpcHighlights}
                      disabled={npcHighlightGroups.length === 0}
                    >
                      Clear All
                    </OsrsButton>
                  </div>
                </div>

                <div className="npc-highlight-options">
                  <SettingRow
                    isModified={npcHighlightColorMenuEntries !== DEFAULT_HIGHLIGHT_MENU_ENTRIES}
                    onReset={() => {
                      if (npcHighlightColorMenuEntries !== DEFAULT_HIGHLIGHT_MENU_ENTRIES)
                        onToggleNpcHighlightColorMenuEntries();
                    }}
                    searchId={pluginSearchId('npcHighlights', 'Color menu and hover text')}
                  >
                    <OsrsCheckbox
                      label="Color menu and hover text"
                      checked={npcHighlightColorMenuEntries}
                      onChange={() => onToggleNpcHighlightColorMenuEntries()}
                    />
                  </SettingRow>
                </div>
              </div>
            </PluginRow>

            <PluginRow
              label="Prayer"
              pluginKey="prayer"
              isOn={prayerEnabled}
              onToggle={onPrayerToggle}
              hasSettings={true}
              expanded={expandedPlugins.prayer}
              onToggleExpand={() => toggleExpand('prayer')}
            >
              <SettingRow
                isModified={prayerFlickOrbEnabled !== D.prayerFlickOrbEnabled}
                onReset={() => {
                  if (prayerFlickOrbEnabled !== D.prayerFlickOrbEnabled) onPrayerFlickOrbToggle();
                }}
                searchId={pluginSearchId('prayer', 'Pray flick on prayer orb')}
              >
                <OsrsCheckbox
                  label="Pray flick on prayer orb"
                  checked={prayerFlickOrbEnabled}
                  onChange={() => onPrayerFlickOrbToggle()}
                />
              </SettingRow>

              <SettingRow
                isModified={prayerFlickAlwaysOn !== D.prayerFlickAlwaysOn}
                onReset={() => {
                  if (prayerFlickAlwaysOn !== D.prayerFlickAlwaysOn) onPrayerFlickAlwaysOnToggle();
                }}
                searchId={pluginSearchId('prayer', 'Never hide pray flick')}
              >
                <OsrsCheckbox
                  label="Never hide pray flick"
                  checked={prayerFlickAlwaysOn}
                  onChange={() => onPrayerFlickAlwaysOnToggle()}
                />
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Prayer Flick Helper"
              pluginKey="prayerFlickHelper"
              isOn={prayerFlickEnabled}
              onToggle={onPrayerFlickToggle}
            />

            <PluginRow
              label="Status Bars"
              pluginKey="statusBars"
              isOn={statusBarsEnabled}
              onToggle={onStatusBarsToggle}
              hasSettings={true}
              expanded={expandedPlugins.statusBars}
              onToggleExpand={() => toggleExpand('statusBars')}
            >
              <SettingRow
                isModified={statusBarsShowValues !== D.statusBarsShowValues}
                onReset={() => {
                  if (statusBarsShowValues !== D.statusBarsShowValues) onStatusBarsShowValuesToggle();
                }}
                searchId={pluginSearchId('statusBars', 'Show values')}
              >
                <OsrsCheckbox
                  label="Show values"
                  checked={statusBarsShowValues}
                  onChange={() => onStatusBarsShowValuesToggle()}
                />
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Stretched Mode"
              pluginKey="stretchedMode"
              isOn={stretchedModePluginEnabled}
              onToggle={onStretchedModePluginToggle}
              hasSettings={true}
              expanded={expandedPlugins.stretchedMode}
              onToggleExpand={() => toggleExpand('stretchedMode')}
            >
              {/* One scale per layout, as in RuneLite's Stretched Mode: the UI scale for the
              resizable layouts, the client's own multiple for Fixed. Mobile has its own setting
              in Settings, so it gets a pointer there instead of a dead control. */}
              {fixedLayout ? (
                <FixedLayoutScaleField
                  fixedLayoutScale={fixedLayoutScale}
                  onFixedLayoutScaleChange={onFixedLayoutScaleChange}
                  integerScaling={fixedLayoutIntegerScaling}
                  onIntegerScalingChange={onFixedLayoutIntegerScalingChange}
                />
              ) : mobileLayout ? (
                <div className="stretched-mode-field" data-search-id={pluginSearchId('stretchedMode', 'UI scale')}>
                  <div className="plugin-group-label">UI scale</div>
                  {/* The whole line is the link, so a narrow panel wraps it as one sentence. */}
                  <p className="stretched-mode-hint">
                    <RevealLink target={settingsSearchId('Mobile', 'Interface scaling')}>
                      Edit mobile interface size in Settings
                    </RevealLink>
                  </p>
                </div>
              ) : (
                /* One group: its heading carries the exact value (the custom input), the picker the
               common stops, and a single line under it says how else to set it. What the scale
               covers is in the heading's tooltip. */
                <div className="stretched-mode-field" data-search-id={pluginSearchId('stretchedMode', 'UI scale')}>
                  <div className="stretched-mode-heading">
                    <label
                      className="plugin-group-label"
                      htmlFor="stretched-mode-custom-scale"
                      title="Sizes the game panel, minimap and orbs. Infoboxes, tooltips and menus grow less."
                    >
                      UI scale
                    </label>
                    <OsrsNumberInput
                      id="stretched-mode-custom-scale"
                      value={Math.round(uiScale * 100)}
                      min={100}
                      max={300}
                      step={1}
                      fieldWidth={38}
                      suffix="%"
                      onMouseDown={blockNonLeftClick}
                      onChange={(event) => {
                        const percent = Number.parseFloat(event.target.value);
                        if (Number.isFinite(percent) && percent >= 100 && percent <= 300) {
                          onUiScaleChange(percent / 100);
                        }
                      }}
                    />
                  </div>
                  <div className="stretched-mode-segmented" role="radiogroup" aria-label="Interface scaling">
                    {PANEL_SCALE_STOPS.map((stop) => (
                      /* biome-ignore lint/a11y/useSemanticElements: matches the Compact Orbs picker above; a native radio cannot carry the segmented styling. */
                      <button
                        key={stop}
                        type="button"
                        role="radio"
                        aria-checked={uiScale === stop}
                        className={`stretched-mode-segment${uiScale === stop ? ' is-active' : ''}`}
                        onClick={() => onUiScaleChange(stop)}
                      >
                        {Math.round(stop * 100)}
                      </button>
                    ))}
                  </div>
                  <p className="stretched-mode-hint">
                    <kbd className="kbd">Alt + Scroll</kbd> over the game UI
                  </p>
                </div>
              )}
              <AutoOverlaySizeSetting enabled={autoOverlayScaleEnabled} onToggle={onAutoOverlayScaleToggle} />
            </PluginRow>

            <PluginRow
              label="Tick Audio Metronome"
              pluginKey="tickAudioMetronome"
              isOn={tickAudioMetronomeEnabled}
              onToggle={onTickAudioMetronomeToggle}
              hasSettings={true}
              expanded={expandedPlugins.tickAudioMetronome}
              onToggleExpand={() => toggleExpand('tickAudioMetronome')}
            >
              <SettingRow
                isModified={tickAudioMetronomeTock !== D.tickAudioMetronomeTock}
                onReset={() => {
                  if (tickAudioMetronomeTock !== D.tickAudioMetronomeTock) onTickAudioMetronomeTockToggle();
                }}
                searchId={pluginSearchId('tickAudioMetronome', 'Alternate tick and tock')}
              >
                <OsrsCheckbox
                  label="Alternate tick and tock"
                  checked={tickAudioMetronomeTock}
                  onChange={() => onTickAudioMetronomeTockToggle()}
                />
              </SettingRow>

              <SettingRow
                isModified={tickAudioMetronomeVolume !== D.tickAudioMetronomeVolume}
                onReset={() => onTickAudioMetronomeVolumeChange(D.tickAudioMetronomeVolume)}
                searchId={pluginSearchId('tickAudioMetronome', 'Volume')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Volume (%):</span>
                  <OsrsNumberInput
                    min={0}
                    max={100}
                    value={Math.round(tickAudioMetronomeVolume * 100)}
                    onMouseDown={blockNonLeftClick}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val) && val >= 0 && val <= 100) {
                        onTickAudioMetronomeVolumeChange(val / 100);
                      }
                    }}
                  />
                </div>
              </SettingRow>
              <p className="tick-metronome-hint">Also scaled by Master Volume in the game panel's Audio settings.</p>
            </PluginRow>

            <PluginRow
              label="Tick Counter"
              pluginKey="tickCounter"
              isOn={showTickCounter}
              onToggle={onShowTickCounterToggle}
              hasSettings={true}
              expanded={expandedPlugins.tickCounter}
              onToggleExpand={() => toggleExpand('tickCounter')}
            >
              <SettingRow
                isModified={showTickCounterInfobox !== D.showTickCounterInfobox}
                onReset={() => {
                  if (showTickCounterInfobox !== D.showTickCounterInfobox) onShowTickCounterInfoboxToggle();
                }}
                searchId={pluginSearchId('tickCounter', 'Show Infobox')}
              >
                <OsrsCheckbox
                  label="Show Infobox"
                  checked={showTickCounterInfobox}
                  onChange={() => onShowTickCounterInfoboxToggle()}
                />
              </SettingRow>
              {/* Where it sits and how it is drawn are shared by every infobox, so they live in one place. */}
              <RevealLink target={settingsSearchId('Interface', 'Infobox appearance')} className="plugin-reveal-link">
                Infobox position and appearance
              </RevealLink>

              <SettingRow
                isModified={showTickCounterOverhead !== D.showTickCounterOverhead}
                onReset={() => {
                  if (showTickCounterOverhead !== D.showTickCounterOverhead) onShowTickCounterOverheadToggle();
                }}
                searchId={pluginSearchId('tickCounter', 'Show Above Head')}
              >
                <OsrsCheckbox
                  label="Show Above Head"
                  checked={showTickCounterOverhead}
                  onChange={() => onShowTickCounterOverheadToggle()}
                />
              </SettingRow>

              <OverheadNumberPlacementRows
                pluginKey="tickCounter"
                placement={{
                  fontSize: tickCounterFontSize,
                  abovePrayerIcon: tickCounterAbovePrayerIcon,
                  offsetX: tickCounterOffsetX,
                  offsetY: tickCounterOffsetY,
                }}
                defaults={{
                  fontSize: D.tickCounterFontSize,
                  abovePrayerIcon: D.tickCounterAbovePrayerIcon,
                  offsetX: D.tickCounterOffsetX,
                  offsetY: D.tickCounterOffsetY,
                }}
                disabled={!showTickCounterOverhead}
                onAbovePrayerIconToggle={onTickCounterAbovePrayerIconToggle}
                onOffsetChange={onTickCounterOffsetChange}
                onFontSizeChange={onTickCounterFontSizeChange}
              />

              <SettingRow
                isModified={tickCounterMax !== D.tickCounterMax}
                onReset={() => onTickCounterMaxChange(D.tickCounterMax)}
                searchId={pluginSearchId('tickCounter', 'Cycle Length')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Cycle Length:</span>
                  <OsrsNumberInput
                    min={TICK_CYCLE_MIN}
                    max={TICK_CYCLE_MAX}
                    value={tickCounterMax}
                    onMouseDown={blockNonLeftClick}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val) && val >= TICK_CYCLE_MIN && val <= TICK_CYCLE_MAX) {
                        onTickCounterMaxChange(val);
                      }
                    }}
                  />
                </div>
              </SettingRow>

              <SettingRow
                isModified={Object.keys(tickCounterColors).length > 0}
                onReset={() => onTickCounterColorsChange(D.tickCounterColors)}
                searchId={pluginSearchId('tickCounter', 'Colors')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Colors:</span>
                  <TickColorChips
                    max={tickCounterMax}
                    colors={tickCounterColors}
                    onChange={onTickCounterColorsChange}
                    onMouseDown={blockNonLeftClick}
                  />
                </div>
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Tile Grid"
              pluginKey="tileGrid"
              isOn={tileGridEnabled}
              onToggle={onTileGridToggle}
              hasSettings={true}
              expanded={expandedPlugins.tileGrid}
              onToggleExpand={() => toggleExpand('tileGrid')}
            >
              <SettingRow
                isModified={tileGridColor.toLowerCase() !== D.tileGridColor}
                onReset={() => onTileGridColorChange(D.tileGridColor)}
                searchId={pluginSearchId('tileGrid', 'Color')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Color:</span>
                  <TileIndicatorColorInput
                    color={tileGridColor}
                    onCommit={(color) => onTileGridColorChange(color.toLowerCase())}
                    onMouseDown={blockNonLeftClick}
                  />
                </div>
              </SettingRow>

              <SettingRow
                isModified={tileGridOpacity !== D.tileGridOpacity}
                onReset={() => onTileGridOpacityChange(D.tileGridOpacity)}
                searchId={pluginSearchId('tileGrid', 'Opacity')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Opacity (%):</span>
                  <OsrsNumberInput
                    min={0}
                    max={100}
                    value={Math.round(tileGridOpacity * 100)}
                    onMouseDown={blockNonLeftClick}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val) && val >= 0 && val <= 100) {
                        onTileGridOpacityChange(val / 100);
                      }
                    }}
                  />
                </div>
              </SettingRow>

              <SettingRow
                isModified={Math.abs(tileGridWidth - D.tileGridWidth) > 0.01}
                onReset={() => {
                  onTileGridWidthChange(D.tileGridWidth);
                  setEditingGridWidth(null);
                }}
                searchId={pluginSearchId('tileGrid', 'Line width')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Line width:</span>
                  <OsrsNumberInput
                    min={TILE_GRID_WIDTH_MIN}
                    max={TILE_GRID_WIDTH_MAX}
                    step={TILE_GRID_WIDTH_STEP}
                    value={editingGridWidth ?? String(tileGridWidth)}
                    onMouseDown={blockNonLeftClick}
                    onChange={(e) => {
                      // As Line Markers: commit each in-range value so the grid redraws as it
                      // changes; the draft holds the incomplete ones ("", "0.").
                      const raw = e.target.value;
                      setEditingGridWidth(raw);
                      const v = parseFloat(raw);
                      if (Number.isFinite(v) && v >= TILE_GRID_WIDTH_MIN && v <= TILE_GRID_WIDTH_MAX) {
                        onTileGridWidthChange(v);
                      }
                    }}
                    onBlur={() => setEditingGridWidth(null)}
                  />
                </div>
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Tile Indicators"
              pluginKey="tileIndicators"
              isOn={tileIndicatorsEnabled}
              onToggle={onTileIndicatorsToggle}
              hasSettings={true}
              expanded={expandedPlugins.tileIndicators}
              onToggleExpand={() => toggleExpand('tileIndicators')}
            >
              <div className="ti-group">
                {(['trueTile', 'hoverTile', 'destinationTile'] as const).map((tileType) => {
                  const style = tileIndicatorConfig[tileType];
                  const defaults = TID[tileType];
                  const label =
                    tileType === 'trueTile'
                      ? 'True Tile'
                      : tileType === 'hoverTile'
                        ? 'Hover Tile'
                        : 'Destination Tile';
                  const editingW = editingWidth[tileType];
                  const effectiveWidth = editingW != null ? parseFloat(String(editingW)) : style.width;
                  const isWidthModified =
                    !Number.isNaN(effectiveWidth) && Math.abs(effectiveWidth - defaults.width) > 0.01;
                  const isAnyModified =
                    style.color !== defaults.color ||
                    isWidthModified ||
                    style.cornerOnly !== defaults.cornerOnly ||
                    style.enabled !== defaults.enabled;
                  return (
                    <SettingRow
                      key={tileType}
                      searchId={pluginSearchId('tileIndicators', label)}
                      isModified={isAnyModified}
                      onReset={() => {
                        onTileIndicatorStyleChange(tileType, 'color', defaults.color);
                        onTileIndicatorStyleChange(tileType, 'width', defaults.width);
                        onTileIndicatorStyleChange(tileType, 'cornerOnly', defaults.cornerOnly);
                        onTileIndicatorStyleChange(tileType, 'enabled', defaults.enabled);
                        setEditingWidth((prev) => {
                          const next = { ...prev };
                          delete next[tileType];
                          return next;
                        });
                      }}
                    >
                      <div className="ti-item">
                        <div className="ti-header">
                          <TileIndicatorColorInput
                            color={style.color}
                            onCommit={(color) => onTileIndicatorStyleChange(tileType, 'color', color)}
                            onMouseDown={blockNonLeftClick}
                          />
                          <span className="ti-label">{label}</span>
                          <OsrsToggle
                            checked={style.enabled}
                            onChange={() => onTileIndicatorStyleChange(tileType, 'enabled', !style.enabled)}
                            size="small"
                          />
                        </div>
                        <div className="ti-controls" style={{ opacity: style.enabled ? 1 : 0.4 }}>
                          <div className="ti-control-group">
                            <span className="ti-control-label">Width:</span>
                            <OsrsNumberInput
                              min={0.5}
                              max={10}
                              step={0.5}
                              value={editingWidth[tileType] ?? String(style.width)}
                              onMouseDown={blockNonLeftClick}
                              onChange={(e) => setEditingWidth((prev) => ({ ...prev, [tileType]: e.target.value }))}
                              onBlur={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isNaN(v) && v >= 0.5 && v <= 10) {
                                  onTileIndicatorStyleChange(tileType, 'width', v);
                                }
                                setEditingWidth((prev) => {
                                  const next = { ...prev };
                                  delete next[tileType];
                                  return next;
                                });
                              }}
                            />
                          </div>
                          <OsrsCheckbox
                            label="Corners only"
                            checked={style.cornerOnly}
                            onChange={() => onTileIndicatorStyleChange(tileType, 'cornerOnly', !style.cornerOnly)}
                          />
                        </div>
                      </div>
                    </SettingRow>
                  );
                })}
              </div>
            </PluginRow>

            <PluginRow
              label="Tile Markers"
              pluginKey="tileMarkers"
              absentOptions={availablePresets.length > 0 ? undefined : [pluginSearchId('tileMarkers', 'Presets')]}
              isOn={showTileMarkers}
              onToggle={onToggleShowTileMarkers}
              hasSettings={true}
              expanded={expandedPlugins.tileMarkers}
              onToggleExpand={() => toggleExpand('tileMarkers')}
              toggleDisabled={markersReadOnly}
            >
              <div className="tile-marker-panel">
                {markersReadOnly && (
                  <div className="tile-marker-io-status">This replay is drawing its own markers.</div>
                )}
                {availablePresets.length > 0 && (
                  <div className="tile-preset-section">
                    <div className="tile-preset-header" data-search-id={pluginSearchId('tileMarkers', 'Presets')}>
                      <span className="tile-preset-title">Presets</span>
                      <div className="tile-preset-bulk-actions">
                        <OsrsButton
                          variant="small"
                          onClick={onDeactivateAllPresets}
                          disabled={markersReadOnly || !availablePresets.some((p) => activePresetIds.includes(p.id))}
                        >
                          Clear
                        </OsrsButton>
                      </div>
                    </div>
                    <div className="tile-preset-list">
                      {availablePresets.map((preset) => {
                        const isActive = activePresetIds.includes(preset.id);
                        return (
                          <div key={preset.id} className={`tile-preset-item ${isActive ? 'active' : ''}`}>
                            <div className="tile-preset-item-toggle" title={preset.description}>
                              <button
                                type="button"
                                className="tile-preset-item-toggle"
                                disabled={markersReadOnly}
                                onClick={() => onTogglePreset(preset.id)}
                              >
                                <div className="tile-preset-item-info">
                                  <span className="tile-preset-item-name">{preset.name}</span>
                                  <span className="tile-preset-item-count">{preset.markers.length} tiles</span>
                                </div>
                              </button>
                              <OsrsToggle
                                checked={isActive}
                                onChange={() => onTogglePreset(preset.id)}
                                disabled={markersReadOnly}
                                size="small"
                              />
                              {preset.link && (
                                <a
                                  href={preset.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="tile-preset-item-link"
                                  title="Watch tutorial"
                                >
                                  <span className="tile-preset-link-icon" aria-hidden="true">
                                    &#9654;
                                  </span>
                                  <span className="tile-preset-link-text">Tutorial</span>
                                </a>
                              )}
                              <button
                                type="button"
                                className="tile-preset-export-btn"
                                title="Export preset as RuneLite ground markers"
                                onClick={() => onExportPreset(preset.id)}
                              >
                                Export
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="tile-marker-section">
                  <div className="tile-marker-header" data-search-id={pluginSearchId('tileMarkers', 'Your Markers')}>
                    <span className="tile-marker-title">Your Markers</span>
                    <div className="tile-marker-count-badge">{tileMarkers.length}</div>
                  </div>

                  <div className="tile-marker-panel-list">
                    {tileMarkers.length === 0 ? (
                      <div className="tile-marker-panel-empty">
                        <kbd className="kbd">Shift + Right-click</kbd> a tile to mark
                      </div>
                    ) : (
                      tileMarkers.map((marker) => (
                        <div key={`${marker.x},${marker.y}`} className="tile-marker-panel-item">
                          <span className="tile-marker-panel-item-info">
                            <span
                              className="tile-marker-panel-item-swatch"
                              style={{
                                background: marker.color,
                                opacity: marker.opacity,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              className="tile-marker-panel-item-text"
                              title={
                                marker.label
                                  ? `[${marker.x}, ${marker.y}] "${marker.label}"`
                                  : `[${marker.x}, ${marker.y}]`
                              }
                            >
                              [{marker.x}, {marker.y}]{marker.label ? ` "${marker.label}"` : ''}
                            </span>
                          </span>
                          <HoverHintButton
                            type="button"
                            className="tile-marker-panel-remove-btn"
                            disabled={markersReadOnly}
                            onClick={() => onRemoveMarker(marker.x, marker.y)}
                            aria-label="Remove marker"
                          >
                            <span>&times;</span>
                          </HoverHintButton>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="tile-marker-panel-actions">
                    <div className="tile-marker-io-actions">
                      <OsrsButton
                        className="tile-marker-panel-clear-btn"
                        onClick={onClearAllMarkers}
                        disabled={markersReadOnly || tileMarkers.length === 0}
                      >
                        Clear All
                      </OsrsButton>
                      <OsrsButton
                        variant="small"
                        className="tile-marker-io-btn"
                        onClick={onExportMarkers}
                        disabled={tileMarkers.length === 0}
                      >
                        Export
                      </OsrsButton>
                      <OsrsButton
                        variant="small"
                        className="tile-marker-io-btn"
                        onClick={onImportMarkers}
                        disabled={markersReadOnly}
                      >
                        Import
                      </OsrsButton>
                    </div>
                    {importExportStatus && <div className="tile-marker-io-status">{importExportStatus}</div>}
                  </div>
                </div>

                <div className="plugin-section-divider">
                  <span className="plugin-section-title">Options</span>
                </div>
                <div className="plugin-options-stack">
                  <SettingRow
                    isModified={!showTileMarkerLabels}
                    onReset={onToggleShowTileMarkerLabels}
                    searchId={pluginSearchId('tileMarkers', 'Show Labels')}
                  >
                    <OsrsCheckbox
                      label="Show Labels"
                      checked={showTileMarkerLabels}
                      onChange={() => onToggleShowTileMarkerLabels()}
                      disabled={markersReadOnly}
                    />
                  </SettingRow>
                  <SettingRow
                    isModified={Math.abs(tileMarkerWidth - DEFAULT_TILE_MARKER_WIDTH) > 0.01}
                    onReset={() => {
                      onTileMarkerWidthChange(DEFAULT_TILE_MARKER_WIDTH);
                      setEditingTileWidth(null);
                    }}
                    searchId={pluginSearchId('tileMarkers', 'Border width')}
                  >
                    <div className="plugin-setting-row">
                      <span className="plugin-setting-label">Border width:</span>
                      <OsrsNumberInput
                        min={TILE_MARKER_WIDTH_MIN}
                        max={TILE_MARKER_WIDTH_MAX}
                        step={TILE_MARKER_WIDTH_STEP}
                        value={editingTileWidth ?? String(tileMarkerWidth)}
                        disabled={markersReadOnly}
                        onMouseDown={blockNonLeftClick}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setEditingTileWidth(raw);
                          const v = parseFloat(raw);
                          if (Number.isFinite(v) && v >= TILE_MARKER_WIDTH_MIN && v <= TILE_MARKER_WIDTH_MAX) {
                            onTileMarkerWidthChange(v);
                          }
                        }}
                        onBlur={() => setEditingTileWidth(null)}
                      />
                    </div>
                  </SettingRow>
                </div>
              </div>
            </PluginRow>

            <PluginRow
              label="XP Drops"
              pluginKey="xpDrops"
              isOn={xpDropsEnabled}
              onToggle={onXpDropsToggle}
              hasSettings={true}
              expanded={expandedPlugins.xpDrops}
              onToggleExpand={() => toggleExpand('xpDrops')}
            >
              <SettingRow
                isModified={xpDropsShowPredictedHit !== XP_DROP_DEFAULTS.showPredictedHit}
                onReset={() => {
                  if (xpDropsShowPredictedHit !== XP_DROP_DEFAULTS.showPredictedHit) onXpDropsPredictedHitToggle();
                }}
                searchId={pluginSearchId('xpDrops', 'Show predicted hit')}
              >
                <OsrsCheckbox
                  label="Show predicted hit"
                  checked={xpDropsShowPredictedHit}
                  onChange={() => onXpDropsPredictedHitToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={xpDropsGrouped !== XP_DROP_DEFAULTS.grouped}
                onReset={() => {
                  if (xpDropsGrouped !== XP_DROP_DEFAULTS.grouped) onXpDropsGroupedToggle();
                }}
                searchId={pluginSearchId('xpDrops', 'Group XP drops')}
              >
                <OsrsCheckbox
                  label="Group XP drops"
                  checked={xpDropsGrouped}
                  onChange={() => onXpDropsGroupedToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={xpDropsShowIcons !== XP_DROP_DEFAULTS.showIcons}
                onReset={() => {
                  if (xpDropsShowIcons !== XP_DROP_DEFAULTS.showIcons) onXpDropsShowIconsToggle();
                }}
                searchId={pluginSearchId('xpDrops', 'Show skill icons')}
              >
                <OsrsCheckbox
                  label="Show skill icons"
                  checked={xpDropsShowIcons}
                  onChange={() => onXpDropsShowIconsToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={xpDropsSpeed !== XP_DROP_DEFAULTS.speed}
                onReset={() => onXpDropsSpeedChange(XP_DROP_DEFAULTS.speed)}
                searchId={pluginSearchId('xpDrops', 'Speed')}
              >
                <div className="plugin-setting-row">
                  <span className="plugin-setting-label">Speed:</span>
                  <OsrsNumberInput
                    min={10}
                    max={200}
                    value={xpDropsSpeed}
                    fieldWidth={40}
                    onMouseDown={blockNonLeftClick}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) onXpDropsSpeedChange(v);
                    }}
                  />
                  <span className="plugin-setting-label" style={{ marginLeft: 2 }}>
                    px/s
                  </span>
                </div>
              </SettingRow>
            </PluginRow>

            <PluginRow
              label="Debug Overlays"
              pluginKey="debugOverlays"
              hasSettings={true}
              expanded={expandedPlugins.debugOverlays}
              onToggleExpand={() => toggleExpand('debugOverlays')}
            >
              <SettingRow
                isModified={showCoordinates !== D.showCoordinates}
                onReset={() => {
                  if (showCoordinates !== D.showCoordinates) onShowCoordinatesToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'Coordinate Overlay')}
              >
                <OsrsCheckbox
                  label="Coordinate Overlay"
                  checked={showCoordinates}
                  onChange={() => onShowCoordinatesToggle()}
                />
              </SettingRow>

              <SettingRow
                isModified={showNpcClickbox !== D.showNpcClickbox}
                onReset={() => {
                  if (showNpcClickbox !== D.showNpcClickbox) onShowNpcClickboxToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'NPC Clickbox')}
              >
                <OsrsCheckbox
                  label="NPC Clickbox"
                  checked={showNpcClickbox}
                  onChange={() => onShowNpcClickboxToggle()}
                />
              </SettingRow>

              <SettingRow
                isModified={npcAttackTimerMetronomeEnabled !== D.npcAttackTimerMetronomeEnabled}
                onReset={() => {
                  if (npcAttackTimerMetronomeEnabled !== D.npcAttackTimerMetronomeEnabled) {
                    onNpcAttackTimerMetronomeToggle();
                  }
                }}
                searchId={pluginSearchId('debugOverlays', 'NPC Attack Timer Metronome')}
              >
                <OsrsCheckbox
                  label="NPC Attack Timer Metronome"
                  checked={npcAttackTimerMetronomeEnabled}
                  onChange={() => onNpcAttackTimerMetronomeToggle()}
                />
              </SettingRow>

              <SettingRow
                isModified={showTickTiming !== D.showTickTiming}
                onReset={() => {
                  if (showTickTiming !== D.showTickTiming) onShowTickTimingToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'Tick Timing')}
              >
                <OsrsCheckbox label="Tick Timing" checked={showTickTiming} onChange={() => onShowTickTimingToggle()} />
              </SettingRow>

              <SettingRow
                isModified={showSoundDebug !== D.showSoundDebug}
                onReset={() => {
                  if (showSoundDebug !== D.showSoundDebug) onShowSoundDebugToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'Sound Debug')}
              >
                <OsrsCheckbox label="Sound Debug" checked={showSoundDebug} onChange={() => onShowSoundDebugToggle()} />
              </SettingRow>
              <SettingRow
                isModified={showCameraDebug !== D.showCameraDebug}
                onReset={() => {
                  if (showCameraDebug !== D.showCameraDebug) onShowCameraDebugToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'Camera Debug')}
              >
                <OsrsCheckbox
                  label="Camera Debug"
                  checked={showCameraDebug}
                  onChange={() => onShowCameraDebugToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={showModifierKeys !== D.showModifierKeys}
                onReset={() => {
                  if (showModifierKeys !== D.showModifierKeys) onShowModifierKeysToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'Input Display')}
              >
                <OsrsCheckbox
                  label="Input Display"
                  checked={showModifierKeys}
                  onChange={() => onShowModifierKeysToggle()}
                />
              </SettingRow>
              <SettingRow
                isModified={hideHardwareAccelWarning !== D.hideHardwareAccelWarning}
                onReset={() => {
                  if (hideHardwareAccelWarning !== D.hideHardwareAccelWarning) onHideHardwareAccelWarningToggle();
                }}
                searchId={pluginSearchId('debugOverlays', 'Hide HW Accel Warning')}
              >
                <OsrsCheckbox
                  label="Hide HW Accel Warning"
                  checked={hideHardwareAccelWarning}
                  onChange={() => onHideHardwareAccelWarningToggle()}
                />
              </SettingRow>
              {encounterDebugFlagsInfo.length > 0 && (
                <>
                  {encounterDebugSectionTitle && (
                    <div className="plugin-section-divider">
                      <span className="plugin-section-title">{encounterDebugSectionTitle}</span>
                    </div>
                  )}

                  {encounterDebugFlagsInfo.map((flag) => (
                    <OsrsCheckbox
                      key={flag.key}
                      label={flag.label}
                      checked={!!encounterDebugFlags[flag.key]}
                      onChange={() => onSetEncounterDebugFlag(flag.key, !encounterDebugFlags[flag.key])}
                    />
                  ))}
                </>
              )}
            </PluginRow>
          </div>
          {search.active && (
            <SidebarSearchResults
              search={search}
              id={resultsId}
              layout={fixedLayout ? 'fixed' : mobileLayout ? 'mobile' : 'resizable'}
            />
          )}
        </div>
      </aside>
    </>
  );
};

// Keep the DOM and row/edit/scroll state through the exit transition, but ignore
// parent tick updates while inert. Opening always renders with the latest props
// before the enter transition; fresh callbacks from App need no equality checks.
export const PluginsPanel = memo(PluginsPanelContent, (previous, next) => !previous.visible && !next.visible);
