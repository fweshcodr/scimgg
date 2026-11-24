import type { GamePanelTab } from '../../hooks/keybindStore';
import type { PrayerType } from '../../types/simulation';
import type { DemoCursorCue, DemoCursorTime } from '../types';

export interface CueOptions {
  label?: string;
  moveMs?: number;
  /** Click on arrival. Default true. */
  click?: boolean;
  /** Whether a missing target fails the step. Default true. */
  required?: boolean;
}

function toTime(time: number | DemoCursorTime): DemoCursorTime {
  return typeof time === 'number' ? { kind: 'tick', tick: time } : time;
}

export function openPanelTab(tab: GamePanelTab, time: number | DemoCursorTime, opts: CueOptions = {}): DemoCursorCue {
  return { target: { kind: 'panel-tab', tab }, time: toTime(time), click: true, ...opts };
}

/** The prayer book must be open before this cue runs. */
export function clickPrayer(prayer: PrayerType, time: number | DemoCursorTime, opts: CueOptions = {}): DemoCursorCue {
  return { target: { kind: 'prayer', prayer }, time: toTime(time), click: true, ...opts };
}

export function clickSelector(selector: string, time: number | DemoCursorTime, opts: CueOptions = {}): DemoCursorCue {
  return { target: { kind: 'selector', selector }, time: toTime(time), click: true, ...opts };
}
