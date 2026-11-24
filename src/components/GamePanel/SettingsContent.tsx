import type React from 'react';
import { PERSISTED_SETTINGS_DEFAULTS } from '../../hooks/usePersistedSettings';
import { FILTER_TOGGLE } from '../../resourcePack';
import { GAMEPANEL_AUDIO_ID, GAMEPANEL_AUDIO_IDS, GAMEPANEL_AUDIO_LABELS } from '../../settingsSearch/ids';
import type { SettingsSubTab } from '../../types/gamePanelViews';
import { PixelSprite } from '../PixelSprite';
import { SettingRow } from '../ui/SettingRow';
import { AudioSlider } from './AudioSlider';
import { type KeybindingCategory, KeybindingsContent } from './KeybindingsContent';
import './SettingsContent.css';

interface SettingsContentProps {
  /** Replay owns this selection so a recorded volume-slider click cannot land on a keybind. */
  subTab: SettingsSubTab;
  onSubTabChange: (subTab: SettingsSubTab) => void;
  /** The Keybindings category, owned by the game panel so a reveal can set it. */
  keybindCategory?: KeybindingCategory;
  onKeybindCategoryChange?: (category: KeybindingCategory) => void;
  readOnly?: boolean;
  masterVolume?: number;
  sfxVolume?: number;
  areaVolume?: number;
  onVolumeChange?: (key: 'masterVolume' | 'sfxVolume' | 'areaVolume', value: number) => void;
  muteWhenUnfocused?: boolean;
  onMuteWhenUnfocusedChange?: (value: boolean) => void;
}

const SETTINGS_PAGES = [
  { id: 'audio', label: 'Audio' },
  { id: 'keybinds', label: 'Keybindings' },
] as const;

export const SettingsContent: React.FC<SettingsContentProps> = ({
  subTab,
  onSubTabChange,
  keybindCategory,
  onKeybindCategoryChange,
  readOnly,
  masterVolume = PERSISTED_SETTINGS_DEFAULTS.masterVolume,
  sfxVolume = PERSISTED_SETTINGS_DEFAULTS.sfxVolume,
  areaVolume = PERSISTED_SETTINGS_DEFAULTS.areaVolume,
  onVolumeChange,
  muteWhenUnfocused = PERSISTED_SETTINGS_DEFAULTS.muteWhenUnfocused,
  onMuteWhenUnfocusedChange,
}) => {
  const renderVolumeSlider = (label: string, key: 'masterVolume' | 'sfxVolume' | 'areaVolume', value: number) => {
    const defaultValue = PERSISTED_SETTINGS_DEFAULTS[key];
    const percent = Math.round(value * 100);
    return (
      <fieldset className="audio-volume" aria-label={label} data-search-id={GAMEPANEL_AUDIO_IDS[key]}>
        <SettingRow
          // Anchored on the slider's fieldset, so a reveal marks the slider too.
          searchId={null}
          isModified={Math.abs(value - defaultValue) > 0.005}
          onReset={() => onVolumeChange?.(key, defaultValue)}
        >
          <div className="audio-volume-heading">
            <label htmlFor={`audio-${key}`}>{label}</label>
            <output htmlFor={`audio-${key}`} translate="no">
              {percent}%
            </output>
          </div>
        </SettingRow>
        <AudioSlider id={`audio-${key}`} percent={percent} onChange={(next) => onVolumeChange?.(key, next / 100)} />
      </fieldset>
    );
  };

  return (
    // Opts back into page translation inside the game panel's translate="no" boundary:
    // settings labels are user-driven, not the live HUD text that translators tear down.
    <div className="settings-content" translate="yes" style={{ width: 204, height: 275, position: 'relative' }}>
      <div className="settings-content-inner">
        <fieldset className="settings-pages" aria-label="Settings pages">
          {/* A text-bearing track fill leaves adjacent tab sprites at a stale raster scale. */}
          <div
            aria-hidden="true"
            data-testid="settings-segment-track-fill"
            className="settings-pages-fill"
            style={{ position: 'absolute', background: 'var(--color-border)' }}
          />
          {SETTINGS_PAGES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="settings-page-button"
              style={{ position: 'relative' }}
              aria-pressed={subTab === id}
              onClick={() => onSubTabChange(id)}
            >
              <span className="settings-page-label">{label}</span>
            </button>
          ))}
        </fieldset>
        {subTab === 'audio' && (
          <div className="game-panel-scroll audio-content" data-search-id={GAMEPANEL_AUDIO_ID}>
            <section className="audio-master-group" aria-label="Master audio">
              {renderVolumeSlider(GAMEPANEL_AUDIO_LABELS.masterVolume, 'masterVolume', masterVolume)}
              <div className="audio-preference" data-search-id={GAMEPANEL_AUDIO_IDS.muteWhenUnfocused}>
                <SettingRow
                  // Anchored on .audio-preference.
                  searchId={null}
                  isModified={muteWhenUnfocused !== PERSISTED_SETTINGS_DEFAULTS.muteWhenUnfocused}
                  onReset={() => onMuteWhenUnfocusedChange?.(PERSISTED_SETTINGS_DEFAULTS.muteWhenUnfocused)}
                >
                  {/* biome-ignore lint/a11y/useSemanticElements: The checkbox uses the same canvas-rendered sprite as the game-panel filters. */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={muteWhenUnfocused}
                    className="audio-mute"
                    onClick={() => onMuteWhenUnfocusedChange?.(!muteWhenUnfocused)}
                  >
                    <PixelSprite
                      src={muteWhenUnfocused ? FILTER_TOGGLE.checked : FILTER_TOGGLE.unchecked}
                      alt=""
                      width={17}
                      height={17}
                    />
                    <span>{GAMEPANEL_AUDIO_LABELS.muteWhenUnfocused}</span>
                  </button>
                </SettingRow>
              </div>
            </section>
            <div className="audio-channels">
              {renderVolumeSlider(GAMEPANEL_AUDIO_LABELS.sfxVolume, 'sfxVolume', sfxVolume)}
              {renderVolumeSlider(GAMEPANEL_AUDIO_LABELS.areaVolume, 'areaVolume', areaVolume)}
            </div>
          </div>
        )}
        {subTab === 'keybinds' && (
          <KeybindingsContent
            readOnly={readOnly}
            category={keybindCategory}
            onCategoryChange={onKeybindCategoryChange}
          />
        )}
      </div>
    </div>
  );
};
