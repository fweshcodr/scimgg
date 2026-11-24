import { useEffect, useState } from 'react';
import { type FixedLayoutScale, PERSISTED_SETTINGS_DEFAULTS } from '../hooks/usePersistedSettings';
import {
  FIXED_FRAME,
  FIXED_SCALE_MAX,
  FIXED_SCALE_MIN,
  FIXED_SCALE_PRESETS,
  fixedFrameSizeAtScale,
} from '../layout/osrsClientLayout';
import { pluginSearchId } from '../settingsSearch/ids';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { SettingRow } from './ui/SettingRow';

function fixedScaleLabel(scale: number): string {
  const { width, height } = fixedFrameSizeAtScale(scale);
  return `${scale}× (${width} × ${height})`;
}

/** The scale to seed the Custom input with when the layout is set to fit or stretch to the window. */
function fixedScaleOrDefault(scale: FixedLayoutScale): number {
  return typeof scale === 'number' ? scale : 1;
}

/**
 * The Fixed layout's size, under the Stretched Mode plugin as in RuneLite: a multiple of the
 * 765 × 503 client, Fit Window (keeps its proportions), or Stretch to Window (fills the window,
 * RuneLite's Keep aspect ratio off). Integer scaling applies to the two that follow the window.
 */
export function FixedLayoutScaleField({
  fixedLayoutScale,
  onFixedLayoutScaleChange,
  integerScaling,
  onIntegerScalingChange,
}: {
  fixedLayoutScale: FixedLayoutScale;
  onFixedLayoutScaleChange: (scale: FixedLayoutScale) => void;
  integerScaling: boolean;
  onIntegerScalingChange: (enabled: boolean) => void;
}) {
  // 'Custom' is local UI state rather than a persisted preset id: there is only one number to
  // compare, so the only thing tracking it buys is keeping the dropdown on Custom after typing a
  // value that happens to equal a preset — worth a useState, not a stored field.
  const [isCustom, setIsCustom] = useState(
    () => typeof fixedLayoutScale === 'number' && !FIXED_SCALE_PRESETS.includes(fixedLayoutScale),
  );
  const [input, setInput] = useState(() => String(fixedScaleOrDefault(fixedLayoutScale)));

  useEffect(() => {
    setInput(String(fixedScaleOrDefault(fixedLayoutScale)));
    // A value arriving from elsewhere (another window's broadcast, a reset): Fit and Stretch are
    // never custom, and a number that is not a preset can only be custom. A preset says nothing
    // about whether the user chose it there or typed it, so the dropdown stays where they left it.
    if (typeof fixedLayoutScale !== 'number') {
      setIsCustom(false);
    } else if (!FIXED_SCALE_PRESETS.includes(fixedLayoutScale)) {
      setIsCustom(true);
    }
  }, [fixedLayoutScale]);

  const selectValue =
    typeof fixedLayoutScale !== 'number' ? fixedLayoutScale : isCustom ? 'custom' : String(fixedLayoutScale);

  const handleChange = (nextId: string) => {
    if (nextId === 'fit' || nextId === 'stretch') {
      setIsCustom(false);
      onFixedLayoutScaleChange(nextId);
      return;
    }
    if (nextId === 'custom') {
      setIsCustom(true);
      // Entering Custom from Fit or Stretch needs a starting number; coming from a preset keeps the
      // size on screen so only the label changes.
      if (typeof fixedLayoutScale !== 'number') onFixedLayoutScaleChange(1);
      return;
    }
    const preset = FIXED_SCALE_PRESETS.find((scale) => String(scale) === nextId);
    if (preset !== undefined) {
      setIsCustom(false);
      onFixedLayoutScaleChange(preset);
    }
  };

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    const fallback = fixedScaleOrDefault(fixedLayoutScale);
    const committed = Number.isFinite(n)
      ? Math.round(Math.max(FIXED_SCALE_MIN, Math.min(FIXED_SCALE_MAX, n)) * 100) / 100
      : fallback;
    setInput(String(committed));
    if (committed !== fixedLayoutScale) onFixedLayoutScaleChange(committed);
  };

  const frame = typeof fixedLayoutScale === 'number' ? fixedFrameSizeAtScale(fixedLayoutScale) : FIXED_FRAME;

  return (
    <div
      className="plugin-group fixed-scale-field"
      data-search-id={pluginSearchId('stretchedMode', 'Fixed layout scale')}
    >
      <div className="plugin-group-label">Fixed layout scale</div>
      <SettingRow
        // Anchored on its group, so a reveal marks the title with it.
        searchId={null}
        isModified={fixedLayoutScale !== PERSISTED_SETTINGS_DEFAULTS.fixedLayoutScale}
        onReset={() => handleChange('fit')}
      >
        <select
          value={selectValue}
          onChange={(event) => handleChange(event.target.value)}
          className="select-input"
          aria-label="Fixed layout scale"
        >
          <option value="fit">Fit Window</option>
          <option value="stretch">Stretch to Window</option>
          {FIXED_SCALE_PRESETS.map((scale) => (
            <option key={scale} value={String(scale)}>
              {fixedScaleLabel(scale)}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </SettingRow>
      {selectValue === 'custom' && (
        <SettingRow
          // The custom multiplier belongs to the Fixed layout scale entry.
          searchId={null}
          isModified={false}
          onReset={() => {}}
          hideReset
        >
          <div className="viewport-dimensions">
            <input
              type="number"
              className="viewport-dimensions__input"
              min={FIXED_SCALE_MIN}
              max={FIXED_SCALE_MAX}
              step={0.05}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onBlur={(event) => commit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-label="Fixed layout scale multiplier"
            />
            <span className="viewport-dimensions__sep" aria-hidden="true">
              ×
            </span>
            <span className="viewport-dimensions__suffix">
              {frame.width} × {frame.height} px
            </span>
          </div>
        </SettingRow>
      )}
      {typeof fixedLayoutScale !== 'number' && (
        <SettingRow
          isModified={integerScaling !== PERSISTED_SETTINGS_DEFAULTS.fixedLayoutIntegerScaling}
          onReset={() => onIntegerScalingChange(PERSISTED_SETTINGS_DEFAULTS.fixedLayoutIntegerScaling)}
          searchId={pluginSearchId('stretchedMode', 'Integer scaling')}
        >
          <OsrsCheckbox label="Integer scaling" checked={integerScaling} onChange={onIntegerScalingChange} />
        </SettingRow>
      )}
      <p className="stretched-mode-hint">
        A multiple keeps the Fixed client's {FIXED_FRAME.width} × {FIXED_FRAME.height} shape. Fit Window follows the
        window; Stretch to Window fills it, stretching the client.
      </p>
    </div>
  );
}
