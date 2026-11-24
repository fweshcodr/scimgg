import type { CSSProperties } from 'react';
import type { PracticeSessionState } from '../types/practiceSession';
import type { ReplayPracticeControls } from '../types/replayPractice';
import { HoverHintButton } from './ui/HoverHintControl';
import { OsrsButton } from './ui/OsrsButton';
import './ReplayPractice.css';

/** One session control shared by desktop top chrome and the mobile tools window. */
export function PracticeRetryBar({
  controls,
  className = '',
  style,
  presentation = 'toolbar',
}: {
  controls: ReplayPracticeControls;
  className?: string;
  style?: CSSProperties;
  /** TopChrome selects from its launcher form and room; mobile keeps the default toolbar. */
  presentation?: 'toolbar' | 'compact' | 'labelled';
}) {
  if (controls.startTick === null) return null;
  return (
    <fieldset
      className={`practice-retry-bar${presentation === 'toolbar' ? '' : ` practice-retry-bar--${presentation}`} ${className}`.trim()}
      style={style}
      aria-label="Practice session"
      aria-busy={controls.busy}
      onMouseDown={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
      }}
    >
      {presentation === 'labelled' && (
        <div className="practice-retry-bar__context">
          <span>Practice</span>
          <kbd>Ctrl+R</kbd>
        </div>
      )}
      <div className="practice-retry-bar__row">
        <HoverHintButton
          type="button"
          className="replay-practice__button replay-practice__button--primary"
          disabled={controls.busy || controls.retryUnavailableReason !== null}
          onClick={controls.onRetry}
          aria-label={`Restart from tick ${controls.startTick}`}
          hint="Ctrl+R restarts from this tick."
        >
          <span className="practice-retry-bar__restart-label">
            Restart: <b>{controls.startTick}</b>
          </span>
        </HoverHintButton>
        {/* Wrapped as one unit so a narrow bar moves both to a second line together. Keep them as
            words: the rewind and close glyphs already mean Replay and "close" in this chrome. */}
        <div className="practice-retry-bar__actions">
          <HoverHintButton
            type="button"
            className="replay-practice__button replay-practice__button--quiet"
            disabled={controls.busy}
            onClick={controls.onChangeStart}
            aria-label="Change"
            hint="Pick a new restart tick in the replay."
          >
            Change
          </HoverHintButton>
          <HoverHintButton
            type="button"
            className="replay-practice__button replay-practice__button--quiet"
            disabled={controls.busy}
            onClick={controls.onClearStart}
            aria-label="Clear restart point"
            hint="Ctrl+R restarts the whole fight again."
          >
            Clear
          </HoverHintButton>
        </div>
      </div>
      {(controls.busy || controls.error || controls.retryUnavailableReason || controls.message) && (
        <p
          className={`replay-practice__hint${!controls.busy && controls.error ? ' practice-retry-bar__error' : ''}`}
          role="status"
        >
          {controls.busy ? 'Restoring tick…' : (controls.error ?? controls.message ?? controls.retryUnavailableReason)}
        </p>
      )}
    </fieldset>
  );
}

/** A full restart always stays explicit, even when Ctrl+R now retries the practice start. */
export function OutcomePracticeActions({
  controls,
  encounterSession,
  onRestart,
  onReplay,
  onReturnToLobby,
}: {
  controls?: ReplayPracticeControls;
  /**
   * The encounter's own restart for the stage the run ended on (Inferno's wave). It leads, because
   * "Restart fight" would send the player back to the wave their setup names rather than the one
   * they just died on. A replay practice start the player chose still wins over both.
   */
  encounterSession?: PracticeSessionState | null;
  onRestart: () => void;
  onReplay?: () => void;
  onReturnToLobby?: () => void;
}) {
  const active = controls?.startTick != null;
  const reason = active ? controls?.retryUnavailableReason : null;
  const session = active ? null : (encounterSession ?? null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: delegated pointer focus prevention, required by the Keyboard and focus policy.
    <div
      className="outcome-practice-actions"
      aria-busy={controls?.busy || undefined}
      onMouseDown={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
      }}
    >
      <div className="outcome-practice-actions__main">
        <OsrsButton
          variant="primary"
          className="outcome-practice-actions__primary"
          disabled={controls?.busy || (active && Boolean(reason))}
          onClick={active ? controls.onRetry : (session?.primary.onClick ?? onRestart)}
        >
          <span>
            {active ? `Restart from tick ${controls.startTick}` : (session?.primary.label ?? 'Restart fight')}
          </span>
          {/* Ctrl+R takes the same precedence as this button: the practice tick, else the
              encounter's session restart, else the whole fight (`useSimulationWiring`'s
              `retryShortcut`). */}
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: supplementary shortcut only; the button keeps its explicit action name. */}
          <kbd className="outcome-practice-actions__shortcut" aria-hidden="true">
            Ctrl+R
          </kbd>
        </OsrsButton>
        {session?.secondary && (
          <span className="outcome-practice-actions__replay">
            <OsrsButton variant="default" onClick={session.secondary.onClick}>
              {session.secondary.label}
            </OsrsButton>
          </span>
        )}
        {onReplay && (
          <span className="outcome-practice-actions__replay">
            <OsrsButton variant="default" onClick={onReplay} disabled={controls?.busy}>
              Watch replay
            </OsrsButton>
          </span>
        )}
      </div>
      {(controls?.busy || controls?.error || controls?.message || reason) && (
        <p
          className={`outcome-practice-actions__status${!controls?.busy && controls?.error ? ' outcome-practice-actions__error' : ''}`}
          role="status"
        >
          {controls?.busy ? 'Restoring tick…' : (controls?.error ?? controls?.message ?? reason)}
        </p>
      )}
      {(active || session || onReturnToLobby) && (
        <div className="outcome-practice-actions__secondary">
          {(active || session) && (
            <OsrsButton variant="ghost" onClick={onRestart} disabled={controls?.busy}>
              Restart fight
            </OsrsButton>
          )}
          {onReturnToLobby && (
            <OsrsButton variant="ghost" onClick={onReturnToLobby}>
              Return to Lobby
            </OsrsButton>
          )}
        </div>
      )}
    </div>
  );
}
