import type React from 'react';
import './SystemNotice.css';

/**
 * How much the notice is claiming, and the only thing that changes color between them.
 *
 * - `progress`: something is being waited on. No severity, no action.
 * - `caution`: it still works, but worse than it should.
 * - `blocked`: it does not work, and the notice carries the way out.
 *
 * The title stays `--color-heading` in all three: severity reads from the mark and the hairline,
 * which is enough to tell them apart at a glance and leaves the title at its most legible.
 */
export type SystemNoticeTone = 'progress' | 'caution' | 'blocked';

/**
 * - `card`: the default. Title, body and the action stacked.
 * - `banner`: a wide, shallow bar for a short viewport. The action sits beside the text while
 *   there is room for both and wraps under it when there is not.
 * - `strip`: one line, for `progress`. No icon, no body, no action.
 */
export type SystemNoticeLayout = 'card' | 'banner' | 'strip';

interface SystemNoticeProps {
  tone: SystemNoticeTone;
  title: string;
  /** The one sentence that says what happened. */
  body?: React.ReactNode;
  /** A quieter fact about the session, on its own line below the body. */
  detail?: React.ReactNode;
  /** Short things the reader can try. Two or three; this is not documentation. */
  steps?: readonly string[];
  /** The single recovery action. */
  action?: React.ReactNode;
  /** Secondary actions beside it, such as browser suggestions. */
  links?: React.ReactNode;
  /**
   * An aside below the action row, ruled off from it: a cause or a caveat the reader may want but
   * which is not what they should do first. Quieter than the steps, and never an instruction.
   */
  note?: React.ReactNode;
  layout?: SystemNoticeLayout;
  role?: 'alert' | 'status';
  /** The caller's positioning or variant hook. The notice owns everything inside its border. */
  className?: string;
}

/**
 * One drawn mark for the whole family. Severity is its color, never its shape: two silhouettes
 * would be a second language to learn for information the color and the title already carry.
 */
function NoticeMark() {
  return (
    <svg className="sys-notice__icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7.72 2.3a1.46 1.46 0 0 1 2.56 0l6.03 10.9A1.46 1.46 0 0 1 15.03 15.4H2.97a1.46 1.46 0 0 1-1.28-2.2L7.72 2.3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M9 6.4v3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 12.4h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The app's system notices: one anatomy, one set of tokens, three severities.
 *
 * Every member is opaque, carries a 1px hairline and no outer shadow, and sets its text at the
 * native pixel-font em, so the family is consistent and its text keeps LCD antialiasing
 * (docs/agent-reference.md, LCD text). Used by the 3D view's status overlay, the hardware
 * acceleration warning and the browser support screen.
 */
export const SystemNotice: React.FC<SystemNoticeProps> = ({
  tone,
  title,
  body,
  detail,
  steps,
  action,
  links,
  note,
  layout = 'card',
  role,
  className = '',
}) => {
  const hasActions = action !== undefined || links !== undefined;

  if (layout === 'strip') {
    return (
      <div className={`sys-notice sys-notice--strip sys-notice--${tone} ${className}`.trim()} role={role}>
        <span className="sys-notice__pulse" aria-hidden="true" />
        <span className="sys-notice__title">{title}</span>
      </div>
    );
  }

  return (
    <div className={`sys-notice sys-notice--${layout} sys-notice--${tone} ${className}`.trim()} role={role}>
      <NoticeMark />
      <div className="sys-notice__body">
        <div className="sys-notice__content">
          <h2 className="sys-notice__title">{title}</h2>
          {body && <p className="sys-notice__text">{body}</p>}
          {detail && <p className="sys-notice__detail">{detail}</p>}
          {steps && steps.length > 0 && (
            <ul className="sys-notice__steps">
              {steps.map((step) => (
                <li key={step} className="sys-notice__step">
                  {step}
                </li>
              ))}
            </ul>
          )}
        </div>
        {hasActions && (
          <div className="sys-notice__actions">
            {action}
            {links}
          </div>
        )}
        {note && <p className="sys-notice__note">{note}</p>}
      </div>
    </div>
  );
};
