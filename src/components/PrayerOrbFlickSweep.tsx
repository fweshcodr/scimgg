import type React from 'react';
import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useDisplayTimeline } from '../contexts/DisplayTimelineContext';
import { ORB_CIRCLE_LEFT, ORB_CIRCLE_SIZE, ORB_CIRCLE_TOP } from './minimapOrbGeometry';
import type { PrayerFlickOrbSweep } from './prayerFlickOrb';
import { prayerFlickOrbSweep } from './prayerFlickOrb';

/**
 * The Prayer Flick Helper's sweep, drawn on the prayer orb.
 *
 * Mounted by `MinimapOrbs` only while the plugin's visibility gate is open, so
 * mounting and unmounting IS the on/off switch — a hidden sweep holds no
 * subscription and costs nothing.
 *
 * The geometry is borrowed rather than invented (`prayerFlickOrb.ts`, a port of
 * RuneLite's overlay), and so is the clock: the displayed timeline's interpolated
 * tick, the one clock live play and replay both publish. Reading wall time here
 * instead would run the line on to the tick's end while a pause or a scrub holds
 * the fight still — the one thing a timing instrument must never do.
 *
 * Frames go straight to the node's transform through an imperative subscription;
 * a `useSyncExternalStore` read of the same clock would re-render the orbs at
 * display rate.
 */

/**
 * RuneLite draws this line in `Color.CYAN` (`PrayerConfig.java:49-59`). Raw #00ffff is
 * the most saturated color that could be on screen and fights both the warm
 * pack chrome and the orb's own art, so the hue is kept and the saturation
 * pulled back into the band `--color-info` (#6898c0) already occupies: same
 * S/L, hue rotated from 207° to cyan.
 *
 * A literal rather than a color token, deliberately. The orbs reproduce the game
 * client's HUD rather than app chrome — `getOrbNumberColor` in `MinimapOrbs`
 * hard-codes its game-faithful ramp for the same reason — and the sprite art
 * under this line is indigo #443467 filled, near-black #0b0b0b drained.
 */
const SWEEP_COLOR = '#69c7d3';

/**
 * Hard 1px shadows either side, no blur. Mid-sweep the line crosses the orb's
 * near-white prayer icon, where cyan alone loses its contrast; this is the same
 * device the orb numbers use (`textShadow: '1px 1px 0 #000'`) and it keeps the
 * mark pixel-crisp instead of hazing it.
 */
const SWEEP_SHADOW = '1px 0 0 rgba(0, 0, 0, 0.75), -1px 0 0 rgba(0, 0, 0, 0.75)';

/**
 * What the line shows with no displayed timeline to sweep against — outside a
 * provider, or a replay whose history is not published yet. RuneLite's
 * equivalent is bailing out when it cannot find the orb widget. A zero-height
 * chord is the resting state the sweep already passes through at both ends of
 * every tick, so this shares the normal draw path instead of needing a branch
 * that writes its own transform.
 */
const HIDDEN_SWEEP: PrayerFlickOrbSweep = { x: 0, y: 0, height: 0 };

/**
 * Static, so the two elements below do not allocate a fresh style object on every
 * render. `MinimapOrbs` re-renders on every simulation state change, and none of
 * these values depend on one — the only thing that moves is the transform the
 * subscription writes straight to the node.
 */
const CLIP_STYLE: CSSProperties = {
  position: 'absolute',
  left: ORB_CIRCLE_LEFT,
  top: ORB_CIRCLE_TOP,
  width: ORB_CIRCLE_SIZE,
  height: ORB_CIRCLE_SIZE,
  overflow: 'hidden',
  pointerEvents: 'none',
};

const LINE_STYLE: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: 1,
  height: ORB_CIRCLE_SIZE,
  transform: 'scaleY(0)',
  transformOrigin: '0 0',
  background: SWEEP_COLOR,
  boxShadow: SWEEP_SHADOW,
};

export const PrayerOrbFlickSweep: React.FC = () => {
  const lineRef = useRef<HTMLSpanElement>(null);
  const timeline = useDisplayTimeline();

  // A layout effect, so the very first draw lands before the browser paints the
  // newly inserted span. With a plain effect the line's `scaleY(0)` initial style
  // gets one painted frame of its own, which reads as a blink at the moment the
  // sweep appears — exactly when the player has just turned a prayer on.
  useLayoutEffect(() => {
    // The last values written. The sweep is truncated to whole pixels, so a clock
    // write that lands on the geometry the previous one already drew has nothing
    // to show and is skipped — an identical write still costs a style parse and a
    // repaint of the orb. A 26px orb crossed over 600ms outruns a 60Hz frame every
    // time, so this saves nothing there, but it skips 13% of frames at 120Hz, 27%
    // at 144Hz and 49% at 240Hz: the faster the display, the more of its extra
    // frames are redundant.
    //
    // Seeded out of range so the first draw always writes.
    let lastX = -1;
    let lastY = -1;
    let lastHeight = -1;

    // Per-frame values go straight to the element's transform, never through
    // React state: this runs on every clock write for as long as a prayer is on.
    const draw = (): void => {
      const line = lineRef.current;
      if (!line) return;

      const snapshot = timeline?.getSnapshot();
      const sweep = snapshot
        ? prayerFlickOrbSweep(snapshot.tick - Math.floor(snapshot.tick), ORB_CIRCLE_SIZE)
        : HIDDEN_SWEEP;

      if (sweep.x === lastX && sweep.y === lastY && sweep.height === lastHeight) return;
      lastX = sweep.x;
      lastY = sweep.y;
      lastHeight = sweep.height;

      // scaleY over height: the chord changes every frame and transform is the
      // only way to express it without a layout pass.
      line.style.transform = `translate(${sweep.x}px, ${sweep.y}px) scaleY(${sweep.height / ORB_CIRCLE_SIZE})`;
    };

    draw();
    return timeline?.subscribe(draw);
  }, [timeline]);

  return (
    <div className="prayer-orb-flick-sweep" aria-hidden style={CLIP_STYLE}>
      {/* No prefers-reduced-motion guard, and that is deliberate — the rest of
          this codebase keeps its guards, including this plugin's own bar sweep.
          Here the motion is not decoration on top of a readout, it IS the
          readout: a still line carries no timing at all. */}
      <span ref={lineRef} style={LINE_STYLE} />
    </div>
  );
};
