// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotlightStep } from '../../types';

type DestroyCb = () => void;
type FakePopoverDom = {
  wrapper: HTMLElement;
  arrow: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  footer: HTMLElement;
  progress: HTMLElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  footerButtons: HTMLElement;
};
type FakeStep = {
  /** Compared between outgoing and incoming steps to mirror Driver's element-change deselection. */
  element?: string | Element | (() => Element);
  onHighlightStarted?: (...a: unknown[]) => void;
  onHighlighted?: (...a: unknown[]) => void;
  onDeselected?: (...a: unknown[]) => void;
  popover?: {
    onPopoverRender?: (popover: FakePopoverDom) => void;
    onNextClick?: (...a: unknown[]) => void;
  };
};
type DriverConfig = {
  steps?: FakeStep[];
  onDestroyed?: DestroyCb;
  onPopoverRender?: (popover: FakePopoverDom) => void;
  onNextClick?: (...a: unknown[]) => void;
  onPrevClick?: (...a: unknown[]) => void;
  onCloseClick?: (el: unknown, step: unknown, opts: { driver: { destroy: () => void } }) => void;
};

interface FakeDriverInstance {
  drive: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  moveNext: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn<(index: number) => void>>;
  getActiveIndex: () => number | undefined;
  getActiveElement: () => Element | undefined;
  __config: DriverConfig;
  __driveCalls: number[];
  __popover: FakePopoverDom | null;
}

const driverInstances: FakeDriverInstance[] = [];
/** What the fake Driver reports as spotlit, for every instance. */
const spotlitElement = vi.hoisted(() => ({ current: null as Element | null }));
/** TOUR_SUSPENDED_CLASS, for the hoisted fake Driver (which cannot import the runner). */
const SUSPENDED_CLASS = 'tutorial-suspended';
/** Driver's highlight phases in the order the fake ran them, for ordering assertions. */
const driverLog = vi.hoisted(() => [] as string[]);

/**
 * Stand-in for the popover DOM Driver.js hands to onPopoverRender. Real
 * elements, mounted in the document, because the step-nav mounts into them and
 * installs document-level listeners.
 */
function makePopoverDom(): FakePopoverDom {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => document.createElement(tag);
  const wrapper = el('div');
  // As Driver's: the step nav inside it is a dialog, which must not read as one the user opened.
  wrapper.className = 'driver-popover';
  const description = el('div');
  const footer = el('div');
  const progress = el('span');
  const dom: FakePopoverDom = {
    wrapper,
    arrow: el('div'),
    title: el('div'),
    description,
    footer,
    progress,
    previousButton: el('button'),
    nextButton: el('button'),
    closeButton: el('button'),
    footerButtons: el('div'),
  };
  footer.append(progress, dom.previousButton, dom.nextButton);
  wrapper.append(dom.title, description, footer);
  document.body.append(wrapper);
  return dom;
}

vi.mock('driver.js', () => ({
  driver: vi.fn((config: DriverConfig) => {
    let activeIndex: number | undefined;
    const driveTo = (startIdx: number): void => {
      inst.__driveCalls.push(startIdx);
      // Real Driver deselects the outgoing step ONLY when the resolved element
      // changes. Reproducing that is what makes same-element navigation (two
      // consecutive steps sharing a target) testable at all — a fake that
      // always deselects hides the listener leak it causes.
      const prevIdx = activeIndex;
      if (prevIdx !== undefined && prevIdx !== startIdx) {
        const prev = config.steps?.[prevIdx];
        if (prev?.element !== config.steps?.[startIdx]?.element) prev?.onDeselected?.();
      }
      // Driver sets activeIndex, starts the highlight (before it scrolls the target into view),
      // renders the popover, and fires onHighlighted a frame later.
      activeIndex = startIdx;
      const step = config.steps?.[startIdx];
      step?.onHighlightStarted?.();
      driverLog.push(`position ${startIdx}`);
      const render = step?.popover?.onPopoverRender ?? config.onPopoverRender;
      if (render) {
        inst.__popover = makePopoverDom();
        render(inst.__popover);
      }
      // Driver then focuses the first focusable control of the popover or the target. A popover the
      // suspended tour hides (tutorial.css: display none) has none, so the target takes focus.
      const popoverShown = !document.body.classList.contains(SUSPENDED_CLASS);
      const target =
        typeof step?.element === 'string'
          ? document.querySelector(step.element)
          : typeof step?.element === 'function'
            ? step.element()
            : (step?.element ?? null);
      const focusable = [
        ...(popoverShown && inst.__popover ? inst.__popover.wrapper.querySelectorAll<HTMLElement>('button') : []),
        ...(target instanceof HTMLElement ? [target] : []),
      ];
      focusable[0]?.focus();
      step?.onHighlighted?.();
    };
    const inst: FakeDriverInstance = {
      drive: vi.fn(driveTo),
      destroy: vi.fn(() => {
        config.onDestroyed?.();
      }),
      refresh: vi.fn(),
      moveNext: vi.fn(),
      moveTo: vi.fn(driveTo),
      getActiveIndex: () => activeIndex,
      getActiveElement: () => spotlitElement.current ?? undefined,
      __config: config,
      __driveCalls: [],
      __popover: null,
    };
    driverInstances.push(inst);
    return inst;
  }),
}));

vi.mock('driver.js/dist/driver.css', () => ({}));
vi.mock('../../tutorial.css', () => ({}));

import { SpotlightRunner, TOUR_SUSPENDED_CLASS } from '../SpotlightRunner';

const mkStep = (id: string): SpotlightStep => ({
  kind: 'spotlight',
  popover: { title: id, description: `desc-${id}` },
});

/**
 * Every runner started in a test is tracked and destroyed. mountStepNav binds
 * capture-phase listeners to `document`, which resetting document.body does NOT
 * remove — leaving them live would accumulate detached panels across the file
 * and let one test's keyboard handling fire inside another's.
 */
const startedRunners: SpotlightRunner[] = [];
function newRunner(callbacks?: ConstructorParameters<typeof SpotlightRunner>[0]): SpotlightRunner {
  const runner = new SpotlightRunner(callbacks);
  startedRunners.push(runner);
  return runner;
}

beforeEach(() => {
  driverInstances.length = 0;
  document.body.innerHTML = '';
});

afterEach(() => {
  spotlitElement.current = null;
  driverLog.length = 0;
});

afterEach(() => {
  for (const runner of startedRunners.splice(0)) runner.destroy();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('SpotlightRunner — lifecycle', () => {
  it('start with empty steps does not instantiate Driver.js', () => {
    const runner = newRunner();
    runner.start({ steps: [] });
    expect(driverInstances).toHaveLength(0);
    expect(runner.isActive()).toBe(false);
  });

  it('start() returns false when there are no steps to show', () => {
    const runner = newRunner();
    expect(runner.start({ steps: [] })).toBe(false);
    expect(runner.isActive()).toBe(false);
  });

  it('start() returns false when every step is filtered out on a touch device', () => {
    const runner = newRunner();
    const steps: SpotlightStep[] = [
      { ...mkStep('a'), desktopOnly: true },
      { ...mkStep('b'), desktopOnly: true },
    ];
    expect(runner.start({ steps, isTouchOnly: true })).toBe(false);
    expect(driverInstances).toHaveLength(0);
    expect(runner.isActive()).toBe(false);
  });

  it('start() returns true when at least one step survives filtering', () => {
    const runner = newRunner();
    expect(runner.start({ steps: [mkStep('a')] })).toBe(true);
    expect(runner.isActive()).toBe(true);
  });

  it('start with steps instantiates Driver.js, marks runner active, drives at resume index 0', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b')] });
    expect(driverInstances).toHaveLength(1);
    expect(runner.isActive()).toBe(true);
    expect(driverInstances[0].drive).toHaveBeenCalledWith(0);
  });

  it('resumeFromStep drives at the resume index when within bounds', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')], resumeFromStep: 2 });
    expect(driverInstances[0].drive).toHaveBeenCalledWith(2);
  });

  it('resumeFromStep is clamped to last step when out of bounds', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b')], resumeFromStep: 99 });
    expect(driverInstances[0].drive).toHaveBeenCalledWith(1);
  });

  it('restart auto-destroys the previous Driver.js instance', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a')] });
    const first = driverInstances[0];
    runner.start({ steps: [mkStep('a'), mkStep('b')] });
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(driverInstances).toHaveLength(2);
    expect(runner.isActive()).toBe(true);
  });

  it('destroy before start is a no-op', () => {
    const runner = newRunner();
    expect(() => runner.destroy()).not.toThrow();
    expect(driverInstances).toHaveLength(0);
  });

  it('destroy after start tears down Driver.js and clears active state', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a')] });
    runner.destroy();
    expect(driverInstances[0].destroy).toHaveBeenCalledTimes(1);
    expect(runner.isActive()).toBe(false);
  });

  it('destroy is idempotent after natural completion', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a')] });
    driverInstances[0].__config.onDestroyed?.();
    expect(runner.isActive()).toBe(false);
    expect(() => runner.destroy()).not.toThrow();
  });
});

describe('SpotlightRunner — callbacks', () => {
  it('onStepHighlighted fires with the step and the steps visited when Driver.js highlights a step', () => {
    const onStepHighlighted = vi.fn();
    const runner = newRunner({ onStepHighlighted });
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')], resumeFromStep: 1, visitedSteps: [0] });
    expect(onStepHighlighted).toHaveBeenCalledWith(1, [0, 1], null);
  });

  it('reports the element Driver spotlit, for a host that has to keep it on screen', () => {
    const onStepHighlighted = vi.fn();
    const target = document.createElement('button');
    spotlitElement.current = target;
    const runner = newRunner({ onStepHighlighted });
    runner.start({ steps: [mkStep('a')] });
    expect(onStepHighlighted).toHaveBeenCalledWith(0, [0], target);
  });

  it('onStepHighlighted reports steps by their place in the tour when desktopOnly steps are dropped', () => {
    const onStepHighlighted = vi.fn();
    const runner = newRunner({ onStepHighlighted });
    const steps: SpotlightStep[] = [mkStep('a'), { ...mkStep('b'), desktopOnly: true }, mkStep('c')];
    runner.start({ steps, isTouchOnly: true, resumeFromStep: 2, visitedSteps: [0] });
    expect(onStepHighlighted).toHaveBeenCalledWith(2, [0, 2], null);
  });

  it('onDestroyed reports reachedLastStep=true once every step has been shown', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({ steps: [mkStep('a'), mkStep('b')], resumeFromStep: 1, visitedSteps: [0] });
    runner.destroy();
    expect(onDestroyed).toHaveBeenCalledWith({ reachedLastStep: true, lastStep: 1, visitedSteps: [0, 1] });
  });

  it('onDestroyed reports reachedLastStep=false when destroyed before reaching the last step', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')] });
    runner.destroy();
    expect(onDestroyed).toHaveBeenCalledWith({ reachedLastStep: false, lastStep: 0, visitedSteps: [0] });
  });

  it('isReplay pre-marks all steps as completed (no onStepHighlighted gating)', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({ steps: [mkStep('a'), mkStep('b')], isReplay: true });
    expect(runner.isActive()).toBe(true);
    runner.destroy();
    expect(onDestroyed).toHaveBeenCalledTimes(1);
  });

  // The drawer puts the final step one click away and `completed` is sticky in
  // persistence, so completion must mean "saw every step", not "was on the last
  // one". Otherwise one jump permanently marks a tour finished end-to-end.
  it('does NOT report reachedLastStep when the last step was reached by a jump', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')] });

    driverInstances[0].moveTo(2);
    runner.destroy();

    expect(onDestroyed).toHaveBeenCalledWith({
      reachedLastStep: false,
      lastStep: 2,
      visitedSteps: [0, 2],
    });
  });

  it('restores the visited set from persistence, not from the bookmark', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({
      steps: [mkStep('a'), mkStep('b'), mkStep('c'), mkStep('d')],
      resumeFromStep: 3,
      visitedSteps: [0, 3],
    });
    runner.destroy();

    expect(onDestroyed).toHaveBeenCalledWith({
      reachedLastStep: false,
      lastStep: 3,
      visitedSteps: [0, 3],
    });
  });
});

describe('SpotlightRunner — close button delegates to driver.destroy()', () => {
  it('onCloseClick destroys the Driver.js instance', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a')] });
    const inst = driverInstances[0];
    inst.__config.onCloseClick?.(null, null, {
      driver: {
        destroy: () => {
          (inst.destroy as () => void)();
        },
      },
    });
    expect(inst.destroy).toHaveBeenCalled();
  });
});

describe('SpotlightRunner — a modal, menu or popover the user opens over the tour', () => {
  /** MutationObserver callbacks run as microtasks. */
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const body = document.body.classList;
  const open = (markup: string): HTMLElement => {
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    const layer = holder.firstElementChild as HTMLElement;
    document.body.append(layer);
    return layer;
  };

  afterEach(() => {
    body.remove('driver-active', TOUR_SUSPENDED_CLASS);
  });

  /** A started tour, with the body class real Driver adds (the fake does not). */
  function startTour() {
    newRunner().start({ steps: [mkStep('a'), mkStep('b')] });
    body.add('driver-active');
    return driverInstances[0];
  }

  it.each([
    ['a modal', '<div aria-modal="true" role="dialog"></div>'],
    ['a sheet card (the Encounters picker)', '<div data-msheet="overlay"><div data-msheet="card"></div></div>'],
    ['a context menu', '<div role="dialog"><div role="menu"></div></div>'],
    ['an anchored popover', '<div data-msheet="popover"></div>'],
  ])('steps aside for %s, so it is above the overlay and takes input', async (_name, markup) => {
    startTour();
    open(markup);
    await settle();

    expect(body.contains(TOUR_SUSPENDED_CLASS)).toBe(true);
    // Driver's `.driver-active *` rule is what left a modal's close button unclickable.
    expect(body.contains('driver-active')).toBe(false);
  });

  it('comes back, re-placed, when the layer closes', async () => {
    const inst = startTour();
    const layer = open('<div aria-modal="true"></div>');
    await settle();
    layer.remove();
    await settle();

    expect(body.contains(TOUR_SUSPENDED_CLASS)).toBe(false);
    expect(body.contains('driver-active')).toBe(true);
    expect(inst.refresh).toHaveBeenCalled();
    expect(inst.destroy).not.toHaveBeenCalled();
  });

  it.each([
    ['its own step nav', '<div class="driver-popover"><div role="menu"></div></div>'],
    ['a launcher pane it spotlights (a non-modal dialog)', '<div role="dialog" aria-label="Practice"></div>'],
    ['a layer kept mounted but hidden', '<div hidden><div aria-modal="true"></div></div>'],
  ])('stays up for %s', async (_name, markup) => {
    startTour();
    open(markup);
    await settle();

    expect(body.contains(TOUR_SUSPENDED_CLASS)).toBe(false);
  });

  it('starts aside when a layer is already open', () => {
    open('<div aria-modal="true"></div>');
    startTour();

    expect(body.contains(TOUR_SUSPENDED_CLASS)).toBe(true);
  });

  // Getting Started's Quick Search step completes as the search opens. Moving on behind the open
  // search, Driver focused the next step's target (the hidden popover has no controls), and typing
  // went nowhere.
  it("holds an action's auto-advance until the layer closes, so Driver cannot take its focus", async () => {
    const next = document.createElement('button');
    next.id = 'next-target';
    document.body.append(next);
    const quickSearch: SpotlightStep = {
      ...mkStep('quick'),
      action: { event: 'evt-quick', waitingText: 'open it', completedText: 'done', autoAdvance: true },
    };
    newRunner().start({ steps: [quickSearch, { ...mkStep('next'), element: '#next-target' }] });
    body.add('driver-active');
    const inst = driverInstances[0];

    const search = open('<div aria-modal="true" role="dialog"><input /></div>');
    const input = search.querySelector('input') as HTMLInputElement;
    input.focus();
    await settle();
    window.dispatchEvent(new CustomEvent('evt-quick'));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(document.activeElement).toBe(input);
    expect(inst.moveTo).not.toHaveBeenCalled();

    search.remove();
    await settle();
    expect(inst.moveTo).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('drops a held move when the tour ends while the layer is still open', async () => {
    const quickSearch: SpotlightStep = {
      ...mkStep('quick'),
      action: { event: 'evt-quick', waitingText: 'open it', completedText: 'done', autoAdvance: true },
    };
    const runner = newRunner();
    runner.start({ steps: [quickSearch, mkStep('next')] });
    const inst = driverInstances[0];
    const search = open('<div aria-modal="true"></div>');
    await settle();
    window.dispatchEvent(new CustomEvent('evt-quick'));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    runner.destroy();
    search.remove();
    await settle();

    expect(inst.moveTo).not.toHaveBeenCalled();
  });

  it('ends aside without leaving the page inert behind it', async () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a')] });
    body.add('driver-active');
    open('<div aria-modal="true"></div>');
    await settle();
    runner.destroy();

    expect(body.contains(TOUR_SUSPENDED_CLASS)).toBe(false);
    expect(body.contains('driver-active')).toBe(false);
    // Nothing watches the page once the tour is gone.
    open('<div aria-modal="true"></div>');
    await settle();
    expect(body.contains(TOUR_SUSPENDED_CLASS)).toBe(false);
  });
});

describe('SpotlightRunner — onEnter/onExit lifecycle (exactly-once)', () => {
  const hookStep = (id: string, onEnter: () => void, onExit: () => void): SpotlightStep => ({
    kind: 'spotlight',
    popover: { title: id, description: `desc-${id}` },
    onEnter,
    onExit,
  });

  it('fires onEnter once when a step is first highlighted, and not onExit yet', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA)] });
    expect(enterA).toHaveBeenCalledTimes(1);
    expect(exitA).not.toHaveBeenCalled();
  });

  it('exits the prior step and enters the next on forward navigation (once each)', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const enterB = vi.fn();
    const exitB = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA), hookStep('b', enterB, exitB)] });
    const cfg = driverInstances[0].__config;
    // Driver.js order: onDeselected(prev) then onHighlightStarted(next).
    cfg.steps?.[0].onDeselected?.();
    cfg.steps?.[1].onHighlightStarted?.();
    expect(exitA).toHaveBeenCalledTimes(1);
    expect(enterB).toHaveBeenCalledTimes(1);
    expect(enterA).toHaveBeenCalledTimes(1);
    expect(exitB).not.toHaveBeenCalled();
  });

  it('does not exit the wrong step when onHighlightStarted(next) fires before onDeselected(prev)', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const enterB = vi.fn();
    const exitB = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA), hookStep('b', enterB, exitB)] });
    const cfg = driverInstances[0].__config;
    cfg.steps?.[1].onHighlightStarted?.();
    cfg.steps?.[0].onDeselected?.();
    expect(exitA).toHaveBeenCalledTimes(1);
    expect(enterB).toHaveBeenCalledTimes(1);
    expect(exitB).not.toHaveBeenCalled();
  });

  it('still exits the prior step when Driver skips onDeselected (consecutive same-element steps)', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const enterB = vi.fn();
    const exitB = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA), hookStep('b', enterB, exitB)] });
    const cfg = driverInstances[0].__config;
    cfg.steps?.[1].onHighlightStarted?.();
    expect(exitA).toHaveBeenCalledTimes(1);
    expect(enterB).toHaveBeenCalledTimes(1);
  });

  it('fires onExit exactly once on normal destruction (Driver deselects then destroys)', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA)] });
    const cfg = driverInstances[0].__config;
    cfg.steps?.[0].onDeselected?.();
    cfg.onDestroyed?.();
    expect(exitA).toHaveBeenCalledTimes(1);
  });

  it('fires onExit once on teardown when onDeselected never fires (destroy mid-step)', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA)] });
    driverInstances[0].__config.onDestroyed?.();
    expect(exitA).toHaveBeenCalledTimes(1);
  });

  // A plugin row expands on enter and the row above collapses on exit. Driver scrolls the target
  // into view and places the popover right after onHighlightStarted, so the reshaping has to be
  // committed by then or the row shifts out of view once it lands.
  it('enters a step, committed through the host, before Driver positions it', () => {
    const runner = newRunner({
      commitSync: (update) => {
        driverLog.push('commit start');
        update();
        driverLog.push('commit end');
      },
    });
    runner.start({
      steps: [
        hookStep(
          'a',
          () => driverLog.push('enter a'),
          () => driverLog.push('exit a'),
        ),
      ],
    });

    expect(driverLog).toEqual(['commit start', 'enter a', 'commit end', 'position 0']);
  });

  it('never calls onExit for a step that was not the entered one', () => {
    const enterA = vi.fn();
    const exitA = vi.fn();
    const runner = newRunner();
    runner.start({ steps: [hookStep('a', enterA, exitA), mkStep('b')] });
    driverInstances[0].__config.onDestroyed?.();
    expect(enterA).toHaveBeenCalledTimes(1);
    expect(exitA).toHaveBeenCalledTimes(1);
  });
});

describe('SpotlightRunner — step nav (jump-to-step)', () => {
  const actionStep = (id: string): SpotlightStep => ({
    kind: 'spotlight',
    popover: { title: id, description: `desc-${id}` },
    action: { event: `evt-${id}`, waitingText: `do ${id}`, completedText: `did ${id}` },
  });

  const trigger = () => document.querySelector<HTMLButtonElement>('.tutorial-stepnav-trigger');
  const rows = () => Array.from(document.querySelectorAll('.tutorial-stepnav-item'));
  const labels = () => rows().map((row) => row.querySelector('.tutorial-stepnav-label')?.textContent);

  it('replaces the native progress readout with a trigger showing the same count', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')], resumeFromStep: 1 });

    expect(driverInstances[0].__popover?.progress.classList.contains('tutorial-stepnav-native')).toBe(true);
    expect(trigger()?.textContent).toContain('2');
    expect(trigger()?.textContent).toContain('3');
    expect(trigger()?.getAttribute('aria-label')).toBe('Step 2 of 3. Jump to another step.');
  });

  it('lists every surviving step by title and omits filtered-out steps', () => {
    const runner = newRunner();
    const steps: SpotlightStep[] = [mkStep('a'), { ...mkStep('b'), desktopOnly: true }, mkStep('c')];
    runner.start({ steps, isTouchOnly: true });

    expect(labels()).toEqual(['a', 'c']);
  });

  it('omits the nav entirely for a single-step tutorial', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a')] });

    expect(trigger()).toBeNull();
    expect(driverInstances[0].__popover?.progress.classList.contains('tutorial-stepnav-native')).toBe(false);
  });

  it('marks saved visited steps done, the bookmark active, and the rest pending', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')], resumeFromStep: 1, visitedSteps: [0] });

    expect(rows().map((row) => row.className)).toEqual([
      'tutorial-stepnav-item done',
      'tutorial-stepnav-item active',
      'tutorial-stepnav-item pending',
    ]);
  });

  it('marks nothing before the bookmark done when no visited steps were saved', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')], resumeFromStep: 1 });

    expect(rows().map((row) => row.className)).toEqual([
      'tutorial-stepnav-item pending',
      'tutorial-stepnav-item active',
      'tutorial-stepnav-item pending',
    ]);
  });

  it('jumps to the clicked step and re-renders the nav against the new position', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')] });

    trigger()?.click();
    rows()[2].querySelector<HTMLButtonElement>('.tutorial-stepnav-item-btn')?.click();

    expect(driverInstances[0].moveTo).toHaveBeenCalledWith(2);
    expect(trigger()?.getAttribute('aria-label')).toBe('Step 3 of 3. Jump to another step.');
  });

  it('marks a step visited once highlighted, so it reads done after jumping away', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c')] });
    driverInstances[0].moveTo(2);

    expect(rows().map((row) => row.className)).toEqual([
      'tutorial-stepnav-item done',
      'tutorial-stepnav-item pending',
      'tutorial-stepnav-item active',
    ]);
  });

  it('closes the panel on Escape without tearing down the tutorial', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b')] });

    trigger()?.click();
    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    expect(runner.isActive()).toBe(true);
  });

  it('renders the nav on action steps too (step-level popover hook path)', () => {
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), mkStep('b')] });

    expect(trigger()).not.toBeNull();
    expect(labels()).toEqual(['a', 'b']);
  });

  it('removes the nav DOM on destroy', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b')] });
    runner.destroy();

    expect(trigger()).toBeNull();
  });
});

describe('SpotlightRunner — action step skip', () => {
  const actionStep = (id: string): SpotlightStep => ({
    kind: 'spotlight',
    popover: { title: id, description: `desc-${id}` },
    action: { event: `evt-${id}`, waitingText: `do ${id}`, completedText: `did ${id}` },
  });

  const skipBtn = () => document.querySelector<HTMLButtonElement>('.tutorial-skip-action');

  it('offers the skip control on the first render, with no failed clicks required', () => {
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), mkStep('b')] });

    expect(skipBtn()).not.toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(true);
  });

  it('skipping completes the step and releases the Next button', () => {
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), mkStep('b')] });
    const popover = driverInstances[0].__popover;

    skipBtn()?.click();

    expect(popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(false);
    expect(document.querySelector('.tutorial-action-indicator')?.className).toBe('tutorial-action-indicator completed');
    expect(skipBtn()).toBeNull();
  });

  it('omits the skip control on a step already completed in a prior run', () => {
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), actionStep('b')], isReplay: true });

    expect(skipBtn()).toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(false);
  });

  // Resuming a tour must pre-satisfy the gates of the steps the save marks visited, or navigating
  // back over them traps the user behind actions they already performed in an earlier session.
  it('pre-satisfies the gate of saved visited action steps before the resume bookmark', () => {
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), actionStep('b'), mkStep('c')], resumeFromStep: 2, visitedSteps: [0, 1] });

    driverInstances[0].moveTo(0);

    expect(skipBtn()).toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(false);
    expect(document.querySelector('.tutorial-action-indicator')?.className).toBe('tutorial-action-indicator completed');
  });

  it('leaves the gate active on an action step at or after the resume bookmark', () => {
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), actionStep('b'), mkStep('c')], resumeFromStep: 1 });

    expect(skipBtn()).not.toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(true);
  });
});

describe('SpotlightRunner — guarded jumps and action teardown', () => {
  const actionStep = (id: string, element?: string): SpotlightStep => ({
    kind: 'spotlight',
    element,
    popover: { title: id, description: `desc-${id}` },
    action: { event: `evt-${id}`, waitingText: `do ${id}`, completedText: `did ${id}` },
  });

  const jumpTo = (index: number) => {
    document.querySelector<HTMLButtonElement>('.tutorial-stepnav-trigger')?.click();
    const rows = document.querySelectorAll<HTMLButtonElement>('.tutorial-stepnav-item-btn');
    rows[index]?.click();
  };

  it('redirects a drawer jump into a guarded step to its fallback when the prerequisite is missing', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = {
      ...mkStep('c'),
      resumeGuard: { isReady: () => false, fallbackStep: 1 },
    };
    runner.start({ steps: [mkStep('a'), mkStep('b'), guarded] });

    jumpTo(2);

    expect(driverInstances[0].moveTo).toHaveBeenCalledWith(1);
  });

  it('honors a drawer jump into a guarded step when its prerequisite is present', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = {
      ...mkStep('c'),
      resumeGuard: { isReady: () => true, fallbackStep: 1 },
    };
    runner.start({ steps: [mkStep('a'), mkStep('b'), guarded] });

    jumpTo(2);

    expect(driverInstances[0].moveTo).toHaveBeenCalledWith(2);
  });

  // Driver resolves the destination's element before it deselects the outgoing step, so chrome the
  // outgoing step's onExit restores must be committed before the move, not after it.
  it("leaves the current step inside the host's commitSync before a drawer jump moves", () => {
    const order: string[] = [];
    const runner = newRunner({
      commitSync: (update) => {
        order.push('commit start');
        update();
        order.push('commit end');
      },
    });
    const leaving: SpotlightStep = { ...mkStep('a'), onExit: () => order.push('exit a') };
    runner.start({ steps: [leaving, mkStep('b'), mkStep('c')] });
    order.length = 0; // entering the first step is committed too
    driverInstances[0].moveTo.mockImplementation(() => order.push('moveTo'));

    jumpTo(2);

    expect(order).toEqual(['commit start', 'exit a', 'commit end', 'moveTo']);
    expect(driverInstances[0].moveTo).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('leaves the current step before a drawer jump moves when the host has no commitSync', () => {
    const order: string[] = [];
    const runner = newRunner();
    const leaving: SpotlightStep = { ...mkStep('a'), onExit: () => order.push('exit a') };
    runner.start({ steps: [leaving, mkStep('b')] });
    driverInstances[0].moveTo.mockImplementation(() => order.push('moveTo'));

    jumpTo(1);

    expect(order).toEqual(['exit a', 'moveTo']);
  });

  // Driver skips the outgoing step's onDeselected when both steps resolve to the
  // same element, which is exactly the shape of 'Move the Game Panel' ->
  // 'Resize the Game Panel'. The runner must tear the action hook down itself.
  it('releases the outgoing action listener when both steps share an element', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const runner = newRunner();
    runner.start({
      steps: [actionStep('a', '#same'), actionStep('b', '#same')],
    });

    driverInstances[0].moveTo(1);

    expect(removeSpy.mock.calls.some(([type]) => type === 'evt-a')).toBe(true);
    removeSpy.mockRestore();
  });

  it('releases the active action listener when the tour is destroyed mid-step', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const runner = newRunner();
    runner.start({ steps: [actionStep('a'), mkStep('b')] });

    runner.destroy();

    expect(removeSpy.mock.calls.some(([type]) => type === 'evt-a')).toBe(true);
    removeSpy.mockRestore();
  });

  // Being SHOWN a step is not the same as having done its action. Resuming onto
  // a step you quit mid-action must re-gate it, even though it is in the
  // visited set that releases the gates of everything else.
  it('re-gates the step being resumed onto, while releasing earlier visited ones', () => {
    const runner = newRunner();
    runner.start({
      steps: [actionStep('a'), actionStep('b')],
      resumeFromStep: 1,
      visitedSteps: [0, 1],
    });

    expect(document.querySelector('.tutorial-skip-action')).not.toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(true);

    driverInstances[0].moveTo(0);

    expect(document.querySelector('.tutorial-skip-action')).toBeNull();
  });

  // Closing Settings (or Plugins) mid-tour and pressing Next must not spotlight a step inside the
  // closed panel: Next and Back take the same guarded route as a drawer jump.
  it('redirects Next into a guarded step to its fallback when the prerequisite is missing', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = { ...mkStep('c'), resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    runner.start({ steps: [mkStep('a'), mkStep('b'), guarded], resumeFromStep: 1 });

    driverInstances[0].__config.onNextClick?.();

    expect(driverInstances[0].moveTo).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('redirects Back into a guarded step to its fallback when the prerequisite is missing', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = { ...mkStep('b'), resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    runner.start({ steps: [mkStep('a'), guarded, mkStep('c')], resumeFromStep: 2 });

    driverInstances[0].__config.onPrevClick?.();

    expect(driverInstances[0].moveTo).toHaveBeenCalledExactlyOnceWith(0);
  });

  // Skipping "open the wrench tab" and pressing Next must not bounce back onto the same step.
  it('passes over a guarded step whose fallback is the step being left, in either direction', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = { ...mkStep('b'), resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    runner.start({ steps: [mkStep('a'), guarded, mkStep('c')] });
    const inst = driverInstances[0];

    inst.__config.onNextClick?.();
    expect(inst.moveTo).toHaveBeenLastCalledWith(2);

    const backGuarded: SpotlightStep = { ...mkStep('b'), resumeGuard: { isReady: () => false, fallbackStep: 2 } };
    runner.start({ steps: [mkStep('a'), backGuarded, mkStep('c')], resumeFromStep: 2, isReplay: true });
    driverInstances[1].__config.onPrevClick?.();
    expect(driverInstances[1].moveTo).toHaveBeenLastCalledWith(0);
  });

  // The fallback is the step that brings the missing panel back; it was done once, but has to be
  // done again before the steps behind the guard make sense.
  it('re-arms the action gate of the fallback step a guarded Next lands on', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = { ...mkStep('c'), resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    runner.start({ steps: [actionStep('a'), mkStep('b'), guarded], resumeFromStep: 1, visitedSteps: [0, 1] });

    driverInstances[0].__config.onNextClick?.();

    expect(driverInstances[0].moveTo).toHaveBeenLastCalledWith(0);
    expect(document.querySelector('.tutorial-skip-action')).not.toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(true);
  });

  it('moves Next and Back one step when nothing is guarded, and ends the tour from the last step', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({ steps: [mkStep('a'), mkStep('b')] });
    const inst = driverInstances[0];

    inst.__config.onPrevClick?.();
    expect(inst.moveTo).not.toHaveBeenCalled();

    inst.__config.onNextClick?.();
    expect(inst.moveTo).toHaveBeenLastCalledWith(1);

    inst.__config.onPrevClick?.();
    expect(inst.moveTo).toHaveBeenLastCalledWith(0);

    inst.__config.onNextClick?.();
    inst.__config.onNextClick?.();
    expect(inst.destroy).toHaveBeenCalledTimes(1);
    expect(onDestroyed).toHaveBeenCalledWith(expect.objectContaining({ reachedLastStep: true }));
  });

  it('leaves the current step inside commitSync before Next moves', () => {
    const order: string[] = [];
    const runner = newRunner({
      commitSync: (update) => {
        order.push('commit start');
        update();
        order.push('commit end');
      },
    });
    runner.start({ steps: [{ ...mkStep('a'), onExit: () => order.push('exit a') }, mkStep('b')] });
    order.length = 0; // entering the first step is committed too
    driverInstances[0].moveTo.mockImplementation(() => order.push('moveTo'));

    driverInstances[0].__config.onNextClick?.();

    expect(order).toEqual(['commit start', 'exit a', 'commit end', 'moveTo']);
  });

  it("keeps an action step's Next gated, and sends it through the guard once the action is done", () => {
    const runner = newRunner();
    const guarded: SpotlightStep = { ...mkStep('c'), resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    runner.start({ steps: [mkStep('a'), actionStep('b'), guarded], resumeFromStep: 1 });
    const inst = driverInstances[0];
    const gatedNext = () => inst.__config.steps?.[1].popover?.onNextClick?.();

    gatedNext();
    expect(inst.moveTo).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent('evt-b'));
    gatedNext();
    expect(inst.moveTo).toHaveBeenCalledExactlyOnceWith(0);
  });

  // The landing step is the guard's fallback, not the bookmark, so that is the step whose gate has
  // to be re-armed; clearing only the bookmark resumed onto a fallback already marked done.
  it('re-gates the fallback step a guarded resume lands on', () => {
    const runner = newRunner();
    const guarded: SpotlightStep = { ...mkStep('c'), resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    runner.start({
      steps: [actionStep('a'), mkStep('b'), guarded],
      resumeFromStep: 2,
      visitedSteps: [0, 1, 2],
    });

    expect(driverInstances[0].drive).toHaveBeenCalledWith(0);
    expect(document.querySelector('.tutorial-skip-action')).not.toBeNull();
    expect(driverInstances[0].__popover?.nextButton.classList.contains('driver-popover-btn-disabled')).toBe(true);
    expect(document.querySelector('.tutorial-action-indicator')?.className).toBe('tutorial-action-indicator waiting');
  });

  // Saved where "b" was shown, resumed on touch where it is dropped: it stays in the save without
  // counting toward this run's completion; a step outside the tour is dropped.
  it('keeps a saved step this run drops without counting it, and drops ones outside the tour', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    runner.start({
      steps: [mkStep('a'), { ...mkStep('b'), desktopOnly: true }, mkStep('c')],
      isTouchOnly: true,
      visitedSteps: [0, 1, 7],
    });
    runner.destroy();

    expect(onDestroyed).toHaveBeenCalledWith({
      reachedLastStep: false,
      lastStep: 0,
      visitedSteps: [0, 1],
    });
  });
});

describe('SpotlightRunner — step drawer is pointer-driven', () => {
  const trigger = () => document.querySelector<HTMLButtonElement>('.tutorial-stepnav-trigger');
  const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  it('opens without moving focus, ignores arrow keys, and closes on Escape', () => {
    const runner = newRunner();
    runner.start({ steps: [mkStep('a'), mkStep('b'), mkStep('c'), mkStep('d')], resumeFromStep: 2 });
    const before = document.activeElement;

    trigger()?.click();
    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(before);

    press('ArrowDown');
    press('End');
    expect(document.activeElement).toBe(before);

    press('Escape');
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(before);
  });
});

describe('SpotlightRunner — keeps the top of a tall target in view', () => {
  /** A target inside a scrolling container whose visible area starts at y=50 and is 340px tall. */
  function scrolledTarget(targetTop: number, targetHeight: number, overflowY = 'auto') {
    const scroller = document.createElement('div');
    scroller.style.overflowY = overflowY;
    const target = document.createElement('div');
    scroller.append(target);
    document.body.append(scroller);
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { value: 340 });
    scroller.getBoundingClientRect = () => new DOMRect(0, 50, 300, 340);
    target.getBoundingClientRect = () => new DOMRect(0, targetTop, 300, targetHeight);
    scroller.scrollTop = 200;
    spotlitElement.current = target;
    return scroller;
  }

  // Driver centers a target taller than its scroller, cutting off its top: an expanded plugin
  // row on a 390px-tall phone lost its title that way.
  it('scrolls the container so a target cut off at the top shows its top, then refreshes Driver', () => {
    const scroller = scrolledTarget(34, 372);
    newRunner().start({ steps: [mkStep('a')] });

    expect(scroller.scrollTop).toBe(184);
    expect(driverInstances[0].refresh).toHaveBeenCalledTimes(1);
  });

  // driver.css sets `overflow: hidden !important` on the spotlit element's parent.
  it("still scrolls the target's parent while Driver has forced it to overflow: hidden", () => {
    const scroller = scrolledTarget(34, 372, 'hidden');
    newRunner().start({ steps: [mkStep('a')] });

    expect(scroller.scrollTop).toBe(184);
  });

  it('leaves the container alone when the target top is already visible', () => {
    const scroller = scrolledTarget(60, 200);
    newRunner().start({ steps: [mkStep('a')] });

    expect(scroller.scrollTop).toBe(200);
    expect(driverInstances[0].refresh).not.toHaveBeenCalled();
  });
});

// Progress is saved by ORIGINAL step index. Filtering depends on the device and the page (Fixed has
// no movable game panel, so Move and Resize are dropped), so a filtered index saved in one layout
// named a different step in another.
describe('SpotlightRunner — saved progress names steps, not positions in one run', () => {
  const actionStep = (id: string): SpotlightStep => ({
    ...mkStep(id),
    action: { event: `evt-${id}`, waitingText: `do ${id}`, completedText: `did ${id}` },
  });
  /** Getting Started's shape: Move and Resize are skipped where the game panel is pinned (Fixed). */
  const tour = (): SpotlightStep[] => [
    mkStep('lobby'),
    { ...actionStep('move'), element: '#movable', skipIfMissing: true },
    { ...actionStep('resize'), element: '#movable', skipIfMissing: true },
    actionStep('wrench'),
    actionStep('open stats'),
    actionStep('stats'),
    mkStep('minimap'),
  ];
  const resizable = () => {
    document.body.innerHTML = '<div id="movable"></div>';
  };
  const skipButton = () => document.querySelector('.tutorial-skip-action');

  it('reports the step and the visited steps by their place in the tour', () => {
    const onStepHighlighted = vi.fn();
    const onDestroyed = vi.fn();
    const runner = newRunner({ onStepHighlighted, onDestroyed });
    runner.start({ steps: tour() }); // Fixed: Move and Resize dropped
    driverInstances[0].moveTo(2);

    expect(onStepHighlighted).toHaveBeenLastCalledWith(4, [0, 4], null);
    runner.destroy();
    expect(onDestroyed).toHaveBeenCalledWith({ reachedLastStep: false, lastStep: 4, visitedSteps: [0, 4] });
  });

  it('resumes a Resizable save in Fixed on the same step, with the same steps visited and gates released', () => {
    const onDestroyed = vi.fn();
    const runner = newRunner({ onDestroyed });
    // Saved in Resizable on "stats" (step 5), after walking every step before it.
    runner.start({ steps: tour(), resumeFromStep: 5, visitedSteps: [0, 1, 2, 3, 4, 5] });
    const inst = driverInstances[0];

    expect(inst.drive).toHaveBeenCalledWith(3);
    // The step resumed onto is gated again; the ones walked before it are not.
    expect(skipButton()).not.toBeNull();
    inst.moveTo(2);
    expect(skipButton()).toBeNull();

    runner.destroy();
    // Move and Resize, not in this run, stay visited for the next Resizable one.
    expect(onDestroyed).toHaveBeenCalledWith({ reachedLastStep: false, lastStep: 4, visitedSteps: [0, 1, 2, 3, 4, 5] });
  });

  it('carries a Fixed save back to Resizable unchanged', () => {
    resizable();
    const runner = newRunner();
    runner.start({ steps: tour(), resumeFromStep: 5, visitedSteps: [0, 3, 4, 5] });
    const inst = driverInstances[0];

    expect(inst.drive).toHaveBeenCalledWith(5);
    // Move was never shown in Fixed: its gate is still up.
    inst.moveTo(1);
    expect(skipButton()).not.toBeNull();
  });

  it('resumes a bookmark this run drops on the next step it keeps, or the one before at the end', () => {
    newRunner().start({ steps: tour(), resumeFromStep: 2 }); // "resize"
    expect(driverInstances[0].drive).toHaveBeenCalledWith(1); // "wrench", step 3

    const steps = [...tour(), { ...mkStep('last'), element: '#gone', skipIfMissing: true }];
    newRunner().start({ steps, resumeFromStep: 7 });
    expect(driverInstances[1].drive).toHaveBeenCalledWith(4); // "minimap", step 6
  });

  it('sends that replacement step through its resumeGuard', () => {
    const steps = tour();
    steps[3] = { ...steps[3], resumeGuard: { isReady: () => false, fallbackStep: 0 } };
    newRunner().start({ steps, resumeFromStep: 2 });

    expect(driverInstances[0].drive).toHaveBeenCalledWith(0);
  });
});
