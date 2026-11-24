import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HoverHintButton } from './HoverHintControl';
import './OsrsNumberInput.css';

interface OsrsNumberInputProps {
  value: number | string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  /** id of an element describing this control, wired to aria-describedby. */
  describedBy?: string;
  /** Inner text field width in px (default 30). */
  fieldWidth?: number;
  /**
   * Static text rendered inside the field's box, between the value and the arrows — a unit
   * or bound that belongs to the number (`/ 99`). Outside the box the arrows sit between
   * the two and they stop reading as one expression.
   */
  suffix?: React.ReactNode;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** Initial delay before repeat starts (ms). */
const REPEAT_DELAY = 400;
/** Starting repeat interval (ms). */
const REPEAT_SLOW = 120;
/** Faster repeat interval after holding longer (ms). */
const REPEAT_FAST = 50;
/** Time before switching to fast repeat (ms). */
const ACCEL_AFTER = 1200;

export const OsrsNumberInput: React.FC<OsrsNumberInputProps> = ({
  value,
  min,
  max,
  step = 1,
  disabled,
  id,
  className,
  placeholder,
  describedBy,
  fieldWidth,
  suffix,
  onChange,
  onBlur,
  onMouseDown,
  onKeyDown,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // Keep rejected partial input until blur, so a caller needs no draft of its own; otherwise React
  // restores the parent's last accepted number before the user can finish typing.
  const [draft, setDraft] = useState<string | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      const input = inputRef.current;
      if (!input || disabled) return;
      if (direction === 1) {
        input.stepUp();
      } else {
        input.stepDown();
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    [disabled],
  );

  const stopRepeat = useCallback(() => {
    if (repeatTimer.current) {
      clearTimeout(repeatTimer.current);
      repeatTimer.current = null;
    }
    if (repeatInterval.current) {
      clearInterval(repeatInterval.current);
      repeatInterval.current = null;
    }
  }, []);

  const startRepeat = useCallback(
    (direction: 1 | -1) => {
      stopRepeat();
      holdStart.current = Date.now();

      // Initial step fires immediately (already handled by caller).
      repeatTimer.current = setTimeout(() => {
        repeatInterval.current = setInterval(() => {
          handleStep(direction);
          if (Date.now() - holdStart.current > ACCEL_AFTER && repeatInterval.current) {
            clearInterval(repeatInterval.current);
            repeatInterval.current = setInterval(() => handleStep(direction), REPEAT_FAST);
          }
        }, REPEAT_SLOW);
      }, REPEAT_DELAY);
    },
    [handleStep, stopRepeat],
  );

  useEffect(() => stopRepeat, [stopRepeat]);

  const handleArrowDown = useCallback(
    (e: React.MouseEvent, direction: 1 | -1) => {
      e.preventDefault();
      handleStep(direction);
      startRepeat(direction);
    },
    [handleStep, startRepeat],
  );

  const handleArrowUp = useCallback(() => {
    stopRepeat();
  }, [stopRepeat]);

  // Set by an edit until that edit's render commits: a `value` change in that render is the edit's
  // own commit (possibly clamped), which keeps the draft. See the `value` effect below.
  const editPending = useRef(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      editPending.current = true;
      setDraft(e.target.value);
      onChange(e);
    },
    [onChange],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setDraft(null);
      onBlur?.(e);
    },
    [onBlur],
  );

  // A value set from elsewhere (a preset chip, a reset) replaces the draft, even while the field
  // keeps focus: chrome buttons do not take focus on press, so no blur would ever drop it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on `value` deliberately — the draft must survive re-renders that do NOT change it.
  useEffect(() => {
    if (!editPending.current) setDraft(null);
  }, [value]);
  // Declared after the effect above so that it still sees this commit's edit.
  useEffect(() => {
    editPending.current = false;
  });

  const fieldStyle = fieldWidth != null ? { width: fieldWidth } : undefined;

  // `stepUp`/`stepDown` already refuse to cross a bound, so an arrow at one is a lit
  // button that does nothing. NaN while a draft is mid-edit leaves both live.
  const shown = draft ?? value;
  const numeric = typeof shown === 'number' ? shown : Number.parseFloat(shown);
  const atMax = max != null && Number.isFinite(numeric) && numeric >= max;
  const atMin = min != null && Number.isFinite(numeric) && numeric <= min;

  // A held arrow that reaches its bound is disabled mid-press, and Chromium fires no
  // mouseup or mouseleave on a button once disabled — so the repeat interval outlives the
  // press and resumes stepping the moment the value moves off the bound again.
  useEffect(() => {
    if (disabled || atMax || atMin) stopRepeat();
  }, [disabled, atMax, atMin, stopRepeat]);

  return (
    <div className={`num-input ${disabled ? 'num-input--disabled' : ''} ${className ?? ''}`}>
      <input
        ref={inputRef}
        id={id}
        className="num-input__field"
        type="number"
        value={draft ?? value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={describedBy}
        style={fieldStyle}
        onChange={handleChange}
        onBlur={handleBlur}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
      />
      {suffix != null && <span className="num-input__suffix">{suffix}</span>}
      <div className="num-input__arrows">
        <HoverHintButton
          type="button"
          className="num-input__btn"
          tabIndex={-1}
          disabled={disabled || atMax}
          onMouseDown={(e) => handleArrowDown(e, 1)}
          onMouseUp={handleArrowUp}
          onMouseLeave={handleArrowUp}
          aria-label="Increment"
        >
          <svg width="7" height="4" viewBox="0 0 7 4" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M3.5 0L7 4H0z" />
          </svg>
        </HoverHintButton>
        <HoverHintButton
          type="button"
          className="num-input__btn"
          tabIndex={-1}
          disabled={disabled || atMin}
          onMouseDown={(e) => handleArrowDown(e, -1)}
          onMouseUp={handleArrowUp}
          onMouseLeave={handleArrowUp}
          aria-label="Decrement"
        >
          <svg width="7" height="4" viewBox="0 0 7 4" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M3.5 4L0 0h7z" />
          </svg>
        </HoverHintButton>
      </div>
    </div>
  );
};
