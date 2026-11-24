// @vitest-environment jsdom
// Deliberately NOT happy-dom: happy-dom's window.confirm handling differs, breaking the in-app confirm assertions.

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTutorialProgress, resetTutorialProgress } from '../../tutorial/persistence';
import { TutorialPickerModal } from '../TutorialPickerModal';

const touchOnly = vi.hoisted(() => ({ current: false }));
vi.mock('../../hooks/useIsTouchOnly', () => ({ useIsTouchOnly: () => touchOnly.current }));

const tutorialProgress: Record<string, { completed?: boolean; lastStep?: number; completedSteps?: number[] } | null> = {
  main: { completed: false, lastStep: -1 },
  advanced: { completed: false, lastStep: -1 },
};

// Tutorial stubs + courses live inside vi.hoisted() so they exist when vi.mock factories run.
// vi.mock is hoisted above module-level const declarations, so all referenced data must be hoisted too.
const { stubs, courses } = vi.hoisted(() => {
  const mainStub = {
    id: 'main',
    title: 'Getting Started',
    description: 'Test main tutorial description.',
    surface: 'app' as const,
    steps: [
      { kind: 'spotlight' as const, popover: { title: 'a', description: 'a' } },
      { kind: 'spotlight' as const, popover: { title: 'b', description: 'b' } },
    ],
  };
  const advancedStub = {
    id: 'advanced',
    title: 'Advanced',
    description: 'Test advanced tutorial description.',
    surface: 'app' as const,
    steps: [
      { kind: 'spotlight' as const, popover: { title: 'a', description: 'a' } },
      { kind: 'spotlight' as const, popover: { title: 'b', description: 'b' } },
      { kind: 'spotlight' as const, popover: { title: 'c', description: 'c' } },
      // Shown only where its target exists, so the step count leaves it out.
      {
        kind: 'spotlight' as const,
        popover: { title: 'd', description: 'd' },
        skipIfMissing: true,
        conditional: true,
      },
      // A touch-only device skips it.
      { kind: 'spotlight' as const, popover: { title: 'e', description: 'e' }, desktopOnly: true },
      // Both: never counted, on any device.
      {
        kind: 'spotlight' as const,
        popover: { title: 'f', description: 'f' },
        skipIfMissing: true,
        conditional: true,
        desktopOnly: true,
      },
    ],
  };
  const gettingStartedCourse = {
    id: 'app-getting-started',
    title: 'Getting Started',
    surface: 'app' as const,
    eyebrow: 'App · Onboarding',
    tracks: [{ id: 'walkthrough' as const, label: 'Walkthroughs', tutorialIds: ['main'] }],
  };
  const advancedCourse = {
    id: 'app-advanced',
    title: 'Advanced',
    surface: 'app' as const,
    eyebrow: 'App · Power Tools',
    tracks: [{ id: 'walkthrough' as const, label: 'Walkthroughs', tutorialIds: ['advanced'] }],
  };
  const yamaBasicsStub = {
    id: 'yama-basics',
    title: 'Yama Basics',
    description: 'Test yama basics description.',
    surface: 'encounter' as const,
    estimatedDurationMin: 8,
    encounterContext: { kind: 'yama_p3' },
    steps: [{ kind: 'spotlight' as const, popover: { title: 'a', description: 'a' } }],
  };
  const yamaWipStub = {
    id: 'yama-wip',
    title: 'Yama WIP Drill',
    description: 'Test wip description.',
    surface: 'encounter' as const,
    estimatedDurationMin: 3,
    availability: 'wip' as const,
    encounterContext: { kind: 'yama_p3' },
    steps: [{ kind: 'spotlight' as const, popover: { title: 'a', description: 'a' } }],
  };
  const yamaDrillStub = {
    id: 'yama-drill',
    title: 'Yama Drill',
    description: 'Test yama drill description.',
    surface: 'encounter' as const,
    estimatedDurationMin: 4,
    encounterContext: { kind: 'yama_p3' },
    steps: [{ kind: 'spotlight' as const, popover: { title: 'a', description: 'a' } }],
  };
  const yamaCourse = {
    id: 'yama',
    title: 'Yama',
    surface: 'encounter' as const,
    eyebrow: 'Boss · Phase 3',
    encounterKind: 'yama_p3',
    tracks: [{ id: 'walkthrough' as const, label: 'Walkthroughs', tutorialIds: ['yama-basics', 'yama-wip'] }],
  };
  return {
    stubs: [mainStub, advancedStub, yamaBasicsStub, yamaWipStub, yamaDrillStub],
    courses: [gettingStartedCourse, advancedCourse, yamaCourse],
  };
});

vi.mock('../../tutorial/content', () => ({
  TUTORIAL_REGISTRY: stubs,
  TRAINING_COURSES: courses,
  getTutorialById: (id: string) => stubs.find((t) => t.id === id),
  getCourseById: (id: string) => courses.find((c) => c.id === id),
  getCourseForEncounterKind: (kind: string | null | undefined) => {
    if (!kind) return undefined;
    return courses.find((c) => c.surface === 'encounter' && c.encounterKind === kind);
  },
  getCourseForTutorial: (tutorialId: string) =>
    courses.find((c) => c.tracks.some((t) => t.tutorialIds.includes(tutorialId))),
  getTrackForTutorial: (course: (typeof courses)[number], tutorialId: string) =>
    course.tracks.find((t) => t.tutorialIds.includes(tutorialId)),
  // Mirrors the real helper: resolve each manifest id, drop unknown ids and
  // work-in-progress lessons. The WIP suite below depends on this filtering.
  getStartableTutorials: (course: (typeof courses)[number]) =>
    course.tracks
      .flatMap((t) => t.tutorialIds)
      .map((id) => stubs.find((s) => s.id === id))
      .filter((t) => t !== undefined && !('availability' in t && t.availability === 'wip')),
  getTutorialsByEncounter: () => [],
  getTutorialTargetEncounter: (t: { encounterContext?: { kind?: string } }) => t.encounterContext?.kind ?? 'lobby',
  assertCoursesAreValid: () => {},
}));

vi.mock('../../tutorial/persistence', () => ({
  loadTutorialProgress: vi.fn((tutorialId: string) => tutorialProgress[tutorialId] ?? null),
  resetTutorialProgress: vi.fn(),
}));

describe('TutorialPickerModal', () => {
  beforeEach(() => {
    tutorialProgress.main = { completed: false, lastStep: -1 };
    tutorialProgress.advanced = { completed: false, lastStep: -1 };
    tutorialProgress['yama-basics'] = { completed: false, lastStep: -1 };
    vi.clearAllMocks();
  });

  afterEach(() => {
    touchOnly.current = false;
    courses[2].tracks = [{ id: 'walkthrough', label: 'Walkthroughs', tutorialIds: ['yama-basics', 'yama-wip'] }];
  });

  it('renders an accessible dialog with close button labeling and "Training" heading', () => {
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close tutorial picker' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument();
  });

  it('keeps curriculum and lesson together without an extra navigation step before Begin', () => {
    const onStart = vi.fn();
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Getting Started' }));
    expect(screen.getByText('Test main tutorial description.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Begin' })).toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Back to lessons' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Advanced.*0\/1/ }));
    expect(screen.queryByText('Test main tutorial description.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Begin' })).toBeInTheDocument();
  });

  it('renders course rail with both App courses + curriculum + detail for default selection', () => {
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Getting Started.*0\/1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Advanced.*0\/1/ })).toBeInTheDocument();

    // Both curriculum-title and detail-title are <h2>, so multiple matches are expected.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Getting Started' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Test main tutorial description.')).toBeInTheDocument();
    expect(screen.getByText('2 steps remaining')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<TutorialPickerModal open onClose={onClose} onStart={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close tutorial picker' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<TutorialPickerModal open onClose={onClose} onStart={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open through a backdrop press until its click, so the click cannot fall through', () => {
    const onClose = vi.fn();
    render(<TutorialPickerModal open onClose={onClose} onStart={vi.fn()} />);
    const backdrop = screen.getByRole('dialog');

    // A touch's mouse events arrive after it; closing on mousedown left the click to land behind.
    fireEvent.pointerDown(backdrop);
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close for a press that began inside the picker and ended on the backdrop', () => {
    const onClose = vi.fn();
    render(<TutorialPickerModal open onClose={onClose} onStart={vi.fn()} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close tutorial picker' }));
    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('switches course (and tutorial) when a different course is clicked in the rail', () => {
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    const advancedRailItem = screen.getByRole('button', { name: /Advanced.*0\/1/ });
    fireEvent.click(advancedRailItem);

    expect(screen.getByText('Test advanced tutorial description.')).toBeInTheDocument();
    expect(screen.getByText('4 steps remaining')).toBeInTheDocument();
  });

  // The Plugins tour's Zuk-only Set Timer step is skipped in the lobby, where the tour runs; counting
  // it promised one step more than the tour showed.
  it('leaves conditional steps out of the step count', () => {
    tutorialProgress.advanced = { completed: true, lastStep: 2 };
    render(<TutorialPickerModal open initialCourseId="app-advanced" onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByText('Completed · 4 of 4 steps')).toBeInTheDocument();
  });

  it('on a touch-only device, counts out the desktop-only steps and says how many it skips', () => {
    touchOnly.current = true;
    render(<TutorialPickerModal open initialCourseId="app-advanced" onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByText('3 steps remaining')).toBeInTheDocument();
    // The conditional desktop-only step is not one this device skips; the tour never shows it.
    expect(screen.getByText('1 desktop-only step skipped')).toBeInTheDocument();
  });

  it('counts only the saved steps this device shows', () => {
    touchOnly.current = true;
    // Saved on desktop: steps a, b and the desktop-only e (index 4) were visited.
    tutorialProgress.advanced = { completed: false, lastStep: 4, completedSteps: [0, 1, 4] };
    render(<TutorialPickerModal open initialCourseId="app-advanced" onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByText('2 of 3 steps completed')).toBeInTheDocument();
  });

  it('starts selected tutorial and uses Begin label when no progress exists', () => {
    const onClose = vi.fn();
    const onStart = vi.fn();
    render(<TutorialPickerModal open onClose={onClose} onStart={onStart} />);

    const startButton = screen.getByRole('button', { name: 'Begin' });
    fireEvent.click(startButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('main');
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('uses Resume label when tutorial has partial progress', () => {
    tutorialProgress.main = { completed: false, lastStep: 0, completedSteps: [0] };

    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 steps completed')).toBeInTheDocument();
  });

  it('uses Replay label when tutorial is completed', () => {
    tutorialProgress.main = { completed: true, lastStep: 1 };
    tutorialProgress.advanced = { completed: true, lastStep: 2 };

    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByText(/Completed · \d+ of \d+ steps/)).toBeInTheDocument();
  });

  it('shows reset progress button when progress exists and resets selected tutorial progress', () => {
    tutorialProgress.main = { completed: false, lastStep: 0 };

    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    const resetButton = screen.getByRole('button', { name: 'Reset progress' });
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);

    expect(resetTutorialProgress).toHaveBeenCalledWith('main');
    expect(resetTutorialProgress).toHaveBeenCalledTimes(1);
    expect(loadTutorialProgress).toHaveBeenCalled();
  });

  it('does not render a "Don\'t show on startup" checkbox', () => {
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.queryByRole('checkbox', { name: /Don't show on startup/ })).not.toBeInTheDocument();
  });

  it('honors initialCourseId by preselecting the named course', () => {
    render(<TutorialPickerModal open initialCourseId="app-advanced" onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getAllByRole('heading', { level: 2 }).some((el) => el.textContent === 'Advanced')).toBe(true);
    expect(screen.getByText('Test advanced tutorial description.')).toBeInTheDocument();
  });

  it('preselects the encounter course matching currentSceneKind', () => {
    render(<TutorialPickerModal open currentSceneKind="yama_p3" onClose={vi.fn()} onStart={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Yama.*0\/1/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Test yama basics description.')).toBeInTheDocument();
  });

  it('initialCourseId wins over currentSceneKind when both are provided', () => {
    render(
      <TutorialPickerModal
        open
        initialCourseId="app-getting-started"
        currentSceneKind="yama_p3"
        onClose={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Test main tutorial description.')).toBeInTheDocument();
  });

  it('renders a mobile course switcher with every course as an option', () => {
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    // Mobile <select> is always in the DOM (CSS hides it above 720px).
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Getting Started', 'Advanced', 'Yama']);
  });

  it('mobile course switcher changes the selected course when used', () => {
    render(<TutorialPickerModal open onClose={vi.fn()} onStart={vi.fn()} />);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'yama' } });

    expect(screen.getByText('Test yama basics description.')).toBeInTheDocument();
  });

  it('does NOT confirm when browsing/selecting a tutorial while another is running', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TutorialPickerModal open runningTutorialId="main" onClose={vi.fn()} onStart={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Advanced.*0\/1/ }));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows an in-app confirm (no native confirm) before starting a different tutorial than the running one', () => {
    const onStart = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <TutorialPickerModal
        open
        runningTutorialId="main"
        initialCourseId="app-advanced"
        onClose={vi.fn()}
        onStart={onStart}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText(/Starting will end your current tutorial\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Switch & Start' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(expect.any(String));
    confirmSpy.mockRestore();
  });

  describe('WIP tutorials', () => {
    const sectionLabels = () =>
      Array.from(document.querySelectorAll('.tp-section-label')).map((label) => label.textContent);

    it('omits WIP lessons, and hides a track left with no startable lesson', () => {
      courses[2].tracks = [
        { id: 'walkthrough', label: 'Walkthroughs', tutorialIds: ['yama-basics'] },
        { id: 'walkthrough', label: 'Upcoming drills', tutorialIds: ['yama-wip'] },
      ];
      render(<TutorialPickerModal open initialCourseId="yama" onClose={vi.fn()} onStart={vi.fn()} />);

      expect(screen.getByRole('button', { name: /Yama Basics/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Yama WIP Drill/ })).toBeNull();
      // One visible track left, so no section labels.
      expect(sectionLabels()).toEqual([]);
      expect(screen.queryByText(/Coming soon/)).toBeNull();
    });

    it('labels the sections when more than one track has a startable lesson', () => {
      courses[2].tracks = [
        { id: 'walkthrough', label: 'Walkthroughs', tutorialIds: ['yama-basics'] },
        { id: 'walkthrough', label: 'Mechanic Drills', tutorialIds: ['yama-wip', 'yama-drill'] },
      ];
      render(<TutorialPickerModal open initialCourseId="yama" onClose={vi.fn()} onStart={vi.fn()} />);

      expect(sectionLabels()).toEqual(['Walkthroughs', 'Mechanic Drills']);
      expect(screen.getByRole('button', { name: /Yama Drill/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Yama WIP Drill/ })).toBeNull();
    });

    it('excludes WIP tutorials from the course rail progress count', () => {
      render(<TutorialPickerModal open initialCourseId="yama" onClose={vi.fn()} onStart={vi.fn()} />);

      // Yama course has 2 tutorials but only 1 is startable — rail shows 0/1.
      expect(screen.getByRole('button', { name: /Yama.*0\/1/ })).toBeInTheDocument();
    });
  });
});
