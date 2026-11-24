import type React from 'react';
import { useId, useRef, useState } from 'react';
import { InfoHint } from './ui/InfoHint';
import { OsrsNumberInput } from './ui/OsrsNumberInput';
import './StartingHitpointsField.css';

const WRETCHED_STRENGTH_INFO = 'Wretched Strength: your minimum hit rises as health falls.';

interface StartingHitpointsFieldProps {
  value: number;
  /** The player's configured hitpoints max — the ceiling, and the denominator shown beside the field. */
  max: number;
  onChange: (hitpoints: number) => void;
}

/** A settings row leading the configurer's picker zone; the list owns its inset, seam and rhythm. */
export const StartingHitpointsField: React.FC<StartingHitpointsFieldProps> = ({ value, max, onChange }) => {
  // Held while typing so a half-entered number is not clamped out from under the
  // caret: "1" on the way to "15" would otherwise commit and rewrite the field.
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = useId();
  const labelRef = useRef<HTMLDivElement>(null);

  return (
    <div className="starthp-field">
      <div ref={labelRef} className="starthp-label info-hint-region">
        <label htmlFor={inputId}>Starting Hitpoints</label>
        <InfoHint label="Starting Hitpoints" text={WRETCHED_STRENGTH_INFO} hoverRegionRef={labelRef} />
      </div>
      <OsrsNumberInput
        id={inputId}
        className="starthp-input"
        value={draft ?? String(value)}
        min={1}
        max={max}
        fieldWidth={24}
        suffix={`/ ${max}`}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number.parseInt(event.target.value, 10);
          if (Number.isInteger(parsed)) onChange(Math.min(Math.max(parsed, 1), max));
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
};
