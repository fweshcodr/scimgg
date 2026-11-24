import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { EncounterRegistry } from '../core/encounters/encounterFactory';
import { useEscapeLayer } from '../hooks/useEscapeLayer';
import { useIsTouchOnly } from '../hooks/useIsTouchOnly';
import {
  getCourseById,
  getCourseForEncounterKind,
  getCourseForTutorial,
  getStartableTutorials,
  getTrackForTutorial,
  getTutorialById,
  getTutorialTargetEncounter,
  TRAINING_COURSES,
} from '../tutorial/content';
import { loadTutorialProgress, resetTutorialProgress } from '../tutorial/persistence';
import type { TrainingCourse, Tutorial } from '../tutorial/types';
import './TutorialPickerModal.css';
import { useBackdropDismiss } from './ui/backdropDismiss';
import { CloseButton } from './ui/CloseButton';
import { sheet } from './ui/mobileSheet';
import { OsrsButton } from './ui/OsrsButton';
import { useCenteredModalSnap } from './ui/useCenteredModalSnap';

// Course rail and curriculum are driven by the TRAINING_COURSES manifest in
// src/tutorial/content/courses.ts. Tutorials carry no top-level taxonomy of
// their own; the course manifest owns ordering + grouping. To shuffle the IA
// (add a course, move a tutorial between tracks, hide an encounter), edit
// courses.ts only — no React change required. Work-in-progress tutorials
// ('wip') are omitted from the picker and its counts; tracks left without a
// startable lesson are hidden.

interface ResolvedTutorial {
  tutorial: Tutorial;
  totalStepCount: number;
  desktopOnlyStepCount: number;
  effectiveStepCount: number;
  /** Indices into `tutorial.steps` that this device's run shows; saved progress uses the same indices. */
  countedSteps: ReadonlySet<number>;
}

function countCompletedSteps(countedSteps: ReadonlySet<number>, completedSteps: readonly number[] = []): number {
  return new Set(completedSteps.filter((index) => countedSteps.has(index))).size;
}

function resolveTutorial(tutorial: Tutorial, isTouchOnly: boolean): ResolvedTutorial {
  let desktopOnlyStepCount = 0;
  const countedSteps = new Set<number>();
  tutorial.steps.forEach((step, index) => {
    // Conditional steps are counted out because the runner usually skips them; counting them
    // promised a step the tour never showed, and counting them as skipped here one it would.
    if (step.kind === 'spotlight' && step.conditional) return;
    const desktopOnly = step.kind === 'spotlight' && !!step.desktopOnly;
    if (desktopOnly) desktopOnlyStepCount += 1;
    if (isTouchOnly && desktopOnly) return;
    countedSteps.add(index);
  });
  return {
    tutorial,
    totalStepCount: tutorial.steps.length,
    desktopOnlyStepCount,
    effectiveStepCount: countedSteps.size,
    countedSteps,
  };
}

function difficultyLabel(difficulty: Tutorial['difficulty']): string | null {
  if (!difficulty) return null;
  return difficulty === 'beginner' ? 'Beginner' : difficulty === 'intermediate' ? 'Intermediate' : 'Advanced';
}

function getEncounterDisplayName(kind: string, registry: EncounterRegistry | undefined): string {
  const descriptor = registry?.getDescriptorForKind?.(kind) ?? registry?.getDescriptor?.(kind);
  return descriptor?.displayName ?? kind;
}

interface CourseProgress {
  completed: number;
  total: number;
}

/** Startable tutorial ids for a course, in display order. */
function availableTutorialIds(course: TrainingCourse): string[] {
  return getStartableTutorials(course).map((tutorial) => tutorial.id);
}

function getCourseProgress(course: TrainingCourse): CourseProgress {
  const ids = availableTutorialIds(course);
  let completed = 0;
  for (const id of ids) {
    if (loadTutorialProgress(id)?.completed) completed += 1;
  }
  return { completed, total: ids.length };
}

function firstUnfinishedIdInCourse(course: TrainingCourse): string | null {
  const ids = availableTutorialIds(course);
  for (const id of ids) {
    if (!loadTutorialProgress(id)?.completed) return id;
  }
  return ids[0] ?? null;
}

function pickInitialCourseId(initialCourseId: string | null, currentSceneKind: string | null): string | null {
  if (initialCourseId && getCourseById(initialCourseId)) return initialCourseId;
  const sceneCourse = getCourseForEncounterKind(currentSceneKind);
  if (sceneCourse) return sceneCourse.id;
  const appCourse = TRAINING_COURSES.find((c) => c.surface === 'app');
  if (appCourse) return appCourse.id;
  return TRAINING_COURSES[0]?.id ?? null;
}

export interface TutorialPickerModalProps {
  open: boolean;
  /**
   * Course to pre-select on open. Used when a contextual entry point (e.g.
   * Encounter Picker's "Train" button) wants to drop the user into a specific
   * course. Null/undefined falls back to the auto-select heuristic.
   */
  initialCourseId?: string | null;
  /**
   * The scene the user is currently in (e.g. 'lobby' or 'yama_p3'). Drives the
   * auto-select fallback and the cross-scene confirm flow on Begin.
   */
  currentSceneKind?: string | null;
  /**
   * Currently-running tutorial id (any non-idle director phase). Used to gate
   * navigation between tutorials and to mark the running row in the
   * curriculum with the "running" eyebrow status.
   */
  runningTutorialId?: string | null;
  /** Encounter registry — resolves encounter display names for scene pills. */
  encounterRegistry?: EncounterRegistry;
  onClose: () => void;
  onStart: (tutorialId: string) => void;
}

export function TutorialPickerModal({
  open,
  initialCourseId = null,
  currentSceneKind = null,
  runningTutorialId = null,
  encounterRegistry,
  onClose,
  onStart,
}: TutorialPickerModalProps) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedTutorialId, setSelectedTutorialId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  useCenteredModalSnap(modalRef, open);
  const isTouchOnly = useIsTouchOnly();
  useEscapeLayer(1300, open, onClose);

  // Re-init on open. Read currentSceneKind via a ref so the effect doesn't
  // fire when the scene changes mid-picker (which would clobber selection).
  const currentSceneKindRef = useRef(currentSceneKind);
  currentSceneKindRef.current = currentSceneKind;
  useEffect(() => {
    if (!open) return;
    const courseId = pickInitialCourseId(initialCourseId, currentSceneKindRef.current);
    setSelectedCourseId(courseId);
    if (courseId) {
      const course = getCourseById(courseId);
      const tutorialId = course ? firstUnfinishedIdInCourse(course) : null;
      setSelectedTutorialId(tutorialId);
    } else {
      setSelectedTutorialId(null);
    }
  }, [open, initialCourseId]);

  const backdropDismiss = useBackdropDismiss(modalRef, onClose);

  if (!open) return null;

  const selectedCourse = selectedCourseId ? (getCourseById(selectedCourseId) ?? null) : null;
  const activeTutorial = selectedTutorialId ? (getTutorialById(selectedTutorialId) ?? null) : null;

  function selectCourse(courseId: string) {
    const course = getCourseById(courseId);
    if (!course) return;
    setSelectedCourseId(courseId);
    setSelectedTutorialId(firstUnfinishedIdInCourse(course));
  }

  function selectTutorial(tutorialId: string) {
    setSelectedTutorialId(tutorialId);
    // Keep the course rail in sync if the tutorial belongs to a different course
    // (defensive — UI shouldn't route here, but the guard is cheap).
    const owningCourse = getCourseForTutorial(tutorialId);
    if (owningCourse && owningCourse.id !== selectedCourseId) {
      setSelectedCourseId(owningCourse.id);
    }
  }

  function handleStart(tutorialId: string) {
    onClose();
    onStart(tutorialId);
  }

  function handleReset(tutorialId: string) {
    resetTutorialProgress(tutorialId);
    forceUpdate();
  }

  return (
    <div className="tutorial-picker-backdrop" {...sheet.overlay} role="dialog" aria-modal="true" {...backdropDismiss}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Delegated button blur prevention preserves game keys under the Keyboard and focus policy. */}
      <div
        className="tp-shell centered-modal-snap"
        {...sheet.card}
        ref={modalRef}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button, summary')) event.preventDefault();
        }}
      >
        <header className="tp-header" {...sheet.head}>
          <h1 className="tp-heading">Training</h1>
          <CloseButton {...sheet.close} onClick={onClose} aria-label="Close tutorial picker" />
        </header>

        <div className="tp-body">
          <CourseRail selectedCourseId={selectedCourseId} onSelectCourse={selectCourse} />

          {selectedCourse ? (
            <Curriculum
              course={selectedCourse}
              selectedCourseId={selectedCourseId}
              selectedTutorialId={selectedTutorialId}
              runningTutorialId={runningTutorialId}
              isTouchOnly={isTouchOnly}
              onSelectCourse={selectCourse}
              onSelectTutorial={selectTutorial}
            />
          ) : (
            <EmptyCurriculum />
          )}

          <article className="tp-detail">
            {activeTutorial ? (
              <TutorialDetail
                tutorial={activeTutorial}
                course={selectedCourse}
                isTouchOnly={isTouchOnly}
                currentSceneKind={currentSceneKind}
                encounterRegistry={encounterRegistry}
                runningTutorialId={runningTutorialId}
                onStart={handleStart}
                onReset={handleReset}
                onSelectTutorial={selectTutorial}
              />
            ) : (
              <EmptyDetail />
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

interface CourseRailProps {
  selectedCourseId: string | null;
  onSelectCourse: (courseId: string) => void;
}

function CourseRail({ selectedCourseId, onSelectCourse }: CourseRailProps) {
  const appCourses = useMemo(() => TRAINING_COURSES.filter((c) => c.surface === 'app'), []);
  const encounterCourses = useMemo(() => TRAINING_COURSES.filter((c) => c.surface === 'encounter'), []);

  return (
    <nav className="tp-rail" aria-label="Courses">
      {appCourses.length > 0 && (
        <>
          <div className="tp-rail-section">App</div>
          <div className="tp-rail-items">
            {appCourses.map((course) => (
              <CourseRailItem
                key={course.id}
                course={course}
                active={course.id === selectedCourseId}
                onSelect={onSelectCourse}
              />
            ))}
          </div>
        </>
      )}
      {encounterCourses.length > 0 && (
        <>
          <div className="tp-rail-section">Encounters</div>
          <div className="tp-rail-items">
            {encounterCourses.map((course) => (
              <CourseRailItem
                key={course.id}
                course={course}
                active={course.id === selectedCourseId}
                onSelect={onSelectCourse}
              />
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

interface CourseRailItemProps {
  course: TrainingCourse;
  active: boolean;
  onSelect: (courseId: string) => void;
}

function CourseRailItem({ course, active, onSelect }: CourseRailItemProps) {
  const progress = getCourseProgress(course);
  return (
    <button
      type="button"
      className={`tp-rail-item${active ? ' active' : ''}`}
      onClick={() => onSelect(course.id)}
      aria-current={active ? 'true' : undefined}
    >
      <span className="tp-rail-name">{course.title}</span>
      <span className="tp-rail-progress">
        {progress.completed}/{progress.total}
      </span>
    </button>
  );
}

interface CurriculumProps {
  course: TrainingCourse;
  selectedCourseId: string | null;
  selectedTutorialId: string | null;
  runningTutorialId: string | null;
  isTouchOnly: boolean;
  onSelectCourse: (courseId: string) => void;
  onSelectTutorial: (tutorialId: string) => void;
}

function Curriculum({
  course,
  selectedCourseId,
  selectedTutorialId,
  runningTutorialId,
  isTouchOnly,
  onSelectCourse,
  onSelectTutorial,
}: CurriculumProps) {
  const startable = getStartableTutorials(course);
  const sections = course.tracks
    .map((track) => ({ track, lessons: startable.filter((tutorial) => track.tutorialIds.includes(tutorial.id)) }))
    .filter((section) => section.lessons.length > 0);
  const showSectionLabels = sections.length > 1;
  const eyebrow = course.eyebrow ?? (course.surface === 'app' ? 'App' : 'Encounter');
  const appCourses = TRAINING_COURSES.filter((c) => c.surface === 'app');
  const encounterCourses = TRAINING_COURSES.filter((c) => c.surface === 'encounter');

  return (
    <div className="tp-curriculum">
      {/* Compact course switcher replaces the course column on phones and short landscapes. */}
      <label className="tp-mobile-course-select">
        <span className="tp-mobile-course-select-label">Course</span>
        <select value={selectedCourseId ?? ''} onChange={(e) => onSelectCourse(e.target.value)}>
          {appCourses.length > 0 && (
            <optgroup label="App">
              {appCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </optgroup>
          )}
          {encounterCourses.length > 0 && (
            <optgroup label="Encounters">
              {encounterCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <div className="tp-curriculum-header">
        <div className="tp-curriculum-eyebrow">{eyebrow}</div>
        <h2 className="tp-curriculum-title">{course.title}</h2>
      </div>
      {sections.map(({ track, lessons }) => (
        <CurriculumSection
          key={track.id}
          label={showSectionLabels ? track.label : null}
          lessons={lessons}
          selectedTutorialId={selectedTutorialId}
          runningTutorialId={runningTutorialId}
          isTouchOnly={isTouchOnly}
          onSelectTutorial={onSelectTutorial}
        />
      ))}
    </div>
  );
}

interface CurriculumSectionProps {
  label: string | null;
  lessons: readonly Tutorial[];
  selectedTutorialId: string | null;
  runningTutorialId: string | null;
  isTouchOnly: boolean;
  onSelectTutorial: (tutorialId: string) => void;
}

function CurriculumSection({
  label,
  lessons,
  selectedTutorialId,
  runningTutorialId,
  isTouchOnly,
  onSelectTutorial,
}: CurriculumSectionProps) {
  return (
    <section className="tp-section">
      {label && <div className="tp-section-label">{label}</div>}
      {lessons.map((tutorial) => (
        <CurriculumLesson
          key={tutorial.id}
          tutorial={tutorial}
          isTouchOnly={isTouchOnly}
          active={tutorial.id === selectedTutorialId}
          running={tutorial.id === runningTutorialId}
          onSelect={onSelectTutorial}
        />
      ))}
    </section>
  );
}

interface CurriculumLessonProps {
  tutorial: Tutorial;
  isTouchOnly: boolean;
  active: boolean;
  running: boolean;
  onSelect: (tutorialId: string) => void;
}

function CurriculumLesson({ tutorial, isTouchOnly, active, running, onSelect }: CurriculumLessonProps) {
  const resolved = resolveTutorial(tutorial, isTouchOnly);
  const progress = loadTutorialProgress(tutorial.id);
  const done = progress?.completed ?? false;
  const started = (progress?.lastStep ?? -1) >= 0;
  const status: 'done' | 'progress' | 'pending' = done ? 'done' : started || running ? 'progress' : 'pending';

  return (
    <button
      type="button"
      className={`tp-lesson${active ? ' active' : ''}`}
      onClick={() => onSelect(tutorial.id)}
      aria-current={active ? 'true' : undefined}
    >
      <span className={`tp-lesson-status ${status}`} aria-hidden="true">
        {status === 'done' && (
          <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <path d="M2 5 L4.5 7.5 L8 3" />
          </svg>
        )}
      </span>
      <span className="tp-lesson-name">{tutorial.title}</span>
      {tutorial.estimatedDurationMin != null && (
        <span className="tp-lesson-duration">
          {tutorial.estimatedDurationMin} min
          {isTouchOnly && resolved.desktopOnlyStepCount > 0 ? '*' : ''}
        </span>
      )}
    </button>
  );
}

function EmptyCurriculum() {
  return (
    <div className="tp-curriculum">
      <div className="tp-curriculum-header">
        <h2 className="tp-curriculum-title">No course selected</h2>
      </div>
    </div>
  );
}

interface TutorialDetailProps {
  tutorial: Tutorial;
  course: TrainingCourse | null;
  isTouchOnly: boolean;
  currentSceneKind: string | null;
  encounterRegistry: EncounterRegistry | undefined;
  runningTutorialId: string | null;
  onStart: (tutorialId: string) => void;
  onReset: (tutorialId: string) => void;
  onSelectTutorial: (tutorialId: string) => void;
}

function TutorialDetail({
  tutorial,
  course,
  isTouchOnly,
  currentSceneKind,
  encounterRegistry,
  runningTutorialId,
  onStart,
  onReset,
  onSelectTutorial,
}: TutorialDetailProps) {
  const resolved = resolveTutorial(tutorial, isTouchOnly);
  const progress = loadTutorialProgress(tutorial.id);
  const isCompleted = progress?.completed ?? false;
  const lastStep = progress?.lastStep ?? -1;
  const hasStarted = lastStep >= 0;
  const showDesktopOnlyNote = isTouchOnly && resolved.desktopOnlyStepCount > 0;
  const isRunning = runningTutorialId === tutorial.id;
  const startLabel = isRunning ? 'Continue' : isCompleted ? 'Replay' : hasStarted ? 'Resume' : 'Begin';

  const eyebrow = useMemo(() => {
    if (course) {
      const track = getTrackForTutorial(course, tutorial.id);
      if (track) return track.label;
    }
    return tutorial.encounterContext ? 'Encounter Tutorial' : 'Walkthrough';
  }, [course, tutorial]);

  const prerequisites = useMemo(
    () => (tutorial.prerequisites ?? []).map((id) => getTutorialById(id)).filter((t): t is Tutorial => t !== undefined),
    [tutorial.prerequisites],
  );

  // Scene context — drives the optional scene pill + the cross-scene confirm
  // flow when starting.
  const targetSceneKind = getTutorialTargetEncounter(tutorial);
  const targetSceneName =
    targetSceneKind === 'lobby' ? 'Lobby' : getEncounterDisplayName(targetSceneKind, encounterRegistry);
  const currentSceneName = currentSceneKind
    ? currentSceneKind === 'lobby'
      ? 'Lobby'
      : getEncounterDisplayName(currentSceneKind, encounterRegistry)
    : null;
  const needsSceneSwitch = currentSceneKind !== null && currentSceneKind !== targetSceneKind;
  const willEndRunningTutorial = runningTutorialId !== null && !isRunning;
  const needsConfirm = needsSceneSwitch || willEndRunningTutorial;

  const [pendingSceneConfirm, setPendingSceneConfirm] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset on tutorial change.
  useEffect(() => {
    setPendingSceneConfirm(false);
  }, [tutorial.id]);

  function handleBeginClick() {
    if (needsConfirm && !isRunning) {
      setPendingSceneConfirm(true);
      return;
    }
    onStart(tutorial.id);
  }

  return (
    <>
      <div className="tp-detail-reading">
        <div className="tp-detail-eyebrow" data-status={isRunning ? 'running' : undefined}>
          {eyebrow}
        </div>
        <h2 className="tp-detail-title">{tutorial.title}</h2>

        <div className="tp-detail-meta">
          {difficultyLabel(tutorial.difficulty) && (
            <span className={`tp-pill tp-pill--${tutorial.difficulty}`}>{difficultyLabel(tutorial.difficulty)}</span>
          )}
          {tutorial.estimatedDurationMin != null && (
            <span className="tp-pill">
              <svg className="tp-pill-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <circle cx="6" cy="6" r="4" />
                <path d="M6 6 L6 3.5 M6 6 L8 6" strokeLinecap="round" />
              </svg>
              {tutorial.estimatedDurationMin} min
            </span>
          )}
          {/* `role="group"` so the label survives: a generic span drops aria-label. */}
          {/* biome-ignore lint/a11y/useSemanticElements: a fieldset's UA box fights the pill layout. */}
          <span
            className={`tp-pill${needsSceneSwitch ? ' tp-pill--scene-mismatch' : ''}`}
            role="group"
            aria-label={`Scene: ${targetSceneName}`}
          >
            <svg className="tp-pill-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M6 1.5 C 3.8 1.5 2.4 3 2.4 4.8 C 2.4 7.4 6 10.5 6 10.5 C 6 10.5 9.6 7.4 9.6 4.8 C 9.6 3 8.2 1.5 6 1.5 Z" />
              <circle cx="6" cy="4.8" r="1.3" />
            </svg>
            <span>{targetSceneName}</span>
          </span>
        </div>

        {prerequisites.length > 0 && (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset's UA box fights the chip row layout.
          <div className="tp-prereqs" role="group" aria-label="Prerequisites">
            <span className="tp-prereqs-label">Recommended first</span>
            {prerequisites.map((prereq) => {
              const prereqDone = loadTutorialProgress(prereq.id)?.completed ?? false;
              return (
                <button
                  key={prereq.id}
                  type="button"
                  className={`tp-prereqs-chip${prereqDone ? ' done' : ''}`}
                  onClick={() => onSelectTutorial(prereq.id)}
                >
                  {prereqDone && (
                    <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                      <path d="M2 5 L4.5 7.5 L8 3" />
                    </svg>
                  )}
                  <span>{prereq.title}</span>
                </button>
              );
            })}
          </div>
        )}

        <p className="tp-detail-desc">{tutorial.description}</p>

        <p className={`tp-progress${isCompleted ? ' completed' : ''}`}>
          {isCompleted
            ? `Completed · ${resolved.effectiveStepCount} of ${resolved.effectiveStepCount} steps`
            : hasStarted
              ? // Saved steps can include ones this device skips (desktop-only on touch);
                // count only steps this run shows.
                `${countCompletedSteps(resolved.countedSteps, progress?.completedSteps)} of ${resolved.effectiveStepCount} steps completed`
              : `${resolved.effectiveStepCount} steps remaining`}
        </p>

        {showDesktopOnlyNote && (
          <p className="tp-mobile-note" title="These steps need a mouse, a keyboard or the desktop layouts.">
            {resolved.desktopOnlyStepCount} desktop-only step{resolved.desktopOnlyStepCount === 1 ? '' : 's'} skipped
          </p>
        )}
      </div>

      {needsConfirm && pendingSceneConfirm && !isRunning ? (
        <div
          className="tp-cta-confirm"
          role="alertdialog"
          aria-label={needsSceneSwitch ? 'Confirm scene switch' : 'Confirm switching tutorial'}
        >
          <p className="tp-cta-confirm-text">
            {needsSceneSwitch ? (
              targetSceneKind === 'lobby' ? (
                <>
                  Starting will return to the <strong>{targetSceneName}</strong>.
                </>
              ) : (
                <>
                  Starting will load the <strong>{targetSceneName}</strong> encounter.
                </>
              )
            ) : (
              <>Starting will end your current tutorial.</>
            )}
            {needsSceneSwitch && currentSceneName ? (
              <>
                {' '}
                Currently in <strong>{currentSceneName}</strong>.
              </>
            ) : null}
            {willEndRunningTutorial ? ' Your progress is saved.' : ''}
          </p>
          <div className="tp-cta-confirm-actions">
            <OsrsButton className="tp-start" onClick={() => setPendingSceneConfirm(false)}>
              Cancel
            </OsrsButton>
            <OsrsButton variant="primary" className="tp-start" onClick={() => onStart(tutorial.id)}>
              Switch &amp; Start
            </OsrsButton>
          </div>
        </div>
      ) : (
        <div className="tp-cta">
          <OsrsButton variant="primary" className="tp-start" onClick={handleBeginClick}>
            {startLabel}
          </OsrsButton>
          {(isCompleted || hasStarted) && !isRunning && (
            <button type="button" className="tp-reset-link" onClick={() => onReset(tutorial.id)}>
              Reset progress
            </button>
          )}
        </div>
      )}
    </>
  );
}

function EmptyDetail() {
  return (
    <div className="tp-empty">
      <h2 className="tp-detail-title">No tutorials available</h2>
      <p className="tp-detail-desc">Tutorials will appear here as encounters are added to the simulator.</p>
    </div>
  );
}
