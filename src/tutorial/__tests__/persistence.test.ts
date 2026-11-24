// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasOpenedTutorialPicker,
  loadTutorialProgress,
  markTutorialPickerOpened,
  resetTutorialProgress,
  saveTutorialProgress,
} from '../persistence';

const TUTORIAL_PROGRESS_KEY = 'osrs-tutorial-progress';

function writeProgress(value: Record<string, unknown>): void {
  localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(value));
}

function readProgress(): Record<string, unknown> | null {
  const raw = localStorage.getItem(TUTORIAL_PROGRESS_KEY);
  if (raw === null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

describe('hasOpenedTutorialPicker / markTutorialPickerOpened', () => {
  beforeEach(() => {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
  });

  it('returns false by default when nothing is persisted', () => {
    expect(hasOpenedTutorialPicker()).toBe(false);
  });

  it('returns true after markTutorialPickerOpened() and roundtrips through localStorage', () => {
    markTutorialPickerOpened();

    expect(hasOpenedTutorialPicker()).toBe(true);

    const stored = readProgress();
    expect(stored).not.toBeNull();
    expect(stored?._pickerSeen).toBe(true);
  });

  it('reads only the picker-seen flag, not tutorial progress', () => {
    writeProgress({ main: { lastStep: 0, completed: false } });

    expect(hasOpenedTutorialPicker()).toBe(false);
  });

  it('leaves existing per-tutorial progress untouched when marked', () => {
    writeProgress({
      main: { lastStep: 2, completed: false },
      advanced: { lastStep: 1, completed: false },
    });

    markTutorialPickerOpened();

    // Read raw: these unsigned spotlight entries would load as stale content.
    expect(readProgress()?.main).toEqual({ lastStep: 2, completed: false });
    expect(readProgress()?.advanced).toEqual({ lastStep: 1, completed: false });
    expect(hasOpenedTutorialPicker()).toBe(true);
  });

  it('survives across an unrelated resetTutorialProgress call', () => {
    writeProgress({
      main: { lastStep: 2, completed: false },
    });
    markTutorialPickerOpened();

    resetTutorialProgress('main');

    expect(hasOpenedTutorialPicker()).toBe(true);
    expect(loadTutorialProgress('main')).toBeNull();
  });
});

describe('saveTutorialProgress completed stickiness', () => {
  beforeEach(() => {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
  });

  it('keeps completed=true when a replay saves completed=false', () => {
    saveTutorialProgress('yama-basics', { lastStep: 9, completed: true, completedSteps: [0, 1, 2] });

    // Replaying from step 0 persists in-progress saves with completed: false.
    saveTutorialProgress('yama-basics', { lastStep: 0, completed: false, completedSteps: [0] });

    const progress = loadTutorialProgress('yama-basics');
    expect(progress?.completed).toBe(true);
    expect(progress?.lastStep).toBe(0);
    expect(progress?.completedSteps).toEqual([0]);
  });

  it('does not invent completion for never-completed tutorials', () => {
    saveTutorialProgress('yama-waves', { lastStep: 2, completed: false });
    expect(loadTutorialProgress('yama-waves')?.completed).toBe(false);
  });

  it('resetTutorialProgress clears stickiness (explicit restart)', () => {
    saveTutorialProgress('yama-basics', { lastStep: 9, completed: true });
    resetTutorialProgress('yama-basics');
    saveTutorialProgress('yama-basics', { lastStep: 1, completed: false });

    expect(loadTutorialProgress('yama-basics')?.completed).toBe(false);
  });
});

// Saved step indices only mean the same steps under the content they were saved with.
describe('spotlight progress saved under other content', () => {
  beforeEach(() => {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY);
  });

  it('drops an unfinished tour saved without a signature', () => {
    writeProgress({ main: { lastStep: 5, completed: false, completedSteps: [0, 1, 2, 3, 4, 5] } });

    expect(loadTutorialProgress('main')).toBeNull();
  });

  it('keeps an earned completion, without its bookmark or visited steps', () => {
    writeProgress({ advanced: { lastStep: 9, completed: true, completedSteps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] } });

    expect(loadTutorialProgress('advanced')).toEqual({ lastStep: -1, completed: true, completedSteps: [] });
  });

  // Each tour's real signature, written onto the other tour: both are signatures current code
  // produces, but each names other content.
  it('drops a save signed for other content once, keeping its completion', () => {
    saveTutorialProgress('main', { lastStep: 5, completed: false, completedSteps: [0, 5] });
    saveTutorialProgress('advanced', { lastStep: 3, completed: true, completedSteps: [0, 3] });
    const stored = readProgress() as Record<string, { contentSignature: string }>;
    const mainSignature = stored.main.contentSignature;
    const advancedSignature = stored.advanced.contentSignature;
    expect(mainSignature).not.toBe(advancedSignature);
    writeProgress({
      main: { lastStep: 5, completed: false, completedSteps: [0, 5], contentSignature: advancedSignature },
      advanced: { lastStep: 3, completed: true, completedSteps: [0, 3], contentSignature: mainSignature },
    });

    expect(loadTutorialProgress('main')).toBeNull();
    expect(loadTutorialProgress('advanced')).toEqual({ lastStep: -1, completed: true, completedSteps: [] });
    // Saved again, it reads back.
    saveTutorialProgress('main', { lastStep: 5, completed: false, completedSteps: [0, 5] });
    expect(loadTutorialProgress('main')).toMatchObject({ lastStep: 5, completedSteps: [0, 5] });
  });

  it('drops progress whose signature names other content', () => {
    writeProgress({
      plugins: { lastStep: 3, completed: false, completedSteps: [0, 1, 2, 3], contentSignature: 'stale' },
    });

    expect(loadTutorialProgress('plugins')).toBeNull();
  });

  it('round-trips progress saved under the current content', () => {
    saveTutorialProgress('main', { lastStep: 5, completed: false, completedSteps: [0, 5] });

    expect(loadTutorialProgress('main')).toMatchObject({ lastStep: 5, completed: false, completedSteps: [0, 5] });
  });

  it('leaves combat tutorials alone: they have no signature', () => {
    writeProgress({ 'yama-basics': { lastStep: 4, completed: false, completedSteps: [0, 1] } });

    expect(loadTutorialProgress('yama-basics')).toEqual({ lastStep: 4, completed: false, completedSteps: [0, 1] });
  });
});
