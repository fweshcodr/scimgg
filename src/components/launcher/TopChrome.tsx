import type React from 'react';
import { type RefObject, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EncounterCommand } from '../../core/encounters/commands';
import type { DebugActionInfo, MechanicsToggleInfo } from '../../core/encounters/types';
import type { SimulationEngine } from '../../core/SimulationEngine';
import { encounterSetupStage } from '../../encounters/practiceChrome';
import { ESC_PRIORITY, useEscapeLayer } from '../../hooks/useEscapeLayer';
import {
  type ChromeFrame,
  fpsPosition,
  LAUNCHER_BUTTON_HEIGHT,
  launcherRowPosition,
  launcherRowUsesIcons,
  PANE_WIDTH,
  type PaneKind,
  type PanePlacement,
  placePane,
  pluginsClearOfRow,
  pluginsPosition,
  type Rect,
} from '../../layout/topChromeLayout';
import { TUTORIAL_CLOSE_PANE_EVENT, TUTORIAL_HUD_OPENED_EVENT } from '../../tutorial/events';
import type { PracticeSessionState } from '../../types/practiceSession';
import type { ReplayPracticeControls } from '../../types/replayPractice';
import type { SetupContextControls } from '../../types/setupContext';
import type { MechanicsConfig, SimulationState } from '../../types/simulation';
import { HUD_TOOL_GAP } from '../../util/viewportLayout';
import { chromeZoomStyle } from '../chromeZoom';
import { FPS_OVERLAY_INSET, FpsOverlay } from '../FpsOverlay';
import { usePracticeControls } from '../hudModel';
import { useVisibleInPractice } from '../MechanicsSettings';
import { PracticeSessionBar } from '../PracticeSessionBar';
import { PracticeRetryBar } from '../ReplayPractice';
import { usePassiveSnapTarget } from '../snap';
import { useHoverCard } from '../ui/HoverCard';
import { useLayoutMeasure } from '../useLayoutMeasure';
import { EncounterWorkbench } from './EncounterWorkbench';
import { type LauncherGlyph, LauncherIcon } from './launcherIcons';
import { CloseGlyph, PracticePane, type PracticeTab } from './PracticePane';
import { useEncounterTool } from './useEncounterTool';
import './TopChrome.css';

/** A clicked control keeps no focus: keys over the game are game input (Keyboard and focus policy). */
const keepFocusOffButtons = (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
};

const ACTIONS_OFF_IN_REPLAY = 'Actions are off while you watch a replay.';
// Changing modifiers starts a new fight, which would end the replay.
const MODIFIERS_OFF_IN_REPLAY = 'Modifiers are off while you watch a replay.';

/**
 * The frame's fixed chrome a pane keeps clear of (placePane `chrome`): the minimap with its orbs or
 * the Compact Orbs block, the side panel and its tab bar. Plugins is TopChrome's own.
 */
const PANE_CHROME = '[data-tutorial="minimap"], [data-tutorial="game-panel"], [data-tutorial="tab-bar"]';

/** The menu pane's width, at zoom 1, where the column allows: one width for every row. */
const MENU_WIDTH = 192;

export interface TopChromeProps {
  readonly onRestart?: () => void;
  readonly replayPractice?: ReplayPracticeControls;
  /**
   * The encounter's own session controls, drawn in the same slot as replay practice's bar and in
   * the same two forms. Replay practice wins while it is active: a restart tick the player chose
   * is a more specific answer than the stage the fight is on.
   */
  readonly encounterSession?: PracticeSessionState | null;
  /** Grid's frame element: the game frame, in window pixels. */
  readonly frameRef: RefObject<HTMLElement | null>;
  readonly fixed: boolean;
  /** The chrome's zoom (Auto). */
  readonly zoom: number;
  /**
   * Changes whenever the window, the frame, the chat, the minimap's place or the chrome's zoom do:
   * the inputs a pane's placement is decided on. Ticks and the overlays (infoboxes, the boss bar)
   * never change it: panes draw over those, so an open pane stays put through the fight.
   */
  readonly layoutKey: string;
  /**
   * The Settings drawer (opened from the menu's first row). While it is open the row moves right
   * past it (`inset`, its width in window pixels) and stays usable; a drawer that covers the whole
   * window (inset 0, narrow windows) hides the row under it instead.
   */
  readonly settings: { readonly open: boolean; readonly inset: number };
  /**
   * A spotlight tutorial's overlay is up: the chrome rises above it, so the pinned menu's Training
   * cluster (with its Exit control) stays visible and usable, the rest dimmed.
   */
  readonly elevated?: boolean;
  readonly menu: {
    /** The menu's buttons (App owns what they open). */
    readonly items: React.ReactNode;
    /** A tutorial points at these buttons: the menu stays shown while no other pane is open. */
    readonly pinned: boolean;
    /**
     * A new player's first lobby visit: the menu opens by itself, once, and `onOpenedOnce` records
     * that it has. It closes like any menu (an item, a click outside, its launcher).
     */
    readonly openOnce?: boolean;
    readonly onOpenedOnce?: () => void;
  };
  /**
   * Plugins, in the window's top-right corner, toggling its drawer. While the drawer is open the
   * button shows pressed and it moves left past it (`inset`, its width in window pixels), as the row does past Settings; a
   * drawer that covers the whole window (inset 0) hides it instead.
   */
  readonly plugins: { readonly open: boolean; readonly inset: number; readonly onToggle: () => void } | null;
  /**
   * The encounter's run modifiers, where its descriptor offers any: a launcher that opens App's
   * modifier picker (`open` while it is up), which restarts the fight with the chosen set. Absent
   * or null where the encounter has none.
   */
  readonly modifiers?: { readonly open: boolean; readonly onOpen: () => void } | null;
  readonly showFps: boolean;
  readonly engine?: SimulationEngine;
  readonly simulationState: SimulationState;
  readonly dpsProjection?: ReturnType<SimulationEngine['getAdjustedTheoreticalDps']>;
  readonly mechanicsConfig: MechanicsConfig;
  readonly onMechanicsConfigChange: (config: MechanicsConfig) => void;
  /** Practice's Reset to defaults (`SetupContextControls`); absent offers none. */
  readonly setupContext?: SetupContextControls;
  readonly mechanicsToggles: readonly MechanicsToggleInfo[];
  readonly debugActions: readonly DebugActionInfo[];
  readonly onExecuteEncounterCommand: (command: EncounterCommand) => void;
  /** The running encounter's selected loadout for setup links (`EncounterToolProps.exportGear`). */
  readonly exportEncounterGear?: () => string;
  /** The encounter tool opening and closing, to hold the fight under it (`useEncounterTool`). */
  readonly onEncounterToolOpenChange?: (open: boolean) => void;
  readonly onSetBossHp: (hp: number) => void;
  readonly onApplyBossHpPreset?: (hp: number) => void;
  readonly replay: {
    readonly hasRecording: boolean;
    readonly isReplaying: boolean;
    readonly onEnter: () => void;
    readonly onExit: () => void;
    /** Why a recording may be incomplete, shown on the Replay button. */
    readonly notice: string | null;
  } | null;
  /**
   * Replay never appears here, whatever `replay` says: a combat tutorial hides it (App's
   * `effectiveReplay`), so the row's form does not count it as one still to come.
   */
  readonly replaySuppressed?: boolean;
  /**
   * The launcher row on screen, in window pixels: the boss bar's default slot keeps clear of it
   * (topChromeLayout.ts `bossBarDefault`). Its form follows the viewport alone (`launcherRowUsesIcons`),
   * so the bar cannot change it.
   */
  readonly onRowChange?: (rect: Rect | null) => void;
  /**
   * Plugins on screen, in window pixels, or null while hidden: the boss bar's default keeps clear
   * of it.
   */
  readonly onPluginsChange?: (rect: Rect | null) => void;
}

interface Measured {
  readonly frame: Rect;
  readonly window: { readonly width: number; readonly height: number };
  readonly chatTop: number;
  /**
   * The fixed chrome panes keep clear of, where it is now: the minimap with its orbs (or the
   * Compact Orbs block), the side panel and its tab bar. Never the click-through overlays.
   */
  readonly chrome: readonly Rect[];
  /** Only the persistent practice session avoids this overlay; ordinary opened panes do not. */
  readonly bossBar: Rect | null;
  /**
   * Each launcher's width in each form, in window pixels, as the probes lay them out: every launcher
   * that can show here, Replay included before there is a recording (`replaySupported`).
   */
  readonly labelledWidths: readonly number[];
  readonly iconWidths: readonly number[];
  readonly pluginsSize: { readonly width: number; readonly height: number } | null;
}

function childWidths(row: Element | null): number[] {
  return row ? Array.from(row.children, (child) => child.getBoundingClientRect().width) : [];
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const sameNumbers = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);
const sameSize = (
  a: { readonly width: number; readonly height: number } | null,
  b: { readonly width: number; readonly height: number } | null,
) => a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height);

function sameMeasured(a: Measured, b: Measured): boolean {
  return (
    sameRect(a.frame, b.frame) &&
    sameSize(a.window, b.window) &&
    a.chatTop === b.chatTop &&
    (a.bossBar === b.bossBar || (a.bossBar !== null && b.bossBar !== null && sameRect(a.bossBar, b.bossBar))) &&
    a.chrome.length === b.chrome.length &&
    a.chrome.every((rect, i) => sameRect(rect, b.chrome[i])) &&
    sameNumbers(a.labelledWidths, b.labelledWidths) &&
    sameNumbers(a.iconWidths, b.iconWidths) &&
    sameSize(a.pluginsSize, b.pluginsSize)
  );
}

const rectKey = (rect: Rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`;

/** A row of `widths` one gap apart: its total width and each button's offset from its left. */
function rowLayout(widths: readonly number[], gap: number): { width: number; offsets: number[] } {
  const offsets: number[] = [];
  let x = 0;
  for (const width of widths) {
    offsets.push(x);
    x += width + gap;
  }
  return { width: Math.max(0, x - gap), offsets };
}

function rectOf(element: Element | null | undefined): Rect | null {
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? { x: box.left, y: box.top, width: box.width, height: box.height } : null;
}

interface LauncherButtonProps {
  readonly glyph: LauncherGlyph;
  readonly label: string;
  /** The name the icon form gives, where it differs from the label (Replay while replaying: Exit Replay). */
  readonly iconName?: string;
  /** The row's icon form: the launcher's glyph in place of its label. */
  readonly iconOnly: boolean;
  readonly open: boolean;
  readonly toggles: boolean;
  readonly disabledReason?: string;
  /** Why a recording may be incomplete (Replay): marked on the button, explained on hover. */
  readonly notice?: string;
  readonly tutorial?: string;
  readonly buttonRef?: React.Ref<HTMLButtonElement>;
  /** False for the width probes: measured, never read or pressed, so no name, card or handler. */
  readonly live: boolean;
  readonly onClick: () => void;
}

/**
 * One launcher. Whatever it cannot say on its face (its name in icon form, why it is off, what a
 * notice means) it says on hover in the app's hover card, under the row, never the browser's
 * title tooltip. A press closes the card: what the press opens is where the card was. Touch has no
 * hover, and a tap belongs to the button, so touch shows no card (useHoverCard `regionTouch`).
 */
const LauncherButton: React.FC<LauncherButtonProps> = ({
  glyph,
  label,
  iconName = label,
  iconOnly,
  open,
  toggles,
  disabledReason,
  notice,
  tutorial,
  buttonRef,
  live,
  onClick,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const cardId = useId();
  const tip = disabledReason ?? (notice ? `${iconName}. ${notice}` : iconOnly ? iconName : null);
  const { card } = useHoverCard({
    content: tip,
    anchorRef: ref,
    placement: 'block',
    cardId,
    // Launchers are aimed at on purpose: show the name at once.
    dwellMs: 0,
    cardClassName: 'hover-card--instant',
    openOnFocus: false,
    dismissOnPress: true,
    regionTouch: false,
  });
  const setRef = (node: HTMLButtonElement | null) => {
    ref.current = node;
    if (typeof buttonRef === 'function') buttonRef(node);
    else if (buttonRef) (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };
  const icon = iconOnly ? glyph : null;
  return (
    <>
      <button
        ref={live ? setRef : undefined}
        type="button"
        className={`launcher-btn${icon ? ' launcher-btn--icon' : ''}${glyph === 'menu' ? ' launcher-btn--menu' : ''}${open ? ' is-open' : ''}`}
        aria-label={live && icon ? iconName : undefined}
        aria-describedby={live && tip && !icon ? cardId : undefined}
        aria-expanded={toggles ? undefined : open}
        aria-pressed={toggles ? open : undefined}
        aria-disabled={disabledReason ? true : undefined}
        data-tutorial={live ? tutorial : undefined}
        data-launcher={glyph}
        onClick={live ? onClick : undefined}
      >
        {icon ? <LauncherIcon glyph={icon} /> : label}
        {notice && !icon && (
          <span className="launcher-btn__notice" aria-hidden="true">
            !
          </span>
        )}
      </button>
      {live && tip && card}
    </>
  );
};

/**
 * The chrome along the top of the game on desktop: the launcher row and the one pane it opens at a
 * time (Menu, Practice, Actions), Replay, Plugins, and the FPS readout. Placement is
 * layout/topChromeLayout.ts; this measures the live frame, chat, boss bar, minimap and infobox rows
 * and lays the chrome out in window pixels.
 */
export const TopChrome: React.FC<TopChromeProps> = (props) => {
  const { frameRef, fixed, zoom, layoutKey, menu, settings, plugins, replay, onRowChange, onPluginsChange } = props;
  const modifiers = props.modifiers ?? null;
  // The open Settings drawer pushes the row right; one covering the whole window hides it.
  const leftInset = settings.open ? settings.inset : 0;
  const settingsTucked = settings.open && settings.inset === 0;
  // Plugins mirrors the row on the right: pushed left by its open drawer, hidden by a full-window one.
  const pluginsOpen = plugins?.open ?? false;
  const rightInset = pluginsOpen ? (plugins?.inset ?? 0) : 0;
  const pluginsTucked = pluginsOpen && rightInset === 0;
  // A full-window drawer hides everything here, whichever side it opens from. Normally it just paints
  // over this chrome, but a tour raises the chrome above the drawers (`elevated`): the pinned menu
  // then covered the plugin rows a tour pointed at, and Plugins the Settings drawer's close.
  const rowTucked = settingsTucked || pluginsTucked;
  // Moving with a drawer: the drawer's slide, then back to placing at once.
  const [sliding, setSliding] = useState(false);
  const previousInsets = useRef(`${leftInset}|${rightInset}`);
  useEffect(() => {
    const insets = `${leftInset}|${rightInset}`;
    if (previousInsets.current === insets) return;
    previousInsets.current = insets;
    setSliding(true);
    const timer = window.setTimeout(() => setSliding(false), 320);
    return () => window.clearTimeout(timer);
  }, [leftInset, rightInset]);
  const practice = usePracticeControls({
    engine: props.engine,
    mechanicsToggles: props.mechanicsToggles,
    simulationState: props.simulationState,
  });
  const [pane, setPane] = useState<PaneKind | null>(null);
  const [practiceTab, setPracticeTab] = useState<PracticeTab>('setup');
  const [measured, setMeasured] = useState<Measured | null>(null);
  // Every pane opened from an icon carries its name until placed again, whatever
  // the row's form does meanwhile. Labeled launchers provide that name themselves.
  const [placement, setPlacement] = useState<{ kind: PaneKind; at: PanePlacement; fromIcon: boolean } | null>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const iconProbeRef = useRef<HTMLDivElement>(null);
  const pluginsRef = useRef<HTMLButtonElement>(null);
  const pluginsProbeRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // A pressed control keeps no focus: delegated over the whole chrome with a native listener, since
  // the chrome itself is not a control.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.addEventListener('mousedown', keepFocusOffButtons);
    return () => root.removeEventListener('mousedown', keepFocusOffButtons);
  }, []);
  const replaying = replay?.isReplaying ?? false;
  const encounterTool = useEncounterTool(props, replaying);
  const practiceSession = !replaying && props.replayPractice?.startTick != null ? props.replayPractice : null;
  const encounterSession = !replaying && !practiceSession ? (props.encounterSession ?? null) : null;
  // One session bar at a time, whichever owns the slot: it decides the placement, what the pane
  // keeps clear of, and whether the chrome carries a session at all.
  const hasSession = practiceSession !== null || encounterSession !== null;
  const sessionBar = (presentation: 'compact' | 'labelled', className?: string, style?: React.CSSProperties) =>
    practiceSession ? (
      <PracticeRetryBar controls={practiceSession} presentation={presentation} className={className} style={style} />
    ) : encounterSession ? (
      <PracticeSessionBar session={encounterSession} presentation={presentation} className={className} style={style} />
    ) : null;
  // The same encounter-authored rule as Mobile Practice's list: Zuk's actions only while wave 69 is
  // fought, Random Spawns or Lock Layout as the run's session bar offers them.
  const runSnapshot = props.simulationState.encounter;
  const debugActions = useVisibleInPractice(props.debugActions, {
    config: props.mechanicsConfig,
    stage: encounterSetupStage(runSnapshot) ?? undefined,
    encounterSnapshot: runSnapshot,
  });
  const hasActions = debugActions.length > 0;
  const hasPractice = practice.hasPracticeControls;
  const hasModifiers = modifiers !== null;
  const hasReplay = Boolean(replay?.hasRecording);
  // Replay is counted in the row's form wherever it can appear, before there is a recording: it
  // appears a tick into every fight and goes on reset, and must not flip the rest. Not where a combat
  // tutorial hides it: there it never appears, so the row is decided without it.
  const replaySupported = replay !== null && !props.replaySuppressed;

  // Tutorials point at the menu's buttons, so it stays up while nothing else is open. A tour that
  // opens Practice closes it again as it moves on (TUTORIAL_CLOSE_PANE_EVENT); until then the Menu
  // launcher stays pressable under the tour's overlay (TopChrome.css), so Training and its Exit are
  // one press away whatever is open.
  const shownPane: PaneKind | null = pane ?? (menu.pinned ? 'menu' : null);

  // Measured when something it reads may have moved (useLayoutMeasure), never on a tick, and set
  // only on a change. Opening a pane measures too, so a pane is placed on a fresh measure.
  useLayoutMeasure(frameRef, () => {
    const frameElement = frameRef.current;
    if (!frameElement) return [];
    // A frame not laid out yet (or a DOM without layout) is taken as the window, so the row is
    // always there to press; a real frame is measured before the first paint.
    const frame = rectOf(frameElement) ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const chatElement = frameElement.querySelector('.chatbox');
    const chat = rectOf(chatElement);
    const chromeElements = Array.from(frameElement.querySelectorAll(PANE_CHROME));
    const bossBar = hasSession ? frameElement.querySelector('[data-tutorial="boss-health-bar-panel"]') : null;
    const next: Measured = {
      frame,
      window: { width: window.innerWidth, height: window.innerHeight },
      chatTop: chat ? chat.y : frame.y + frame.height,
      chrome: chromeElements.map(rectOf).filter((rect): rect is Rect => rect !== null),
      bossBar: rectOf(bossBar),
      labelledWidths: childWidths(probeRef.current),
      iconWidths: childWidths(iconProbeRef.current),
      pluginsSize: pluginsProbeRef.current
        ? { width: pluginsProbeRef.current.offsetWidth * zoom, height: pluginsProbeRef.current.offsetHeight * zoom }
        : null,
    };
    setMeasured((previous) => (previous && sameMeasured(previous, next) ? previous : next));
    // Watched for size: the chat collapsing or resizing, the chrome resizing within its panel,
    // a launcher's label or font changing its width.
    return [
      frameElement,
      chatElement,
      ...chromeElements,
      bossBar,
      ...(probeRef.current?.children ?? []),
      ...(iconProbeRef.current?.children ?? []),
      pluginsProbeRef.current,
    ];
  }, [
    layoutKey,
    zoom,
    fixed,
    leftInset,
    rightInset,
    shownPane,
    hasSession,
    // The launchers the probes lay out, and the notice Replay may carry.
    hasPractice,
    hasActions,
    hasModifiers,
    encounterTool.definition,
    replaySupported,
    replay?.notice ?? null,
    plugins !== null,
  ]);

  const chromeFrame: ChromeFrame | null = measured ? { rect: measured.frame, fixed } : null;
  const rowHeight = LAUNCHER_BUTTON_HEIGHT * zoom;
  const pluginsRect: Rect | null =
    measured?.pluginsSize && plugins
      ? { ...pluginsPosition(measured.pluginsSize, measured.window, zoom, rightInset), ...measured.pluginsSize }
      : null;
  // Two forms: all labeled, or every launcher (Menu too) as its icon. Decided on the labeled row
  // of every launcher the encounter can show (the probes), from the viewport alone: the boss bar and the rest place themselves around the row, never the other way round.
  const gap = HUD_TOOL_GAP * zoom;
  const icons =
    measured !== null &&
    chromeFrame !== null &&
    launcherRowUsesIcons({
      labelledWidth: rowLayout(measured.labelledWidths, gap).width,
      frame: chromeFrame,
      zoom,
      leftInset,
    });
  // The live row: the shown launchers, a prefix of the probes' (only Replay, last, may be missing).
  const keys = launcherKeys(hasReplay && replaySupported);
  const layout = rowLayout(
    keys.map((_, i) => (icons ? measured?.iconWidths[i] : measured?.labelledWidths[i]) ?? 0),
    gap,
  );
  const row: Rect | null =
    measured && chromeFrame
      ? {
          ...launcherRowPosition({ width: layout.width, height: rowHeight }, chromeFrame, zoom, leftInset),
          width: layout.width,
          height: rowHeight,
        }
      : null;

  const rowKey = row ? rectKey(row) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowKey stands for row's values.
  useEffect(() => {
    onRowChange?.(row);
  }, [rowKey, onRowChange]);
  // Hidden under a full-window drawer, or giving way to the row where both drawers leave no room.
  const pluginsHidden = rowTucked || (pluginsRect !== null && !pluginsClearOfRow(pluginsRect, row, zoom));
  const shownPlugins = plugins && !pluginsHidden ? pluginsRect : null;
  // Panels snap against Plugins while it is shown.
  usePassiveSnapTarget('nav-plugins', pluginsRef, shownPlugins !== null);
  const pluginsKey = shownPlugins ? rectKey(shownPlugins) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: pluginsKey stands for shownPlugins' values.
  useEffect(() => {
    onPluginsChange?.(shownPlugins);
  }, [pluginsKey, onPluginsChange]);

  // Where the shown pane opens: decided when it opens and frozen until it closes, so it holds still
  // through the fight. The only exceptions are the layout it was placed on changing under it: the
  // window or the frame resizing, the layout mode, the chat opening or closing (`layoutKey` and the
  // measured frame and chat), the chrome's zoom, the Settings drawer moving the row, and the fixed
  // chrome it keeps clear of moving or resizing (the minimap or Compact Orbs, the game panel and
  // its tab bar, Plugins). That chrome is keyed by the measurement the pane is solved against, not
  // by what Grid knows changed: Grid's key can change a render before the new places are measured,
  // and a pane placed then would keep the old ones. The row's width is deliberately not an input:
  // it follows which launchers are available (Actions and Replay come and go), and that may not
  // move an open pane; nor are the overlays (boss bar, infoboxes), which panes draw over. Nor is the
  // row's form: whether the pane carries a title row is decided here with its place, so an open pane
  // never gains or loses one.
  const paneChrome = measured ? (shownPlugins ? [...measured.chrome, shownPlugins] : measured.chrome) : [];
  // A session keeps boss HP clear both alone and combined with a pane. Without a
  // session, ordinary panes retain their original policy of drawing over overlays.
  const sessionChrome = measured?.bossBar ? [...paneChrome, measured.bossBar] : paneChrome;
  const placedChrome = hasSession ? sessionChrome : paneChrome;
  const sessionPlacement =
    hasSession && !shownPane && measured && chromeFrame && row
      ? placePane({
          kind: 'actions',
          zoom,
          row,
          frame: chromeFrame,
          window: measured.window,
          chatTop: measured.chatTop,
          chrome: sessionChrome,
        })
      : null;
  const placementKey = measured
    ? `${shownPane}|${layoutKey}|${zoom}|${leftInset}|${rectKey(measured.frame)}|${measured.chatTop}|${placedChrome.map(rectKey).join(';')}`
    : '';
  // Keyed, not run after every render: a tick changes none of it, and even a no-op set re-renders.
  // biome-ignore lint/correctness/useExhaustiveDependencies: placementKey stands for every input read here (row and chromeFrame exist exactly when measured does).
  useLayoutEffect(() => {
    if (!shownPane || !measured || !chromeFrame || !row) {
      setPlacement(null);
      return;
    }
    setPlacement({
      kind: shownPane,
      fromIcon: icons,
      at: placePane({
        kind: shownPane,
        zoom,
        row,
        frame: chromeFrame,
        window: measured.window,
        chatTop: measured.chatTop,
        chrome: placedChrome,
      }),
    });
  }, [placementKey]);

  const close = useCallback(() => setPane(null), []);
  useEffect(() => {
    const closeOverMenu = () =>
      setPane((current) => (current === 'practice' || current === 'actions' ? null : current));
    window.addEventListener(TUTORIAL_CLOSE_PANE_EVENT, closeOverMenu);
    return () => window.removeEventListener(TUTORIAL_CLOSE_PANE_EVENT, closeOverMenu);
  }, []);
  const toggle = (kind: PaneKind) => {
    encounterTool.close();
    setPane((current) => (current === kind ? null : kind));
    if (kind === 'practice' && pane !== 'practice') window.dispatchEvent(new CustomEvent(TUTORIAL_HUD_OPENED_EVENT));
  };

  // Practice and Actions stay open until closed: Escape, ×, their launcher. Scene clicks play.
  // Escape is arbitrated with everything else it closes (useEscapeLayer): over a replay, the pane
  // closes and the replay plays on; under the encounter search, the search closes first.
  useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, pane === 'practice' || pane === 'actions', close);
  // The menu is a menu: Escape, a click outside it or choosing an item closes it. A pinned menu
  // (`pane` null) is the tour's, not the player's, so Escape leaves it.
  useEscapeLayer(ESC_PRIORITY.LAUNCHER_MENU, pane === 'menu', close);
  useEffect(() => {
    if (pane !== 'menu') return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (paneRef.current?.contains(event.target) || menuButtonRef.current?.contains(event.target)) return;
      setPane(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [pane]);

  // Choosing a menu item closes the menu. React's bubbling click, so the item's own click (a React
  // handler on the item) has run first; a native listener on the body would run before it.
  const closeMenuOnItem = (event: React.MouseEvent) => {
    const item = event.target instanceof Element ? event.target.closest('button') : null;
    if (item) setPane((current) => (current === 'menu' ? null : current));
  };

  // A pane whose launcher has gone (an encounter without actions, or replay starting under the
  // Actions palette) closes with it.
  useEffect(() => {
    if ((pane === 'actions' && (!hasActions || replaying)) || (pane === 'practice' && !hasPractice)) setPane(null);
  }, [pane, hasActions, hasPractice, replaying]);

  // A new player's first lobby visit opens the menu, once.
  const { openOnce, onOpenedOnce } = menu;
  useEffect(() => {
    if (!openOnce) return;
    setPane((current) => current ?? 'menu');
    onOpenedOnce?.();
  }, [openOnce, onOpenedOnce]);

  const zoomStyle = chromeZoomStyle(zoom);
  const at = (x: number, y: number): React.CSSProperties => ({ ...zoomStyle, left: x / zoom, top: y / zoom });

  // The launchers, in order. Actions and Modifiers come and go with the encounter, Replay with a
  // recording; Replay is last, so the shown launchers are always a prefix of the probes'
  // (`withReplay` = supported).
  function launcherKeys(withReplay: boolean): LauncherGlyph[] {
    return [
      'menu',
      ...(hasPractice ? (['practice'] as const) : []),
      ...(hasActions ? (['actions'] as const) : []),
      ...(hasModifiers ? (['modifiers'] as const) : []),
      ...(encounterTool.definition ? [encounterTool.definition.icon] : []),
      ...(withReplay ? (['replay'] as const) : []),
    ];
  }

  const launcherButtons = (keys: readonly LauncherGlyph[], asIcons: boolean, live: boolean) =>
    keys.map((key) => {
      const common = { glyph: key, iconOnly: asIcons, live };
      if (key === encounterTool.definition?.icon)
        return (
          <LauncherButton
            key={key}
            {...common}
            label={encounterTool.definition.label}
            open={encounterTool.open}
            toggles={false}
            disabledReason={encounterTool.disabledReason}
            onClick={() => {
              if (!encounterTool.disabledReason) {
                setPane(null);
                encounterTool.toggle();
              }
            }}
          />
        );
      switch (key) {
        case 'menu':
          return (
            <LauncherButton
              key={key}
              {...common}
              label="Menu"
              open={shownPane === 'menu'}
              toggles={false}
              buttonRef={menuButtonRef}
              tutorial="menu-launcher"
              onClick={() => toggle('menu')}
            />
          );
        case 'practice':
          return (
            <LauncherButton
              key={key}
              {...common}
              label="Practice"
              open={shownPane === 'practice'}
              toggles={false}
              tutorial="practice-launcher"
              onClick={() => toggle('practice')}
            />
          );
        case 'actions':
          return (
            <LauncherButton
              key={key}
              {...common}
              label="Actions"
              open={shownPane === 'actions'}
              toggles={false}
              disabledReason={replaying ? ACTIONS_OFF_IN_REPLAY : undefined}
              onClick={() => {
                if (!replaying) toggle('actions');
              }}
            />
          );
        case 'modifiers':
          return (
            <LauncherButton
              key={key}
              {...common}
              label="Modifiers"
              open={modifiers?.open ?? false}
              toggles={false}
              disabledReason={replaying ? MODIFIERS_OFF_IN_REPLAY : undefined}
              onClick={() => {
                if (!replaying) modifiers?.onOpen();
              }}
            />
          );
        case 'replay':
          return (
            <LauncherButton
              key={key}
              {...common}
              label="Replay"
              iconName={replaying ? 'Exit Replay' : 'Replay'}
              open={replaying}
              toggles
              tutorial="replay-launcher"
              notice={!replaying && replay?.notice ? replay.notice : undefined}
              onClick={() => {
                if (!replay) return;
                if (replay.isReplaying) replay.onExit();
                else replay.onEnter();
              }}
            />
          );
        default:
          return null;
      }
    });
  // Kept across renders that change none of what they show or the handlers they hold, so a tick
  // skips every launcher (two probe rows and the live row) and its hover card. The probes are never
  // pressed: their handlers are not attached, so `pane` (read by `toggle`) is the live row's alone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: launcherButtons reads exactly these.
  const probeButtons = useMemo(() => {
    const probed = launcherKeys(replaySupported);
    return { labelled: launcherButtons(probed, false, false), icons: launcherButtons(probed, true, false) };
  }, [
    hasPractice,
    hasActions,
    modifiers,
    replaySupported,
    replay,
    replaying,
    shownPane,
    encounterTool.definition,
    encounterTool.disabledReason,
    encounterTool.open,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: launcherButtons reads exactly these; keys follows hasPractice, hasActions, modifiers and hasReplay.
  const liveButtons = useMemo(
    () => launcherButtons(keys, icons, true),
    [
      icons,
      hasPractice,
      hasActions,
      modifiers,
      hasReplay,
      replay,
      replaying,
      shownPane,
      pane,
      encounterTool.definition,
      encounterTool.disabledReason,
      encounterTool.open,
    ],
  );

  const placedPane = placement && shownPane && placement.kind === shownPane ? placement : null;
  const placed = placedPane?.at ?? null;
  const paneTitle = shownPane === 'practice' ? 'Practice' : shownPane === 'actions' ? 'Actions' : 'Menu';
  // All icon launchers get a pane title; labeled launchers need no duplicate.
  // With a session, the title follows it and names the pane's content below.
  // Practice's tab-row close gives way to this one, so there is only one close.
  const titled = placedPane?.fromIcon ?? false;
  const titleRow = titled && (
    <div className="launcher-pane__title">
      <span>{paneTitle}</span>
      <button type="button" className="launcher-pane__close" aria-label={`Close ${paneTitle}`} onClick={close}>
        <CloseGlyph />
      </button>
    </div>
  );

  const fps = measured ? fpsPosition(measured.window, shownPlugins, zoom, FPS_OVERLAY_INSET) : null;
  // The readout draws above the drawers, so skip it wherever a drawer covers its spot: a full-window
  // Settings drawer, or an open Plugins drawer with no Plugins beside it to sit under.
  const fpsOverDrawer = rowTucked || (pluginsOpen && shownPlugins === null);

  return (
    <div
      ref={rootRef}
      className={`top-chrome${props.elevated ? ' top-chrome--elevated' : ''}${sliding ? ' top-chrome--sliding' : ''}`}
    >
      {/* Width probes of every launcher the encounter can show (Replay before its recording), all
          labeled and every launcher as its icon: the row's form and layout come from
          these widths (launcherRowUsesIcons). */}
      <div ref={probeRef} className="launcher-row launcher-row--probe" style={zoomStyle} aria-hidden="true">
        {probeButtons.labelled}
      </div>
      <div ref={iconProbeRef} className="launcher-row launcher-row--probe" style={zoomStyle} aria-hidden="true">
        {probeButtons.icons}
      </div>

      {/* Each launcher is placed on its own: the row has no fill of its own between the buttons,
          and a transparent row layer would cost every label its LCD text. */}
      {row && (
        <nav className="launcher-row launcher-row--live" aria-label="Game menu">
          {liveButtons.map((button, index) => (
            <div
              key={button?.key}
              className="top-chrome__item"
              data-tucked={rowTucked}
              style={at(row.x + (layout.offsets[index] ?? 0), row.y)}
            >
              {button}
            </div>
          ))}
        </nav>
      )}

      {sessionPlacement &&
        !rowTucked &&
        sessionBar(
          icons || sessionPlacement.width < PANE_WIDTH ? 'compact' : 'labelled',
          'top-chrome__item practice-session',
          {
            ...at(sessionPlacement.x, sessionPlacement.y),
            width: sessionPlacement.width,
            maxHeight: sessionPlacement.maxHeight,
          },
        )}

      {placed && shownPane && (
        <div
          ref={paneRef}
          className={`top-chrome__item launcher-pane${placed.width < 200 ? ' launcher-pane--narrow' : ''}`}
          data-tutorial={shownPane === 'practice' ? 'practice-pane' : undefined}
          data-pane={shownPane}
          data-column={placed.column}
          data-tucked={pluginsTucked || (settingsTucked && placed.column !== 'right')}
          {...(shownPane === 'menu'
            ? { role: 'group', 'aria-label': paneTitle }
            : { role: 'dialog', 'aria-label': paneTitle })}
          style={{
            ...at(placed.x, placed.y),
            // A combined session and pane share the available column. Without a
            // session, the menu and action list keep their compact intrinsic widths.
            ...(shownPane === 'practice' || hasSession
              ? { width: placed.width }
              : shownPane === 'menu'
                ? { width: Math.min(placed.width, MENU_WIDTH) }
                : { width: 'max-content', maxWidth: placed.width }),
            maxHeight: placed.maxHeight,
          }}
        >
          {sessionBar(placedPane?.fromIcon || placed.width < PANE_WIDTH ? 'compact' : 'labelled')}
          {titleRow}
          {shownPane === 'practice' && (
            <PracticePane
              onRestart={props.onRestart}
              restartShortcutTargetsSession={hasSession}
              restoring={props.replayPractice?.busy}
              tab={practiceTab}
              onTabChange={setPracticeTab}
              replaying={replaying}
              onClose={titled ? undefined : close}
              engine={props.engine}
              simulationState={props.simulationState}
              dpsProjection={props.dpsProjection}
              practice={practice}
              mechanicsConfig={props.mechanicsConfig}
              onMechanicsConfigChange={props.onMechanicsConfigChange}
              setupContext={props.setupContext}
              onSetBossHp={props.onSetBossHp}
              onApplyBossHpPreset={props.onApplyBossHpPreset}
              onExecuteEncounterCommand={props.onExecuteEncounterCommand}
            />
          )}
          {shownPane === 'actions' && (
            <div className="launcher-pane__body launcher-list" data-tutorial-input-surface="gameplay">
              {debugActions.map(({ command, label }) => (
                <button
                  // The whole command, not `encounter:type`: two actions may share a type and differ
                  // only in payload (Zuk's demonstrate-jad magic vs range).
                  key={JSON.stringify(command)}
                  type="button"
                  className="launcher-list__row"
                  onClick={() => props.onExecuteEncounterCommand(command)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {shownPane === 'menu' && (
            // biome-ignore lint/a11y/noStaticElementInteractions: delegated from the menu's buttons, which are the controls.
            // biome-ignore lint/a11y/useKeyWithClickEvents: the buttons inside take any key themselves.
            <div className="launcher-pane__body launcher-list launcher-menu" onClick={closeMenuOnItem}>
              {menu.items}
              {/* Settings, then the places to go (TopChrome.css orders the rows). */}
              <hr className="launcher-menu__rule launcher-menu__rule--settings" />
            </div>
          )}
        </div>
      )}

      {/* Measured before it is placed: its width decides how far in from the corner it starts. */}
      {encounterTool.mounted && encounterTool.definition && (
        <EncounterWorkbench
          key={props.simulationState.encounter.kind}
          title={encounterTool.definition.label}
          open={encounterTool.open && !rowTucked}
          anchor={row}
          onClose={encounterTool.close}
        >
          {encounterTool.content}
        </EncounterWorkbench>
      )}
      {plugins && (
        <div
          ref={pluginsProbeRef}
          className="launcher-row launcher-row--probe top-chrome__corner"
          style={zoomStyle}
          aria-hidden="true"
        >
          <button type="button" className="launcher-btn launcher-btn--plugins">
            Plugins
          </button>
        </div>
      )}
      {plugins && pluginsRect && (
        <div
          className="top-chrome__item launcher-row top-chrome__corner"
          data-tucked={pluginsHidden}
          style={at(pluginsRect.x, pluginsRect.y)}
        >
          {/* A toggle, like Replay: pressed while its drawer is open, and a press closes it again. */}
          <button
            ref={pluginsRef}
            type="button"
            className={`launcher-btn launcher-btn--plugins${pluginsOpen ? ' is-open' : ''}`}
            aria-pressed={pluginsOpen}
            data-tutorial="plugins-button"
            onClick={plugins.onToggle}
          >
            Plugins
          </button>
        </div>
      )}

      {/* Above the drawers, as it always was, so its own portal rather than this layer. */}
      {props.showFps &&
        !fpsOverDrawer &&
        createPortal(<FpsOverlay visible backed position={fps} sliding={sliding} />, document.body)}
    </div>
  );
};
