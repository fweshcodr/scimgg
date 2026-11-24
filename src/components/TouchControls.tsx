import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { PERSISTED_SETTINGS_DEFAULTS as D } from '../hooks/usePersistedSettings';
import {
  TOUCH_LONG_PRESS_MAX_MS,
  TOUCH_LONG_PRESS_MIN_MS,
  TOUCH_LONG_PRESS_STEP_MS,
  TOUCH_MENU_ROW_HEIGHT_MAX_PX,
  TOUCH_MENU_ROW_HEIGHT_MIN_PX,
  TOUCH_MENU_ROW_HEIGHT_STEP_PX,
} from '../input/touchPrefs';
import { OSM_INTERFACE_SCALING_OPTIONS } from '../layout/osmClientLayout';
import {
  JAGEX_BOSSING_HOTKEYS,
  OSM_HOTKEY_EMPTY,
  OSM_HOTKEY_TYPES,
  type OsmHotkeySlot,
  osmHotkeyType,
} from '../layout/osmHotkeys';
import { InfoHint } from './ui/InfoHint';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { ResetButton } from './ui/ResetButton';
import { SettingRow } from './ui/SettingRow';
import './TouchControls.css';
import { settingsSearchId } from '../settingsSearch/ids';

const HotkeyCustomizationContext = createContext({ request: 0, customize: () => {} });
export const useHotkeyCustomization = () => useContext(HotkeyCustomizationContext);

/** Both entry points use the same persisted slot editor in SettingsSidebar. */
export function HotkeyCustomizationProvider({
  children,
  onOpenSettings,
}: {
  children: React.ReactNode;
  onOpenSettings: () => void;
}) {
  const [request, setRequest] = useState(0);
  // Read through a ref so a caller's inline callback does not change the context value on every
  // render: App wraps the whole shell, and a new value re-renders every consumer, the closed
  // Settings drawer included, on every simulation tick.
  const onOpenSettingsRef = useRef(onOpenSettings);
  onOpenSettingsRef.current = onOpenSettings;
  const customize = useCallback(() => {
    setRequest((value) => value + 1);
    onOpenSettingsRef.current();
  }, []);
  const value = useMemo(() => ({ request, customize }), [request, customize]);
  return <HotkeyCustomizationContext.Provider value={value}>{children}</HotkeyCustomizationContext.Provider>;
}

export interface TouchControlsProps {
  touchLongPressMs: number;
  onTouchLongPressMsChange: (value: number) => void;
  touchMenuRowHeight: number;
  onTouchMenuRowHeightChange: (value: number) => void;
  touchHapticsEnabled: boolean;
  onTouchHapticsEnabledChange: (value: boolean) => void;
  /** Hide vibration on hybrid desktops, while keeping their touch settings available. */
  showHaptics: boolean;
  /** Interface scaling and the hotkey rows exist only for the Mobile layout. */
  mobileLayout: boolean;
  mobileInterfaceScaling: number;
  onMobileInterfaceScalingChange: (value: number) => void;
  mobileHotkeys: readonly OsmHotkeySlot[];
  onMobileHotkeysChange: (slots: OsmHotkeySlot[]) => void;
  mobileHotkeysOpenOnLeft: boolean;
  onMobileHotkeysOpenOnLeftChange: (value: boolean) => void;
}

// Hints only where the label leaves something unclear; keep them to one short line.
const ROW_HEIGHT_HINT = 'For menus opened by a long tap.';
const HAPTICS_HINT = "iPhone browsers can't vibrate.";
// The game warns on turning this on: "Warning! opening the popout panel will overlap
// left-aligned side panels."
const OPEN_LEFT_HINT = 'Only for panels opened from a hotkey. The pop-out can cover them.';

function TouchSlider({
  searchId,
  label,
  hint,
  value,
  defaultValue,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  searchId: string;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const modified = value !== defaultValue;
  return (
    <SettingRow isModified={modified} onReset={() => onChange(defaultValue)} hideReset searchId={searchId}>
      <div className="slider-control">
        <div className="slider-label">
          <span className="slider-label-text touch-controls__label">
            <span ref={labelRef} className="touch-controls__label info-hint-region">
              {label}
              {hint && <InfoHint label={label} text={hint} hoverRegionRef={labelRef} />}
            </span>
            {modified && (
              <ResetButton
                className="setting-row__reset-inline"
                onClick={() => onChange(defaultValue)}
                aria-label={`Reset ${label.toLowerCase()} to default`}
              />
            )}
          </span>
          <span className="slider-label-value">
            {value} {unit}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          aria-label={label}
          aria-valuetext={`${value} ${unit}`}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={`slider-input${modified ? ' slider-input--modified' : ''}`}
        />
      </div>
    </SettingRow>
  );
}

function HintedCheckbox({
  searchId,
  label,
  hint,
  checked,
  defaultValue,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  defaultValue: boolean;
  onChange: (value: boolean) => void;
  searchId: string;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  return (
    <SettingRow isModified={checked !== defaultValue} onReset={() => onChange(defaultValue)} searchId={searchId}>
      {/* Beside the checkbox, never inside it: both are buttons (see MechanicsSettings). */}
      <div ref={regionRef} className="touch-controls__toggle info-hint-region">
        <OsrsCheckbox checked={checked} onChange={onChange} label={label} />
        <InfoHint label={label} text={hint} hoverRegionRef={regionRef} />
      </div>
    </SettingRow>
  );
}

/**
 * Touch settings: shown on touchscreen devices and whenever the Mobile layout is on, where
 * Interface scaling and the hotkey rows join them.
 */
export const TouchControls: React.FC<TouchControlsProps> = ({
  touchLongPressMs,
  onTouchLongPressMsChange,
  touchMenuRowHeight,
  onTouchMenuRowHeightChange,
  touchHapticsEnabled,
  onTouchHapticsEnabledChange,
  showHaptics,
  mobileLayout,
  mobileInterfaceScaling,
  onMobileInterfaceScalingChange,
  mobileHotkeys,
  onMobileHotkeysChange,
  mobileHotkeysOpenOnLeft,
  onMobileHotkeysOpenOnLeftChange,
}) => {
  const setSlot = (index: number, value: OsmHotkeySlot) => {
    const next = [...mobileHotkeys];
    next[index] = value;
    onMobileHotkeysChange(next);
  };

  return (
    <div className="controls-container touch-controls">
      <div className="control-group">
        <TouchSlider
          searchId={settingsSearchId('Mobile', 'Long Tap Delay')}
          label="Long Tap Delay"
          value={touchLongPressMs}
          defaultValue={D.touchLongPressMs}
          min={TOUCH_LONG_PRESS_MIN_MS}
          max={TOUCH_LONG_PRESS_MAX_MS}
          step={TOUCH_LONG_PRESS_STEP_MS}
          unit="ms"
          onChange={onTouchLongPressMsChange}
        />
        <TouchSlider
          searchId={settingsSearchId('Mobile', 'Menu Row Height')}
          label="Menu Row Height"
          hint={ROW_HEIGHT_HINT}
          value={touchMenuRowHeight}
          defaultValue={D.touchMenuRowHeight}
          min={TOUCH_MENU_ROW_HEIGHT_MIN_PX}
          max={TOUCH_MENU_ROW_HEIGHT_MAX_PX}
          step={TOUCH_MENU_ROW_HEIGHT_STEP_PX}
          unit="px"
          onChange={onTouchMenuRowHeightChange}
        />
        {showHaptics && (
          <HintedCheckbox
            searchId={settingsSearchId('Mobile', 'Vibrate on long tap')}
            label="Vibrate on long tap"
            hint={HAPTICS_HINT}
            checked={touchHapticsEnabled}
            defaultValue={D.touchHapticsEnabled}
            onChange={onTouchHapticsEnabledChange}
          />
        )}
      </div>

      {mobileLayout && (
        <div className="control-group" data-search-id={settingsSearchId('Mobile', 'Interface scaling')}>
          <div className="group-title">Interface scaling</div>
          <SettingRow
            // Anchored on its group, so a reveal marks the title with it.
            searchId={null}
            isModified={mobileInterfaceScaling !== D.mobileInterfaceScaling}
            onReset={() => onMobileInterfaceScalingChange(D.mobileInterfaceScaling)}
          >
            <select
              className="select-input"
              aria-label="Interface scaling"
              value={mobileInterfaceScaling}
              onChange={(event) => onMobileInterfaceScalingChange(Number(event.target.value))}
            >
              {OSM_INTERFACE_SCALING_OPTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </select>
          </SettingRow>
        </div>
      )}

      {mobileLayout && (
        <div className="control-group control-group--no-border" data-search-id={settingsSearchId('Mobile', 'Hotkeys')}>
          <div className="group-title">Hotkeys</div>
          {mobileHotkeys.map((slot, index) => {
            const label = `Slot ${index + 1}`;
            const defaultSlot = JAGEX_BOSSING_HOTKEYS[index] ?? OSM_HOTKEY_EMPTY;
            return (
              <SettingRow
                // The slots belong to the Hotkeys group's entry, which is anchored above.
                searchId={null}
                // Slots are positions, not items: the index IS the identity.
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed five-slot loadout.
                key={index}
                isModified={slot !== defaultSlot}
                onReset={() => setSlot(index, defaultSlot)}
              >
                <label className="touch-controls__slot">
                  <span className="touch-controls__slot-label">{label}</span>
                  <select
                    className="select-input"
                    value={slot}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setSlot(index, osmHotkeyType(value)?.id ?? OSM_HOTKEY_EMPTY);
                    }}
                  >
                    <option value={OSM_HOTKEY_EMPTY}>Empty</option>
                    {OSM_HOTKEY_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </label>
              </SettingRow>
            );
          })}
          <HintedCheckbox
            searchId={settingsSearchId('Mobile', 'Hotkeys open side panels on the left')}
            label="Hotkeys open side panels on the left"
            hint={OPEN_LEFT_HINT}
            checked={mobileHotkeysOpenOnLeft}
            defaultValue={D.mobileHotkeysOpenOnLeft}
            onChange={onMobileHotkeysOpenOnLeftChange}
          />
        </div>
      )}
    </div>
  );
};
