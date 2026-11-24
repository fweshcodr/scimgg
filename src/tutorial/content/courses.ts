import { baseEncounterKind } from '../../encounters/catalog';
import type { TrainingCourse, TrainingTrack, Tutorial } from '../types';
import { getTutorialById, TUTORIAL_REGISTRY } from './registry';

export const TRAINING_COURSES: readonly TrainingCourse[] = Object.freeze([
  {
    id: 'app-getting-started',
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'A guided tour of the simulator interface.',
    surface: 'app',
    eyebrow: 'App · Onboarding',
    tracks: [
      {
        id: 'walkthrough',
        label: 'Walkthroughs',
        tutorialIds: ['main'],
      },
    ],
  },
  {
    id: 'app-advanced',
    slug: 'advanced',
    title: 'Advanced Tools',
    description: 'Replays, prayer and spell filtering, mechanics toggles, and the plugin panel.',
    surface: 'app',
    eyebrow: 'App · Power Tools',
    tracks: [
      {
        id: 'walkthrough',
        label: 'Walkthroughs',
        tutorialIds: ['advanced', 'plugins'],
      },
    ],
  },

  {
    id: 'yama',
    slug: 'yama',
    title: 'Yama',
    description:
      'The final phase of the Yama fight, with shadow waves, fireballs, void flares, and alternating attacks.',
    surface: 'encounter',
    eyebrow: 'Boss · Phase 3',
    encounterKind: 'yama_p3',
    tracks: [
      {
        id: 'walkthrough',
        label: 'Walkthroughs',
        tutorialIds: ['yama-basics'],
      },
      {
        id: 'mechanic-drill',
        label: 'Mechanic Drills',
        tutorialIds: ['yama-waves', 'yama-fireballs', 'yama-voidflares'],
      },
      {
        id: 'strategy',
        label: 'Strategies',
        tutorialIds: ['yama-rotation', 'yama-perfect-dodge'],
      },
    ],
  },
]);

export function getCourseById(id: string): TrainingCourse | undefined {
  return TRAINING_COURSES.find((c) => c.id === id);
}

export function getCourseForEncounterKind(kind: string | null | undefined): TrainingCourse | undefined {
  if (!kind) return undefined;
  const canonicalKind = baseEncounterKind(kind);
  return TRAINING_COURSES.find((c) => c.surface === 'encounter' && c.encounterKind === canonicalKind);
}

export function getCourseForTutorial(tutorialId: string): TrainingCourse | undefined {
  return TRAINING_COURSES.find((c) => c.tracks.some((t) => t.tutorialIds.includes(tutorialId)));
}

export function getTrackForTutorial(course: TrainingCourse, tutorialId: string): TrainingTrack | undefined {
  return course.tracks.find((t) => t.tutorialIds.includes(tutorialId));
}

export function getOrderedTutorialIds(course: TrainingCourse): readonly string[] {
  return course.tracks.flatMap((t) => t.tutorialIds);
}

/**
 * The lessons the Training picker lists and counts, and the completion card's course track; 'wip'
 * lessons are omitted everywhere. Unknown ids are dropped too: filtering on availability alone
 * would keep them, because undefined !== 'wip'.
 */
export function getStartableTutorials(course: TrainingCourse): Tutorial[] {
  return getOrderedTutorialIds(course)
    .map((id) => getTutorialById(id))
    .filter((tutorial): tutorial is Tutorial => tutorial !== undefined && tutorial.availability !== 'wip');
}

export function assertCoursesAreValid(): void {
  const knownIds = new Set(TUTORIAL_REGISTRY.map((t) => t.id));
  const claimed = new Set<string>();
  for (const course of TRAINING_COURSES) {
    for (const track of course.tracks) {
      for (const id of track.tutorialIds) {
        if (!knownIds.has(id)) {
          throw new Error(`TRAINING_COURSES: course '${course.id}' references unknown tutorial id '${id}'.`);
        }
        if (claimed.has(id)) {
          throw new Error(`TRAINING_COURSES: tutorial id '${id}' is claimed by multiple courses.`);
        }
        claimed.add(id);
      }
    }
  }
  for (const tutorial of TUTORIAL_REGISTRY) {
    if (!claimed.has(tutorial.id)) {
      throw new Error(`TRAINING_COURSES: tutorial '${tutorial.id}' is not assigned to any course.`);
    }
  }
}
