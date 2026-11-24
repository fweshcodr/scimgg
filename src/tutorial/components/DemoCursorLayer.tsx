import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DemoPlayheadStore } from '../runtime/demoPlayheadStore';
import { tickBus } from '../runtime/tickBus';
import type { DemoCursorSession, DirectorPhase } from '../runtime/types';
import type { DemoCursorCue } from '../types';
import { dispatchSyntheticClick, elementCenter, resolveCursorElement } from './cursorTargets';
import { cursorStateAt } from './cursorTimeline';
import './DemoCursorLayer.css';
import { CursorArrow } from '../../components/cursors/PointerCursor';
import { TooltipCard } from '../../components/Tooltip/TooltipCard';
import { TOOLTIP_COLORS, type TooltipContent } from '../../components/Tooltip/tooltipTypes';
import { type SidebarInsets, uncoveredCentreX } from '../../util/viewportLayout';
import { isGameplayInputTarget, setWatchInputGated } from '../runtime/tutorialInputBoundary';

/** Default glide for ms-anchored cues. */
export const DEMO_CURSOR_DEFAULT_MOVE_MS = 900;
/** Target glide for tick-anchored cues — slow + smooth so the swap is easy to follow. */
const DEMO_CURSOR_GLIDE_MS = 1000;
const PRESS_MS = 220;

const demoNoopSubscribe = (): (() => void) => () => {};
/** Quick final approach into a click (the cursor is already settled on the target). */
const DEMO_CURSOR_CLICK_MOVE_MS = 150;
/** Dwell after the cursor arrives before it clicks, so the move reads as deliberate, ms. */
const DEMO_CURSOR_SETTLE_MS = 160;
/** Retry interval for an ms-anchored click cue that fired while the demo is paused. */
const PAUSE_RETRY_MS = 120;

interface CursorVisual {
  x: number;
  y: number;
  moveMs: number;
  visible: boolean;
  pressed: boolean;
  label: string | null;
}

/** Where the cursor starts its first glide from: low and centered in the room the sidebars leave. */
function restingVisual(sidebars: SidebarInsets | undefined): CursorVisual {
  const x = typeof window !== 'undefined' ? uncoveredCentreX(window.innerWidth, sidebars) : 0;
  const y = typeof window !== 'undefined' ? window.innerHeight * 0.82 : 0;
  return { x, y, moveMs: 0, visible: false, pressed: false, label: null };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function DemoCursorLayer({
  session,
  review = null,
  demoPlayheadStore,
  phase,
  uiScale,
  onRequiredTargetMissing,
  sidebarInsets,
}: {
  session: DemoCursorSession | null;
  review?: {
    cues: readonly import('../types').DemoCursorCue[];
    tickMs: number;
    playheadMs: number;
    blockInput?: boolean;
  } | null;
  /** Per-frame review playhead store. When present, drives the cursor at frame rate without re-rendering App. */
  demoPlayheadStore?: DemoPlayheadStore;
  phase: DirectorPhase;
  uiScale: number;
  onRequiredTargetMissing?: (label: string | null) => void;
  /** The open sidebars' window insets (App `uiInsets`). */
  sidebarInsets?: SidebarInsets;
}) {
  const [vis, setVis] = useState<CursorVisual>(() => restingVisual(sidebarInsets));
  // Latest insets, read when a session or review starts without restarting either.
  const sidebarInsetsRef = useRef(sidebarInsets);
  sidebarInsetsRef.current = sidebarInsets;
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const reviewCues = review?.cues;
  // Subscribe to the per-frame playhead store so only this component re-renders as the cursor glides.
  // Falls back to the prop value when no store is provided (isolated tests).
  const storePlayheadMs = useSyncExternalStore(
    demoPlayheadStore ? demoPlayheadStore.subscribe : demoNoopSubscribe,
    () => demoPlayheadStore?.getSnapshot(),
    () => undefined,
  );
  const reviewPlayheadMs = demoPlayheadStore ? storePlayheadMs : review?.playheadMs;
  const reviewTickMs = review?.tickMs;

  // Latest phase, read inside timers without re-subscribing the playback effect.
  const phaseRef = useRef<DirectorPhase>(phase);
  phaseRef.current = phase;

  // Latest missing-target callback, read inside timers without re-subscribing.
  const onMissingRef = useRef(onRequiredTargetMissing);
  onMissingRef.current = onRequiredTargetMissing;

  // ---- Playback ---------------------------------------------------------
  useEffect(() => {
    if (!session) return;
    const { track } = session;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let unsub: (() => void) | null = null;

    setVis(restingVisual(sidebarInsetsRef.current));
    setSpotlight(null);

    // Resolve targets at each cue so panel re-renders and resizes do not stale the destination.
    const doGlide = (cue: DemoCursorCue, moveMs: number): boolean => {
      if (cancelled) return false;
      const el = resolveCursorElement(cue.target);
      if (!el) {
        // Target not mounted yet (e.g. the prayer book is still opening). Return
        // failure so the tick driver retries next tick; the click stage reports a
        // genuinely-missing required target.
        return false;
      }
      const c = elementCenter(el);
      const rect = el.getBoundingClientRect();
      const pad = 6;
      setSpotlight({ x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 });
      setVis((v) => ({
        ...v,
        x: c.x,
        y: c.y,
        moveMs,
        visible: true,
        label: cue.label ?? null,
      }));
      return true;
    };

    // Arrive + click (re-resolve so a moved/late-mounted target is still hit).
    const doClick = (cue: DemoCursorCue) => {
      if (cancelled) return;
      const wantsClick = cue.click ?? true;
      // B1 (pause-aware): a click must LAND while the demo is actually running.
      // ms-anchored cues fire on wall-clock, so if the user paused before this
      // cue's time the click would otherwise be silently dropped — stranding
      // later cues (e.g. leaving the prayer book closed). Re-arm and retry on
      // resume instead of consuming the cue. `cancelled` (set on teardown) stops
      // the retry chain.
      if (wantsClick && phaseRef.current !== 'running') {
        timers.push(setTimeout(() => doClick(cue), PAUSE_RETRY_MS));
        return;
      }
      const el = resolveCursorElement(cue.target);
      if (!el) {
        // A missing REQUIRED target fails the step (the `required` contract in types.ts);
        // an optional one is skipped silently.
        if (cue.required ?? true) {
          warnMissing(cue);
          onMissingRef.current?.(cue.label ?? null);
        }
        return;
      }
      const c = elementCenter(el);
      setVis((v) => {
        // If the cursor is already gliding to this exact spot, DON'T restart the
        // transition with a fast 150ms move — let the in-flight glide finish so the
        // motion stays slow even if the click tick arrives early (e.g. at >1x speed).
        // Only do a quick corrective hop if the target actually moved since the glide.
        const moved = Math.hypot(c.x - v.x, c.y - v.y) > 2;
        return moved
          ? {
              ...v,
              x: c.x,
              y: c.y,
              moveMs: DEMO_CURSOR_CLICK_MOVE_MS,
              visible: true,
              pressed: wantsClick,
              label: cue.label ?? null,
            }
          : { ...v, visible: true, pressed: wantsClick, label: cue.label ?? null };
      });
      if (wantsClick) dispatchSyntheticClick(el);
      if (wantsClick) {
        timers.push(setTimeout(() => !cancelled && setVis((v) => ({ ...v, pressed: false })), PRESS_MS));
      }
    };

    // ms-anchored cues run on wall-clock setTimeout (e.g. open the prayer book
    // as the demo mounts). Glide so the cursor ARRIVES at the cue time.
    for (const cue of track.cues) {
      if (cue.time.kind !== 'ms') continue;
      const cueMs = cue.time.ms;
      const moveMs = cue.moveMs ?? DEMO_CURSOR_DEFAULT_MOVE_MS;
      timers.push(setTimeout(() => doGlide(cue, moveMs), Math.max(0, cueMs - moveMs)));
      timers.push(setTimeout(() => doClick(cue), Math.max(0, cueMs)));
    }

    // tick-anchored cues are driven by the ENGINE tick bus, so they land exactly
    // on the attack ticks regardless of wall-clock drift. We start the glide
    // `leadTicks` ticks before the click so a full, instructional-paced glide
    // fits inside the window and arrives with a brief settle before the tap.
    // doGlide is retried each tick until the target resolves (the prayer book
    // may still be opening), so starting early can never strand a cue.
    const tickMs = session.tickMs;
    const leadTicks = Math.max(1, Math.ceil((DEMO_CURSOR_GLIDE_MS + DEMO_CURSOR_SETTLE_MS) / tickMs));
    const tickCues = track.cues
      .filter((c) => c.time.kind === 'tick')
      .map((c) => ({ cue: c, clickTick: c.time.kind === 'tick' ? c.time.tick : 0, glided: false, clicked: false }));
    if (tickCues.length > 0) {
      unsub = tickBus.subscribe((engineTick) => {
        if (cancelled) return;
        for (const st of tickCues) {
          if (!st.glided && engineTick >= st.clickTick - leadTicks && engineTick < st.clickTick) {
            // Glide for the remaining window (minus a settle), capped at the
            // instructional target, so the move is slow and easy to follow.
            const windowMs = (st.clickTick - engineTick) * tickMs - DEMO_CURSOR_SETTLE_MS;
            const glideMs = Math.min(st.cue.moveMs ?? DEMO_CURSOR_GLIDE_MS, windowMs);
            if (doGlide(st.cue, glideMs)) st.glided = true;
          }
          if (!st.clicked && engineTick >= st.clickTick) {
            st.clicked = true;
            doClick(st.cue);
          }
        }
      });
    }

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      unsub?.();
    };
    // Restart only when the director publishes a new/cleared session (the
    // session reference is stable across unrelated director state updates).
  }, [session]);

  useEffect(() => {
    if (!reviewCues || reviewPlayheadMs === undefined || reviewTickMs === undefined) return;
    const st = cursorStateAt(reviewCues, reviewPlayheadMs, reviewTickMs);
    if (st === null) {
      setVis((v) => ({ ...v, visible: false }));
      setSpotlight(null);
      return;
    }
    const toEl = resolveCursorElement(st.toTarget);
    if (!toEl) {
      setVis((v) => ({ ...v, visible: false }));
      setSpotlight(null);
      return;
    }
    const toC = elementCenter(toEl);
    const fromEl = st.fromTarget ? resolveCursorElement(st.fromTarget) : null;
    const fromC = fromEl ? elementCenter(fromEl) : restingVisual(sidebarInsetsRef.current);
    const e = easeInOutCubic(st.t);
    const x = fromC.x + (toC.x - fromC.x) * e;
    const y = fromC.y + (toC.y - fromC.y) * e;
    setVis({ x, y, moveMs: 0, visible: true, pressed: st.pressed, label: st.label });
    const rect = toEl.getBoundingClientRect();
    const pad = 6;
    setSpotlight({ x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 });
  }, [reviewPlayheadMs, reviewCues, reviewTickMs]);

  // Stable across playhead frames (review is a fresh object each frame), so the
  // document listeners install once per gating session instead of thrashing 60x/s.
  const gateActive = (!!session && session.track.blockInput !== false) || (!!review && review.blockInput !== false);
  useEffect(() => {
    if (!gateActive) return;
    setWatchInputGated(true);

    // Only game hotkeys are blocked: those fire with focus on the body or a gameplay surface.
    const onKey = (e: KeyboardEvent) => {
      // Tab is not let through: it is a bindable game key, and the app never uses it for focus.
      if (e.key === 'Escape') return;
      if (e.target instanceof Element && e.target !== document.body && !isGameplayInputTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      setWatchInputGated(false);
    };
  }, [gateActive]);

  if (!session && !review) return null;

  // Keep the familiar tooltip on-screen: the prayer book sits bottom-right, so
  // flip the label to the cursor's left / above when it nears those edges, the
  // same way the game's own tooltip never runs off the viewport.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const flipLabelX = vw > 0 && vis.x > vw * 0.62;
  const flipLabelY = vh > 0 && vis.y > vh * 0.72;

  return (
    <>
      {/* Re-key the focus frame per target so its settle animation replays. */}
      {spotlight && (
        <div
          key={`${Math.round(spotlight.x)}:${Math.round(spotlight.y)}`}
          className="demo-cursor-spotlight"
          aria-hidden="true"
          style={{
            width: `${spotlight.w}px`,
            height: `${spotlight.h}px`,
            transform: `translate3d(${spotlight.x}px, ${spotlight.y}px, 0)`,
          }}
        />
      )}
      <div
        className="demo-cursor"
        data-visible={vis.visible}
        data-pressed={vis.pressed}
        style={{
          transform: `translate3d(${vis.x}px, ${vis.y}px, 0)`,
          transitionDuration: `${vis.moveMs}ms`,
        }}
        aria-hidden="true"
      >
        <div className="demo-cursor-scale" style={{ zoom: uiScale }}>
          <span className="demo-cursor-ring" />
          <CursorArrow />
          {vis.label && (
            <TooltipCard
              content={demoLabelContent(vis.label)}
              style={{
                position: 'absolute',
                zIndex: 3,
                left: flipLabelX ? '-10px' : '24px',
                top: flipLabelY ? '-10px' : '22px',
                transform: `translate(${flipLabelX ? '-100%' : '0'}, ${flipLabelY ? '-100%' : '0'})`,
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

function warnMissing(cue: DemoCursorCue): void {
  console.error('[DemoCursorLayer] target not found, skipping cue:', cue.target, cue.label ?? '');
}

/** OSRS tooltip shape: the context line is white and the trailing action line amber, so the color tokens read inverted here. */
function demoLabelContent(label: string): TooltipContent {
  const lines = label.split('\n');
  return {
    lines: lines.map((text, i) => {
      const isActionLine = lines.length > 1 && i === lines.length - 1;
      return { spans: [{ text, color: isActionLine ? TOOLTIP_COLORS.ui : TOOLTIP_COLORS.action }] };
    }),
  };
}
