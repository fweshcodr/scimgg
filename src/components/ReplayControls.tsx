import type React from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReplayChapter, ReplayChapterSet, ReplayLateTick } from '../core/replayTimeline';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import { TAKE_OVER_UNAVAILABLE_TEXT, type TakeOverUnavailableReason } from '../hooks/useReplay';
import { replayCaptureNotice } from '../replay/capturePresentation';
import type { ReplayCapture } from '../replay/format/capture';
import type { ReplayPracticeControls } from '../types/replayPractice';
import { ReplayWaveMarks, ReplayWavePicker, useChapterRailMetrics } from './ReplayWaves';
import {
  chapterIndexAtFrame,
  chapterRailCutLayer,
  chapterRailCuts,
  describeChapter,
  nextChapterFrame,
  previousChapterFrame,
} from './replayChapterNav';
import type { TooltipContent, TooltipLine } from './Tooltip';
import { useTooltip } from './Tooltip';
import { pointerHovers, useHoverCard } from './ui/HoverCard';
import { HoverHintButton, HoverHintRegion } from './ui/HoverHintControl';
import './ReplayControls.css';

export interface ReplayControlsProps {
  readonly replayPractice?: ReplayPracticeControls;
  readonly frameTicks?: readonly number[];
  readonly capture?: ReplayCapture;
  compact: boolean;
  /**
   * The secondary actions (cursor, Exit) wait behind one More button and open
   * as labeled buttons above the transport, which then needs only one row. Mobile's tool window,
   * whose stylesheet (MobileToolWindow.css) lays these out; the floating bars never set it.
   */
  moreMenu?: boolean;
  replayFrameIndex: number;
  totalFrames: number;
  /**
   * Ticks the recording ran late, oldest first; empty when none did. Each is marked on the seek
   * bar and counted in a warning beside the tick readout; an empty list draws nothing.
   */
  lateTicks?: readonly ReplayLateTick[];
  /** The encounter's named stretches of this replay (the Inferno); null or absent draws none. */
  chapters?: ReplayChapterSet | null;
  onExitReplay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onSeek: (frameIndex: number) => void;
  /** Renderer-only preview of a tick while the seek bar is being dragged. */
  onPreviewSeek: (frameIndex: number) => void;
  onPlayPause: () => void;
  isPlaying: boolean;
  onTakeOver: () => void;
  /** Non-null disables Take Over: this frame cannot be resumed. */
  takeOverUnavailableReason?: TakeOverUnavailableReason | null;
  /** Shown in the bar when a Take Over attempt was refused and the replay was left alone. */
  takeOverError?: string | null;
  /** Set when playback latched a failure: this history cannot be played, seeked or resumed. */
  playbackError?: string | null;
  replayCursorVisible: boolean;
  onReplayCursorVisibleChange: (visible: boolean) => void;
}

const blockNonLeftClick = (e: React.MouseEvent) => {
  if (e.button !== 0) e.preventDefault();
};

/** A form control (the tick field, the seek bar) keeps its keys: the transport's never reach it. */
const isFormField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

/** A clicked button keeps no focus, so Space stays play/pause instead of re-pressing it. */
const keepFocusOffButtons = (e: React.MouseEvent) => {
  if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
};

const IconSkipBack = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1="5" y1="4" x2="5" y2="20" />
  </svg>
);

const IconStepBack = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="19 20 9 12 19 4 19 20" />
  </svg>
);

const IconPlay = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);

const IconPause = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="5" y="3" width="5" height="18" rx="1" />
    <rect x="14" y="3" width="5" height="18" rx="1" />
  </svg>
);

const IconStepForward = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 4 15 12 5 20 5 4" />
  </svg>
);

const IconSkipForward = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="4" x2="19" y2="20" />
  </svg>
);

const IconCursor = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 4l7 16 2.5-7.5L21 10 4 4Z" />
    <path d="M13 13l5 5" />
  </svg>
);

const IconMore = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="3" y="10" width="4" height="4" />
    <rect x="10" y="10" width="4" height="4" />
    <rect x="17" y="10" width="4" height="4" />
  </svg>
);

const IconLateTick = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3 2 20h20L12 3Z" />
    <line x1="12" y1="10" x2="12" y2="13.5" />
    <line x1="12" y1="17" x2="12" y2="17" />
  </svg>
);

/** Chapter back and forward. A bare chevron, so neither is read as the transport's end jumps. */
const IconWaveBack = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 5 8 12 15 19" />
  </svg>
);

const IconWaveForward = () => (
  <svg
    aria-hidden="true"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 5 16 12 9 19" />
  </svg>
);

const NO_LATE_TICKS: readonly ReplayLateTick[] = [];
const NO_CHAPTERS: readonly ReplayChapter[] = [];
/** Worst late ticks the warning's tooltip names before it summarizes the rest. */
const LATE_TICK_TIP_LIMIT = 5;
/** How far, in screen pixels, the pointer may sit from a seek-bar marker and still name it. */
const LATE_MARK_HIT_PX = 4;

const lateTickCount = (count: number) => `${count} late tick${count === 1 ? '' : 's'}`;
const lateTickMs = (tick: ReplayLateTick) => `${Math.round(tick.lateByMs)} ms late`;
const lateTickLine = (tick: ReplayLateTick, frameTicks?: readonly number[]) => ({
  spans: [
    { text: `Tick ${frameTicks?.[tick.frameIndex] ?? tick.frameIndex + 1}`, color: '#f0b878' },
    { text: ` ran ${lateTickMs(tick)}`, color: '#e8dcc8' },
  ],
});

/** The warning's copy: the count, why it matters, and the worst ticks, worst first. */
function describeLateTicks(lateTicks: readonly ReplayLateTick[], frameTicks?: readonly number[]) {
  const worstFirst = [...lateTicks].sort((a, b) => b.lateByMs - a.lateByMs || a.frameIndex - b.frameIndex);
  const worst = worstFirst[0];
  if (!worst) return null;
  // A colon, not a dash: the RuneScape faces draw an em dash as a long double bar.
  const headline = `${lateTickCount(lateTicks.length)}: the game stalled during this run`;
  const worstText = `Worst: tick ${frameTicks?.[worst.frameIndex] ?? worst.frameIndex + 1}, ${lateTickMs(worst)}.`;
  const named = worstFirst.slice(0, LATE_TICK_TIP_LIMIT);
  const unnamed = lateTicks.length - named.length;
  const tip: TooltipContent = {
    lines: [
      { spans: [{ text: headline, color: '#e8dcc8' }] },
      ...named.map((tick) => lateTickLine(tick, frameTicks)),
      ...(unnamed > 0 ? [{ spans: [{ text: `and ${unnamed} more`, color: '#c8b89c' }] }] : []),
    ],
  };
  return { count: lateTicks.length, sentence: `${headline}. ${worstText}`, tip };
}

export const ReplayControls: React.FC<ReplayControlsProps> = ({
  capture,
  compact,
  moreMenu = false,
  replayFrameIndex,
  totalFrames,
  lateTicks = NO_LATE_TICKS,
  chapters = null,
  onExitReplay,
  onStepBack,
  onStepForward,
  onJumpToStart,
  onJumpToEnd,
  onSeek,
  onPreviewSeek,
  onPlayPause,
  isPlaying,
  onTakeOver,
  takeOverUnavailableReason = null,
  takeOverError = null,
  playbackError = null,
  replayCursorVisible,
  onReplayCursorVisibleChange,
  replayPractice,
  frameTicks,
}) => {
  const tickAt = (index: number) => frameTicks?.[index] ?? index + 1;
  const [tickDraft, setTickDraftState] = useState<string | null>(null);
  const tickDraftRef = useRef<string | null>(null);
  const tickInputRef = useRef<HTMLInputElement>(null);
  const setTickDraft = useCallback((draft: string | null) => {
    tickDraftRef.current = draft;
    setTickDraftState(draft);
  }, []);
  const [dragValue, setDragValue] = useState<number | null>(null);
  // Release commits through a parent transition; retain its exact index until props catch up.
  const pendingSeekRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  // A newer transport intent may interrupt the seek's parent transition entirely.
  // Retire its local selection and queued preview before dispatching the new intent.
  const runTransportAction = useCallback(
    (action: () => void) => {
      setTickDraft(null);
      pendingSeekRef.current = null;
      setDragValue(null);
      lastValueRef.current = null;
      pendingPreviewRef.current = null;
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
      action();
    },
    [setTickDraft],
  );
  const selectedFrameIndex = pendingSeekRef.current ?? dragValue ?? replayFrameIndex;
  const tickFieldId = useId();
  const currentTick = tickAt(replayFrameIndex);
  const indexForTick = (text: string) =>
    Number(text) === currentTick ? replayFrameIndex : frameTicks ? frameTicks.indexOf(Number(text)) : Number(text) - 1;
  const tickText = tickDraft ?? String(tickAt(selectedFrameIndex));
  const candidateIndex = tickDraft === null ? selectedFrameIndex : indexForTick(tickDraft);
  const validCandidate = /^\d+$/.test(tickText.trim()) && candidateIndex >= 0 && candidateIndex < totalFrames;
  const tickError = validCandidate
    ? null
    : `Enter a recorded tick from ${tickAt(0)} to ${tickAt(Math.max(0, totalFrames - 1))}.`;
  // A real playhead change replaces the draft; a new array identity must not erase invalid typing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change of frame or actual tick resets the field.
  useEffect(() => setTickDraft(null), [replayFrameIndex, currentTick, setTickDraft]);
  const captureNotice = useMemo(() => replayCaptureNotice(capture), [capture]);
  const controlsBlocked = playbackError !== null || Boolean(replayPractice?.busy);
  // More opens the replay's actions that do not fit the one row.
  const [moreOpen, setMoreOpen] = useState(false);
  const hasMore = moreMenu || compact;
  const showActions = !hasMore || moreOpen;

  // The encounter's chapters (an Inferno run's waves): the readout and its two jumps beside the
  // tick, the boundary cuts and landmark marks on the rail, and the picker the readout opens. A
  // replay whose encounter names none is the bar exactly as it was, so everything here is skipped.
  const chapterList = chapters?.chapters ?? NO_CHAPTERS;
  const hasChapters = chapterList.length > 0;
  const canPickWave = hasChapters && chapterList.length > 1;
  const currentChapterIndex = chapterIndexAtFrame(chapterList, selectedFrameIndex);
  const currentChapter = chapterList[currentChapterIndex] ?? null;
  const landmarks = useMemo(() => chapterList.filter((chapter) => chapter.landmark), [chapterList]);
  const [wavePickerOpen, setWavePickerOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const wavePanelRef = useRef<HTMLFieldSetElement>(null);
  const waveToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!canPickWave) setWavePickerOpen(false);
  }, [canPickWave]);
  // Placed against its own toggle rather than the bar's edge, so the panel reads as that control's
  // and not as another More. Whole pixels, or every figure in it resamples; clamped to the bar,
  // which is the one surface it may not hang off. The Mobile tool window lays it out as a row of
  // the band instead, and says so by not positioning it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening is what mounts the panel this measures.
  useLayoutEffect(() => {
    const panel = wavePanelRef.current;
    const toggle = waveToggleRef.current;
    const bar = barRef.current;
    if (!panel || !toggle || !bar) return;
    if (getComputedStyle(panel).position !== 'absolute') {
      panel.style.left = '';
      return;
    }
    const inset = parseFloat(getComputedStyle(bar).getPropertyValue('--replay-inset')) || 0;
    const furthest = Math.max(inset, bar.clientWidth - panel.offsetWidth - inset);
    // Less the panel's own padding, so its first column lines up with the label's left edge.
    const wanted = toggle.offsetLeft - 8;
    panel.style.left = `${Math.round(Math.min(Math.max(inset, wanted), furthest))}px`;
  }, [wavePickerOpen]);
  // A press anywhere else closes it, as it closes the app's hover cards. The toggle is excluded:
  // its own click would otherwise reopen what this just closed.
  useEffect(() => {
    if (!wavePickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wavePanelRef.current?.contains(target) || waveToggleRef.current?.contains(target)) return;
      setWavePickerOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [wavePickerOpen]);

  // Escape, the one key a latched playback failure leaves working. It is the lowest layer on the
  // shared stack (useEscapeLayer), so anything open over the replay (Practice, the menu, a drawer,
  // the encounter search) closes first and one press does one thing. An open More closes before the
  // replay exits. The wave picker goes first: it is the topmost thing the bar itself opens.
  useEscapeLayer(ESC_PRIORITY.REPLAY, true, (e) => {
    if (isFormField(e.target)) return false;
    if (wavePickerOpen) setWavePickerOpen(false);
    else if (moreOpen) setMoreOpen(false);
    else onExitReplay();
  });
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (isFormField(target)) return;
      if (target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;

      const dispatch = (action: () => void) => {
        e.preventDefault();
        if (!controlsBlocked) {
          runTransportAction(action);
        }
      };
      switch (e.key) {
        case ' ':
          dispatch(onPlayPause);
          break;
        case 'ArrowLeft':
          dispatch(onStepBack);
          break;
        case 'ArrowRight':
          dispatch(onStepForward);
          break;
        case 'Home':
          dispatch(onJumpToStart);
          break;
        case 'End':
          dispatch(onJumpToEnd);
          break;
      }
    },
    [controlsBlocked, onPlayPause, onStepBack, onStepForward, onJumpToStart, onJumpToEnd, runTransportAction],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scrubbing.
  //
  // A range input emits one `input` per pointer sample, so a drag with a 125Hz
  // mouse produces ~125 values/second. Committing each one through onSeek swaps
  // the displayed tick in React state, which re-renders the whole simulator tree
  // (App -> GridProviders -> Grid -> chrome/panels) at ~30-40ms a go. That is what
  // made dragging the bar lag: no amount of throttling fixes it, because even one
  // commit per frame overruns the frame budget.
  //
  // So a drag never commits. It publishes the previewed tick to the replay frame
  // store (onPreviewSeek), which re-renders only the 3D viewport, and can
  // therefore track the pointer at full frame rate. Releasing commits once, and
  // the chrome/panels catch up in that single render.
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onPreviewSeekRef = useRef(onPreviewSeek);
  onPreviewSeekRef.current = onPreviewSeek;

  const flushPreview = useCallback(() => {
    previewFrameRef.current = null;
    const next = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (next !== null) onPreviewSeekRef.current(next);
  }, []);

  // One preview per animation frame: you cannot show more than one frame per
  // frame, and it keeps the viewport re-render off the pointer-event path.
  const queueSeek = useCallback(
    (value: number) => {
      setTickDraft(null);
      pendingSeekRef.current = value;
      setDragValue(value);
      lastValueRef.current = value;
      pendingPreviewRef.current = value;
      if (previewFrameRef.current === null) {
        previewFrameRef.current = requestAnimationFrame(flushPreview);
      }
    },
    [flushPreview, setTickDraft],
  );

  // Release: the one and only full commit, landing exactly where the pointer did.
  const commitSelectedFrame = useCallback((next: number | null) => {
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    pendingPreviewRef.current = null;
    lastValueRef.current = null;
    if (next !== null) {
      pendingSeekRef.current = next;
      setDragValue(next);
      onSeekRef.current(next);
    }
  }, []);
  const commitSeekNow = useCallback(() => commitSelectedFrame(lastValueRef.current), [commitSelectedFrame]);

  // A range input captures the pointer, but a drag can still end off-element
  // (pointer canceled, window blurred). Never leave a preview uncommitted.
  useEffect(() => {
    const finish = () => {
      if (lastValueRef.current !== null) commitSeekNow();
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
    };
  }, [commitSeekNow]);

  // Once the committed index catches up, hand control of the thumb back to props
  // so playback and the transport buttons drive it again.
  useEffect(() => {
    if (dragValue !== null && dragValue === replayFrameIndex && pendingSeekRef.current === replayFrameIndex) {
      pendingSeekRef.current = null;
      setDragValue(null);
    }
  }, [dragValue, replayFrameIndex]);

  const seekValue = selectedFrameIndex;

  const isAtStart = replayFrameIndex <= 0;
  const isAtEnd = replayFrameIndex >= totalFrames - 1;
  const progress = totalFrames > 1 ? (seekValue / (totalFrames - 1)) * 100 : 0;

  // Late ticks: a marker on the seek bar for each, and one warning that counts them. Everything
  // here is skipped when none ran late, so an on-time recording's bar is unchanged.
  const { bindTooltip, hideTooltip } = useTooltip();
  const lateSummary = useMemo(() => describeLateTicks(lateTicks, frameTicks), [lateTicks, frameTicks]);
  const lateByFrame = useMemo(() => new Map(lateTicks.map((tick) => [tick.frameIndex, tick])), [lateTicks]);
  const lateWarningTip = bindTooltip(lateSummary?.tip ?? null);
  // The markers sit under the slider, so the slider itself names what is under the pointer: the
  // wave anywhere along the rail, and the late tick when the pointer is on one of those marks.
  // One tooltip for both, since a late tick inside a wave is one answer, not two competing ones.
  const hoveredLateRef = useRef<ReplayLateTick | null>(null);
  const hoveredChapterRef = useRef<ReplayChapter | null>(null);
  const seekHoverTip = bindTooltip(() => {
    const lines: TooltipLine[] = [];
    const chapter = hoveredChapterRef.current;
    if (chapter) {
      lines.push({
        spans: [
          { text: chapter.label, color: '#f0b878' },
          ...(chapter.attempt > 1 ? [{ text: `, attempt ${chapter.attempt}`, color: '#c8b89c' }] : []),
        ],
      });
      if (chapter.detail) lines.push({ spans: [{ text: chapter.detail, color: '#e8dcc8' }] });
    }
    if (hoveredLateRef.current) lines.push(lateTickLine(hoveredLateRef.current, frameTicks));
    return lines.length > 0 ? { lines } : null;
  });
  const restartMarkRef = useRef<HTMLSpanElement>(null);
  const restartHintId = useId();
  const [restartHintOpen, setRestartHintOpen] = useState(false);
  const { card: restartHint } = useHoverCard({
    anchorRef: restartMarkRef,
    cardId: restartHintId,
    content: `Restart: tick ${replayPractice?.startTick}`,
    placement: 'above',
    forceOpen: restartHintOpen && replayPractice?.startFrameIndex != null,
    onDismiss: () => setRestartHintOpen(false),
    openOnFocus: false,
    regionTouch: false,
    dismissOnPress: true,
    cardClassName: 'hover-card--instant',
  });
  // The nub never intercepts a seek gesture. The slider supplies its hover region instead,
  // below the rail so a late-tick marker at the same index still has its own hint above it.
  const pointerNearRestart = (clientX: number, clientY: number) => {
    const rect = restartMarkRef.current?.getBoundingClientRect();
    return Boolean(
      rect &&
        Math.abs(clientX - (rect.left + rect.width / 2)) <= 6 &&
        clientY >= rect.top - 1 &&
        clientY <= rect.bottom + 3,
    );
  };
  const lateTickAtPointer = (input: HTMLInputElement, clientX: number): ReplayLateTick | null => {
    if (totalFrames < 2) return null;
    const rect = input.getBoundingClientRect();
    // Markers sit where the thumb's center would: its half-width in from each end. The rect is
    // in screen pixels and the thumb width in CSS pixels, so scale it by the bar's zoom.
    const zoom = input.offsetWidth > 0 ? rect.width / input.offsetWidth : 1;
    const thumb = (parseFloat(getComputedStyle(input).getPropertyValue('--seek-thumb')) || 0) * zoom;
    const span = rect.width - thumb;
    let nearest: ReplayLateTick | null = null;
    let nearestPx = LATE_MARK_HIT_PX;
    for (const tick of lateTicks) {
      const x = rect.left + thumb / 2 + (span * tick.frameIndex) / (totalFrames - 1);
      const px = Math.abs(x - clientX);
      if (px <= nearestPx) {
        nearest = tick;
        nearestPx = px;
      }
    }
    return nearest;
  };
  /** The frame the pointer is over, in the same thumb-inset coordinates as the markers. */
  const frameAtPointer = (input: HTMLInputElement, clientX: number): number | null => {
    if (totalFrames < 2) return null;
    const rect = input.getBoundingClientRect();
    const zoom = input.offsetWidth > 0 ? rect.width / input.offsetWidth : 1;
    const thumb = (parseFloat(getComputedStyle(input).getPropertyValue('--seek-thumb')) || 0) * zoom;
    const span = rect.width - thumb;
    if (span <= 0) return null;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - thumb / 2) / span));
    return Math.round(ratio * (totalFrames - 1));
  };
  const seekHoverHandlers =
    lateSummary || hasChapters
      ? {
          'data-tooltip-bound': seekHoverTip['data-tooltip-bound'],
          onMouseMove: (e: React.MouseEvent<HTMLInputElement>) => {
            const nearRestart = pointerNearRestart(e.clientX, e.clientY);
            // Not while dragging: the thumb is the subject then, not what it passes over, and the
            // wave readout beside the tick already follows the drag.
            const reading = e.buttons === 0 && !nearRestart;
            const nextLate = reading && lateSummary ? lateTickAtPointer(e.currentTarget, e.clientX) : null;
            const frame = reading && hasChapters ? frameAtPointer(e.currentTarget, e.clientX) : null;
            const nextChapter = frame === null ? null : (chapterList[chapterIndexAtFrame(chapterList, frame)] ?? null);
            if (nextLate !== hoveredLateRef.current || nextChapter !== hoveredChapterRef.current) {
              hoveredLateRef.current = nextLate;
              hoveredChapterRef.current = nextChapter;
              hideTooltip();
            }
            if (nearRestart) {
              hideTooltip();
              return;
            }
            seekHoverTip.onMouseMove(e);
          },
          onMouseLeave: () => {
            hoveredLateRef.current = null;
            hoveredChapterRef.current = null;
            seekHoverTip.onMouseLeave();
          },
        }
      : {};
  const lateHere = lateByFrame.get(seekValue);

  // The rail's boundary cuts, measured once per chapter set and rail width (never per frame).
  const seekRef = useRef<HTMLInputElement>(null);
  const railMetrics = useChapterRailMetrics(seekRef, canPickWave);
  const railCutLayer = useMemo(() => {
    if (!railMetrics) return null;
    const { cuts, cutPx } = chapterRailCuts(chapterList, totalFrames, railMetrics);
    return chapterRailCutLayer(cuts, cutPx);
  }, [chapterList, totalFrames, railMetrics]);
  const jumpToFrame = (frame: number | null) => {
    if (frame === null || controlsBlocked) return;
    runTransportAction(() => {
      tickInputRef.current?.blur();
      onSeek(frame);
    });
  };
  const previousWaveFrame = canPickWave ? previousChapterFrame(chapterList, seekValue) : null;
  const nextWaveFrame = canPickWave ? nextChapterFrame(chapterList, seekValue) : null;
  // Outside every chapter (a recording whose first frames carry no snapshot) the readout names the
  // set rather than a wave, and the picker is still the way into one.
  const waveText = currentChapter?.label ?? chapters?.title ?? '';

  const playLabel = isPlaying ? 'Pause replay' : 'Play replay';

  const actionsBlocked = controlsBlocked || !validCandidate;
  const commitTick = () => {
    const draft = tickDraftRef.current;
    const selected = draft === null ? (pendingSeekRef.current ?? dragValue ?? replayFrameIndex) : indexForTick(draft);
    const valid = selected >= 0 && selected < totalFrames && (draft === null || /^\d+$/.test(draft.trim()));
    if (controlsBlocked || !valid) return false;
    // Retire any queued drag preview before synchronously seeking the exact displayed index.
    commitSelectedFrame(selected);
    setTickDraft(null);
    return true;
  };
  // The point's selected frame. Playing tick T forks at T−1, so a just-restored branch can end one
  // frame before it; the marker then sits at the end of the track until T is recorded again.
  const pointFrame = replayPractice?.startFrameIndex ?? null;
  // Selected vs selected: a takeover at C forks at C−1, which drops the point's anchor only when C < it.
  const clearsRestartPoint = pointFrame !== null && validCandidate && candidateIndex < pointFrame;
  const restartWarning = clearsRestartPoint
    ? `Taking over here clears restart tick ${replayPractice?.startTick}.`
    : null;
  // Progress and saved metadata must not grow the bar during a successful handoff.
  const actionError = playbackError ?? tickError ?? takeOverError ?? replayPractice?.error ?? null;

  const seekRow = (
    <div className="replay-seek-row">
      <div className="replay-seek-track">
        {lateSummary && totalFrames > 1 && (
          <div className="replay-late-marks" aria-hidden="true">
            {lateTicks.map((tick) => (
              <span
                key={tick.frameIndex}
                className="replay-late-mark"
                style={{ '--at': tick.frameIndex / (totalFrames - 1) } as React.CSSProperties}
              />
            ))}
          </div>
        )}
        {hasChapters && <ReplayWaveMarks landmarks={landmarks} totalFrames={totalFrames} />}
        {pointFrame !== null && totalFrames > 0 && (
          <span
            ref={restartMarkRef}
            className="replay-restart-mark"
            role="img"
            aria-label={`Restart: tick ${replayPractice?.startTick}`}
            style={{ '--at': Math.min(1, pointFrame / Math.max(1, totalFrames - 1)) } as React.CSSProperties}
          />
        )}
        <input
          ref={seekRef}
          type="range"
          className="replay-seek"
          aria-label="Seek replay"
          aria-valuetext={`Tick ${tickAt(seekValue)} of ${tickAt(Math.max(0, totalFrames - 1))}${currentChapter ? `, ${currentChapter.label}` : ''}${lateHere ? `, ran ${lateTickMs(lateHere)}` : ''}`}
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={seekValue}
          disabled={controlsBlocked}
          onChange={(e) => queueSeek(parseInt(e.target.value, 10))}
          onPointerUp={commitSeekNow}
          onPointerMove={(event) =>
            setRestartHintOpen(
              pointerHovers(event.pointerType) &&
                event.buttons === 0 &&
                pointerNearRestart(event.clientX, event.clientY),
            )
          }
          onPointerLeave={() => setRestartHintOpen(false)}
          onPointerDown={() => setRestartHintOpen(false)}
          onKeyUp={commitSeekNow}
          onBlur={commitSeekNow}
          onMouseDown={blockNonLeftClick}
          {...seekHoverHandlers}
          style={
            {
              '--seek-progress': `${progress}%`,
              ...(railCutLayer ? { '--seek-waves': railCutLayer } : {}),
            } as React.CSSProperties
          }
        />
      </div>
      {restartHint}
    </div>
  );

  return (
    <div
      onMouseDown={(event) => {
        keepFocusOffButtons(event);
        if (
          event.button === 0 &&
          event.target instanceof Element &&
          event.target.closest('.replay-transport button:not(:disabled)')
        ) {
          // Discard, like Escape: clear the ref before blur so onBlur cannot commit
          // the old draft over the transport action. The button still takes no focus.
          setTickDraft(null);
          tickInputRef.current?.blur();
        }
      }}
      ref={barRef}
      className={`replay-bar ${compact ? 'replay-bar--compact' : 'replay-bar--full'}${hasMore ? ' replay-bar--more-menu' : ''}${hasMore && moreOpen ? ' replay-bar--more-open' : ''}`}
      role="toolbar"
      aria-busy={Boolean(replayPractice?.busy)}
      data-replay-viewer-chrome=""
      aria-label="Replay controls"
    >
      {seekRow}

      {captureNotice && (
        <div className="replay-capture-notice" role="status">
          {captureNotice}
        </div>
      )}

      <div className="replay-controls-row">
        {/* Transport: playback only. Nothing that leaves the playhead where it is belongs in
            this cluster — its meaning comes from being an unbroken sequence. */}
        <div className="replay-transport">
          {!compact && (
            <HoverHintButton
              type="button"
              className="replay-btn"
              aria-label="Jump to first tick"
              hintPlacement="above"
              onClick={() => runTransportAction(onJumpToStart)}
              disabled={isAtStart || controlsBlocked}
              onMouseDown={blockNonLeftClick}
            >
              <IconSkipBack />
            </HoverHintButton>
          )}
          <HoverHintButton
            type="button"
            className="replay-btn"
            aria-label="Previous tick"
            hintPlacement="above"
            onClick={() => runTransportAction(onStepBack)}
            disabled={isAtStart || controlsBlocked}
            onMouseDown={blockNonLeftClick}
          >
            <IconStepBack />
          </HoverHintButton>
          <HoverHintButton
            type="button"
            className="replay-btn replay-btn--play"
            aria-label={playLabel}
            hintPlacement="above"
            onClick={() => runTransportAction(onPlayPause)}
            disabled={controlsBlocked}
            onMouseDown={blockNonLeftClick}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </HoverHintButton>
          <HoverHintButton
            type="button"
            className="replay-btn"
            aria-label="Next tick"
            hintPlacement="above"
            onClick={() => runTransportAction(onStepForward)}
            disabled={isAtEnd || controlsBlocked}
            onMouseDown={blockNonLeftClick}
          >
            <IconStepForward />
          </HoverHintButton>
          {!compact && (
            <HoverHintButton
              type="button"
              className="replay-btn"
              aria-label="Jump to last tick"
              hintPlacement="above"
              onClick={() => runTransportAction(onJumpToEnd)}
              disabled={isAtEnd || controlsBlocked}
              onMouseDown={blockNonLeftClick}
            >
              <IconSkipForward />
            </HoverHintButton>
          )}
        </div>

        {/* The coarse coordinate, before the tick: which wave, a step either way, and the list.
            One chapter is a readout only, since there is nowhere else to step or jump to. */}
        {hasChapters && (
          <div className="replay-wave">
            {canPickWave ? (
              <>
                <HoverHintButton
                  type="button"
                  className="replay-btn replay-wave__step"
                  aria-label="Previous wave"
                  hintPlacement="above"
                  onClick={() => jumpToFrame(previousWaveFrame)}
                  disabled={previousWaveFrame === null || controlsBlocked}
                  onMouseDown={blockNonLeftClick}
                >
                  <IconWaveBack />
                </HoverHintButton>
                <HoverHintButton
                  ref={waveToggleRef}
                  type="button"
                  className={`replay-wave__label${wavePickerOpen ? ' replay-wave__label--open' : ''}`}
                  aria-label={currentChapter ? `${describeChapter(currentChapter)}. Choose a wave` : 'Choose a wave'}
                  hint={wavePickerOpen ? null : 'Choose a wave'}
                  hintPlacement="above"
                  aria-expanded={wavePickerOpen}
                  disabled={controlsBlocked}
                  onClick={() => {
                    setMoreOpen(false);
                    setWavePickerOpen((open) => !open);
                  }}
                  onMouseDown={blockNonLeftClick}
                >
                  {waveText}
                </HoverHintButton>
                <HoverHintButton
                  type="button"
                  className="replay-btn replay-wave__step"
                  aria-label="Next wave"
                  hintPlacement="above"
                  onClick={() => jumpToFrame(nextWaveFrame)}
                  disabled={nextWaveFrame === null || controlsBlocked}
                  onMouseDown={blockNonLeftClick}
                >
                  <IconWaveForward />
                </HoverHintButton>
              </>
            ) : (
              <span
                className="replay-wave__label replay-wave__label--static"
                role="note"
                aria-label={currentChapter ? describeChapter(currentChapter) : waveText}
              >
                {waveText}
              </span>
            )}
          </div>
        )}
        {wavePickerOpen && chapters && (
          <ReplayWavePicker
            chapterSet={chapters}
            currentIndex={currentChapterIndex}
            panelRef={wavePanelRef}
            onPick={(chapter) => {
              setWavePickerOpen(false);
              jumpToFrame(chapter.startFrame);
            }}
          />
        )}

        <div className="replay-tick">
          <label className="replay-tick-label" htmlFor={tickFieldId}>
            Tick
          </label>
          <input
            ref={tickInputRef}
            className="replay-tick-input"
            id={tickFieldId}
            type="text"
            inputMode="numeric"
            aria-label="Replay tick"
            aria-invalid={!validCandidate}
            aria-describedby={actionError ? `${tickFieldId}-message` : undefined}
            value={tickText}
            style={{ width: `${Math.max(3, String(tickAt(Math.max(0, totalFrames - 1))).length)}ch` }}
            disabled={controlsBlocked}
            onFocus={() => {
              if (isPlaying) onPlayPause();
            }}
            onChange={(event) => {
              const value = event.target.value;
              setTickDraft(value);
              const index = indexForTick(value);
              if (/^\d+$/.test(value.trim()) && index >= 0 && index < totalFrames) commitSelectedFrame(index);
            }}
            onBlur={() => {
              if (tickDraftRef.current !== null) commitTick();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (!actionsBlocked) event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setTickDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
          <span className="replay-tick-of">
            <span className="replay-tick-sep">/</span>
            <span className="replay-tick-total">{tickAt(Math.max(0, totalFrames - 1))}</span>
          </span>
        </div>
        {lateSummary && (
          <span
            className="replay-late"
            role="note"
            aria-label={lateSummary.sentence}
            data-tooltip-bound={lateWarningTip['data-tooltip-bound']}
            onMouseEnter={lateWarningTip.onMouseEnter}
            onMouseMove={lateWarningTip.onMouseMove}
            onMouseLeave={lateWarningTip.onMouseLeave}
          >
            <IconLateTick />
            <span className="replay-late__count" aria-hidden="true">
              {lateSummary.count}
              {!compact && ' late'}
            </span>
          </span>
        )}

        {hasMore && (
          <HoverHintButton
            type="button"
            className={`replay-more-toggle${moreOpen ? ' replay-more-toggle--open' : ''}`}
            aria-label="More replay actions"
            hintPlacement="above"
            aria-expanded={moreOpen}
            onClick={() => {
              // Both open over the bar, in the same place.
              setWavePickerOpen(false);
              setMoreOpen((open) => !open);
            }}
            onMouseDown={blockNonLeftClick}
          >
            {moreMenu ? moreOpen ? 'Back' : 'More' : <IconMore />}
          </HoverHintButton>
        )}

        {/* Keep the two ways to resume together, before the quieter viewing utilities. */}
        {showActions && (
          <div className={`replay-actions${hasMore ? ' replay-actions--more' : ''}`}>
            <div className="replay-utilities">
              <HoverHintButton
                type="button"
                className={`replay-cursor-toggle${replayCursorVisible ? ' replay-cursor-toggle--active' : ''}`}
                aria-label="Replay cursor"
                hint={null}
                hintPlacement="above"
                aria-pressed={replayCursorVisible}
                onClick={() => onReplayCursorVisibleChange(!replayCursorVisible)}
                onMouseDown={blockNonLeftClick}
              >
                <IconCursor />
                <span className="replay-cursor-toggle__label">Cursor</span>
                {moreMenu && <span className="replay-cursor-state">{replayCursorVisible ? 'On' : 'Off'}</span>}
              </HoverHintButton>
              <button
                type="button"
                className="replay-action replay-action--exit"
                aria-label="Exit replay"
                disabled={replayPractice?.busy}
                onClick={onExitReplay}
                onMouseDown={blockNonLeftClick}
              >
                Exit
              </button>
            </div>
            <HoverHintRegion
              className="replay-takeover-wrap"
              hint={
                takeOverUnavailableReason
                  ? TAKE_OVER_UNAVAILABLE_TEXT[takeOverUnavailableReason]
                  : (restartWarning ?? `Play from tick ${tickText}. Later ticks are replaced.`)
              }
              hintPlacement="above"
            >
              <button
                type="button"
                className="replay-action replay-action--takeover"
                onClick={() => {
                  if (commitTick()) onTakeOver();
                }}
                disabled={takeOverUnavailableReason !== null || actionsBlocked}
                aria-label={
                  takeOverUnavailableReason
                    ? `Take over unavailable: ${TAKE_OVER_UNAVAILABLE_TEXT[takeOverUnavailableReason]}`
                    : 'Take over'
                }
              >
                <span>Take over</span>
                <span
                  className={`replay-action__description${restartWarning ? ' replay-action__description--warning' : ''}`}
                >
                  {restartWarning ? `Clears restart tick ${replayPractice?.startTick}` : `Play from tick ${tickText}`}
                </span>
              </button>
            </HoverHintRegion>
            {replayPractice && (
              <HoverHintRegion
                className="replay-practice-wrap"
                hint={
                  replayPractice.practiceUnavailableReason ??
                  `Start from tick ${tickText} and make Ctrl+R restart here.`
                }
                hintPlacement="above"
              >
                <button
                  type="button"
                  className="replay-action replay-action--practice"
                  onClick={() => {
                    if (commitTick()) replayPractice.onStartPractice();
                  }}
                  disabled={actionsBlocked || replayPractice.practiceUnavailableReason !== null}
                  aria-label="Practice"
                >
                  <span>Practice</span>
                  <span className="replay-action__description">Play + set restart</span>
                </button>
              </HoverHintRegion>
            )}
            {hasMore && takeOverUnavailableReason && (
              <p className="replay-more-note">{TAKE_OVER_UNAVAILABLE_TEXT[takeOverUnavailableReason]}</p>
            )}
            {hasMore &&
              replayPractice?.practiceUnavailableReason &&
              replayPractice.practiceUnavailableReason !==
                (takeOverUnavailableReason ? TAKE_OVER_UNAVAILABLE_TEXT[takeOverUnavailableReason] : null) && (
                <p className="replay-more-note">{replayPractice.practiceUnavailableReason}</p>
              )}
            {/* A finger has no hover for the warning's tooltip, so More spells it out. */}
            {hasMore && lateSummary && <p className="replay-more-note">{lateSummary.sentence}</p>}
          </div>
        )}
      </div>
      {actionError && (
        <div className="replay-takeover-error" id={`${tickFieldId}-message`} role="status">
          {actionError}
        </div>
      )}
    </div>
  );
};
