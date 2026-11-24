import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import './Controls.css';
import { useDeviceMode, useIsMobileDevice } from '../hooks/useIsMobileDevice';
import {
  DEFAULT_GAME_RESOLUTION,
  FIGHT_START_COUNTDOWN_TICKS_MAX,
  FIGHT_START_COUNTDOWN_TICKS_MIN,
  type FixedLayoutScale,
  GAME_RESOLUTION_MAX,
  GAME_RESOLUTION_MIN,
  type GameResolutionSettings,
  PERSISTED_SETTINGS_DEFAULTS,
  type PersistedSettings,
  RESOLUTION_PRESETS,
} from '../hooks/usePersistedSettings';
import {
  CLIENT_LAYOUT_LABELS,
  CLIENT_LAYOUT_MODES,
  type ClientLayoutMode,
  FIXED_FRAME,
} from '../layout/osrsClientLayout';
import { pluginSearchId, settingsSearchId } from '../settingsSearch/ids';
import { type DeviceMode, setDeviceMode } from '../util/deviceMode';
import { detectMobileDevice } from '../util/mobileDetection';
import { InfoHint } from './ui/InfoHint';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { ResetButton } from './ui/ResetButton';
import { RevealLink, SettingLinkRow } from './ui/RevealLinks';
import { SettingRow } from './ui/SettingRow';

const D = PERSISTED_SETTINGS_DEFAULTS;

const FPS_CAP_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Uncapped' },
  { value: 144, label: '144 FPS' },
  { value: 120, label: '120 FPS' },
  { value: 90, label: '90 FPS' },
  { value: 60, label: '60 FPS' },
  { value: 30, label: '30 FPS' },
];

export interface SimulationControlsProps {
  /** Ctrl+R runs a practice restart (a replay practice tick, or the encounter session's primary), not this one. */
  restartShortcutTargetsPractice?: boolean;
  onReset: () => void;
  resetDisabled?: boolean;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
  autoAdvance: boolean;
  onAutoAdvanceToggle: () => void;
  pauseWhenUnfocused: boolean;
  onPauseWhenUnfocusedChange: (enabled: boolean) => void;
  inputLagMs: number;
  onInputLagMsChange: (ms: number) => void;
  fightStartCountdown: boolean;
  onFightStartCountdownChange: (enabled: boolean) => void;
  fightStartCountdownTicks: number;
  onFightStartCountdownTicksChange: (ticks: number) => void;
}

export interface DisplayControlsProps {
  smoothTerrain: boolean;
  onSmoothTerrainToggle: () => void;
  brightness: number;
  onBrightnessChange: (brightness: number) => void;
  contrast: number;
  onContrastChange: (contrast: number) => void;
  saturation: number;
  onSaturationChange: (saturation: number) => void;
  selectedRenderer: 'webgl' | 'canvas2d';
  onRendererChange: (renderer: 'webgl' | 'canvas2d') => void;
  renderScale: number;
  onRenderScaleChange: (scale: number) => void;
  fpsCap: number;
  onFpsCapChange: (cap: number) => void;
  antiAliasing: PersistedSettings['antiAliasing'];
  onAntiAliasingChange: (value: PersistedSettings['antiAliasing']) => void;
}

export interface ViewportPopoutControlProps {
  onOpenPopout: () => void;
  canPopOut: boolean;
  isPopoutWindow: boolean;
}

export interface ShortcutHintsControlProps {
  showShortcutHints?: boolean;
  onShowShortcutHintsToggle?: () => void;
}

/**
 * The sidebar's Interface section, in one order, with slots for the groups the sidebar owns
 * (Keybinds and Infobox appearance).
 */
export interface InterfaceControlsProps extends ViewportPopoutControlProps, ShortcutHintsControlProps {
  gameResolution: GameResolutionSettings;
  onGameResolutionChange: (resolution: GameResolutionSettings) => void;
  clientLayoutMode: ClientLayoutMode;
  onClientLayoutModeChange: (mode: ClientLayoutMode) => void;
  /** The oversized frame or recording to warn about, or null when everything fits. */
  viewportSizeWarning: { readonly width: number; readonly height: number; readonly replay: boolean } | null;
  /** Read-only here: the Stretched Mode plugin (or Mobile's own setting) edits the interface scaling. */
  interfaceScaling: InterfaceScalingState;
  transparentChatbox: boolean;
  onTransparentChatboxChange: (transparent: boolean) => void;
  transparentSidePanel: boolean;
  onTransparentSidePanelChange: (transparent: boolean) => void;
  hotkeysCloseSidePanel: boolean;
  onHotkeysCloseSidePanelChange: (close: boolean) => void;
  clickThroughTransparentChatbox: boolean;
  onClickThroughTransparentChatboxChange: (clickThrough: boolean) => void;
}

/** The groups the sidebar fills in, each placed where it belongs in the section's order. */
export interface InterfaceSlots {
  /** After Layout and its scaling: where the controls for playing live. */
  keybinds?: React.ReactNode;
  /** After the game window: how the interface looks. */
  appearance?: React.ReactNode;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  onReset,
  resetDisabled,
  restartShortcutTargetsPractice = false,
  speedMultiplier,
  onSpeedChange,
  autoAdvance,
  onAutoAdvanceToggle,
  pauseWhenUnfocused,
  onPauseWhenUnfocusedChange,
  inputLagMs,
  onInputLagMsChange,
  fightStartCountdown,
  onFightStartCountdownChange,
  fightStartCountdownTicks,
  onFightStartCountdownTicksChange,
}) => {
  const countdownTicksModified = fightStartCountdownTicks !== D.fightStartCountdownTicks;
  return (
    <div className="controls-container">
      <div
        className="control-group control-group--no-border"
        data-search-id={settingsSearchId('Simulation', 'Restart Simulation')}
      >
        <button type="button" onClick={onReset} className="control-button restart-button" disabled={resetDisabled}>
          <span>Restart Simulation</span>
          {!restartShortcutTargetsPractice && <kbd className="restart-keybind">(Ctrl+R)</kbd>}
        </button>
      </div>

      <div className="control-group" data-search-id={settingsSearchId('Simulation', 'Playback Speed')}>
        <div className="group-title">Playback Speed</div>
        <div className="speed-buttons">
          {[0.5, 1, 2].map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => onSpeedChange(speed)}
              className={`control-button ${speedMultiplier === speed ? 'active' : ''}`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <SettingRow
          isModified={inputLagMs !== D.inputLagMs}
          onReset={() => onInputLagMsChange(D.inputLagMs)}
          hideReset
          searchId={settingsSearchId('Simulation', 'Input Lag')}
        >
          <div className="slider-control">
            <div className="slider-label">
              <span className="slider-label-text">
                Input Lag
                {inputLagMs !== D.inputLagMs && (
                  <ResetButton
                    className="setting-row__reset-inline"
                    onClick={() => onInputLagMsChange(D.inputLagMs)}
                    aria-label="Reset input lag to default"
                  />
                )}
              </span>
              <span className="slider-label-value">{inputLagMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="10"
              aria-label="Input lag in milliseconds"
              aria-valuetext={`${inputLagMs} milliseconds`}
              value={inputLagMs}
              onChange={(e) => onInputLagMsChange(Number(e.target.value))}
              className={`slider-input${inputLagMs !== D.inputLagMs ? ' slider-input--modified' : ''}`}
            />
          </div>
        </SettingRow>
      </div>

      <div className="control-group" data-search-id={settingsSearchId('Simulation', 'Start of Fight Countdown')}>
        <div className="group-title">Start of Fight Countdown</div>
        <SettingRow
          isModified={fightStartCountdown !== D.fightStartCountdown}
          onReset={() => onFightStartCountdownChange(D.fightStartCountdown)}
          searchId={settingsSearchId('Simulation', 'Start of Fight Countdown', 'Countdown')}
        >
          <OsrsCheckbox checked={fightStartCountdown} onChange={onFightStartCountdownChange} label="Countdown" />
        </SettingRow>
        <SettingRow
          isModified={countdownTicksModified}
          onReset={() => onFightStartCountdownTicksChange(D.fightStartCountdownTicks)}
          hideReset
          searchId={settingsSearchId('Simulation', 'Start of Fight Countdown', 'Length')}
        >
          <div className="slider-control">
            <div className="slider-label">
              <span className="slider-label-text">
                Length
                {countdownTicksModified && (
                  <ResetButton
                    className="setting-row__reset-inline"
                    onClick={() => onFightStartCountdownTicksChange(D.fightStartCountdownTicks)}
                    aria-label="Reset countdown length to default"
                  />
                )}
              </span>
              <span className="slider-label-value">
                {fightStartCountdownTicks} {fightStartCountdownTicks === 1 ? 'tick' : 'ticks'}
              </span>
            </div>
            <input
              type="range"
              min={FIGHT_START_COUNTDOWN_TICKS_MIN}
              max={FIGHT_START_COUNTDOWN_TICKS_MAX}
              step="1"
              aria-label="Countdown length in ticks"
              aria-valuetext={`${fightStartCountdownTicks} ${fightStartCountdownTicks === 1 ? 'tick' : 'ticks'}`}
              value={fightStartCountdownTicks}
              disabled={!fightStartCountdown}
              onChange={(e) => onFightStartCountdownTicksChange(Number(e.target.value))}
              className={`slider-input${countdownTicksModified ? ' slider-input--modified' : ''}`}
            />
          </div>
        </SettingRow>
        <div className="settings-hint">Counts down in game ticks before a fight starts.</div>
      </div>

      <div className="control-group control-group--no-border">
        <SettingRow
          isModified={autoAdvance !== D.autoAdvance}
          onReset={() => {
            if (autoAdvance !== D.autoAdvance) onAutoAdvanceToggle();
          }}
          searchId={settingsSearchId('Simulation', 'Auto-Advance')}
        >
          <OsrsCheckbox checked={autoAdvance} onChange={() => onAutoAdvanceToggle()} label="Auto-Advance" />
        </SettingRow>
        <SettingRow
          isModified={pauseWhenUnfocused !== D.pauseWhenUnfocused}
          onReset={() => onPauseWhenUnfocusedChange(D.pauseWhenUnfocused)}
          searchId={settingsSearchId('Simulation', 'Pause simulator when unfocused')}
        >
          <OsrsCheckbox
            checked={pauseWhenUnfocused}
            onChange={onPauseWhenUnfocusedChange}
            label="Pause simulator when unfocused"
          />
        </SettingRow>
      </div>
    </div>
  );
};

export const DisplayControls: React.FC<DisplayControlsProps> = ({
  smoothTerrain,
  onSmoothTerrainToggle,
  brightness,
  onBrightnessChange,
  contrast,
  onContrastChange,
  saturation,
  onSaturationChange,
  selectedRenderer,
  onRendererChange,
  renderScale,
  onRenderScaleChange,
  fpsCap,
  onFpsCapChange,
  antiAliasing,
  onAntiAliasingChange,
}) => {
  return (
    <div className="controls-container">
      <div className="control-group" data-search-id={settingsSearchId('Graphics & Performance', 'View Mode')}>
        <div className="group-title">View Mode</div>
        <SettingRow
          // Anchored on its group, so a reveal marks the title with it.
          searchId={null}
          isModified={selectedRenderer !== D.rendererType}
          onReset={() => onRendererChange(D.rendererType)}
        >
          <select
            value={selectedRenderer}
            onChange={(e) => onRendererChange(e.target.value as 'webgl' | 'canvas2d')}
            className="select-input"
          >
            <option value="webgl">3D View (WebGL)</option>
            <option value="canvas2d">2D View (Debug)</option>
          </select>
        </SettingRow>
        {selectedRenderer === 'canvas2d' && (
          <p className="view-mode-note setting-row-aside" role="status">
            2D view is a debugging aid, not intended to be fully playable.
          </p>
        )}
      </div>

      <div className="control-group">
        <div className="group-title">Display Options</div>
        <SettingRow
          isModified={smoothTerrain !== D.smoothTerrain}
          onReset={() => {
            if (smoothTerrain !== D.smoothTerrain) onSmoothTerrainToggle();
          }}
          searchId={settingsSearchId('Graphics & Performance', 'Smooth Terrain')}
        >
          <OsrsCheckbox checked={smoothTerrain} onChange={() => onSmoothTerrainToggle()} label="Smooth Terrain" />
        </SettingRow>

        <SettingRow
          isModified={Math.abs(brightness - D.brightness) > 0.005}
          onReset={() => onBrightnessChange(D.brightness)}
          hideReset
          searchId={settingsSearchId('Graphics & Performance', 'Brightness')}
        >
          <div className="slider-control">
            <div className="slider-label">
              <span className="slider-label-text">
                Brightness
                {Math.abs(brightness - D.brightness) > 0.005 && (
                  <ResetButton
                    className="setting-row__reset-inline"
                    onClick={() => onBrightnessChange(D.brightness)}
                    aria-label="Reset brightness to default"
                  />
                )}
              </span>
              <span className="slider-label-value">{brightness.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.2"
              step="0.05"
              value={brightness}
              onChange={(e) => onBrightnessChange(parseFloat(e.target.value))}
              className={`slider-input${Math.abs(brightness - D.brightness) > 0.005 ? ' slider-input--modified' : ''}`}
            />
          </div>
        </SettingRow>
        <SettingRow
          isModified={Math.abs(contrast - D.contrast) > 0.005}
          onReset={() => onContrastChange(D.contrast)}
          hideReset
          searchId={settingsSearchId('Graphics & Performance', 'Contrast')}
        >
          <div className="slider-control">
            <div className="slider-label">
              <span className="slider-label-text">
                Contrast
                {Math.abs(contrast - D.contrast) > 0.005 && (
                  <ResetButton
                    className="setting-row__reset-inline"
                    onClick={() => onContrastChange(D.contrast)}
                    aria-label="Reset contrast to default"
                  />
                )}
              </span>
              <span className="slider-label-value">{contrast.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.05"
              value={contrast}
              onChange={(e) => onContrastChange(parseFloat(e.target.value))}
              className={`slider-input${Math.abs(contrast - D.contrast) > 0.005 ? ' slider-input--modified' : ''}`}
            />
          </div>
        </SettingRow>
        <SettingRow
          isModified={Math.abs(saturation - D.saturation) > 0.005}
          onReset={() => onSaturationChange(D.saturation)}
          hideReset
          searchId={settingsSearchId('Graphics & Performance', 'Saturation')}
        >
          <div className="slider-control">
            <div className="slider-label">
              <span className="slider-label-text">
                Saturation
                {Math.abs(saturation - D.saturation) > 0.005 && (
                  <ResetButton
                    className="setting-row__reset-inline"
                    onClick={() => onSaturationChange(D.saturation)}
                    aria-label="Reset saturation to default"
                  />
                )}
              </span>
              <span className="slider-label-value">{saturation.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.05"
              value={saturation}
              onChange={(e) => onSaturationChange(parseFloat(e.target.value))}
              className={`slider-input${Math.abs(saturation - D.saturation) > 0.005 ? ' slider-input--modified' : ''}`}
            />
          </div>
        </SettingRow>
        <SettingRow
          isModified={Math.abs(renderScale - D.renderScaleHardware) > 0.005}
          onReset={() => onRenderScaleChange(D.renderScaleHardware)}
          hideReset
          searchId={settingsSearchId('Graphics & Performance', '3D render scale')}
        >
          <div className="slider-control">
            <div className="slider-label">
              <span className="slider-label-text">
                3D render scale
                {Math.abs(renderScale - D.renderScaleHardware) > 0.005 && (
                  <ResetButton
                    className="setting-row__reset-inline"
                    onClick={() => onRenderScaleChange(D.renderScaleHardware)}
                    aria-label="Reset 3D render scale to default"
                  />
                )}
              </span>
              <span className="slider-label-value">{renderScale.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.25"
              max="1.0"
              step="0.05"
              aria-label="3D render scale"
              value={renderScale}
              onChange={(e) => onRenderScaleChange(parseFloat(e.target.value))}
              className={`slider-input${Math.abs(renderScale - D.renderScaleHardware) > 0.005 ? ' slider-input--modified' : ''}`}
            />
            {/* Players reach for this to make the interface bigger; say up front that it does not. */}
            <div className="settings-hint render-scale-hint">
              Sharpness of the 3D scene. Lower it for speed; the interface keeps its size.
            </div>
          </div>
        </SettingRow>
      </div>

      <div className="control-group" data-search-id={settingsSearchId('Graphics & Performance', 'FPS Cap')}>
        <div className="group-title">FPS Cap</div>
        <SettingRow
          // Anchored on its group, so a reveal marks the title with it.
          searchId={null}
          isModified={fpsCap !== D.fpsCap}
          onReset={() => onFpsCapChange(D.fpsCap)}
        >
          <select
            value={fpsCap}
            onChange={(e) => onFpsCapChange(Number(e.target.value))}
            className="select-input"
            aria-label="Frame rate cap"
          >
            {FPS_CAP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>
      <div className="control-group" data-search-id={settingsSearchId('Graphics & Performance', 'Anti-aliasing')}>
        <div className="group-title">Anti-aliasing</div>
        <SettingRow
          searchId={null}
          isModified={antiAliasing !== D.antiAliasing}
          onReset={() => onAntiAliasingChange(D.antiAliasing)}
        >
          <select
            value={antiAliasing}
            onChange={(e) => onAntiAliasingChange(e.target.value as PersistedSettings['antiAliasing'])}
            className="select-input"
            aria-label="Anti-aliasing"
          >
            <option value="auto">Auto</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </SettingRow>
        <div className="settings-hint">
          Smooths jagged edges. Off is faster on weak computers. Auto turns it off on iPhone and iPad, and when hardware
          acceleration is unavailable. Takes effect after reload.
        </div>
      </div>
    </div>
  );
};

/** What the Interface section's read-only Interface scaling row reports, and where it leads. */
export interface InterfaceScalingState {
  stretchedModeEnabled: boolean;
  uiScale: number;
  fixedLayoutScale: FixedLayoutScale;
  mobileInterfaceScaling: number;
}

/**
 * The Interface scaling row's value and destination. One editor per layout: the Stretched Mode
 * plugin owns the UI scale and the Fixed layout scale, as in RuneLite; Mobile has its own setting
 * under Settings → Mobile.
 */
export function interfaceScalingSummary(
  clientLayoutMode: ClientLayoutMode,
  state: InterfaceScalingState,
): { value: string; hint: string; target: string } {
  if (clientLayoutMode === 'mobile') {
    return {
      value: `${state.mobileInterfaceScaling}%`,
      hint: 'Edit in Settings → Mobile.',
      target: settingsSearchId('Mobile', 'Interface scaling'),
    };
  }
  const hint = 'Edit in Plugins → Stretched Mode.';
  if (!state.stretchedModeEnabled) return { value: 'Off', hint, target: pluginSearchId('stretchedMode') };
  if (clientLayoutMode === 'fixed') {
    return {
      value:
        state.fixedLayoutScale === 'fit'
          ? 'Fit window'
          : state.fixedLayoutScale === 'stretch'
            ? 'Stretch to window'
            : `${state.fixedLayoutScale}×`,
      hint,
      target: pluginSearchId('stretchedMode', 'Fixed layout scale'),
    };
  }
  return { value: `${Math.round(state.uiScale * 100)}%`, hint, target: pluginSearchId('stretchedMode', 'UI scale') };
}

/**
 * The Interface section, in the order players reach for it: Layout and its scaling, Keybinds, the
 * game window, how it looks (Infobox appearance), the chatbox and shortcut hints,
 * then Device Mode, the rarely touched override.
 *
 * Returns a fragment rather than its own .controls-container wrapper so these
 * groups are direct siblings of the Interface section's other .control-group
 * children — that keeps one shared border rhythm and lets the stock
 * .control-group:last-child rule suppress the trailing divider.
 */
export const InterfaceControls: React.FC<InterfaceControlsProps & InterfaceSlots> = ({
  gameResolution,
  onGameResolutionChange,
  clientLayoutMode,
  onClientLayoutModeChange,
  viewportSizeWarning,
  interfaceScaling,
  transparentChatbox,
  onTransparentChatboxChange,
  transparentSidePanel,
  onTransparentSidePanelChange,
  hotkeysCloseSidePanel,
  onHotkeysCloseSidePanelChange,
  clickThroughTransparentChatbox,
  onClickThroughTransparentChatboxChange,
  onOpenPopout,
  canPopOut,
  isPopoutWindow,
  showShortcutHints,
  onShowShortcutHintsToggle,
  keybinds,
  appearance,
}) => {
  // On actual mobile DEVICES the Layout + Game window (resolution + popout)
  // blocks are hidden: the popout button doesn't make sense on touch, and
  // fixed-resolution letterboxing on a phone would clip the canvas to a
  // tiny centered box. Mobile is forced to 'fit window' via
  // MOBILE_PLATFORM_DEFAULTS.gameResolution in usePersistedSettings.
  //
  // We deliberately gate on the device check (touch + no fine pointer)
  // rather than the narrow-viewport breakpoint. A laptop user shrinking the
  // browser is still on a desktop and must be able to reach the resolution
  // picker — hiding it would strand them with no way to change or exit a
  // custom layout size.
  const isMobile = useIsMobileDevice();
  // Local input state for the W/H fields so users can type freely
  // (including fully clearing and retyping).
  const [widthInput, setWidthInput] = useState(() => String(gameResolution.width));
  const [heightInput, setHeightInput] = useState(() => String(gameResolution.height));

  useEffect(() => {
    setWidthInput(String(gameResolution.width));
  }, [gameResolution.width]);

  useEffect(() => {
    setHeightInput(String(gameResolution.height));
  }, [gameResolution.height]);

  const isResolutionModified =
    gameResolution.mode !== DEFAULT_GAME_RESOLUTION.mode ||
    gameResolution.width !== DEFAULT_GAME_RESOLUTION.width ||
    gameResolution.height !== DEFAULT_GAME_RESOLUTION.height ||
    gameResolution.presetId !== DEFAULT_GAME_RESOLUTION.presetId;

  const handlePresetChange = (nextId: string) => {
    if (nextId === 'fit') {
      onGameResolutionChange({ ...DEFAULT_GAME_RESOLUTION });
      return;
    }
    if (nextId === 'custom') {
      // Mark presetId as 'custom' so the dropdown stays on Custom even if the
      // current dimensions happen to match a preset.
      const w = gameResolution.mode === 'fixed' ? gameResolution.width : DEFAULT_GAME_RESOLUTION.width;
      const h = gameResolution.mode === 'fixed' ? gameResolution.height : DEFAULT_GAME_RESOLUTION.height;
      onGameResolutionChange({ mode: 'fixed', width: w, height: h, presetId: 'custom' });
      return;
    }
    const preset = RESOLUTION_PRESETS.find((p) => p.id === nextId);
    if (preset) {
      onGameResolutionChange({
        mode: 'fixed',
        width: preset.width,
        height: preset.height,
        presetId: preset.id,
      });
    }
  };

  const clampDim = (n: number): number => Math.round(Math.max(GAME_RESOLUTION_MIN, Math.min(GAME_RESOLUTION_MAX, n)));

  const commitWidth = (raw: string) => {
    const n = parseInt(raw, 10);
    const committed = Number.isFinite(n) ? clampDim(n) : gameResolution.width;
    setWidthInput(String(committed));
    if (committed !== gameResolution.width) {
      onGameResolutionChange({
        mode: 'fixed',
        width: committed,
        height: gameResolution.height,
        presetId: 'custom',
      });
    }
  };

  const commitHeight = (raw: string) => {
    const n = parseInt(raw, 10);
    const committed = Number.isFinite(n) ? clampDim(n) : gameResolution.height;
    setHeightInput(String(committed));
    if (committed !== gameResolution.height) {
      onGameResolutionChange({
        mode: 'fixed',
        width: gameResolution.width,
        height: committed,
        presetId: 'custom',
      });
    }
  };

  const scaling = interfaceScalingSummary(clientLayoutMode, interfaceScaling);

  return (
    <>
      {/* Device Mode owns Mobile; desktop keeps its saved layout choice. */}
      <div className="control-group" data-search-id={settingsSearchId('Interface', 'Layout')}>
        <div className="group-title">Layout</div>
        {isMobile ? (
          <div className="setting-row">
            <span className="settings-inline-label">Mobile</span>
          </div>
        ) : (
          <SettingRow
            // Anchored on its group, so a reveal marks the title with it.
            searchId={null}
            isModified={clientLayoutMode !== 'modern'}
            onReset={() => onClientLayoutModeChange('modern')}
          >
            <select
              id="client-layout-mode"
              value={clientLayoutMode}
              onChange={(e) => onClientLayoutModeChange(e.target.value as ClientLayoutMode)}
              className="select-input"
              aria-label="Client layout"
            >
              {CLIENT_LAYOUT_MODES.filter((mode) => mode !== 'mobile').map((mode) => (
                <option key={mode} value={mode}>
                  {CLIENT_LAYOUT_LABELS[mode]}
                </option>
              ))}
            </select>
          </SettingRow>
        )}
        {/* Shown beside Layout because that is where people look for it, but edited in one place. */}
        <SettingLinkRow
          label="Interface scaling"
          value={scaling.value}
          hint={scaling.hint}
          target={scaling.target}
          searchId={settingsSearchId('Interface', 'Interface scaling')}
        />
      </div>

      {keybinds}

      {!isMobile && (
        <div className="control-group" data-search-id={settingsSearchId('Interface', 'Game window')}>
          <div className="group-title">Game window</div>
          {clientLayoutMode === 'fixed' ? (
            // The stored `gameResolution` is left alone and returns with the resizable layouts.
            <div className="settings-hint game-window-fixed-note">
              The Fixed layout is {FIXED_FRAME.width} × {FIXED_FRAME.height}. Make it bigger with{' '}
              <RevealLink target={scaling.target}>Interface scaling</RevealLink>
            </div>
          ) : (
            <>
              <label className="settings-field-label" htmlFor="viewport-preset">
                Resolution
              </label>
              <SettingRow
                isModified={isResolutionModified}
                onReset={() => onGameResolutionChange({ ...DEFAULT_GAME_RESOLUTION })}
                searchId={settingsSearchId('Interface', 'Game window', 'Resolution')}
              >
                <select
                  id="viewport-preset"
                  value={gameResolution.presetId}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="select-input"
                  aria-label="Game window resolution"
                >
                  <option value="fit">Fit Window</option>
                  {RESOLUTION_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom…</option>
                </select>
              </SettingRow>

              {gameResolution.presetId === 'custom' && (
                <SettingRow
                  // Custom width and height belong to the Resolution entry.
                  searchId={null}
                  isModified={false}
                  onReset={() => {}}
                  hideReset
                >
                  <div className="viewport-dimensions">
                    <input
                      type="number"
                      className="viewport-dimensions__input"
                      min={GAME_RESOLUTION_MIN}
                      max={GAME_RESOLUTION_MAX}
                      step={1}
                      value={widthInput}
                      onChange={(e) => setWidthInput(e.target.value)}
                      onBlur={(e) => commitWidth(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      aria-label="Width in pixels"
                    />
                    <span className="viewport-dimensions__sep" aria-hidden="true">
                      ×
                    </span>
                    <input
                      type="number"
                      className="viewport-dimensions__input"
                      min={GAME_RESOLUTION_MIN}
                      max={GAME_RESOLUTION_MAX}
                      step={1}
                      value={heightInput}
                      onChange={(e) => setHeightInput(e.target.value)}
                      onBlur={(e) => commitHeight(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      aria-label="Height in pixels"
                    />
                    <span className="viewport-dimensions__suffix" aria-hidden="true">
                      px
                    </span>
                  </div>
                </SettingRow>
              )}
            </>
          )}

          {viewportSizeWarning && (
            <div className="viewport-warning" role="status">
              <div className="viewport-warning__title">
                Window too small for {viewportSizeWarning.width}×{viewportSizeWarning.height}
              </div>
              <p className="viewport-warning__detail">
                {viewportSizeWarning.replay
                  ? 'The replay keeps its recorded size. Enlarge the window or choose Fit Window.'
                  : 'The game window keeps its selected size. Enlarge the window, pick a smaller size, or choose Fit Window.'}
              </p>
            </div>
          )}

          <ViewportPopoutControl onOpenPopout={onOpenPopout} canPopOut={canPopOut} isPopoutWindow={isPopoutWindow} />
        </div>
      )}

      {appearance}

      {!isMobile && (clientLayoutMode === 'modern' || clientLayoutMode === 'classic') && (
        <div className="control-group">
          <div className="group-title">Side panel</div>
          <SettingRow
            isModified={transparentSidePanel !== D.transparentSidePanel}
            onReset={() => onTransparentSidePanelChange(D.transparentSidePanel)}
            searchId={settingsSearchId('Interface', 'Transparent side panel')}
          >
            <OsrsCheckbox
              checked={transparentSidePanel}
              onChange={onTransparentSidePanelChange}
              label="Transparent side panel"
            />
          </SettingRow>
          {clientLayoutMode === 'modern' && (
            <SettingRow
              isModified={hotkeysCloseSidePanel !== D.hotkeysCloseSidePanel}
              onReset={() => onHotkeysCloseSidePanelChange(D.hotkeysCloseSidePanel)}
              searchId={settingsSearchId('Interface', 'Hotkeys close side panel')}
              hint="Press the open panel's key again to close it. Clicking its tab always closes it."
            >
              <OsrsCheckbox
                checked={hotkeysCloseSidePanel}
                onChange={onHotkeysCloseSidePanelChange}
                label="Hotkeys close side panel"
              />
            </SettingRow>
          )}
        </div>
      )}

      {/* The client offers transparency in the resizable layouts only; Fixed is always opaque. */}
      {!isMobile && (clientLayoutMode === 'modern' || clientLayoutMode === 'classic') && (
        <div className="control-group">
          <div className="group-title">Chatbox</div>
          <SettingRow
            isModified={transparentChatbox !== D.transparentChatbox}
            onReset={() => onTransparentChatboxChange(D.transparentChatbox)}
            searchId={settingsSearchId('Interface', 'Transparent chatbox')}
          >
            <OsrsCheckbox
              checked={transparentChatbox}
              onChange={onTransparentChatboxChange}
              label="Transparent chatbox"
            />
          </SettingRow>
          {/* The client's own dependency: it only means anything while the chatbox is transparent. */}
          {transparentChatbox && (
            <SettingRow
              isModified={clickThroughTransparentChatbox !== D.clickThroughTransparentChatbox}
              onReset={() => onClickThroughTransparentChatboxChange(D.clickThroughTransparentChatbox)}
              searchId={settingsSearchId('Interface', 'Click through transparent chatbox')}
            >
              <OsrsCheckbox
                checked={clickThroughTransparentChatbox}
                onChange={onClickThroughTransparentChatboxChange}
                label="Click through transparent chatbox"
              />
            </SettingRow>
          )}
        </div>
      )}

      <ShortcutHintsControl
        showShortcutHints={showShortcutHints}
        onShowShortcutHintsToggle={onShowShortcutHintsToggle}
      />

      <DeviceModeControl />
    </>
  );
};

/**
 * Overrides phone/tablet detection on this device. Shown in both modes so a wrong guess is
 * always reversible from where it lands the user.
 */
function DeviceModeControl() {
  const mode = useDeviceMode();
  // Detection's own answer, so Automatic can say what it picked. Read per render: the user agent
  // and touch points are static, and a pointer change re-renders through useIsMobileDevice.
  useIsMobileDevice();
  const detected = detectMobileDevice() ? 'Mobile' : 'Desktop';
  const titleRef = useRef<HTMLSpanElement>(null);
  return (
    <div className="control-group" data-search-id={settingsSearchId('Interface', 'Device Mode')}>
      <div className="group-title">
        <span ref={titleRef} className="group-title__label info-hint-region">
          Device Mode
          <InfoHint label="Device Mode" text={DEVICE_MODE_HELP} hoverRegionRef={titleRef} />
        </span>
      </div>
      {/* Segmented styles live with the other settings vocabulary in SettingsSidebar.css. */}
      <SettingRow
        // Anchored on its group, so a reveal marks the title with it.
        searchId={null}
        isModified={mode !== 'auto'}
        onReset={() => setDeviceMode('auto')}
      >
        <div className="settings-segmented" role="radiogroup" aria-label="Device Mode">
          {DEVICE_MODE_OPTIONS.map(([value, label]) => (
            /* biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup; a native radio cannot render the segmented glyph styling. */
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              className={`settings-segmented__option${mode === value ? ' is-active' : ''}`}
              onClick={() => setDeviceMode(value)}
            >
              <DeviceModeGlyph mode={value} />
              <span className="settings-segmented__label">{label}</span>
            </button>
          ))}
        </div>
      </SettingRow>
      <div className="settings-hint">Auto detects this device as {detected}.</div>
    </div>
  );
}

const DEVICE_MODE_HELP = 'If Auto picks the wrong mode, choose Mobile or Desktop. Only this browser is affected.';

const DEVICE_MODE_OPTIONS: readonly (readonly [DeviceMode, string])[] = [
  ['auto', 'Auto'],
  ['mobile', 'Mobile'],
  ['desktop', 'Desktop'],
];

/**
 * Device glyph in the infobox picker's 18px, 1.2-stroke language, all three ~14.4px tall or wide so
 * they weigh the same: the camera-style circled A for Auto, a phone with speaker and home bar for
 * Mobile, and a monitor on a stand for Desktop.
 */
function DeviceModeGlyph({ mode }: { mode: DeviceMode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {mode === 'auto' && (
        <>
          <circle cx="9" cy="9" r="7.2" />
          <path d="M6.2 12.4 9 5.6l2.8 6.8M7.2 10.2h3.6" />
        </>
      )}
      {mode === 'mobile' && (
        <>
          <rect x="4.6" y="1.8" width="8.8" height="14.4" rx="2.2" />
          <path d="M7.8 4.2h2.4M7.6 13.8h2.8" />
        </>
      )}
      {mode === 'desktop' && (
        <>
          <rect x="1.8" y="2.6" width="14.4" height="9.6" rx="1.6" />
          <path d="M9 12.2v2.8M6 15.4h6" />
        </>
      )}
    </svg>
  );
}

export const ViewportPopoutControl: React.FC<ViewportPopoutControlProps> = ({
  onOpenPopout,
  canPopOut,
  isPopoutWindow,
}) => {
  const isMobile = useIsMobileDevice();
  if (isMobile) return null;

  return (
    // A block inside the Game window group, not a group of its own: it shares that group's rule.
    <div className="viewport-popout" data-search-id={settingsSearchId('Interface', 'Game window', 'Pop Out Game')}>
      <button
        type="button"
        className="control-button viewport-popout__button"
        onClick={onOpenPopout}
        disabled={!canPopOut}
        title={isPopoutWindow ? 'Already in popout window' : 'Open the game in a separate window'}
      >
        <span>{isPopoutWindow ? 'Popout Active' : 'Pop Out Game'}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M4.5 1.5H1.5V10.5H10.5V7.5M7 1.5H10.5V5M10.5 1.5L5.5 6.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className="viewport-popout__hint">
        {isPopoutWindow
          ? 'Close this window to return to the main view.'
          : 'Opens in a new window sized to the current resolution.'}
      </p>
    </div>
  );
};

export const ShortcutHintsControl: React.FC<ShortcutHintsControlProps> = ({
  showShortcutHints = true,
  onShowShortcutHintsToggle = () => {},
}) => (
  <div className="control-group">
    <SettingRow
      searchId={settingsSearchId('Interface', 'Show Shortcut Hints')}
      isModified={showShortcutHints !== D.showShortcutHints}
      onReset={() => {
        if (showShortcutHints !== D.showShortcutHints) onShowShortcutHintsToggle();
      }}
    >
      <OsrsCheckbox
        checked={showShortcutHints}
        onChange={() => onShowShortcutHintsToggle()}
        label="Show Shortcut Hints"
      />
    </SettingRow>
  </div>
);
