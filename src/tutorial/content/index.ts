import type { Tutorial } from '../types';
import { assertCoursesAreValid } from './courses';
import { TUTORIAL_REGISTRY } from './registry';

export {
  assertCoursesAreValid,
  getCourseById,
  getCourseForEncounterKind,
  getCourseForTutorial,
  getOrderedTutorialIds,
  getStartableTutorials,
  getTrackForTutorial,
  TRAINING_COURSES,
} from './courses';
export { getTutorialById, TUTORIAL_REGISTRY } from './registry';

if (import.meta.env?.DEV) {
  // Direct call — Vite statically replaces import.meta.env.DEV with false in
  // prod, allowing dead-code elimination so this never ships to users.
  assertCoursesAreValid();
}

export function getTutorialTargetEncounter(tutorial: Tutorial): string {
  return tutorial.encounterContext?.kind ?? 'lobby';
}

export function getTutorialsByEncounter(encounterKind: string): Tutorial[] {
  return TUTORIAL_REGISTRY.filter((tutorial) => tutorial.encounterContext?.kind === encounterKind);
}

/** Contract kinds remain distinct: selected contracts need their own drill, while the picker asks for the base boss. */
export function hasTutorialsForEncounter(encounterKind: string): boolean {
  return getTutorialsByEncounter(encounterKind).length > 0;
}
