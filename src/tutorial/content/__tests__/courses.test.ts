import { describe, expect, it } from 'vitest';
import { EQUIPMENT_PRESETS } from '../../../data/playerPresets';
import { encounterRegistry } from '../../../encounters/registry';
import type { TrainingCourse } from '../../types';
import {
  assertCoursesAreValid,
  getCourseById,
  getCourseForEncounterKind,
  getCourseForTutorial,
  getOrderedTutorialIds,
  getStartableTutorials,
  getTrackForTutorial,
  TRAINING_COURSES,
  TUTORIAL_REGISTRY,
} from '..';

describe('TRAINING_COURSES manifest', () => {
  it('passes assertCoursesAreValid() — every tutorial claimed by exactly one course', () => {
    // Duplicates the dev-only auto-call in content/index.ts so a renamed id fails in `npm test` too.
    expect(() => assertCoursesAreValid()).not.toThrow();
  });

  it('every tutorial id in TUTORIAL_REGISTRY is referenced by exactly one course track', () => {
    const claimed = new Set<string>();
    for (const course of TRAINING_COURSES) {
      for (const track of course.tracks) {
        for (const id of track.tutorialIds) {
          expect(claimed.has(id), `tutorial '${id}' is claimed by multiple courses`).toBe(false);
          claimed.add(id);
        }
      }
    }
    for (const tutorial of TUTORIAL_REGISTRY) {
      expect(claimed.has(tutorial.id), `tutorial '${tutorial.id}' is not assigned to any course`).toBe(true);
    }
  });

  it('every encounter course exposes an encounterKind that matches a course-lookup roundtrip', () => {
    for (const course of TRAINING_COURSES) {
      if (course.surface !== 'encounter') continue;
      expect(course.encounterKind, `encounter course '${course.id}' must declare encounterKind`).toBeTruthy();
      const found = getCourseForEncounterKind(course.encounterKind);
      expect(found?.id).toBe(course.id);
    }
  });

  it('maps encounter variants to their parent encounter course', () => {
    const yamaDescriptor = encounterRegistry.getDescriptor('yama_p3');
    expect(yamaDescriptor?.variants?.length).toBeGreaterThan(0);

    for (const variant of yamaDescriptor?.variants ?? []) {
      expect(getCourseForEncounterKind(variant.encounterKind)?.id).toBe('yama');
    }
  });

  it('getCourseForTutorial roundtrips for every claimed tutorial', () => {
    for (const tutorial of TUTORIAL_REGISTRY) {
      const course = getCourseForTutorial(tutorial.id);
      expect(course, `tutorial '${tutorial.id}' has no owning course`).toBeTruthy();
      expect(getOrderedTutorialIds(course!).includes(tutorial.id)).toBe(true);
    }
  });

  it('every tutorial in an encounter course matches that course’s surface + encounterKind', () => {
    for (const course of TRAINING_COURSES) {
      if (course.surface !== 'encounter') continue;
      const tutorialIds = getOrderedTutorialIds(course);
      for (const id of tutorialIds) {
        const tutorial = TUTORIAL_REGISTRY.find((t) => t.id === id);
        expect(tutorial, `course '${course.id}' references missing tutorial '${id}'`).toBeTruthy();
        expect(tutorial!.surface, `tutorial '${id}' must have surface='encounter' to live in '${course.id}'`).toBe(
          'encounter',
        );
        expect(tutorial!.encounterContext?.kind, `tutorial '${id}' must declare encounterContext.kind`).toBe(
          course.encounterKind,
        );
      }
    }
  });

  it('every tutorial in an app course has surface="app"', () => {
    for (const course of TRAINING_COURSES) {
      if (course.surface !== 'app') continue;
      const tutorialIds = getOrderedTutorialIds(course);
      for (const id of tutorialIds) {
        const tutorial = TUTORIAL_REGISTRY.find((t) => t.id === id);
        expect(tutorial?.surface, `tutorial '${id}' must have surface='app' to live in '${course.id}'`).toBe('app');
      }
    }
  });

  it('getCourseById returns each course for its own id and undefined otherwise', () => {
    for (const course of TRAINING_COURSES) {
      expect(getCourseById(course.id)).toBe(course);
    }
    expect(getCourseById('no-such-course')).toBeUndefined();
  });

  it('getTrackForTutorial returns the track that owns a tutorial, and undefined for an outsider', () => {
    for (const course of TRAINING_COURSES) {
      for (const track of course.tracks) {
        for (const id of track.tutorialIds) {
          expect(getTrackForTutorial(course, id)).toBe(track);
        }
      }
      const foreignId = TUTORIAL_REGISTRY.map((t) => t.id).find((id) => !getOrderedTutorialIds(course).includes(id));
      if (foreignId) {
        expect(getTrackForTutorial(course, foreignId)).toBeUndefined();
      }
    }
  });

  // The picker hides 'wip' lessons, so a course or prerequisite chip must never lead only to them.
  it('gives every course a startable lesson, and every startable lesson startable prerequisites', () => {
    const startableIds = new Set(TRAINING_COURSES.flatMap((c) => getStartableTutorials(c)).map((t) => t.id));
    for (const course of TRAINING_COURSES) {
      expect(getStartableTutorials(course).length, `course '${course.id}' has no startable lesson`).toBeGreaterThan(0);
    }
    for (const tutorial of TUTORIAL_REGISTRY) {
      if (!startableIds.has(tutorial.id)) continue;
      for (const prerequisite of tutorial.prerequisites ?? []) {
        expect(startableIds.has(prerequisite), `'${tutorial.id}' lists hidden prerequisite '${prerequisite}'`).toBe(
          true,
        );
      }
    }
  });

  it('every tutorial that declares encounterContext.equipmentPresetKey references a valid EQUIPMENT_PRESETS entry', () => {
    // App.tsx applies this preset BEFORE the encounter loads. A typo here
    // would silently fall back to the default loadout (typically melee),
    // making the tutorial visually misleading.
    for (const tutorial of TUTORIAL_REGISTRY) {
      const presetKey = tutorial.encounterContext?.equipmentPresetKey;
      if (!presetKey) continue;
      const kind = tutorial.encounterContext!.kind;
      const variantDesc = encounterRegistry.getDescriptorForKind(kind);
      const variant = variantDesc?.variants?.find((v) => v.encounterKind === kind);
      const presetsKey = variant?.presetsKey ?? kind;
      const preset = EQUIPMENT_PRESETS[presetsKey]?.[presetKey];
      expect(
        preset,
        `tutorial '${tutorial.id}' references unknown equipment preset '${presetKey}' for presetsKey '${presetsKey}'`,
      ).toBeDefined();
    }
  });

  // `hasTutorialsForEncounter(kind)` is the sole predicate behind every "tutorial available"
  // affordance: the Configure panel's TUTORIAL AVAILABLE badge and its Start Tutorial button,
  // and the picker's Start Tutorial action. It is a plain string match on encounterContext.kind,
  // so a kind that no longer exists (or never did) fails SILENTLY — the tutorial simply stops
  // being offered anywhere, with no error to notice. The badge and the drill cannot drift apart
  // as long as every declared kind is one the registry actually serves.
  it('every tutorial targets an encounter kind the registry serves, so no drill can go unadvertised', () => {
    for (const tutorial of TUTORIAL_REGISTRY) {
      const kind = tutorial.encounterContext?.kind;
      if (!kind) continue; // lobby / app tutorials legitimately declare no encounter
      expect(
        encounterRegistry.hasKind(kind),
        `tutorial '${tutorial.id}' targets unregistered encounter kind '${kind}' — it would never ` +
          `be offered, and no "Tutorial available" badge would ever appear for it`,
      ).toBe(true);
    }
    // Guards the loop above against passing vacuously if hasKind ever starts saying yes to everything.
    expect(encounterRegistry.hasKind('no_such_encounter_kind')).toBe(false);
  });
});

// The single denominator for every "N of M" course readout: the picker's rail progress and
// the completion card's course track both count from here.
describe('getStartableTutorials', () => {
  const courseWith = (tutorialIds: string[]): TrainingCourse => ({
    id: 'test-course',
    slug: 'test-course',
    title: 'Test Course',
    description: 'd',
    surface: 'app',
    tracks: [{ id: 'only', label: 'Only', tutorialIds }],
  });

  it('resolves every id to its Tutorial and preserves manifest order', () => {
    for (const course of TRAINING_COURSES) {
      const startable = getStartableTutorials(course);
      const ordered = getOrderedTutorialIds(course);
      let cursor = -1;
      for (const tutorial of startable) {
        const at = ordered.indexOf(tutorial.id);
        expect(at, `'${tutorial.id}' is not in course '${course.id}'`).toBeGreaterThan(cursor);
        cursor = at;
      }
    }
  });

  it('drops work-in-progress lessons', () => {
    const wip = TUTORIAL_REGISTRY.filter((t) => t.availability === 'wip');
    // Guards the fixture itself: if no tutorial is ever WIP again this test
    // would silently assert nothing.
    expect(wip.length).toBeGreaterThan(0);

    const startableIds = new Set(TRAINING_COURSES.flatMap((c) => getStartableTutorials(c)).map((t) => t.id));
    for (const tutorial of wip) {
      expect(startableIds.has(tutorial.id), `WIP tutorial '${tutorial.id}' is counted as startable`).toBe(false);
    }
  });

  it('drops ids that resolve to no tutorial', () => {
    // Filtering on availability alone keeps unknown ids because undefined !== 'wip'.
    const real = TUTORIAL_REGISTRY[0];
    expect(real).toBeDefined();
    const startable = getStartableTutorials(courseWith([real.id, 'no-such-tutorial-id']));
    expect(startable.map((t) => t.id)).toEqual([real.id]);
  });

  it('equals the full ordered list when nothing is filtered out', () => {
    const startableOnly = TUTORIAL_REGISTRY.filter((t) => t.availability !== 'wip').slice(0, 2);
    expect(startableOnly.length).toBe(2);
    const course = courseWith(startableOnly.map((t) => t.id));
    expect(getStartableTutorials(course).map((t) => t.id)).toEqual([...getOrderedTutorialIds(course)]);
  });

  it('returns an empty list for a course whose lessons are all unstartable', () => {
    expect(getStartableTutorials(courseWith(['nope-a', 'nope-b']))).toEqual([]);
  });
});
