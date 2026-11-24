import type { DemoCursorCue, DemoCursorTarget } from '../types';

/**
 * Cursor state is a pure function of playhead so watched demos remain seekable.
 * DOM-free: DemoCursorLayer resolves the returned targets to live positions.
 */

export function cueAbsoluteMs(cue: DemoCursorCue, tickMs: number): number {
  return cue.time.kind === 'ms' ? cue.time.ms : cue.time.tick * tickMs + (cue.time.offsetMs ?? 0);
}

export const TIMELINE_DEFAULT_MOVE_MS = 900;
export const TIMELINE_PRESS_MS = 220;

export interface CursorTimelineState {
  /** Target the cursor is gliding FROM; null is the resting position. */
  fromTarget: DemoCursorTarget | null;
  toTarget: DemoCursorTarget;
  /** Linear glide progress 0..1; the renderer applies the easing. */
  t: number;
  pressed: boolean;
  label: string | null;
}

interface ResolvedCue {
  cue: DemoCursorCue;
  arriveMs: number;
  moveMs: number;
}

/** Cues must be authored in timeline order without overlapping glides. */
export function cursorStateAt(
  cues: readonly DemoCursorCue[],
  playheadMs: number,
  tickMs: number,
): CursorTimelineState | null {
  if (cues.length === 0) return null;

  const resolved: ResolvedCue[] = cues.map((cue) => ({
    cue,
    arriveMs: cueAbsoluteMs(cue, tickMs),
    moveMs: cue.moveMs ?? TIMELINE_DEFAULT_MOVE_MS,
  }));

  const first = resolved[0];
  if (playheadMs < first.arriveMs - first.moveMs) return null;

  let pressed = false;
  for (const r of resolved) {
    const wantsClick = r.cue.click ?? true;
    if (wantsClick && playheadMs >= r.arriveMs && playheadMs < r.arriveMs + TIMELINE_PRESS_MS) {
      pressed = true;
      break;
    }
  }

  let activeIdx = 0;
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i].arriveMs - resolved[i].moveMs <= playheadMs) activeIdx = i;
    else break;
  }

  const active = resolved[activeIdx];
  const fromTarget: DemoCursorTarget | null = activeIdx === 0 ? null : resolved[activeIdx - 1].cue.target;
  const glideStart = active.arriveMs - active.moveMs;

  let t: number;
  if (playheadMs >= active.arriveMs) {
    t = 1;
  } else if (active.moveMs > 0) {
    t = clamp01((playheadMs - glideStart) / active.moveMs);
  } else {
    t = 1;
  }

  return { fromTarget, toTarget: active.cue.target, t, pressed, label: active.cue.label ?? null };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
