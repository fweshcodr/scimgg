import type React from 'react';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { UIPosition } from '../hooks/usePersistedSettings';
import { BOSS_HEALTH_BAR_WIDTH } from './BossHealthBarOverlay';
import type { ExclusionRect } from './DraggablePanel';
import { DraggablePanel } from './DraggablePanel';
import { buildPrayerFlickTimeline, PRAYER_FLICK_BARS, type PrayerFlickMark } from './prayerFlick';
import { EMPTY_PRAYER_FLICK_SNAPSHOT, type PrayerFlickSnapshot, prayerFlickTimeline } from './prayerFlickTimeline';
import './PrayerFlickOverlay.css';

/**
 * Prayer Flick Helper — a sub-tick timing readout.
 *
 * Each bar is one game tick's window (600ms / speed). The running tick is on
 * top, the two behind it below, so a flicking rhythm reads down the stack.
 *
 * ONE CLICK IS ONE BLADE, standing on the bar's centerline at the moment inside
 * the tick it happened: up for a prayer going on, down for one going off. That
 * is the whole mark, and it is the whole mark whenever input lag is 0 (see
 * `PERSISTED_SETTINGS_DEFAULTS.inputLagMs`), so a click and
 * its arrival are the same instant and there is exactly one fact to draw.
 *
 * Configure input lag and the blade GROWS the rest: it stays on the arrival, and
 * a tail runs back along the centerline to a thin post at the click. When the
 * lag pushes an arrival past the tick boundary the object is cut at the bar edge
 * and resumes on the next tick's bar — the half that was clicked keeps its post
 * and loses its blade, the half that registered keeps its blade and loses its
 * post. Same mark throughout, disclosed by data that is actually there.
 *
 * Read-only: it consumes the timing store the UI layer fills, never simulation
 * state, and never queues input.
 */

/**
 * Panel geometry.
 * Width is the boss health bar's, shared rather than guessed, so overlays
 * stacked down the left edge share one measurement. Height is the sum of the
 * parts: a 16px caption row, 6px of separation, and three 34px bars 4px apart,
 * inside 4px/6px padding and the 1px border.
 */
const PANEL_WIDTH = BOSS_HEALTH_BAR_WIDTH;
export const PRAYER_FLICK_PANEL_HEIGHT = 144;
const PANEL_HEIGHT = PRAYER_FLICK_PANEL_HEIGHT;

/**
 * Default slot: top-left, clear of the boss health bar and the minimap. x clears the
 * top-left buttons (90px wide at 1x); both scale with the overlay size, so it stays clear.
 */
const DEFAULT_POSITION: UIPosition = { x: 104, y: 88, anchorX: 'left', anchorY: 'top' };

/**
 * Below this much of a tick, a click and its arrival are within a few pixels of
 * each other on a 190px track. Drawing a tail across that gap claims a precision
 * the panel does not have and turns a clean blade into a stub, so the mark stays
 * in its one-fact form instead. 0.03 of a tick is ~18ms, ~6px.
 */
const MIN_VISIBLE_TRAVEL = 0.03;

/** Where the resting key draws its two example blades. */
const EXAMPLE_ON = 0.22;
const EXAMPLE_OFF = 0.55;

const NO_SUBSCRIPTION = (): void => {};

function percent(fraction: number): string {
  return `${fraction * 100}%`;
}

/**
 * Subscribe to the timing store only while the plugin is on: a disabled overlay
 * holds no subscription, so the tick loop's per-tick publish costs nothing.
 */
function usePrayerFlickSnapshot(enabled: boolean): PrayerFlickSnapshot {
  const subscribe = useCallback(
    (onChange: () => void) => (enabled ? prayerFlickTimeline.subscribe(onChange) : NO_SUBSCRIPTION),
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? prayerFlickTimeline.getSnapshot() : EMPTY_PRAYER_FLICK_SNAPSHOT),
    [enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * One click on one bar.
 *
 * `left` is when the button went down and `width` is the lag it traveled, so a
 * zero-lag click is a zero-width span and draws as the blade alone. Everything
 * else is a modifier on that same element: `is-instant` for the one-fact form,
 * `is-inbound` / `is-outbound` for the two halves of a click that crossed the
 * tick boundary.
 */
const Mark: React.FC<{ mark: PrayerFlickMark }> = ({ mark }) => {
  const { clickFraction, arrivalFraction, kind, slipped } = mark;
  const start = clickFraction ?? 0;
  const end = arrivalFraction ?? 1;
  const travel = end - start;

  let className = `prayer-flick__event prayer-flick__event--${kind}`;
  if (slipped) className += ' is-carried';
  if (clickFraction === null) className += ' is-inbound';
  if (arrivalFraction === null) className += ' is-outbound';
  if (!slipped && travel < MIN_VISIBLE_TRAVEL) className += ' is-instant';

  return <span className={className} style={{ left: percent(start), width: percent(travel) }} />;
};

interface PrayerFlickOverlayProps {
  overlayScale?: number;
  enabled: boolean;
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

export const PrayerFlickOverlay: React.FC<PrayerFlickOverlayProps> = ({
  overlayScale = 1,
  enabled,
  position,
  onPositionChange,
  locked,
  editDrag,
  viewportWidth,
  viewportHeight,
  exclusionRects,
}) => {
  const snapshot = usePrayerFlickSnapshot(enabled);
  const timeline = useMemo(() => buildPrayerFlickTimeline(snapshot.clicks, snapshot.window), [snapshot]);
  if (!enabled) return null;

  // Nothing recorded yet: the stack teaches its two constants instead of sitting
  // blank. Which side of the line a blade stands on, and what one bar is worth.
  const resting = timeline.clickCount === 0;

  const label = resting
    ? `Prayer Flick Helper. No prayer clicks in the last ${PRAYER_FLICK_BARS} ticks.`
    : `Prayer Flick Helper. ${timeline.clickCount} prayer click${timeline.clickCount === 1 ? '' : 's'} in the last ${PRAYER_FLICK_BARS} ticks${timeline.slippedCount > 0 ? `, ${timeline.slippedCount} arrived on a later tick` : ''}.`;

  return (
    <DraggablePanel
      defaultPosition={DEFAULT_POSITION}
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
      altHintLabel="Prayer Flick Helper"
      dataTutorial="prayer-flick-overlay"
    >
      <div className="prayer-flick" role="img" aria-label={label}>
        <div className="prayer-flick__caption">
          <span className="prayer-flick__title">Prayer Flick Helper</span>
        </div>
        <div className="prayer-flick__bars" aria-hidden="true">
          {timeline.bars.map((bar, age) => (
            <div
              key={bar.tick}
              className={`prayer-flick__bar${bar.current ? ' is-current' : ''}`}
              style={{ '--prayer-flick-age': age } as React.CSSProperties}
            >
              {bar.current && timeline.durationMs > 0 && (
                // Keyed by tick so the sweep restarts from the left edge on every
                // tick boundary instead of continuing the previous tick's run.
                <span
                  key={bar.tick}
                  className="prayer-flick__elapsed"
                  style={{ animationDuration: `${timeline.durationMs}ms` }}
                />
              )}
              {resting && age === 0 && (
                <>
                  <span
                    className="prayer-flick__event prayer-flick__event--on is-instant is-example"
                    style={{ left: percent(EXAMPLE_ON) }}
                  />
                  <span className="prayer-flick__legend prayer-flick__legend--on" style={{ left: percent(EXAMPLE_ON) }}>
                    on
                  </span>
                  <span
                    className="prayer-flick__event prayer-flick__event--off is-instant is-example"
                    style={{ left: percent(EXAMPLE_OFF) }}
                  />
                  <span
                    className="prayer-flick__legend prayer-flick__legend--off"
                    style={{ left: percent(EXAMPLE_OFF) }}
                  >
                    off
                  </span>
                </>
              )}
              {resting && age === 1 && (
                <span className="prayer-flick__legend prayer-flick__legend--axis">each bar is one game tick</span>
              )}
              {bar.marks.map((mark) => (
                <Mark key={mark.id} mark={mark} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </DraggablePanel>
  );
};
