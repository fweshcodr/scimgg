import type React from 'react';
import { getLobbyEffectDefaults, LOBBY_EFFECT_TOGGLES } from '../render/scene/lobbyEffectConfig';
import { OsrsButton } from './ui/OsrsButton';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { SettingRow } from './ui/SettingRow';

interface LobbyEffectsControlsProps {
  flags: Record<string, boolean | number>;
  onChange: React.Dispatch<React.SetStateAction<Record<string, boolean | number>>>;
}

const LOBBY_EFFECT_DEFAULTS = getLobbyEffectDefaults();

export function LobbyEffectsControls({ flags, onChange }: LobbyEffectsControlsProps) {
  return (
    <div className="control-group control-group--no-border">
      <div className="group-title">
        <span>Lobby Effects</span>
        <span className="lobby-effects-actions">
          <OsrsButton
            variant="small"
            onClick={() =>
              onChange(() => {
                const next: Record<string, boolean | number> = {};
                for (const { key } of LOBBY_EFFECT_TOGGLES) next[`lobby_${key}`] = true;
                return next;
              })
            }
          >
            All On
          </OsrsButton>
          <OsrsButton
            variant="small"
            onClick={() =>
              onChange(() => {
                const next: Record<string, boolean | number> = {};
                for (const { key } of LOBBY_EFFECT_TOGGLES) next[`lobby_${key}`] = false;
                return next;
              })
            }
          >
            All Off
          </OsrsButton>
        </span>
      </div>
      {LOBBY_EFFECT_TOGGLES.map(({ key, label }) => {
        const defaultAlpha = LOBBY_EFFECT_DEFAULTS[key] ?? 1.0;
        const isEnabled = flags[`lobby_${key}`] !== false;
        const alphaKey = `lobby_${key}_alpha`;
        const alphaValue = typeof flags[alphaKey] === 'number' ? (flags[alphaKey] as number) : defaultAlpha;
        const hasAlphaOverride = Math.abs(alphaValue - defaultAlpha) > 0.005;
        return (
          <SettingRow
            // Development-only (Debug section): not searchable.
            searchId={null}
            key={key}
            isModified={hasAlphaOverride || !isEnabled}
            onReset={() =>
              onChange((prev) => {
                const next = { ...prev };
                next[`lobby_${key}`] = true;
                next[alphaKey] = defaultAlpha;
                return next;
              })
            }
          >
            <div className="lobby-effect-row">
              <OsrsCheckbox
                checked={isEnabled}
                onChange={() =>
                  onChange((prev) => ({
                    ...prev,
                    [`lobby_${key}`]: prev[`lobby_${key}`] === false,
                  }))
                }
                label={label}
              />
              {isEnabled && (
                <div className="lobby-alpha-slider">
                  <input
                    type="range"
                    className={`slider-input${hasAlphaOverride ? ' slider-input--modified' : ''}`}
                    min={0}
                    max={100}
                    value={Math.round(alphaValue * 100)}
                    onChange={(e) =>
                      onChange((prev) => ({
                        ...prev,
                        [alphaKey]: Number(e.target.value) / 100,
                      }))
                    }
                    onDoubleClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        [alphaKey]: defaultAlpha,
                      }))
                    }
                  />
                  <span className={`lobby-alpha-value${hasAlphaOverride ? ' lobby-alpha-active' : ''}`}>
                    {Math.round(alphaValue * 100)}%
                  </span>
                </div>
              )}
            </div>
          </SettingRow>
        );
      })}
    </div>
  );
}
