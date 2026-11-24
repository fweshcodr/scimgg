// @vitest-environment happy-dom

import { act, fireEvent, render } from '@testing-library/react';
import { createRef, type ReactNode, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DisplayTimelineProvider } from '../../contexts/DisplayTimelineContext';
import { ReplayFrameProvider } from '../../contexts/ReplayFrameContext';
import { TickProgressProvider } from '../../contexts/TickProgressContext';
import type { GameEvent, XpSkill } from '../../core/events/types';
import type { ReplayDisplayFrame } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { SimulationEngine } from '../../core/SimulationEngine';
import { TickProgressStore } from '../../core/tickProgressStore';
import { encounterRegistry } from '../../encounters/registry';
import { type NpcState, OSRS_TICK_MS, type SimulationState } from '../../types/simulation';
import { BossHealthBarOverlay } from '../BossHealthBarOverlay';
import { PackImage } from '../PackImage';
import { PanelSnapRegistryProvider } from '../snap/PanelSnapRegistry';
import { TooltipProvider } from '../Tooltip';
import { XpDropOverlay } from '../XpDropOverlay';
import { XpDropProjection } from '../xpDrops';

const TRANSPARENT_PIXEL_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

describe('PackImage', () => {
  it('renders an img with provided src and spreads additional props', () => {
    const { container } = render(
      <PackImage src="/test.png" alt="test image" className="pack-img" data-testid="pack-image" />,
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('/test.png');
    expect(img!.getAttribute('alt')).toBe('test image');
    expect(img!.className).toBe('pack-img');
    expect(img!.getAttribute('data-testid')).toBe('pack-image');
  });

  it('forwards ref to img element', () => {
    const ref = createRef<HTMLImageElement>();

    render(<PackImage ref={ref} src="/test.png" alt="test" />);

    expect(ref.current).toBeInstanceOf(HTMLImageElement);
    expect(ref.current?.getAttribute('src')).toBe('/test.png');
  });

  describe('error fallback behavior', () => {
    it('switches to fallback src when primary src fails', () => {
      const onError = vi.fn();
      const { container } = render(
        <PackImage src="/broken.png" fallback="/fallback.png" alt="test" onError={onError} />,
      );

      const img = container.querySelector('img')!;
      fireEvent.error(img);

      expect(img.getAttribute('src')).toBe('/fallback.png');
      expect(img.style.opacity).toBe('');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('hides image and uses transparent pixel when no fallback is provided', () => {
      const onError = vi.fn();
      const { container } = render(<PackImage src="/broken.png" alt="test" onError={onError} />);

      const img = container.querySelector('img')!;
      fireEvent.error(img);

      expect(img.getAttribute('src')).toBe(TRANSPARENT_PIXEL_DATA_URI);
      expect(img.style.opacity).toBe('0');
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('hides image when fallback also fails', () => {
      const onError = vi.fn();
      const { container } = render(
        <PackImage src="/broken.png" fallback="/also-broken.png" alt="test" onError={onError} />,
      );

      const img = container.querySelector('img')!;

      fireEvent.error(img);
      expect(img.getAttribute('src')).toBe('/also-broken.png');
      expect(img.style.opacity).toBe('');

      fireEvent.error(img);
      expect(img.getAttribute('src')).toBe(TRANSPARENT_PIXEL_DATA_URI);
      expect(img.style.opacity).toBe('0');
      expect(onError).toHaveBeenCalledTimes(2);
    });
  });

  it('resets error state when src changes', () => {
    const { container, rerender } = render(<PackImage src="/broken.png" fallback="/fallback.png" alt="test" />);

    const img = container.querySelector('img')!;

    fireEvent.error(img);
    fireEvent.error(img);

    expect(img.getAttribute('src')).toBe(TRANSPARENT_PIXEL_DATA_URI);
    expect(img.style.opacity).toBe('0');

    rerender(<PackImage src="/new-image.png" fallback="/new-fallback.png" alt="test" />);

    expect(img.getAttribute('src')).toBe('/new-image.png');
    expect(img.style.opacity).toBe('');

    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe('/new-fallback.png');
    expect(img.style.opacity).toBe('');
  });
});

type BossHealthBarTestProps = {
  enabled: boolean;
  showName: boolean;
  showValues: boolean;
  showPercentage: boolean;
  beta?: boolean;
  width?: number;
};

const BOSS_BASE_PROPS: BossHealthBarTestProps = {
  enabled: true,
  showName: true,
  showValues: true,
  showPercentage: true,
};

interface NpcFixture {
  id: string;
  archetypeId: string;
  role: 'boss' | 'minion' | 'npc';
  hp: number;
  maxHp: number;
}

function makeNpc(fixture: NpcFixture): NpcState {
  return fixture as unknown as NpcState;
}

function makeSimulationState(npcs: NpcState[], attackTarget: string | null = null): SimulationState {
  return { attackTarget, npcs } as unknown as SimulationState;
}

function renderBossHealthBar(simulationState: SimulationState, props: Partial<BossHealthBarTestProps> = {}) {
  // The overlay reads the live UI scale from TooltipContext (it feeds
  // DraggablePanel's layoutScale), so the provider has to wrap it.
  return render(<BossHealthBarOverlay {...BOSS_BASE_PROPS} {...props} simulationState={simulationState} />, {
    wrapper: TooltipProvider,
  });
}

describe('BossHealthBarOverlay', () => {
  it('renders nothing when disabled', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState, { enabled: false });

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when enabled without a boss or target', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'minion', archetypeId: 'voidFlare', role: 'minion', hp: 10, maxHp: 10 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    expect(container.firstChild).toBeNull();
  });

  it('renders the boss health bar with the derived boss name', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    expect(container.querySelector('.boss-hp')).not.toBeNull();
    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Yama');
    // A browser page translation rewriting text nodes React owns tears the live HUD down
    // mid-render, and the name and readout change through the fight.
    expect(container.querySelector('.boss-hp')?.getAttribute('translate')).toBe('no');
  });

  it('marks a beta encounter beside the boss name, and only beside the name', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'zuk', role: 'boss', hp: 1200, maxHp: 1500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState, { beta: true });
    const info = container.querySelector('.boss-hp__info');
    expect(info?.querySelector('.boss-hp__name')?.textContent).toBe('Zuk');
    expect(info?.querySelector('.status-badge--compact')?.textContent).toBe('Beta');

    // The marker annotates the name: hiding the name hides the marker with it.
    const nameless = renderBossHealthBar(simulationState, { beta: true, showName: false });
    expect(nameless.container.querySelector('.status-badge')).toBeNull();

    const finished = renderBossHealthBar(simulationState);
    expect(finished.container.querySelector('.status-badge')).toBeNull();
  });

  it('drops the percentage from the narrow mobile bar while values are shown, so the name fits', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 833, maxHp: 2500 }),
    ]);

    const mobile = renderBossHealthBar(simulationState, { width: 150 });
    expect(mobile.container.querySelector('.boss-hp__values')?.textContent).toBe('833/2500');
    expect(mobile.container.querySelector('.boss-hp__pct')).toBeNull();

    // Percentage alone still shows; the desktop bar keeps both.
    const pctOnly = renderBossHealthBar(simulationState, { width: 150, showValues: false });
    expect(pctOnly.container.querySelector('.boss-hp__pct')?.textContent).toBe('33.3%');
    const desktop = renderBossHealthBar(simulationState);
    expect(desktop.container.querySelector('.boss-hp__pct')?.textContent).toBe('33.3%');
  });

  it('renders snake-case boss identifiers as spaced names', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 1500, maxHp: 1500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Yama');
  });

  it('picks the attack target over the boss when both are present', () => {
    const simulationState = makeSimulationState(
      [
        makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
        makeNpc({ id: 'target', archetypeId: 'voidFlare', role: 'minion', hp: 8, maxHp: 10 }),
      ],
      'target',
    );

    const { container } = renderBossHealthBar(simulationState);

    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Void Flare');
  });

  it('falls back to the boss when attack target is unset', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
      makeNpc({ id: 'target', archetypeId: 'voidFlare', role: 'minion', hp: 8, maxHp: 10 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Yama');
  });

  it('shows a boss from its spawn tick, not from the earlier tick it was added', () => {
    // Wave 69's intro adds TzKal-Zuk at C-8; his spawn tick is control C, when the game opens his bar.
    const zuk = { ...makeNpc({ id: 'zuk', archetypeId: 'zuk', role: 'boss', hp: 1200, maxHp: 1200 }), spawnTick: 37 };
    const atTick = (currentTick: number) => ({ ...makeSimulationState([zuk]), currentTick });

    const { container, rerender } = renderBossHealthBar(atTick(29));
    expect(container.firstChild).toBeNull();
    rerender(<BossHealthBarOverlay {...BOSS_BASE_PROPS} simulationState={atTick(37)} />);
    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Zuk');
  });

  it('uses the remembered target while walking and reads each replay snapshot independently', () => {
    const state = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'zuk', role: 'boss', hp: 1000, maxHp: 1500 }),
      makeNpc({ id: 'ranger', archetypeId: 'ranger', role: 'minion', hp: 80, maxHp: 100 }),
    ]);
    const { container, rerender } = renderBossHealthBar({ ...state, lastAttackTarget: 'ranger' });
    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Ranger');
    expect(container.querySelector('.boss-hp__values')?.textContent).toBe('80/100');

    rerender(<BossHealthBarOverlay {...BOSS_BASE_PROPS} simulationState={{ ...state, lastAttackTarget: null }} />);
    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Zuk');
  });

  it.each([0, 80])('falls back from a dead or missing remembered target (hp=%i)', (hp) => {
    const state = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'zuk', role: 'boss', hp: 1000, maxHp: 1500 }),
      makeNpc({ id: 'ranger', archetypeId: 'ranger', role: 'minion', hp, maxHp: 100 }),
    ]);
    const { container } = renderBossHealthBar({ ...state, lastAttackTarget: hp === 0 ? 'ranger' : 'missing' });
    expect(container.querySelector('.boss-hp__name')?.textContent).toBe('Zuk');
  });

  it('shows values and percentage for the selected target', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    expect(container.querySelector('.boss-hp__values')?.textContent).toBe('250/500');
    expect(container.querySelector('.boss-hp__pct')?.textContent).toBe('50.0%');
  });

  it('hides name values and percentage independently', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState, {
      showName: false,
      showValues: false,
      showPercentage: false,
    });

    expect(container.querySelector('.boss-hp__name')).toBeNull();
    expect(container.querySelector('.boss-hp__values')).toBeNull();
    expect(container.querySelector('.boss-hp__pct')).toBeNull();
  });

  it('sets the fill width from the health ratio', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    expect(container.querySelector<HTMLElement>('.boss-hp__fill')?.style.width).toBe('50%');
  });

  // The slot is computed for the frame at the bar's scaled size; the registry must take it as it is.
  // Projected again from the unscaled 208 box, a centered bar at 1.5x landed at x 1074, not 1124.
  it('opens in its slot at 1.5x and 2x through the panel registry, centered, not projected twice', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);
    const bar = (overlayScale: number) => (
      <PanelSnapRegistryProvider>
        <BossHealthBarOverlay
          {...BOSS_BASE_PROPS}
          simulationState={simulationState}
          overlayScale={overlayScale}
          defaultSlot={{ scene: { x: 0, y: 0, width: 2560, height: 1800 }, row: null, zoom: overlayScale }}
          viewportWidth={2560}
          viewportHeight={1800}
        />
      </PanelSnapRegistryProvider>
    );
    const { container, rerender } = render(bar(1.5), { wrapper: TooltipProvider });
    const placed = () => {
      const panel = container.querySelector<HTMLElement>('[data-tutorial="boss-health-bar-panel"]');
      const match = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(panel?.style.transform ?? '');
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    };
    // (2560 - 208 * 1.5) / 2, one 4px gap (scaled) under the scene's top.
    expect(placed()).toEqual({ x: 1124, y: 6 });
    rerender(bar(2));
    expect(placed()).toEqual({ x: (2560 - 416) / 2, y: 8 });
  });

  /**
   * Structural, not behavioral: the readout is a plugin overlay parked over the arena,
   * and in fixed mode it covers tiles the player has to be able to click, camera-drag and
   * right-click through. jsdom/happy-dom do no CSS hit-testing, so a fireEvent "click
   * through" test would pass no matter what this style said — asserting the declaration
   * is the only thing that actually fails when the pointerPassthrough prop is dropped.
   */
  it('leaves its whole rect pointer-transparent so clicks reach the scene', () => {
    const simulationState = makeSimulationState([
      makeNpc({ id: 'boss', archetypeId: 'yama', role: 'boss', hp: 250, maxHp: 500 }),
    ]);

    const { container } = renderBossHealthBar(simulationState);

    const contentLayer = container.querySelector<HTMLElement>('.boss-hp')?.parentElement;
    expect(contentLayer?.style.pointerEvents).toBe('none');
  });
});

const XP_BASE_PROPS = {
  enabled: true,
  showPredictedHit: false,
  grouped: true,
  showIcons: true,
  speed: 44,
};

type XpOverlayProps = Parameters<typeof XpDropOverlay>[0];
type XpDropEvent = Extract<GameEvent, { type: 'xp_drop' }>;
type SkillDelta = { skill: XpSkill; amount: number };

const XP_INITIAL_STATE = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();

let nextEventId = 0;

function makeXpDropEvent(tick: number, skills: SkillDelta[], predictedHit = 0): XpDropEvent {
  return {
    type: 'xp_drop',
    eventId: ++nextEventId,
    tick,
    skills,
    predictedHit,
  };
}

function xpFrame(currentTick: number, events: GameEvent[] = []): ReplayDisplayFrame {
  return { state: { ...XP_INITIAL_STATE, currentTick }, events };
}

interface XpTimelineTreeProps {
  ticks: TickProgressStore;
  replayStore: ReplayFrameStore;
  history: readonly ReplayDisplayFrame[];
  state: SimulationState;
  replaying: boolean;
  children: ReactNode;
}

// The overlay reads the live UI scale from TooltipContext (it feeds
// DraggablePanel's layoutScale) and its drops from the displayed timeline, so
// every render needs both providers over the real stores the app mounts.
function XpTimelineTree({ ticks, replayStore, history, state, replaying, children }: XpTimelineTreeProps) {
  return (
    <TooltipProvider>
      <ReplayFrameProvider store={replayStore}>
        <TickProgressProvider store={ticks}>
          <DisplayTimelineProvider history={history} state={state} replaying={replaying}>
            {children}
          </DisplayTimelineProvider>
        </TickProgressProvider>
      </ReplayFrameProvider>
    </TooltipProvider>
  );
}

interface XpMountOptions {
  readonly replaying?: boolean;
  readonly strict?: boolean;
  /** A prebuilt recording for replay; live play appends frames through `tick`. */
  readonly history?: ReplayDisplayFrame[];
}

function mountXpOverlay(props: Partial<XpOverlayProps> = {}, options: XpMountOptions = {}) {
  const { replaying = false, strict = false, history = [] } = options;
  const ticks = new TickProgressStore();
  const replayStore = new ReplayFrameStore();
  let state = xpFrame(0).state;
  let overlayProps: XpOverlayProps = { ...XP_BASE_PROPS, ...props };

  // Subscriptions counted at the store boundary: the facade attaches to its
  // stores for the first consumer and detaches after the last one leaves, so a
  // live subscription here is a live consumer.
  const attached = vi.fn();
  const detached = vi.fn();
  const subscribeTicks = ticks.subscribe;
  vi.spyOn(ticks, 'subscribe').mockImplementation((listener) => {
    attached();
    const detach = subscribeTicks(listener);
    return () => {
      detached();
      detach();
    };
  });

  const element = () => {
    const tree = (
      <XpTimelineTree ticks={ticks} replayStore={replayStore} history={history} state={state} replaying={replaying}>
        <XpDropOverlay {...overlayProps} />
      </XpTimelineTree>
    );
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  const view = render(element());

  /** Live play: record the next tick's frame with its events and commit it, clock at the tick start. */
  const tick = (events: GameEvent[] = []): void => {
    const currentTick = history.length;
    history.push(xpFrame(currentTick, events));
    state = xpFrame(currentTick).state;
    view.rerender(element());
    act(() => ticks.set(currentTick));
  };

  return {
    container: view.container,
    unmount: view.unmount,
    ticks,
    replayStore,
    history,
    tick,
    /** Live play: one attack's XP on the next tick. */
    publish: (skills: SkillDelta[], predictedHit = 0): void => {
      tick([makeXpDropEvent(history.length, skills, predictedHit)]);
    },
    /** Live play: display simulation time `timeMs`, recording empty ticks up to it. */
    at: (timeMs: number): void => {
      while (history.length <= Math.floor(timeMs / OSRS_TICK_MS)) tick();
      act(() => ticks.set(timeMs / OSRS_TICK_MS));
    },
    /** Replay: move the playhead. */
    seek: (playheadMs: number): void => {
      act(() => replayStore.set(playheadMs, undefined));
    },
    setProps: (next: Partial<XpOverlayProps>): void => {
      overlayProps = { ...overlayProps, ...next };
      view.rerender(element());
    },
    rerender: (): void => view.rerender(element()),
    liveSubscriptions: () => attached.mock.calls.length - detached.mock.calls.length,
  };
}

function drops(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.xp-drop'));
}

function dropAt(container: HTMLElement, index: number): HTMLElement {
  const drop = drops(container)[index];
  if (!drop) {
    throw new Error(`Expected XP drop at index ${index}`);
  }
  return drop;
}

function dropText(container: HTMLElement, index = 0): string | null {
  return dropAt(container, index).querySelector('.xp-drop__text')?.textContent ?? null;
}

/** What the player sees of each drop, in DOM order: text, icons, position and alpha. */
function dropPicture(container: HTMLElement): string[] {
  return drops(container).map(
    (drop) =>
      `${drop.querySelector('.xp-drop__text')?.textContent}|${Array.from(
        drop.querySelectorAll('.xp-drop__icon'),
        (icon) => icon.getAttribute('aria-label'),
      ).join(',')}|${drop.style.transform}|${drop.style.opacity}`,
  );
}

describe('XpDropOverlay', () => {
  beforeEach(() => {
    nextEventId = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing, subscribes to nothing and indexes nothing when disabled', () => {
    const sample = vi.spyOn(XpDropProjection.prototype, 'sample');
    const { container, liveSubscriptions, publish } = mountXpOverlay({ enabled: false });
    publish([{ skill: 'attack', amount: 100 }]);

    expect(container.firstChild).toBeNull();
    expect(liveSubscriptions()).toBe(0);
    expect(sample).not.toHaveBeenCalled();
  });

  it('renders the draggable XP drops panel when enabled', () => {
    const { container } = mountXpOverlay();

    expect(container.querySelector('[data-tutorial="xp-drops-panel"]')).not.toBeNull();
    expect(container.querySelector('.xp-drop-overlay')).not.toBeNull();
  });

  it('spawns one grouped drop with skill icons and predicted hit text', () => {
    const { container, publish } = mountXpOverlay({ showPredictedHit: true });

    publish(
      [
        { skill: 'attack', amount: 100 },
        { skill: 'hitpoints', amount: 33 },
      ],
      25,
    );

    const drop = dropAt(container, 0);
    expect(drops(container)).toHaveLength(1);
    expect(drop.querySelectorAll('.xp-drop__icon')).toHaveLength(2);
    expect(drop.querySelectorAll('.xp-drop__icon').item(0)).toHaveAttribute('aria-label', 'attack');
    expect(drop.querySelectorAll('.xp-drop__icon').item(1)).toHaveAttribute('aria-label', 'hitpoints');
    expect(dropText(container)).toBe('133 (25)');
  });

  it('honors the predicted-hit and icon visibility options', () => {
    const { container, publish } = mountXpOverlay({ showIcons: false, showPredictedHit: false });

    publish([{ skill: 'magic', amount: 80 }], 30);

    expect(container.querySelectorAll('.xp-drop__icon')).toHaveLength(0);
    expect(dropText(container)).toBe('80');
  });

  it('releases ungrouped drops 400ms of displayed time apart with predicted hit only on the first drop', () => {
    const { container, publish, at } = mountXpOverlay({ grouped: false, showPredictedHit: true });

    publish(
      [
        { skill: 'attack', amount: 100 },
        { skill: 'strength', amount: 50 },
        { skill: 'hitpoints', amount: 33 },
      ],
      25,
    );
    expect(drops(container)).toHaveLength(1);
    expect(dropText(container, 0)).toBe('100 (25)');

    at(399);
    expect(drops(container)).toHaveLength(1);

    at(400);
    expect(drops(container)).toHaveLength(2);
    expect(dropText(container, 1)).toBe('50');

    // The third release lands in the next tick: the clock crosses a tick
    // boundary, and the drop keeps its 400ms slot rather than the tick's.
    at(800);
    expect(drops(container)).toHaveLength(3);
    expect(dropText(container, 2)).toBe('33');
  });

  it('suppresses predicted hit suffix for zero-hit events', () => {
    const { container, publish } = mountXpOverlay({ showPredictedHit: true });

    publish([{ skill: 'defence', amount: 75 }], 0);

    expect(dropText(container)).toBe('75');
  });

  it('skips zero-total XP events', () => {
    const { container, tick } = mountXpOverlay();

    tick([makeXpDropEvent(0, [{ skill: 'attack', amount: 0 }]), makeXpDropEvent(0, [])]);

    expect(drops(container)).toHaveLength(0);
  });

  it('rises at the configured px per displayed second and fades over the last fifth of its life', () => {
    const { container, publish, at } = mountXpOverlay();
    publish([{ skill: 'attack', amount: 100 }]);
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, 0.00px)');
    expect(dropAt(container, 0).style.opacity).toBe('1');

    at(500);
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, -22.00px)');
    expect(dropAt(container, 0).style.opacity).toBe('1');

    at(1800);
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, -79.20px)');
    expect(dropAt(container, 0).style.opacity).toBe('0.5');

    at(1999);
    expect(drops(container)).toHaveLength(1);
    at(2000);
    expect(drops(container)).toHaveLength(0);
  });

  it('holds a drop in place while the displayed clock is held, and moves the same node when it resumes', () => {
    // A paused fight writes no clock. Whatever wall time passes, the drop stays
    // exactly where the last write left it; there is no timer counting its life
    // down behind the pause.
    const { container, publish, at, rerender, ticks } = mountXpOverlay();
    publish([{ skill: 'attack', amount: 100 }]);
    at(500);
    const node = dropAt(container, 0);

    rerender();
    act(() => ticks.set(500 / OSRS_TICK_MS));
    expect(dropAt(container, 0)).toBe(node);
    expect(node.style.transform).toBe('translate(-50%, -22.00px)');

    at(1000);
    expect(dropAt(container, 0)).toBe(node);
    expect(node.style.transform).toBe('translate(-50%, -44.00px)');
  });

  it('stacks a drop born under a still-rising one one row below it, on the displayed clock', () => {
    // Slow enough that one tick of rise (6px) leaves the first drop inside the
    // row the second would spawn into.
    const { container, publish, at } = mountXpOverlay({ speed: 10 });
    publish([{ skill: 'attack', amount: 100 }]);
    publish([{ skill: 'strength', amount: 50 }]);

    // 600ms of displayed time later the first drop is 6px up; the second starts
    // one row (26px) below where the first now is.
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, -6.00px)');
    expect(dropAt(container, 1).style.transform).toBe('translate(-50%, 20.00px)');

    at(900);
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, -9.00px)');
    expect(dropAt(container, 1).style.transform).toBe('translate(-50%, 17.00px)');
  });

  it('rebuilds the drops on screen when a display option changes mid-flight', () => {
    const { container, publish, at, setProps } = mountXpOverlay();
    publish(
      [
        { skill: 'attack', amount: 100 },
        { skill: 'hitpoints', amount: 33 },
      ],
      25,
    );
    at(500);
    expect(dropText(container)).toBe('133');

    setProps({ showPredictedHit: true });
    expect(dropText(container)).toBe('133 (25)');

    setProps({ showIcons: false });
    expect(container.querySelectorAll('.xp-drop__icon')).toHaveLength(0);

    // Speed is px per displayed second, so the same 500ms of age re-lays out at
    // the new rate at once.
    setProps({ speed: 100 });
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, -50.00px)');

    setProps({ grouped: false });
    expect(drops(container)).toHaveLength(2);
    expect(dropText(container, 0)).toBe('100 (25)');
    expect(dropText(container, 1)).toBe('33');
  });

  it('draws the same drops live and in replay at the same displayed simulation time', () => {
    const live = mountXpOverlay({ grouped: false, showPredictedHit: true });
    live.publish(
      [
        { skill: 'attack', amount: 100 },
        { skill: 'strength', amount: 50 },
      ],
      25,
    );
    live.tick();
    live.publish([{ skill: 'magic', amount: 80 }], 12);
    live.at(1500);
    const livePicture = dropPicture(live.container);
    expect(livePicture).toHaveLength(3);
    live.unmount();

    const replay = mountXpOverlay(
      { grouped: false, showPredictedHit: true },
      { replaying: true, history: live.history.map((frame) => ({ ...frame })) },
    );
    act(() => replay.replayStore.setHistory(replay.history));
    replay.seek(1500);

    expect(dropPicture(replay.container)).toEqual(livePicture);
  });

  it('reconstructs the drops a seek lands on at their original age, reusing nodes still in flight', () => {
    const history = [
      xpFrame(0, [makeXpDropEvent(0, [{ skill: 'attack', amount: 100 }])]),
      xpFrame(1),
      xpFrame(2, [makeXpDropEvent(2, [{ skill: 'magic', amount: 80 }])]),
      xpFrame(3),
      xpFrame(4),
    ];
    const { container, replayStore, seek } = mountXpOverlay({}, { replaying: true, history });
    expect(drops(container)).toHaveLength(0);
    act(() => replayStore.setHistory(history));

    seek(2500);
    expect(dropPicture(container)).toEqual(['80|magic|translate(-50%, -57.20px)|1']);

    // Back to 300ms: the first drop is 300ms old again, the second unborn.
    seek(300);
    expect(dropPicture(container)).toEqual(['100|attack|translate(-50%, -13.20px)|1']);
    const first = dropAt(container, 0);

    seek(1500);
    expect(dropAt(container, 0)).toBe(first);
    expect(dropPicture(container)).toEqual([
      '100|attack|translate(-50%, -66.00px)|1',
      '80|magic|translate(-50%, -13.20px)|1',
    ]);

    // A scrub preview shows the previewed frame at its start.
    act(() => replayStore.setPreview({ frameIndex: 0, state: history[0].state, events: history[0].events }));
    expect(dropPicture(container)).toEqual(['100|attack|translate(-50%, 0.00px)|1']);
  });

  it('swaps to the loaded recording when the replay history is replaced', () => {
    const first = [xpFrame(0, [makeXpDropEvent(0, [{ skill: 'attack', amount: 100 }])])];
    const { container, replayStore, seek } = mountXpOverlay({}, { replaying: true, history: first });
    act(() => replayStore.setHistory(first));
    seek(300);
    expect(dropText(container)).toBe('100');

    const loaded = [xpFrame(0, [makeXpDropEvent(0, [{ skill: 'magic', amount: 80 }])])];
    act(() => replayStore.setHistory(loaded));

    expect(dropPicture(container)).toEqual(['80|magic|translate(-50%, -13.20px)|1']);
  });

  it('replaces text, icons and hit when the loaded recording reuses the event ids of the last one', () => {
    // Every run numbers its events from the same seed, so the first attack of
    // a loaded replay collides with the first attack of the run it replaces.
    const eventOne = (skills: SkillDelta[], predictedHit: number): XpDropEvent => ({
      type: 'xp_drop',
      eventId: 1,
      tick: 0,
      skills,
      predictedHit,
    });
    const first = [xpFrame(0, [eventOne([{ skill: 'attack', amount: 53 }], 10)])];
    const { container, replayStore, seek } = mountXpOverlay(
      { showPredictedHit: true },
      { replaying: true, history: first },
    );
    act(() => replayStore.setHistory(first));
    seek(300);
    expect(dropPicture(container)).toEqual(['53 (10)|attack|translate(-50%, -13.20px)|1']);

    const loaded = [xpFrame(0, [eventOne([{ skill: 'magic', amount: 99 }], 25)])];
    act(() => replayStore.setHistory(loaded));

    expect(dropPicture(container)).toEqual(['99 (25)|magic|translate(-50%, -13.20px)|1']);
  });

  it('shows nothing while a replay has no published history', () => {
    const { container, publish, at } = mountXpOverlay({}, { replaying: true });
    publish([{ skill: 'attack', amount: 100 }]);
    at(300);

    expect(drops(container)).toHaveLength(0);
  });

  it('releases its subscription and its drops on unmount, and does no further work', () => {
    const sample = vi.spyOn(XpDropProjection.prototype, 'sample');
    const { container, publish, liveSubscriptions, ticks, unmount } = mountXpOverlay();
    publish([{ skill: 'attack', amount: 100 }]);
    expect(drops(container)).toHaveLength(1);
    expect(liveSubscriptions()).toBe(1);

    unmount();
    sample.mockClear();
    act(() => ticks.set(0.5));

    expect(liveSubscriptions()).toBe(0);
    expect(sample).not.toHaveBeenCalled();
    expect(drops(container)).toHaveLength(0);
  });

  it('holds one subscription and samples once per clock write under StrictMode', () => {
    const sample = vi.spyOn(XpDropProjection.prototype, 'sample');
    const { container, publish, at, liveSubscriptions, unmount } = mountXpOverlay({}, { strict: true });
    publish([{ skill: 'attack', amount: 100 }]);
    expect(liveSubscriptions()).toBe(1);

    sample.mockClear();
    at(300);

    expect(sample).toHaveBeenCalledTimes(1);
    expect(drops(container)).toHaveLength(1);
    expect(dropAt(container, 0).style.transform).toBe('translate(-50%, -13.20px)');

    unmount();
    expect(liveSubscriptions()).toBe(0);
  });
});
