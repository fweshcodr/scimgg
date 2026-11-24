import { type Config, type DriveStep, driver, type PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../tutorial.css';

import type { SpotlightStep, TutorialAction } from '../types';
import { mountStepNav } from './stepNavPanel';

const DRIVER_CONFIG: Partial<Config> = {
  showProgress: true,
  progressText: '{{current}} of {{total}}',
  animate: false, // disabled — Driver.js overlay animation causes incorrect initial positioning; our CSS handles popover animation
  overlayColor: '#000',
  overlayOpacity: 0.75,
  stagePadding: 0,
  stageRadius: 0,
  disableActiveInteraction: false,
  allowClose: true,
  overlayClickBehavior: () => {}, // X button exits, but clicking dimmed overlay does not
  allowKeyboardControl: false, // prevent arrow-key bypass of action gates
  popoverClass: 'osrs-tutorial-popover',
  popoverOffset: 12,
  nextBtnText: 'Next →',
  prevBtnText: '← Back',
  doneBtnText: 'Got it!',
};

type DriverInstance = ReturnType<typeof driver>;

/**
 * Something the user opened over the tour from a spotlit control: a modal (Encounters, an NPC's
 * encounter panel), a context menu or an anchored popover (the sheet roles in
 * components/ui/mobileSheet). Driver's overlay would dim it and its `.driver-active *` rule would
 * leave it unclickable, so the tour steps aside while one is open and comes back when it closes.
 *
 * Not `role="dialog"` alone: the desktop launcher panes are non-modal dialogs the tour spotlights.
 * The step nav in Driver's popover never counts, nor does a layer kept mounted but hidden.
 */
export const TOUR_SUSPENDING_LAYER =
  '[aria-modal="true"], [role="menu"], [data-msheet="card"], [data-msheet="popover"]';

/** On `<body>` while the tour has stepped aside; tutorial.css hides Driver's overlay and popover. */
export const TOUR_SUSPENDED_CLASS = 'tutorial-suspended';

function userLayerOpen(): boolean {
  for (const layer of document.querySelectorAll(TOUR_SUSPENDING_LAYER)) {
    if (!layer.closest('.driver-popover, [hidden]')) return true;
  }
  return false;
}

export interface FilteredSpotlightSteps {
  filteredSteps: SpotlightStep[];
  filteredToOriginal: number[];
  originalToFiltered: Map<number, number>;
}

/** The step as a touch-only device shows it: its `touch` copy in place of the default. */
function withTouchCopy(step: SpotlightStep): SpotlightStep {
  const { touch } = step;
  if (!touch) return step;
  return {
    ...step,
    popover: {
      ...step.popover,
      title: touch.title ?? step.popover.title,
      description: touch.description ?? step.popover.description,
    },
    action: step.action && {
      ...step.action,
      waitingText: touch.waitingText ?? step.action.waitingText,
      completedText: touch.completedText ?? step.action.completedText,
    },
  };
}

/**
 * The steps this run shows, each with the copy for this device. The index maps drive
 * `resumeGuard.fallbackStep` translation in the runner.
 */
export function filterSpotlightSteps(
  steps: SpotlightStep[],
  options: { isTouchOnly?: boolean } = {},
): FilteredSpotlightSteps {
  const { isTouchOnly = false } = options;
  const filteredSteps: SpotlightStep[] = [];
  const filteredToOriginal: number[] = [];
  const originalToFiltered = new Map<number, number>();

  for (let originalIdx = 0; originalIdx < steps.length; originalIdx++) {
    const step = steps[originalIdx];

    // Drop steps that require a fine pointer or keyboard on touch-only
    // devices. Must run BEFORE `element()` so a mobile-hostile step with
    // a throwing element thunk never crashes the filter.
    if (isTouchOnly && step.desktopOnly) continue;

    if (step.skipIfMissing && step.element) {
      const el = typeof step.element === 'function' ? step.element() : document.querySelector(step.element);
      if (el === null) continue;
    }

    const filteredIdx = filteredSteps.length;
    filteredSteps.push(isTouchOnly ? withTouchCopy(step) : step);
    filteredToOriginal.push(originalIdx);
    originalToFiltered.set(originalIdx, filteredIdx);
  }

  return { filteredSteps, filteredToOriginal, originalToFiltered };
}

function resolveDriveStepElement(element: DriveStep['element'] | undefined): Element | null {
  if (!element) return null;
  if (typeof element === 'string') return document.querySelector(element);
  if (typeof element === 'function') {
    const resolved = element();
    return resolved instanceof Element ? resolved : null;
  }
  return element instanceof Element ? element : null;
}

/**
 * Driver centers its target in every scroll container, so a target taller than its container's
 * visible height (an expanded plugin row on a short screen) loses its top edge, title included.
 * Scrolls the nearest scrolling ancestor until the top shows; returns whether it scrolled.
 */
function revealTargetTop(target: Element): boolean {
  for (let el = target.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    // driver.css forces `overflow: hidden` on the target's parent for the length of the step.
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || el === target.parentElement;
    if (!scrolls || el.scrollHeight <= el.clientHeight) continue;
    const visibleTop = Math.max(el.getBoundingClientRect().top + el.clientTop, 0);
    const hidden = visibleTop - target.getBoundingClientRect().top;
    if (hidden <= 0.5) return false;
    el.scrollTop -= hidden;
    return true;
  }
  return false;
}

function buildActionHooks(
  action: TutorialAction,
  /** The runner's guarded Next; Driver's own moveNext would skip the next step's resumeGuard. */
  moveNext: () => void,
  stepIndex: number,
  completedSteps: Set<number>,
  renderStepNav: (popover: PopoverDOM) => void,
) {
  let completed = false;
  let indicatorEl: HTMLElement | null = null;
  let indicatorTextEl: HTMLElement | null = null;
  let nextBtnEl: HTMLElement | null = null;
  let skipBtnEl: HTMLButtonElement | null = null;
  let cleanupListener: (() => void) | null = null;
  let rafId = 0;

  const markComplete = () => {
    if (completed) return;
    completed = true;
    completedSteps.add(stepIndex);

    if (indicatorEl) indicatorEl.className = 'tutorial-action-indicator completed';
    if (indicatorTextEl) indicatorTextEl.innerHTML = action.completedText;
    if (nextBtnEl) nextBtnEl.classList.remove('driver-popover-btn-disabled');
    if (skipBtnEl) {
      skipBtnEl.remove();
      skipBtnEl = null;
    }
    cleanupListener?.();
    cleanupListener = null;

    if (action.autoAdvance) {
      // Assigned so cleanup() can actually cancel it. Left unassigned, a
      // restart between schedule and callback advanced the REPLACEMENT tour by
      // one step, because the callback follows the shared driverRef.
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        moveNext();
      });
    }
  };

  const cleanup = () => {
    cleanupListener?.();
    cleanupListener = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    // Remove the injected skip button so it can't linger (or duplicate) when
    // the step is re-highlighted after the user navigates away and back.
    skipBtnEl?.remove();
    // Reset for potential re-highlight (user navigated back)
    completed = false;
    indicatorEl = null;
    indicatorTextEl = null;
    nextBtnEl = null;
    skipBtnEl = null;
  };

  const stepHooks = {
    disableActiveInteraction: false,

    onHighlighted: () => {
      if (completedSteps.has(stepIndex)) {
        completed = true;
        return;
      }

      if (action.validate?.(undefined)) {
        markComplete();
        return;
      }

      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!action.validate || action.validate(detail)) {
          markComplete();
        }
      };
      window.addEventListener(action.event, handler);
      cleanupListener = () => window.removeEventListener(action.event, handler);
    },

    onDeselected: () => {
      cleanup();
    },
  };

  const popoverHooks = {
    onNextClick: () => {
      if (completed) moveNext();
    },

    onPopoverRender: (popover: PopoverDOM) => {
      renderStepNav(popover);

      nextBtnEl = popover.nextButton ?? null;
      const alreadyDone = completedSteps.has(stepIndex);
      if (nextBtnEl && !alreadyDone) {
        nextBtnEl.classList.add('driver-popover-btn-disabled');
      }

      indicatorEl = document.createElement('div');
      indicatorEl.className = alreadyDone ? 'tutorial-action-indicator completed' : 'tutorial-action-indicator waiting';

      indicatorTextEl = document.createElement('span');
      indicatorTextEl.className = 'tutorial-action-indicator-text';
      indicatorTextEl.innerHTML = alreadyDone ? action.completedText : `▸ ${action.waitingText}`;
      indicatorEl.append(indicatorTextEl);

      // Skip is present from the first render: gating it behind failed Next
      // clicks left users hammering a dead button with no signal an exit existed.
      if (!alreadyDone) {
        skipBtnEl = document.createElement('button');
        skipBtnEl.type = 'button';
        skipBtnEl.className = 'tutorial-skip-action';
        skipBtnEl.textContent = 'Skip';
        skipBtnEl.title = 'Skip this step and continue';
        skipBtnEl.onclick = () => markComplete();
        indicatorEl.append(skipBtnEl);
      }

      if (popover.description && popover.footer) {
        popover.description.parentElement?.insertBefore(indicatorEl, popover.footer);
      } else if (popover.wrapper) {
        popover.wrapper.appendChild(indicatorEl);
      }
    },
  };

  // `cleanup` is returned so the runner can tear this step down on ANY index
  // transition. Driver only fires the previous step's onDeselected when the
  // resolved ELEMENT changes, so two consecutive steps sharing an element (or a
  // drawer jump between them) would otherwise leave this step's action listener
  // bound forever.
  return { stepHooks, popoverHooks, cleanup };
}

interface DriverStepsResult {
  driverSteps: DriveStep[];
  actionCleanups: Map<number, () => void>;
}

function toDriverSteps(
  filteredSteps: readonly SpotlightStep[],
  moveNext: () => void,
  completedSteps: Set<number>,
  renderStepNav: (popover: PopoverDOM) => void,
): DriverStepsResult {
  const actionCleanups = new Map<number, () => void>();

  const driverSteps = filteredSteps.map((step, idx) => {
    const base: DriveStep = {
      element: step.element as DriveStep['element'],
      popover: {
        title: step.popover.title,
        description: step.popover.description,
        side: step.popover.side,
        align: step.popover.align,
        popoverClass: 'osrs-tutorial-popover',
      },
    };

    if (step.action) {
      const { stepHooks, popoverHooks, cleanup } = buildActionHooks(
        step.action,
        moveNext,
        idx,
        completedSteps,
        renderStepNav,
      );
      actionCleanups.set(idx, cleanup);
      return {
        ...base,
        ...stepHooks,
        popover: {
          ...base.popover,
          ...popoverHooks,
        },
      };
    }
    return base;
  });

  return { driverSteps, actionCleanups };
}

/**
 * Every step index crossing this boundary (resume, visited steps, the callbacks) is an index into
 * the tour's own `steps`. A run's positions are its own: what it drops depends on the device and
 * the page (Fixed has no movable game panel), so a position saved in one run names another step in
 * the next.
 */
export interface SpotlightRunnerCallbacks {
  /**
   * `visitedSteps` is the running set of steps shown so far; the host has to persist it because
   * `step` alone stopped being a high-water mark once the step drawer allowed jumps.
   */
  onStepHighlighted?: (
    step: number,
    visitedSteps: number[],
    /** The element Driver spotlit for the step, if any; the host may need it on screen. */
    element: Element | null,
  ) => void;
  onDestroyed?: (info: {
    /**
     * Every step in the tour was shown at least once across this run and the
     * ones restored from `visitedSteps`. This is the tutorial-completion
     * signal, and it is deliberately NOT "the last step was highlighted": the
     * step drawer lets one click land on the final step, which would otherwise
     * mark a tour the user never walked as finished end-to-end.
     */
    reachedLastStep: boolean;
    lastStep: number;
    visitedSteps: number[];
  }) => void;
  /**
   * Runs `update` so the UI it changes is committed to the DOM before this returns (a React host
   * passes `flushSync`). Used only where a drawer jump leaves its step: Driver resolves the
   * destination's element straight after, so chrome the exit restores must already be there.
   */
  commitSync?: (update: () => void) => void;
}

export interface SpotlightRunStartOptions {
  steps: SpotlightStep[];
  /**
   * Where to resume. A step this run drops resumes on the next one it keeps, or the last kept
   * before it at the end of the tour; either still goes through its resumeGuard.
   */
  resumeFromStep?: number;
  isReplay?: boolean;
  isTouchOnly?: boolean;
  /**
   * Steps the user has already been shown, restored from persistence; absent means none. The
   * bookmark says nothing about them: the drawer allows non-linear navigation, so `resumeFromStep`
   * is not a high-water mark, and treating the steps before it as seen would mark them done, and
   * release their action gates, purely because the user jumped past them.
   */
  visitedSteps?: readonly number[];
}

export class SpotlightRunner {
  private driverRef: { current: DriverInstance | null } = { current: null };
  private resizeObserver: ResizeObserver | null = null;
  private observedElement: Element | null = null;
  private refreshRafId = 0;
  private trailingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private transitionStartHandler: ((e: Event) => void) | null = null;
  private transitionEndHandler: ((e: Event) => void) | null = null;
  private windowResizeHandler: (() => void) | null = null;
  private panelMoveHandler: (() => void) | null = null;
  private panelResizeHandler: (() => void) | null = null;
  private animateRafId = 0;
  private callbacks: SpotlightRunnerCallbacks;
  private disposeStepNav: (() => void) | null = null;
  private layerObserver: MutationObserver | null = null;
  /** Set while a user-opened layer has the tour stepped aside; whether Driver's body class was taken off for it. */
  private suspension: { readonly tookDriverActive: boolean } | null = null;
  /** A step change asked for while the tour was aside, run when it comes back (`whenShown`). */
  private heldMove: (() => void) | null = null;

  constructor(callbacks: SpotlightRunnerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  start(options: SpotlightRunStartOptions): boolean {
    const { steps, resumeFromStep = 0, isReplay = false, isTouchOnly = false, visitedSteps: savedVisited } = options;
    this.destroy();

    const { filteredSteps, filteredToOriginal, originalToFiltered } = filterSpotlightSteps(steps, { isTouchOnly });
    if (filteredSteps.length === 0) return false;

    // Inside the run everything is a position in `filteredSteps`; saved steps are translated here and
    // reported back as steps (SpotlightRunnerCallbacks). The bookmark resumes on the first kept
    // step at or after it, or the last kept one when none follows.
    const firstKeptFrom = filteredToOriginal.findIndex((original) => original >= resumeFromStep);
    const bookmark = firstKeptFrom === -1 ? filteredSteps.length - 1 : firstKeptFrom;

    // Steps the user has actually been shown, restored from persistence.
    // Saved steps this run drops (Move and Resize in Fixed) are kept for the save, not counted here:
    // the completion check below is against this run's steps.
    const savedSteps = (savedVisited ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < steps.length);
    const visitedSteps = new Set<number>();
    for (const original of savedSteps) {
      const position = originalToFiltered.get(original);
      if (position !== undefined) visitedSteps.add(position);
    }
    if (isReplay) {
      for (let i = 0; i < filteredSteps.length; i++) visitedSteps.add(i);
    }
    const visitedForSave = (): number[] =>
      [
        ...new Set([...savedSteps, ...[...visitedSteps].map((position) => filteredToOriginal[position] ?? position)]),
      ].sort((a, b) => a - b);
    // A step behind a resumeGuard needs its prerequisite UI on screen. Resume,
    // drawer jumps and Next/Back all go through this door, or they spotlight an
    // element that is not in the DOM (e.g. a Settings-panel step after the user
    // closed Settings).
    const resolveGuardedIndex = (filteredIdx: number): number => {
      if (filteredIdx <= 0) return filteredIdx;
      const originalIdx = filteredToOriginal[filteredIdx];
      const guard = originalIdx !== undefined ? steps[originalIdx]?.resumeGuard : undefined;
      if (!guard || guard.isReady()) return filteredIdx;
      const fallback = originalToFiltered.get(guard.fallbackStep);
      return fallback ?? filteredIdx;
    };

    const resumeIndex = isReplay ? bookmark : resolveGuardedIndex(bookmark);

    // An action gate is pre-satisfied only for a step the user actually reached
    // AND left. The step quit on and the step resumed onto (its guard's fallback,
    // when the prerequisite UI is gone) are excluded: being shown a step is not
    // the same as having performed its action, and resuming must not hand back
    // a tour with that gate already open.
    const completedSteps = new Set<number>(visitedSteps);
    if (!isReplay) {
      completedSteps.delete(bookmark);
      completedSteps.delete(resumeIndex);
    }

    // Exactly-once onEnter/onExit tracking. Driver.js can fire a step's
    // onDeselected twice (once on navigation, once again just before
    // onDestroyed) or skip it entirely when consecutive steps share an
    // element, so we own the enter/exit lifecycle here instead of mapping it
    // 1:1 onto Driver's callbacks. `enteredStep` is the filtered index whose
    // onEnter has fired and whose onExit has not.
    let enteredStep: number | null = null;
    const sourceStepAt = (filteredIdx: number): SpotlightStep | undefined => {
      const oi = filteredToOriginal[filteredIdx];
      return oi !== undefined ? steps[oi] : undefined;
    };
    const exitEnteredStep = (): void => {
      if (enteredStep === null) return;
      const idx = enteredStep;
      enteredStep = null; // clear first so a re-entrant onExit can't loop
      sourceStepAt(idx)?.onExit?.();
    };

    const commit = (update: () => void): void => {
      if (this.callbacks.commitSync) this.callbacks.commitSync(update);
      else update();
    };

    const navTitles = filteredSteps.map((step) => step.popover.title);
    // Every step change the user drives (drawer jump, Next, Back, an action's auto-advance) goes
    // through here. It leaves the current step BEFORE Driver moves: Driver resolves the
    // destination's element first and only then deselects the outgoing step, so chrome the outgoing
    // step's onExit puts back (the pinned menu the Practice step covered, say) would arrive after
    // Driver had already settled on its stand-in element. The host commits that exit synchronously
    // (`commitSync`), so the destination is in the DOM when Driver looks for it.
    const jumpTo = (index: number): void => {
      const instance = this.driverRef.current;
      if (!instance) return;
      const target = resolveGuardedIndex(index);
      if (target !== index) {
        // A guard redirect lands on the step that puts the missing UI back (Open Settings, say).
        // Re-arm its gate: it was done once, but the user has to do it again for the steps after it.
        completedSteps.delete(target);
        actionCleanups.get(target)?.();
      }
      const leaving = enteredStep;
      if (leaving !== null && leaving !== target) {
        commit(() => {
          actionCleanups.get(leaving)?.();
          exitEnteredStep();
        });
        // The committed exit may have ended the tour; a destroyed Driver must not be moved.
        if (this.driverRef.current !== instance) return;
      }
      instance.moveTo(target);
    };
    // Next and Back, replacing Driver's own moves so they honor resumeGuard like a jump does:
    // otherwise closing Settings mid-tour and pressing Next spotlights a step inside the closed panel.
    const stepBy = (delta: 1 | -1): void => {
      const instance = this.driverRef.current;
      const active = instance?.getActiveIndex();
      if (!instance || active === undefined) return;
      let target = active + delta;
      // Pass over steps whose guard would send the user straight back to this one: after skipping
      // the action that opens their panel (the wrench tab, Settings), staying put leaves Next dead.
      while (target >= 0 && target < filteredSteps.length && resolveGuardedIndex(target) === active) target += delta;
      // Next on the last step is Done.
      if (target >= filteredSteps.length) instance.destroy();
      else if (target >= 0) jumpTo(target);
    };
    // A step change waits while a layer the user opened is up. Driver focuses the new step's first
    // control, and with the popover hidden that is the target behind the layer: Quick Search's
    // auto-advance put the focus on the next step's control, out of the search field the user was typing in.
    const whenShown = (move: () => void): void => {
      if (userLayerOpen()) {
        this.heldMove = move; // the latest wins
        this.syncSuspension();
        return;
      }
      this.heldMove = null;
      move();
    };
    const moveNext = (): void => whenShown(() => stepBy(1));
    const renderStepNav = (popover: PopoverDOM): void => {
      this.disposeStepNav?.();
      const activeIndex = this.driverRef.current?.getActiveIndex() ?? 0;
      this.disposeStepNav = mountStepNav(popover, {
        titles: navTitles,
        currentIndex: activeIndex,
        isVisited: (index) => visitedSteps.has(index),
        onJump: (index) => whenShown(() => jumpTo(index)),
      });
    };

    const { driverSteps, actionCleanups } = toDriverSteps(filteredSteps, moveNext, completedSteps, renderStepNav);

    let currentStep = 0;

    const enterStep = (filteredIdx: number): void => {
      if (enteredStep === filteredIdx) return;
      // Tear the prior step's action hook down here rather than relying on
      // Driver's onDeselected, which it skips entirely when the outgoing and
      // incoming steps resolve to the SAME element. Two such steps sit next to
      // each other in Getting Started, and the drawer can jump between any
      // pair, so without this the outgoing step's window listener stays bound
      // for the life of the page.
      if (enteredStep !== null) actionCleanups.get(enteredStep)?.();
      exitEnteredStep(); // exit the prior step (covers Driver's same-element onDeselected skip)
      enteredStep = filteredIdx;
      sourceStepAt(filteredIdx)?.onEnter?.();
    };

    const stepsWithProgress: DriveStep[] = driverSteps.map((step, stepIndex) => {
      const onHighlighted = step.onHighlighted;
      const onDeselected = step.onDeselected;
      const originalIdx = filteredToOriginal[stepIndex];
      return {
        ...step,
        // Driver calls this before it scrolls the target into view and places the popover;
        // onHighlighted only follows a frame later. Entering here, with the host committing
        // synchronously, lets a step's onEnter reshape the page (a plugin row expanding, the one
        // above it collapsing) before Driver measures, so the target is not shifted off screen.
        onHighlightStarted: () => commit(() => enterStep(stepIndex)),
        onHighlighted: (...args) => {
          currentStep = stepIndex;
          visitedSteps.add(stepIndex);

          const element = this.driverRef.current?.getActiveElement() ?? null;
          // Driver has scrolled by now; it does not notice a nested container scrolling, so refresh.
          if (element && revealTargetTop(element)) this.driverRef.current?.refresh();
          this.callbacks.onStepHighlighted?.(originalIdx ?? stepIndex, visitedForSave(), element);
          this.observeHighlightedElement(step);
          onHighlighted?.(...args);
        },
        onDeselected: (...args) => {
          if (enteredStep === stepIndex) exitEnteredStep();
          onDeselected?.(...args);
        },
      };
    });

    const instance = driver({
      ...DRIVER_CONFIG,
      steps: stepsWithProgress,
      // Step-level popover hooks REPLACE this one rather than stacking, so
      // action steps call renderStepNav themselves; dropping either call site
      // leaves that class of step without a jump control.
      onPopoverRender: renderStepNav,
      // Action steps replace onNextClick with their gated version, which calls the same moveNext.
      onNextClick: moveNext,
      onPrevClick: () => whenShown(() => stepBy(-1)),
      onCloseClick: (_el: unknown, _step: unknown, opts: { driver: { destroy: () => void } }) => {
        opts.driver.destroy();
      },
      onDestroyed: () => {
        // Driver.js fires this both from our destroy() and from the X-button
        // close path (onCloseClick → opts.driver.destroy()). The latter never
        // routes through destroy(), so tear down the window listeners and the
        // transition RAF loop here too. detachWindowListeners is idempotent, so
        // the destroy() path (which already called it) is unaffected.
        // Fire the entered step's onExit exactly once so side effects (e.g. an
        // auto-expanded plugin row) are undone when the tour is closed
        // mid-step. No-op if navigation already exited it.
        // Capture BEFORE exitEnteredStep, which clears enteredStep — reading it
        // afterwards makes the action teardown a silent no-op on every close.
        const closingStep = enteredStep;
        exitEnteredStep();
        if (closingStep !== null) actionCleanups.get(closingStep)?.();
        this.disposeStepNav?.();
        this.disposeStepNav = null;
        this.detachWindowListeners();
        this.cleanupResizeTracking();
        this.driverRef.current = null;
        // Completion means every step was shown at least once, NOT that the
        // last one was highlighted. The drawer puts the final step one click
        // away, and `completed` is sticky in persistence, so the weaker test
        // would let a single jump permanently mark a tour finished.
        const reachedLastStep = visitedSteps.size >= stepsWithProgress.length;
        this.callbacks.onDestroyed?.({
          reachedLastStep,
          lastStep: filteredToOriginal[currentStep] ?? currentStep,
          visitedSteps: visitedForSave(),
        });
      },
    });

    this.driverRef.current = instance;
    this.attachWindowListeners();
    instance.drive(resumeIndex);
    // A layer already open (the Mobile welcome sheet, say) keeps the tour aside until it closes.
    this.syncSuspension();
    return true;
  }

  isActive(): boolean {
    return this.driverRef.current !== null;
  }

  refresh(): void {
    this.driverRef.current?.refresh();
  }

  destroy(): void {
    this.detachWindowListeners();
    this.disposeStepNav?.();
    this.disposeStepNav = null;
    if (this.driverRef.current) {
      this.cleanupResizeTracking();
      this.driverRef.current.destroy();
      this.driverRef.current = null;
    }
  }

  private scheduleRefresh = (): void => {
    cancelAnimationFrame(this.refreshRafId);
    this.refreshRafId = requestAnimationFrame(() => {
      this.refreshRafId = 0;
      this.driverRef.current?.refresh();
    });
    if (this.trailingTimeoutId) clearTimeout(this.trailingTimeoutId);
    this.trailingTimeoutId = setTimeout(() => {
      this.trailingTimeoutId = null;
      this.driverRef.current?.refresh();
    }, 150);
  };

  private cleanupResizeTracking(): void {
    cancelAnimationFrame(this.refreshRafId);
    this.refreshRafId = 0;
    if (this.trailingTimeoutId) {
      clearTimeout(this.trailingTimeoutId);
      this.trailingTimeoutId = null;
    }
    this.resizeObserver?.disconnect();
    this.observedElement = null;
  }

  private observeHighlightedElement(step: DriveStep): void {
    const element = resolveDriveStepElement(step.element);
    if (this.observedElement === element) return;

    this.resizeObserver?.disconnect();
    this.observedElement = element;

    if (!element) return;

    if (!this.resizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleRefresh();
      });
    }

    this.resizeObserver.observe(element);
  }

  /** Steps the tour aside while a user-opened layer is up, and back once none is (TOUR_SUSPENDING_LAYER). */
  private syncSuspension = (): void => {
    const open = this.driverRef.current !== null && userLayerOpen();
    if (open === (this.suspension !== null)) return;
    const body = document.body.classList;
    if (open) {
      // Driver's `.driver-active *` rule is what makes everything outside the spotlight inert.
      this.suspension = { tookDriverActive: body.contains('driver-active') };
      body.remove('driver-active');
      body.add(TOUR_SUSPENDED_CLASS);
      return;
    }
    this.endSuspension(true);
    this.driverRef.current?.refresh();
    const held = this.heldMove;
    this.heldMove = null;
    held?.();
  };

  /**
   * `resume` puts Driver's body class back. Teardown never does: Driver has removed it, or is about
   * to, and a stray one would leave the whole page inert.
   */
  private endSuspension(resume: boolean): void {
    if (!this.suspension) return;
    const body = document.body.classList;
    body.remove(TOUR_SUSPENDED_CLASS);
    if (resume && this.suspension.tookDriverActive) body.add('driver-active');
    this.suspension = null;
  }

  private attachWindowListeners(): void {
    // Checked on every DOM change rather than per frame: the lookup is a handful of attribute
    // selectors, and checking here keeps a just-opened modal from painting a frame under the overlay.
    this.layerObserver = new MutationObserver(this.syncSuspension);
    this.layerObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal', 'data-msheet', 'hidden'],
    });
    this.windowResizeHandler = () => this.scheduleRefresh();
    this.panelMoveHandler = () => this.scheduleRefresh();
    this.panelResizeHandler = () => this.scheduleRefresh();
    window.addEventListener('resize', this.windowResizeHandler);
    window.addEventListener('tutorial:panel-moved', this.panelMoveHandler);
    window.addEventListener('tutorial:panel-resized', this.panelResizeHandler);

    // Track CSS transform transitions (e.g. sidebar slide-in) — keep the
    // spotlight aligned during interpolation.
    const animateLoop = () => {
      this.driverRef.current?.refresh();
      this.animateRafId = requestAnimationFrame(animateLoop);
    };

    this.transitionStartHandler = (e: Event) => {
      const te = e as TransitionEvent;
      if (te.propertyName !== 'transform') return;
      const observed = this.observedElement;
      if (!observed) return;
      const target = e.target as Element;
      if (target !== observed && !target.contains(observed)) return;
      if (!this.animateRafId) this.animateRafId = requestAnimationFrame(animateLoop);
    };

    this.transitionEndHandler = (e: Event) => {
      const te = e as TransitionEvent;
      if (te.propertyName !== 'transform') return;
      if (this.animateRafId) {
        cancelAnimationFrame(this.animateRafId);
        this.animateRafId = 0;
      }
      this.scheduleRefresh();
    };

    window.addEventListener('transitionstart', this.transitionStartHandler);
    window.addEventListener('transitionend', this.transitionEndHandler);
    window.addEventListener('transitioncancel', this.transitionEndHandler);
  }

  private detachWindowListeners(): void {
    this.layerObserver?.disconnect();
    this.layerObserver = null;
    this.heldMove = null;
    this.endSuspension(false);
    if (this.windowResizeHandler) window.removeEventListener('resize', this.windowResizeHandler);
    if (this.panelMoveHandler) window.removeEventListener('tutorial:panel-moved', this.panelMoveHandler);
    if (this.panelResizeHandler) window.removeEventListener('tutorial:panel-resized', this.panelResizeHandler);
    if (this.transitionStartHandler) window.removeEventListener('transitionstart', this.transitionStartHandler);
    if (this.transitionEndHandler) {
      window.removeEventListener('transitionend', this.transitionEndHandler);
      window.removeEventListener('transitioncancel', this.transitionEndHandler);
    }
    if (this.animateRafId) {
      cancelAnimationFrame(this.animateRafId);
      this.animateRafId = 0;
    }
    this.windowResizeHandler = null;
    this.panelMoveHandler = null;
    this.panelResizeHandler = null;
    this.transitionStartHandler = null;
    this.transitionEndHandler = null;
  }
}
