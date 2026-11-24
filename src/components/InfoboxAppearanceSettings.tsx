import {
  type InfoboxPinTarget,
  infoboxPinTargetUnavailableReason,
  PERSISTED_SETTINGS_DEFAULTS,
  resolveInfoboxPinTarget,
} from '../hooks/usePersistedSettings';
import type { ClientLayoutMode } from '../layout/osrsClientLayout';
import { TileIndicatorColorInput } from './TileIndicatorColorInput';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { SettingRow } from './ui/SettingRow';
import './SettingsSidebar.css';
import './InfoboxAppearanceSettings.css';
import { settingsSearchId } from '../settingsSearch/ids';

const INFOBOX_PIN_LABELS: Readonly<Record<InfoboxPinTarget, string>> = {
  inventory: 'Inventory',
  hud: 'Chatbox',
  free: 'Free',
};

const INFOBOX_PIN_OPTIONS: readonly InfoboxPinTarget[] = ['inventory', 'hud', 'free'];

export interface InfoboxAppearanceProps {
  /** The layout the player chose; it decides which positions are available. */
  clientLayoutMode: ClientLayoutMode;
  pinTarget: InfoboxPinTarget;
  onPinTargetChange: (value: InfoboxPinTarget) => void;
  textOutlineEnabled: boolean;
  onTextOutlineEnabledChange: (value: boolean) => void;
  textOutlineColor: string;
  onTextOutlineColorChange: (color: string) => void;
}

/**
 * Where infoboxes sit and how their text is drawn: a group in Settings → Interface. Shared by every
 * infobox (the Tick Counter's and the game's own timers), so it is not any one plugin's option.
 */
export function InfoboxAppearanceSettings({
  clientLayoutMode,
  pinTarget,
  onPinTargetChange,
  textOutlineEnabled,
  onTextOutlineEnabledChange,
  textOutlineColor,
  onTextOutlineColorChange,
}: InfoboxAppearanceProps) {
  const effectivePinTarget = resolveInfoboxPinTarget(pinTarget, clientLayoutMode);
  // Duplicates each disabled segment's `title` on purpose: a title is only reachable by
  // hovering a control the user has already been told not to use.
  const unavailableReasons = INFOBOX_PIN_OPTIONS.map((value) =>
    infoboxPinTargetUnavailableReason(value, clientLayoutMode),
  ).filter((reason): reason is string => reason !== null);

  return (
    <div className="control-group" data-search-id={settingsSearchId('Interface', 'Infobox appearance')}>
      <div className="group-title">Infobox appearance</div>
      <div className="infobox-field" data-search-id={settingsSearchId('Interface', 'Infobox appearance', 'Position')}>
        <div className="settings-field-label">Position</div>
        <SettingRow
          // Anchored on its field, with the label.
          searchId={null}
          isModified={pinTarget !== PERSISTED_SETTINGS_DEFAULTS.infoboxPinTarget}
          onReset={() => onPinTargetChange(PERSISTED_SETTINGS_DEFAULTS.infoboxPinTarget)}
        >
          <div className="settings-segmented" role="radiogroup" aria-label="Infobox position">
            {INFOBOX_PIN_OPTIONS.map((value) => {
              const unavailable = infoboxPinTargetUnavailableReason(value, clientLayoutMode);
              return (
                /* biome-ignore lint/a11y/useSemanticElements: intentional ARIA radiogroup; a native radio cannot render the segmented glyph styling. */
                <button
                  key={value}
                  type="button"
                  role="radio"
                  // Effective, not stored: the reset control above reads the stored
                  // preference on purpose, but the live segment must be what renders.
                  aria-checked={effectivePinTarget === value}
                  disabled={unavailable !== null}
                  title={unavailable ?? undefined}
                  className={`settings-segmented__option${effectivePinTarget === value ? ' is-active' : ''}`}
                  onClick={() => onPinTargetChange(value)}
                >
                  <PinTargetGlyph target={value} />
                  <span className="settings-segmented__label">{INFOBOX_PIN_LABELS[value]}</span>
                </button>
              );
            })}
          </div>
        </SettingRow>
        <p className="settings-hint">
          {effectivePinTarget === 'hud'
            ? 'Infoboxes sit in a band above the chatbox, as wide as it, and wrap upward. Clicks go through them.'
            : effectivePinTarget === 'inventory'
              ? 'Infoboxes sit above the inventory panel (bottom-right).'
              : 'Infoboxes float free: drag them anywhere with Alt.'}
        </p>
        {unavailableReasons.map((reason) => (
          <p key={reason} className="settings-hint infobox-field__unavailable">
            {/* Your choice is kept, not rewritten: say where they are now, and that it comes back. */}
            {effectivePinTarget !== pinTarget
              ? `${reason.replace(/\.$/, '')}, so infoboxes sit above the chatbox. Your ${INFOBOX_PIN_LABELS[pinTarget]} choice is kept for the other layouts.`
              : reason}
          </p>
        ))}
      </div>
      <div
        className="infobox-field"
        data-search-id={settingsSearchId('Interface', 'Infobox appearance', 'Text outline')}
      >
        <SettingRow
          // Anchored on its field, with the hint.
          searchId={null}
          isModified={
            textOutlineEnabled !== PERSISTED_SETTINGS_DEFAULTS.infoboxTextOutlineEnabled ||
            (textOutlineEnabled && textOutlineColor !== PERSISTED_SETTINGS_DEFAULTS.infoboxTextOutlineColor)
          }
          onReset={() => {
            onTextOutlineEnabledChange(PERSISTED_SETTINGS_DEFAULTS.infoboxTextOutlineEnabled);
            onTextOutlineColorChange(PERSISTED_SETTINGS_DEFAULTS.infoboxTextOutlineColor);
          }}
          hint="Outlines infobox values so they stay readable over bright item icons."
        >
          <div className="settings-inline-row">
            <OsrsCheckbox checked={textOutlineEnabled} label="Text outline" onChange={onTextOutlineEnabledChange} />
            {textOutlineEnabled && (
              <span
                className="infobox-outline-colour"
                data-search-id={settingsSearchId('Interface', 'Infobox appearance', 'Outline color')}
              >
                <span className="infobox-outline-colour__label">Color</span>
                <TileIndicatorColorInput
                  color={textOutlineColor}
                  onCommit={onTextOutlineColorChange}
                  onMouseDown={(e) => {
                    if (e.button !== 0) {
                      e.preventDefault();
                    }
                  }}
                />
              </span>
            )}
          </div>
        </SettingRow>
      </div>
    </div>
  );
}

/**
 * Screen-location glyph for an infobox pin target: a small monitor frame with a
 * marker (the infobox strip) at the spot the strip lands — bottom-left for the
 * Chatbox, bottom-right for the inventory, and a centered marker in a dashed (i.e.
 * unpinned) frame for free placement. Makes it obvious at a glance that these
 * are on-screen positions, not abstract modes.
 */
function PinTargetGlyph({ target }: { target: InfoboxPinTarget }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      <rect
        x="2"
        y="3"
        width="14"
        height="12"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.2"
        {...(target === 'free' ? { strokeDasharray: '2.4 1.8' } : {})}
      />
      {target === 'hud' && (
        <>
          <rect x="3.4" y="7.4" width="5" height="2.6" rx="0.8" fill="currentColor" />
          <rect x="3.4" y="11.2" width="8" height="2.2" rx="0.6" stroke="currentColor" strokeWidth="1" />
        </>
      )}
      {target === 'inventory' && <rect x="9.6" y="10.6" width="5" height="2.6" rx="0.8" fill="currentColor" />}
      {target === 'free' && <rect x="6.5" y="7.4" width="5" height="2.6" rx="0.8" fill="currentColor" />}
    </svg>
  );
}
