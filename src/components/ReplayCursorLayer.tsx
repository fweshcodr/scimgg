import { type RefObject, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReplayFrameStore, useReplayPlayheadMs } from '../contexts/ReplayFrameContext';
import type { ReplayCursorTrack } from '../core/ReplayRecorder';
import { frameStartMs } from '../core/replayTimeline';
import { runSyntheticInput } from '../input/inputProvenance';
import { setWatchInputGated } from '../tutorial/runtime/tutorialInputBoundary';
import { getReplayPointerTarget, toElementClientPoint } from '../util/viewportBounds';
import { CursorArrow } from './cursors/PointerCursor';
import { ReplayClickMarker, ReplayHoldMarker } from './ReplayClickMarker';
import { REPLAY_CLICK_PIXEL_SCALE } from './replayClickVisuals';
import { interpolateCursor, projectActiveClicks, projectActiveHolds } from './replayCursorProjection';
import { type TapEdges, tapEdgesFor } from './replayTapDisc';
import { TooltipAPIContext } from './Tooltip/tooltipTypes';
import '../tutorial/components/DemoCursorLayer.css';
import './ReplayCursorLayer.css';

const REPLAY_CURSOR_INPUT_GATE_OWNER = Symbol('replay-cursor-input-gate');

export interface ReplayCursorLayerProps {
  readonly track: ReplayCursorTrack;
  readonly frameIndex: number;
  readonly isPlaying: boolean;
  readonly speedMultiplier: number;
  readonly playheadMs?: number;
  /**
   * Bumped by the caller whenever the rebuilt frame changes shape. Recorded
   * coordinates are unchanged by that, but the ELEMENT under them is not, so the
   * synthetic hover below has to be re-aimed even though the cursor has not moved.
   */
  readonly layoutRevision?: number;
}

export function ReplayCursorLayer({ track, frameIndex, playheadMs, layoutRevision = 0 }: ReplayCursorLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const tooltip = useContext(TooltipAPIContext);
  // In production the playhead advances every frame via ReplayFrameContext, so
  // this component (not Grid) re-renders per frame. Tests pass playheadMs as a
  // prop, which takes precedence.
  const storePlayheadMs = useReplayPlayheadMs();
  const replayStore = useReplayFrameStore();
  const replayMenuOpen = Boolean(replayStore?.getMenuState());
  const resolvedPlayheadMs =
    playheadMs ?? storePlayheadMs ?? frameStartMs(replayStore?.getSnapshot().history ?? [], frameIndex);
  const layoutAvailable = replayStore?.isTrackAvailable('presentationSamples', resolvedPlayheadMs) ?? true;
  const cursorAvailable = replayStore?.isTrackAvailable('cursorSamples', resolvedPlayheadMs) ?? true;
  const clicksAvailable = replayStore?.isTrackAvailable('cursorClicks', resolvedPlayheadMs) ?? true;
  const menuAvailable = replayStore?.isTrackAvailable('menuEvents', resolvedPlayheadMs) ?? true;

  const tapEdges = useTapEdges(layerRef, layoutRevision);

  useEffect(() => {
    setWatchInputGated(true, REPLAY_CURSOR_INPUT_GATE_OWNER);
    return () => {
      setWatchInputGated(false, REPLAY_CURSOR_INPUT_GATE_OWNER);
      tooltip?.hideTooltip();
    };
  }, [tooltip]);

  const cursor = layoutAvailable && cursorAvailable ? interpolateCursor(track, resolvedPlayheadMs) : null;
  const cursorX = cursor?.x;
  const cursorY = cursor?.y;
  const cursorIsTouch = cursor?.touch === true;
  const activeClicks = layoutAvailable && clicksAvailable ? projectActiveClicks(track, resolvedPlayheadMs) : [];
  const latestActiveClickOccurrence = activeClicks.at(-1)?.occurrence;
  // A hold needs the menu that marks it and the press sample that places it. Without a store
  // (isolated tests) there is no menu timeline, so no holds.
  const activeHolds =
    replayStore && layoutAvailable && cursorAvailable && menuAvailable
      ? projectActiveHolds(track, replayStore.getMenuEvents(), resolvedPlayheadMs)
      : [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: these revisions are re-aim triggers, not inputs. Recorded coordinates can stay fixed while replay content or a click changes what must be hovered beneath them.
  useEffect(() => {
    // A recorded finger hovered nothing, so it raises no hover and no hover tooltip here
    // either: the recorder saw none.
    if (
      replayMenuOpen ||
      !menuAvailable ||
      !layoutAvailable ||
      cursorIsTouch ||
      cursorX === undefined ||
      cursorY === undefined
    ) {
      tooltip?.hideTooltip();
      return;
    }
    if (typeof document.elementFromPoint !== 'function') return;
    const dispatchHover = () => {
      const layer = layerRef.current;
      if (!layer) return;
      const clientPoint = toElementClientPoint(layer, cursorX, cursorY);
      const target = getReplayPointerTarget(clientPoint.clientX, clientPoint.clientY);
      if (!target) {
        tooltip?.hideTooltip();
        return;
      }

      runSyntheticInput(() => {
        target.dispatchEvent(
          // MouseEvent rounds client coordinates; PointerEvent preserves scaled subpixels.
          new PointerEvent('mousemove', {
            pointerType: 'mouse',
            bubbles: true,
            button: 0,
            buttons: 0,
            cancelable: false,
            clientX: clientPoint.clientX,
            clientY: clientPoint.clientY,
          }),
        );
      });
    };
    dispatchHover();
    let resizeRaf = 0;
    const handleResize = () => {
      cancelAnimationFrame(resizeRaf);
      // The frame's new fit transform is committed after the resize event.
      resizeRaf = requestAnimationFrame(dispatchHover);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(resizeRaf);
    };
  }, [
    cursorX,
    cursorY,
    cursorIsTouch,
    frameIndex,
    latestActiveClickOccurrence,
    layoutRevision,
    replayMenuOpen,
    menuAvailable,
    layoutAvailable,
    tooltip,
  ]);

  return (
    <div
      ref={layerRef}
      className="replay-cursor-layer"
      aria-hidden="true"
      data-testid="replay-cursor-layer"
      data-tap-edges={tapEdges}
    >
      {/* A finger has no on-screen pointer between taps; the click markers show the taps. */}
      {cursor && !cursorIsTouch && (
        <div
          className="replay-cursor"
          data-testid="replay-cursor"
          style={{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)` }}
        >
          <CursorArrow />
        </div>
      )}
      {/* Beneath the clicks, so a tap on the opened menu's rows draws over any hold still showing. */}
      {activeHolds.map((hold) => (
        <ReplayHoldMarker key={hold.key} hold={hold} />
      ))}
      {activeClicks.map((click) => (
        <ReplayClickMarker key={click.key} click={click} />
      ))}
    </div>
  );
}

/**
 * How a touch tap's pixel disc is rasterized (see `tapEdgesFor`), from the device pixels one
 * art pixel covers: the frame's fitted scale times the screen's pixel ratio. Re-measured when
 * the frame refits (a resize, or the caller's layout revision) and when browser zoom changes
 * the pixel ratio, which also fires a resize.
 */
function useTapEdges(layerRef: RefObject<HTMLDivElement | null>, layoutRevision: number): TapEdges {
  const [tapEdges, setTapEdges] = useState<TapEdges>('smooth');
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutRevision is a re-measure trigger, not an input.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const measure = () => {
      const frameScale = layer.offsetWidth > 0 ? layer.getBoundingClientRect().width / layer.offsetWidth : 1;
      setTapEdges(tapEdgesFor(REPLAY_CLICK_PIXEL_SCALE * frameScale * (window.devicePixelRatio || 1)));
    };
    measure();
    let resizeRaf = 0;
    const handleResize = () => {
      cancelAnimationFrame(resizeRaf);
      // The frame's new fit transform is committed after the resize event.
      resizeRaf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(resizeRaf);
    };
  }, [layerRef, layoutRevision]);
  return tapEdges;
}
