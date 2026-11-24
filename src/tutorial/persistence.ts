import { loadSetting, saveSetting } from '../util/storage';
import { getTutorialById } from './content/registry';
import { isSpotlightOnlyTutorial, type Tutorial } from './types';

export const TUTORIAL_PROGRESS_KEY = 'osrs-tutorial-progress';

export interface TutorialProgress {
  /**
   * An index into the tutorial's own `steps` (spotlight tours too: never a position in one filtered
   * run, since what a run drops depends on the device and the page).
   *
   * NOT a high-water mark: the spotlight step drawer lets the user jump
   * anywhere, so a later index does not imply the earlier ones were seen. Read
   * `completedSteps` for that.
   */
  lastStep: number;
  completed: boolean;
  /**
   * Sorted, deduplicated list of step indices (into `steps`, as `lastStep`) the user has reached.
   *
   * - Combat tutorials store steps whose required action was actually finished.
   *   For the director this is a PURE VISUAL marker for the StepsList and
   *   picker progress — it MUST NOT skip, gate, or otherwise alter step
   *   execution. A step in this set runs identically to one that isn't.
   * - Spotlight tours store the steps that were shown. SpotlightRunner DOES
   *   read it to decide completion and to pre-satisfy the action gates of steps
   *   already visited, because with a jump-anywhere drawer `lastStep` can no
   *   longer answer either question.
   *
   * Both runners write it on every save. Stored progress is read unvalidated, so
   * readers treat an absent list as empty.
   */
  completedSteps?: readonly number[];
  /**
   * Spotlight tours only: the content the indices above were saved under
   * (`spotlightContentSignature`). A spotlight entry without one reads as stale.
   */
  contentSignature?: string;
}

/**
 * Bumped when what a spotlight save's indices mean changes, so a save in any other format reads as
 * stale. Format 2 holds indices into the tour's steps, not positions in one filtered run.
 */
const SPOTLIGHT_PROGRESS_FORMAT = 2;

/**
 * Names the steps a spotlight save's indices point into: their titles, in order. Authored inserts,
 * removals, reorders and renames change it and the save is discarded; filtering never does, since
 * the indices are into the steps themselves, not one run's selection of them.
 *
 * Null for combat tutorials, which resume from checkpoints.
 */
function spotlightContentSignature(tutorial: Tutorial): string | null {
  if (!isSpotlightOnlyTutorial(tutorial)) return null;
  const content = [
    `format ${SPOTLIGHT_PROGRESS_FORMAT}`,
    ...tutorial.steps.map((step) => (step.kind === 'spotlight' ? step.popover.title : '')),
  ].join('\n');
  // FNV-1a: short enough to store per tour, and any edit above changes it.
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function signatureFor(tutorialId: string): string | null {
  const tutorial = getTutorialById(tutorialId);
  return tutorial ? spotlightContentSignature(tutorial) : null;
}

type TutorialProgressMap = Record<string, TutorialProgress>;

function loadAllProgress(): TutorialProgressMap {
  return loadSetting<TutorialProgressMap>(TUTORIAL_PROGRESS_KEY) ?? {};
}

function saveAllProgress(map: TutorialProgressMap): void {
  saveSetting(TUTORIAL_PROGRESS_KEY, map);
}

export function loadTutorialProgress(tutorialId: string): TutorialProgress | null {
  const map = loadAllProgress();
  const progress = map[tutorialId] ?? null;
  const signature = signatureFor(tutorialId);
  if (!progress || signature === null || progress.contentSignature === signature) return progress;
  // Saved under other content (or before signatures): its indices would resume onto the wrong step
  // and release gates the user never passed. An earned completion stays; the rest starts over.
  return progress.completed ? { lastStep: -1, completed: true, completedSteps: [] } : null;
}

export function saveTutorialProgress(tutorialId: string, progress: TutorialProgress): void {
  const map = loadAllProgress();
  // `completed` is sticky: it means "finished end-to-end at least once", so a
  // later replay/exit save must not regress it (picker badges, course progress,
  // and prerequisite checks all read it). An explicit restart clears it via
  // resetTutorialProgress(), which deletes the whole entry.
  const wasCompleted = map[tutorialId]?.completed === true;
  const signature = signatureFor(tutorialId);
  const signed = signature === null ? progress : { ...progress, contentSignature: signature };
  map[tutorialId] = wasCompleted ? { ...signed, completed: true } : signed;
  saveAllProgress(map);
}

export function resetTutorialProgress(tutorialId: string): void {
  const map = loadAllProgress();
  delete map[tutorialId];
  saveAllProgress(map);
}

export function hasOpenedTutorialPicker(): boolean {
  return (loadAllProgress() as Record<string, unknown>)._pickerSeen === true;
}

/**
 * Whether the desktop menu has opened by itself on a new player's first lobby visit (TopChrome
 * `menu.openOnce`). It does so once, ever.
 */
export function hasShownFirstRunMenu(): boolean {
  return (loadAllProgress() as Record<string, unknown>)._firstRunMenuShown === true;
}

export function markFirstRunMenuShown(): void {
  const map = loadAllProgress();
  (map as Record<string, unknown>)._firstRunMenuShown = true;
  saveAllProgress(map);
}

export function markTutorialPickerOpened(): void {
  const map = loadAllProgress();
  (map as Record<string, unknown>)._pickerSeen = true;
  saveAllProgress(map);
}
