import { type DependencyList, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePanelSnapRegistry } from './snap/PanelSnapRegistry';

/** The elements a measurement read, watched for size changes until the next measurement. */
export type MeasuredElements = Iterable<Element | null | undefined>;

interface Tracker {
  /** Measures now, in the caller's phase (a layout effect). */
  run: () => void;
  /** Measures now and renders the result before the browser paints (observers, events). */
  runNow: () => void;
  /** Measures once the current commit is done: a solve is reported from inside one. */
  runAfterCommit: () => void;
  measuredFrame: () => Element | null;
  start: () => void;
  stop: () => void;
}

function createTracker(measure: () => MeasuredElements, frameRef: RefObject<Element | null>): Tracker {
  let active = false;
  let queued = false;
  let frame: Element | null = null;
  const observed = new Set<Element>();
  let sizes: ResizeObserver | null = null;
  let ancestry: MutationObserver | null = null;

  const measureElements = (): Set<Element> => {
    const elements = new Set<Element>();
    if (!active) return elements;
    const current = frameRef.current;
    if (current !== frame) {
      frame = current;
      ancestry?.disconnect();
      if (current && typeof MutationObserver !== 'undefined') {
        ancestry ??= new MutationObserver(() => runNow());
        // The app places (and, for a fitted replay, scales) the frame through its own style or an
        // ancestor's: the frame moves in the window with nothing in it resizing.
        for (let node: Element | null = current; node; node = node.parentElement) {
          ancestry.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
        }
      }
    }
    for (const element of measure()) if (element) elements.add(element);
    if (typeof ResizeObserver !== 'undefined') {
      sizes ??= new ResizeObserver(() => runNow());
      for (const element of observed) {
        if (elements.has(element)) continue;
        sizes.unobserve(element);
        observed.delete(element);
      }
      for (const element of elements) {
        if (observed.has(element)) continue;
        sizes.observe(element);
        observed.add(element);
      }
    }
    return elements;
  };
  const run = () => {
    measureElements();
  };
  const runNow = () => {
    if (active) flushSync(run);
  };
  const runAfterCommit = () => {
    if (queued || !active) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!active) return;
      let elements = new Set<Element>();
      flushSync(() => {
        elements = measureElements();
      });
      // A solve that glides a panel animates its content layer from the old place: chrome inside
      // that layer reads where it was until the glide ends, so it is read again then.
      const gliding = glidesOver(elements);
      if (gliding.length > 0) void Promise.allSettled(gliding.map((animation) => animation.finished)).then(runNow);
    });
  };
  return {
    run,
    runNow,
    runAfterCommit,
    measuredFrame: () => frame,
    start: () => {
      active = true;
    },
    stop: () => {
      active = false;
      frame = null;
      sizes?.disconnect();
      ancestry?.disconnect();
      observed.clear();
    },
  };
}

/** Finite animations running on an ancestor of any of `elements`. */
function glidesOver(elements: ReadonlySet<Element>): Animation[] {
  if (elements.size === 0 || typeof document.getAnimations !== 'function') return [];
  return document.getAnimations().filter((animation) => {
    const effect = animation.effect as KeyframeEffect | null;
    const target = effect?.target;
    if (!target || animation.playState !== 'running') return false;
    if (!Number.isFinite(Number(effect.getComputedTiming().endTime))) return false;
    for (const element of elements) if (target !== element && target.contains(element)) return true;
    return false;
  });
}

/**
 * Runs `measure` when the geometry it reads may have changed, and not on other renders: Grid and
 * its chrome re-render on every simulation tick, and a tick moves none of it. `measure` reads the
 * DOM, sets state only where a value changed, and returns the elements it read.
 *
 * It runs again when:
 * - `deps` change: the render-driven inputs (the layout, the zoom, the drawers, what is shown);
 * - a panel layout solve moves, resizes, mounts or removes a panel (the PanelSnapRegistry layout
 *   store), once the commit is done, and again when that solve's glides have finished;
 * - an element it returned changes size (a font loading, the chat collapsing, a probe);
 * - the window resizes, or `frameRef`'s element or an ancestor changes its style or class (the
 *   app placing or fitting the frame in the window);
 * - `frameRef` is attached (a parent's ref, set after this component's layout effects) or replaced.
 *
 * Without a PanelSnapRegistryProvider panels are not observed: each lays itself out alone.
 */
export function useLayoutMeasure(
  frameRef: RefObject<Element | null>,
  measure: () => MeasuredElements,
  deps: DependencyList,
): void {
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const [tracker] = useState(() => createTracker(() => measureRef.current(), frameRef));
  const layout = usePanelSnapRegistry()?.layout;

  // First, so the effects below measure through a started tracker.
  useLayoutEffect(() => {
    tracker.start();
    return tracker.stop;
  }, [tracker]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `deps` are the caller's measure inputs.
  useLayoutEffect(tracker.run, deps);
  // An identity check, no read: measures where the frame was not attached at the last measure.
  useLayoutEffect(() => {
    if (frameRef.current !== tracker.measuredFrame()) tracker.run();
  });
  useEffect(() => {
    if (frameRef.current !== tracker.measuredFrame()) tracker.run();
  });
  // Subscribed in the layout phase, so a solve in the commit that mounts this is not missed.
  useLayoutEffect(() => layout?.subscribeGeometry(tracker.runAfterCommit), [layout, tracker]);
  useLayoutEffect(() => {
    window.addEventListener('resize', tracker.runNow);
    return () => window.removeEventListener('resize', tracker.runNow);
  }, [tracker]);
}
