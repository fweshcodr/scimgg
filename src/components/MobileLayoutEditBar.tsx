import type React from 'react';
import { useRef } from 'react';
import { setMobileLayoutEditing } from '../layout/mobileLayoutEdit';
import { InfoHint } from './ui/InfoHint';
import './MobileLayoutEditBar.css';

/** What the edit mode does; Settings' "Overlay positions" entry explains it the same way. */
export const EDIT_LAYOUT_HELP = 'Drag plugin overlays to move them. Game UI stays put.';

/**
 * The one control "Edit layout" adds to the Mobile layout: what the mode does, and Done to
 * leave it. Deliberately plain until the mode gets its designed chrome.
 */
export const MobileLayoutEditBar: React.FC = () => {
  const labelRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      role="toolbar"
      aria-label="Edit layout"
      style={{
        position: 'absolute',
        top: 8,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* The pill has nothing else to do, so a tap anywhere on it opens the hint. Its name
            carries the hint's text, as `insideControl` requires. */}
        <button
          ref={labelRef}
          type="button"
          className="layout-edit-pill info-hint-region"
          aria-label={`Editing layout. ${EDIT_LAYOUT_HELP}`}
        >
          <span className="layout-edit-pill__label">Editing layout</span>
          <InfoHint label="Editing layout" text={EDIT_LAYOUT_HELP} hoverRegionRef={labelRef} insideControl />
        </button>
        <button type="button" className="layout-edit-pill" onClick={() => setMobileLayoutEditing(false)}>
          <span className="layout-edit-pill__label">Done</span>
        </button>
      </div>
    </div>
  );
};
