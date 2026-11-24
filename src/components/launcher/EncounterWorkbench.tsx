import type React from 'react';
import { createPortal } from 'react-dom';
import { ESC_PRIORITY, useEscapeLayer } from '../../hooks/useEscapeLayer';
import type { Rect } from '../../layout/topChromeLayout';
import { CloseButton } from '../ui/CloseButton';
import './EncounterWorkbench.css';

/** A deliberate editing surface, not a combat-control column. No backdrop or game-key guard. */
export function EncounterWorkbench({
  open,
  title,
  anchor,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly anchor?: Rect | null;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, open, onClose);
  return createPortal(
    <section
      className="encounter-workbench"
      role="dialog"
      aria-label={title}
      hidden={!open}
      style={
        {
          '--workbench-top': `${anchor ? anchor.y + anchor.height + 4 : 4}px`,
          '--workbench-left': `${anchor?.x ?? 4}px`,
        } as React.CSSProperties
      }
      onMouseDown={(event) => {
        if ((event.target as Element).closest('button')) event.preventDefault();
      }}
    >
      <header className="encounter-workbench__head">
        <h2>{title}</h2>
        <CloseButton aria-label={`Close ${title}`} tabIndex={-1} onClick={onClose} />
      </header>
      <div className="encounter-workbench__body">{children}</div>
    </section>,
    document.body,
  );
}
