import type { CSSProperties } from 'react';
import type { PracticeSessionState } from '../types/practiceSession';
import { HoverHintButton } from './ui/HoverHintControl';
import './PracticeSessionBar.css';

/**
 * An encounter's session controls, in the top chrome's session slot and on the Mobile Tools
 * Practice session page.
 *
 * It names the stage the run is on and offers that stage's restarts, so repeating a wave is one
 * press from wherever the player is rather than a trip through a launcher. The shape matches the
 * replay practice bar beside it (same slot, same metrics); the two never show at once.
 */
export function PracticeSessionBar({
  session,
  className = '',
  style,
  presentation = 'toolbar',
}: {
  session: PracticeSessionState;
  className?: string;
  style?: CSSProperties;
  /** TopChrome selects from its launcher form and room; Mobile Tools uses `compact`. */
  presentation?: 'toolbar' | 'compact' | 'labelled';
}) {
  return (
    <fieldset
      className={`session-bar${presentation === 'toolbar' ? '' : ` session-bar--${presentation}`} ${className}`.trim()}
      style={style}
      aria-label="Practice session"
      // A pressed control keeps no focus: keys over the game are game input (Keyboard and focus policy).
      onMouseDown={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
      }}
    >
      {/* The stage the run is on, carried by the control that restarts it rather than by a second
          readout: the number and the action belong together. Dropped where the bar is narrowest,
          because the primary action names the stage again. */}
      {presentation !== 'compact' && <div className="session-bar__title">{session.title}</div>}
      <div className="session-bar__row">
        {/* The name is the action, as the face reads it; the hint only says what the action does,
            so it is the card's content rather than the button's label. */}
        <HoverHintButton
          type="button"
          className="session-bar__button session-bar__button--primary"
          aria-label={session.primary.label}
          hint={session.primary.hint}
          onClick={session.primary.onClick}
        >
          {session.primary.label}
        </HoverHintButton>
        {session.secondary && (
          <HoverHintButton
            type="button"
            className="session-bar__button session-bar__button--quiet"
            aria-label={session.secondary.label}
            hint={session.secondary.hint}
            onClick={session.secondary.onClick}
          >
            {session.secondary.label}
          </HoverHintButton>
        )}
      </div>
    </fieldset>
  );
}
