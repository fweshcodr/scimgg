import type React from 'react';
import { useRemainingSeconds } from '../contexts/TickProgressContext';
import { DEFAULT_PLUGIN_KEYBINDS, type PluginKeybindMap } from '../data/pluginKeybinds';
import { formatKeyName } from '../hooks/useGamePanelShortcuts';
import type { UIPosition } from '../hooks/usePersistedSettings';
import { scaleOverlayDefaultPosition } from '../layout/overlayScale';
import type { ZukSetTimerState } from '../types/zukSetTimer';
import { zukSetTimerNextStep, zukSetTimerRemainingTicks } from '../types/zukSetTimer';
import { BOSS_HEALTH_BAR_WIDTH } from './BossHealthBarOverlay';
import type { ExclusionRect } from './DraggablePanel';
import { DraggablePanel } from './DraggablePanel';
import { formatSecondsClock, formatTicksToClock } from './InfoBox/timerFormat';
import './ZukSetTimerOverlay.css';

/**
 * TzKal-Zuk set timer overlay.
 *
 * The countdown Inferno runners keep in their head, made visible — but still
 * kept BY the player: the encounter knows exactly when the next set lands, and
 * the overlay only reveals that on request, because driving the clock
 * yourself is the skill being practiced.
 */

/**
 * Panel geometry.
 *
 * Width is the boss health bar's, shared rather than guessed: this overlay's
 * default slot sits directly under that one at the same x, and two stacked
 * overlays of different widths read as a mistake.
 *
 */
const PANEL_WIDTH = BOSS_HEALTH_BAR_WIDTH;
export const ZUK_SET_TIMER_PANEL_HEIGHT = 134;
const PANEL_HEIGHT = ZUK_SET_TIMER_PANEL_HEIGHT;

/** Default slot: under the boss health bar's top-center slot. */
export const DEFAULT_ZUK_SET_TIMER_POSITION: UIPosition = { x: 359, y: 74, anchorX: 'left', anchorY: 'top' };

/** Shared by the live panel and capture: recordings must not defer a movable default. */
export function resolveZukSetTimerPosition(position: UIPosition | null | undefined, overlayScale: number): UIPosition {
  return position ?? scaleOverlayDefaultPosition(DEFAULT_ZUK_SET_TIMER_POSITION, overlayScale);
}

/**
 * Urgency thresholds in ticks, matching the values the infobox tile used so the
 * escalation a player already learned carries over: 50 ticks = 30s of warning,
 * 17 ticks = the ~10s in which the set has to be prayed for.
 */
const WARNING_TICKS = 50;
const DANGER_TICKS = 17;

type Urgency = 'idle' | 'normal' | 'warning' | 'danger';

export function zukSetTimerUrgency(timer: ZukSetTimerState, ticksRemaining: number): Urgency {
  if (timer.status !== 'running') return 'idle';
  if (ticksRemaining <= DANGER_TICKS) return 'danger';
  if (ticksRemaining <= WARNING_TICKS) return 'warning';
  return 'normal';
}

/**
 * Countdown digits. A running timer steps on true one-second boundaries via the
 * tick-progress store (the raw tick count only changes every 0.6s, which reads
 * as a stutter); a stopped one renders its frozen tick value directly.
 */
const Countdown: React.FC<{ ticksRemaining: number; sampledAtTick: number; running: boolean }> = ({
  ticksRemaining,
  sampledAtTick,
  running,
}) => {
  const seconds = useRemainingSeconds(ticksRemaining, sampledAtTick);
  const text = running ? formatSecondsClock(seconds) : formatTicksToClock(ticksRemaining);
  const [minutes, rest] = text.split(':');
  return (
    <span className="zuk-set-timer__clock">
      {minutes}
      {/* Colon blinks only while the clock is live: the OSRS-native "this is
          running" cue, and the one signal that separates paused from ticking
          without spending a second line on a status word. */}
      <span className="zuk-set-timer__colon">:</span>
      {rest}
    </span>
  );
};

const KeyHint: React.FC<{ combo: string; action: string }> = ({ combo, action }) => (
  <span className="zuk-set-timer__hint">
    {combo && <kbd className="zuk-set-timer__key">{combo.split('+').map(formatKeyName).join(' + ')}</kbd>}
    <span className="zuk-set-timer__action">
      {action}
      {!combo && ': unavailable'}
    </span>
  </span>
);

interface ZukSetTimerOverlayProps {
  overlayScale?: number;
  keybinds?: PluginKeybindMap;
  /** The player's own clock, or undefined while the overlay is off. */
  timer?: ZukSetTimerState;
  currentTick: number;
  /**
   * The encounter's authoritative countdown, revealed alongside the player's
   * clock so they can check themselves. Omitted when the reveal key is off, or
   * when the encounter is not running sets at all.
   */
  actual?: { ticksRemaining: number; frozen: boolean };
  /** Persisted panel position; null = DEFAULT_ZUK_SET_TIMER_POSITION. */
  position?: UIPosition | null;
  onPositionChange?: (position: UIPosition) => void;
  /** Mobile layout: pinned in ordinary play (see mobileLayoutEdit). */
  locked?: boolean;
  /** Mobile layout's "Edit layout": dragged by a plain press, touch included. */
  editDrag?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  exclusionRects?: ExclusionRect[];
}

export const ZukSetTimerOverlay: React.FC<ZukSetTimerOverlayProps> = ({
  overlayScale = 1,
  timer,
  keybinds = DEFAULT_PLUGIN_KEYBINDS,
  currentTick,
  actual,
  position,
  onPositionChange,
  locked,
  editDrag,
  viewportWidth,
  viewportHeight,
  exclusionRects,
}) => {
  if (!timer) return null;

  const ticksRemaining = zukSetTimerRemainingTicks(timer, currentTick);
  const running = timer.status === 'running';
  const urgency = zukSetTimerUrgency(timer, ticksRemaining);
  const nextStep = zukSetTimerNextStep(timer);

  return (
    <DraggablePanel
      defaultPosition={DEFAULT_ZUK_SET_TIMER_POSITION}
      position={position ?? undefined}
      width={PANEL_WIDTH}
      height={PANEL_HEIGHT}
      scale={overlayScale}
      // Sized by Auto alone: Alt+scroll over it is taken and does nothing, so it never
      // reaches the camera or a panel underneath.
      scaleLocked
      onPositionChange={onPositionChange}
      locked={locked}
      editDrag={editDrag}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      exclusionRects={exclusionRects}
      pointerPassthrough
      altHintLabel="Set Timer"
      dataTutorial="zuk-set-timer-overlay"
    >
      <div
        className={`zuk-set-timer zuk-set-timer--${urgency}${running ? ' zuk-set-timer--running' : ''}`}
        role="timer"
        // One label for the whole surface: role="timer" replaces the subtree for
        // assistive tech, so the revealed encounter countdown has to be named
        // here or it is announced nowhere.
        aria-label={[
          `Next Zuk set in ${formatTicksToClock(ticksRemaining)}`,
          running ? 'running' : timer.status === 'paused' ? 'frozen for Jad' : 'not started',
          ...(actual
            ? [`encounter countdown ${formatTicksToClock(actual.ticksRemaining)}${actual.frozen ? ' (frozen)' : ''}`]
            : []),
        ].join(', ')}
      >
        <span className="zuk-set-timer__title">SET TIMER</span>
        <div className="zuk-set-timer__readout">
          <Countdown ticksRemaining={ticksRemaining} sampledAtTick={currentTick} running={running} />
          {actual && (
            <span className={`zuk-set-timer__actual${actual.frozen ? ' is-frozen' : ''}`}>
              <span className="zuk-set-timer__actual-label">actual</span>
              <span className="zuk-set-timer__actual-value">{formatTicksToClock(actual.ticksRemaining)}</span>
            </span>
          )}
        </div>
        {/* Every control keeps a permanent slot. Hiding the other two behind
            hover meant nothing on the resting surface said they existed, and on
            touch they could not be reached at all — two features undocumented in
            the product to save one row. */}
        <div className="zuk-set-timer__cue">
          {nextStep ? (
            keybinds.zukSetTimerAdvance ? (
              <KeyHint combo={keybinds.zukSetTimerAdvance} action={`${nextStep.action} ${nextStep.cue}`} />
            ) : (
              'Check timer keybindings'
            )
          ) : (
            <span className="zuk-set-timer__cue-text">Rolling every 3:30</span>
          )}
        </div>
        <div className="zuk-set-timer__controls">
          <KeyHint combo={keybinds.zukSetTimerReset} action="Reset" />
          <KeyHint combo={keybinds.zukSetTimerReveal} action={actual ? 'Hide' : 'Actual'} />
        </div>
      </div>
    </DraggablePanel>
  );
};
