import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  clearTickColor,
  getTickColor,
  resolveTickColor,
  setAllTickColors,
  setTickColor,
  type TickColorOverrides,
  tickCycle,
  uniformTickColor,
} from '../util/tickColor';

/**
 * The picker streams `input` for every pixel of drag; committing on those
 * writes a persisted setting per frame. `change` is the OK/dismiss.
 */
function useColorPicker(color: string, onCommit: (color: string) => void) {
  const [draft, setDraft] = useState(color);
  const inputRef = useRef<HTMLInputElement>(null);
  // Read through a ref so the listener below binds once. Both the committed
  // color and the callback are new on every parent render, and a dependency on
  // either re-binds a native listener per chip per render.
  const latest = useRef({ color, onCommit });
  latest.current = { color, onCommit };

  useEffect(() => {
    setDraft(color);
  }, [color]);

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    const commit = () => {
      const next = input.value.toLowerCase();
      if (next !== latest.current.color.toLowerCase()) latest.current.onCommit(next);
    };
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);

  return { draft, setDraft, inputRef };
}

type TickColorChipProps = {
  readonly tick: number;
  readonly max: number;
  readonly overrides: TickColorOverrides;
  readonly markCustom: boolean;
  readonly onCommit: (tick: number, color: string) => void;
  readonly onReset: (tick: number) => void;
  readonly onMouseDown: React.MouseEventHandler<HTMLInputElement>;
};

const TickColorChip: React.FC<TickColorChipProps> = ({
  tick,
  max,
  overrides,
  markCustom,
  onCommit,
  onReset,
  onMouseDown,
}) => {
  const color = resolveTickColor(tick, max, overrides);
  const isCustom = markCustom && overrides[String(tick)] !== undefined;
  const { draft, setDraft, inputRef } = useColorPicker(color, (next) => onCommit(tick, next));

  return (
    <label
      className={`tick-color-chip${isCustom ? ' is-custom' : ''}`}
      title={`Tick ${tick} of ${max}. Click to set a color, right-click to restore ${getTickColor(tick, max)}.`}
      onContextMenu={(event) => {
        event.preventDefault();
        onReset(tick);
      }}
    >
      <span className="tick-color-chip__glyph" style={{ color: draft }}>
        {tick}
      </span>
      <input
        ref={inputRef}
        type="color"
        value={draft}
        aria-label={`Color for tick ${tick}`}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onMouseDown={onMouseDown}
      />
    </label>
  );
};

type TickColorAllProps = {
  readonly max: number;
  readonly uniformColor: string | null;
  readonly onCommit: (color: string) => void;
  readonly onMouseDown: React.MouseEventHandler<HTMLInputElement>;
};

/**
 * It deliberately does NOT offer a bulk reset on right-click the way the chips
 * do. SettingRow's arrow already restores the gradient for this row, and a
 * second gesture for it would put one action in two places.
 */
const TickColorAll: React.FC<TickColorAllProps> = ({ max, uniformColor, onCommit, onMouseDown }) => {
  const { draft, setDraft, inputRef } = useColorPicker(uniformColor ?? getTickColor(1, max), onCommit);
  const isUniform = uniformColor !== null;

  return (
    <label className="tick-color-all" title={`Set all ${max} ticks to one color.`}>
      <span className="tick-color-all__label" style={isUniform ? { color: draft } : undefined}>
        All
      </span>
      <input
        ref={inputRef}
        type="color"
        value={draft}
        aria-label="Color for every tick"
        onInput={(event) => setDraft(event.currentTarget.value)}
        onMouseDown={onMouseDown}
      />
    </label>
  );
};

type TickColorChipsProps = {
  readonly max: number;
  readonly colors: TickColorOverrides;
  readonly onChange: (colors: TickColorOverrides) => void;
  readonly onMouseDown: React.MouseEventHandler<HTMLInputElement>;
};

/**
 * Each chip is the digit the player sees over their head in that tick's color,
 * rather than a filled swatch like Tile Indicators uses: a color legible as a
 * 20px block is not necessarily legible as a thin outlined glyph over an arena
 * floor, which is the judgment being made.
 */
export const TickColorChips: React.FC<TickColorChipsProps> = ({ max, colors, onChange, onMouseDown }) => {
  const ticks = tickCycle(max);
  const allOverridden = ticks.length > 0 && ticks.every((tick) => colors[String(tick)] !== undefined);
  const uniformColor = uniformTickColor(max, colors);

  const commit = (tick: number, color: string) => onChange(setTickColor(colors, tick, color));
  const commitAll = (color: string) => onChange(setAllTickColors(max, color));
  const reset = (tick: number) => {
    const next = clearTickColor(colors, tick);
    if (next !== colors) onChange(next);
  };

  return (
    <div className="tick-color-controls">
      <TickColorAll max={max} uniformColor={uniformColor} onCommit={commitAll} onMouseDown={onMouseDown} />
      <div className="tick-color-chips">
        {ticks.map((tick) => (
          <TickColorChip
            key={tick}
            tick={tick}
            max={max}
            overrides={colors}
            // Once every tick is custom the mark distinguishes nothing, and
            // lighting the accent on all 20 at once is exactly what makes an
            // accent stop reading as a selection. SettingRow's amber bar is
            // already reporting the row as modified.
            markCustom={!allOverridden}
            onCommit={commit}
            onReset={reset}
            onMouseDown={onMouseDown}
          />
        ))}
      </div>
    </div>
  );
};
