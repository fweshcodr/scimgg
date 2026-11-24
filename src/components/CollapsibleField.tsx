import type React from 'react';
import { useId, useState } from 'react';
import './CollapsibleField.css';

interface CollapsibleFieldProps {
  /** Uppercase label at the left of the header (e.g. "Contract", "Invocations"). */
  label: string;
  /** Right-aligned header content: the current selection / summary. Caller styles it. */
  summary: React.ReactNode;
  defaultExpanded?: boolean;
  /** Hide the summary while expanded (when the body already surfaces it). */
  hideSummaryOnExpand?: boolean;
  children: React.ReactNode;
}

/**
 * Shared collapsible field used by the encounter-config selectors (contracts,
 * invocations). One header button (chevron + label + summary) over a body that
 * expands via a `grid-template-rows` transition.
 */
export const CollapsibleField: React.FC<CollapsibleFieldProps> = ({
  label,
  summary,
  defaultExpanded = false,
  hideSummaryOnExpand = false,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bodyId = useId();

  return (
    <div className="cfield">
      <button
        type="button"
        className="cfield-header"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <svg className="cfield-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path
            d="M3 1.5L7 5L3 8.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="cfield-label">{label}</span>
        <span className={`cfield-summary${hideSummaryOnExpand ? ' cfield-summary--hide-open' : ''}`}>{summary}</span>
      </button>

      <div
        id={bodyId}
        className={`cfield-body${expanded ? ' cfield-body--open' : ''}`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="cfield-body-inner">{children}</div>
      </div>
    </div>
  );
};
