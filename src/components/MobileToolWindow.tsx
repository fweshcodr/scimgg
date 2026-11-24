import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EncounterCommand } from '../core/encounters/commands';
import type { DebugActionInfo, MechanicsToggleInfo } from '../core/encounters/types';
import type { SimulationEngine } from '../core/SimulationEngine';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import type { OsmFrame } from '../layout/osmFrame';
import { osmToolWindowLayout } from '../layout/osmToolWindow';
import {
  inReplayMode,
  locateToolWindowTarget,
  type MobileToolWindowState,
  resolveToolWindowView,
  syncReplay,
  TOOL_TAB_LABELS,
  TOOL_TABS,
  type ToolTab,
  type ToolWindowAction,
  toolWindowReducer,
} from '../layout/osmToolWindowState';
import type { Rect, Size } from '../layout/osrsClientLayout';
import type { PracticeSessionState } from '../types/practiceSession';
import type { ReplayPracticeControls } from '../types/replayPractice';
import type { SetupContextControls } from '../types/setupContext';
import type { MechanicsConfig, SimulationState } from '../types/simulation';
import { LauncherIcon } from './launcher/launcherIcons';
import { MobilePracticeControls } from './MobilePracticeControls';
import { ReplayControls, type ReplayControlsProps } from './ReplayControls';
import { HoverHintButton } from './ui/HoverHintControl';
import './PracticePanel.css';
import './MobileToolWindow.css';

export interface MobileToolWindowReplay extends Omit<ReplayControlsProps, 'compact' | 'moreMenu'> {
  readonly isReplaying: boolean;
  readonly hasRecording: boolean;
  readonly onEnterReplay: () => void;
}

export interface MobileToolWindowProps {
  readonly onRestart?: () => void;
  readonly replayPractice?: ReplayPracticeControls;
  readonly frame: OsmFrame;
  readonly viewport: Size;
  readonly sidePanelOnLeft?: boolean;
  readonly state: MobileToolWindowState;
  readonly onStateChange: (next: MobileToolWindowState) => void;
  readonly tutorialTarget: Element | null;
  readonly menuHostRef?: (node: HTMLElement | null) => void;
  readonly onOccupiedChange?: (rects: readonly Rect[]) => void;
  readonly zIndex: number;
  readonly simulationState: SimulationState;
  readonly engine?: SimulationEngine;
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
  /** The encounter's own session controls (Inferno's wave restarts); see MobilePracticeControls. */
  readonly encounterSession?: PracticeSessionState | null;
  readonly replay?: MobileToolWindowReplay;
}

const preventButtonFocus = (event: React.MouseEvent) => {
  if ((event.target as Element).closest('button')) event.preventDefault();
};

/** One native-sized left slot, with content pages rather than a growing settings window. */
export const MobileToolWindow: React.FC<MobileToolWindowProps> = (props) => {
  const { state, onStateChange, replay } = props;
  const isReplaying = replay?.isReplaying ?? false;
  const dispatch = useCallback(
    (action: ToolWindowAction) => onStateChange(toolWindowReducer(state, action)),
    [state, onStateChange],
  );
  const replayMode = inReplayMode(state);
  const hasRecording = replay?.hasRecording ?? false;
  const synced = useRef({ mode: replayMode, replaying: false });
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(() => {
    const step = syncReplay({
      wasMode: synced.current.mode,
      isMode: replayMode,
      wasReplaying: synced.current.replaying,
      isReplaying,
      hasRecording,
    });
    synced.current = { mode: replayMode, replaying: isReplaying };
    if (step.playback === 'enter') replayRef.current?.onEnterReplay();
    if (step.playback === 'exit') replayRef.current?.onExitReplay();
    if (step.window) dispatchRef.current(step.window);
  }, [replayMode, isReplaying, hasRecording]);

  const paneRefs = useRef<Partial<Record<ToolTab, HTMLDivElement | null>>>({});
  const tabRefs = useRef<Partial<Record<ToolTab, HTMLButtonElement | null>>>({});
  const view = resolveToolWindowView(
    state,
    locateToolWindowTarget(props.tutorialTarget, { bodies: paneRefs.current, tabs: tabRefs.current }),
  );
  const [browsing, setBrowsing] = useState(false);
  const tutorialMenuPage = props.tutorialTarget
    ?.closest('[data-mobile-menu-page]')
    ?.getAttribute('data-mobile-menu-page');
  const showBrowse = view.forced && view.tab === 'menu' ? tutorialMenuPage === 'browse' : browsing;
  const paneShown = view.open && !view.collapsed;
  const devicePixelRatio = useDevicePixelRatio(Infinity);
  const layout = osmToolWindowLayout({
    frame: props.frame,
    viewport: props.viewport,
    open: true,
    collapsed: view.collapsed,
    sidePanelOnLeft: props.sidePanelOnLeft,
    devicePixelRatio,
  });
  const win = layout.window!;
  const dock = layout.dock;
  // Below this reading space, do not expose clipped controls or start playback with
  // hidden transport controls. Keep panes mounted so resizing preserves their state.
  const compact = win.width < 88 || (!view.collapsed && win.height - dock.height < 56);
  const occupied = view.open ? layout.occupied : [dock];
  const occupiedKey = occupied.map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`).join(';');
  const { onOccupiedChange } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: compare rectangle coordinates, not object identity.
  useEffect(() => {
    onOccupiedChange?.(occupied);
  }, [occupiedKey, onOccupiedChange]);
  useEffect(() => () => onOccupiedChange?.([]), [onOccupiedChange]);
  // Replay owns Escape while playing, including its More subpage.
  useEscapeLayer(ESC_PRIORITY.REPLAY, view.open && !isReplaying, () => dispatch({ type: 'close' }));

  const menuNodeRef = useRef<HTMLElement | null>(null);
  const { menuHostRef } = props;
  const setMenuHost = useCallback(
    (node: HTMLDivElement | null) => {
      menuNodeRef.current = node;
      menuHostRef?.(node);
    },
    [menuHostRef],
  );
  useEffect(() => {
    const node = menuNodeRef.current;
    if (!node) return;
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('button')) dispatchRef.current({ type: 'menuChosen' });
    };
    node.addEventListener('click', onClick);
    return () => node.removeEventListener('click', onClick);
  }, []);

  const practicePane = isReplaying ? (
    <p className="osm-tools__note">Practice is off while a replay plays.</p>
  ) : (
    <MobilePracticeControls
      simulationState={props.simulationState}
      engine={props.engine}
      mechanicsConfig={props.mechanicsConfig}
      onMechanicsConfigChange={props.onMechanicsConfigChange}
      setupContext={props.setupContext}
      mechanicsToggles={props.mechanicsToggles}
      debugActions={props.debugActions}
      onExecuteEncounterCommand={props.onExecuteEncounterCommand}
      exportEncounterGear={props.exportEncounterGear}
      onEncounterToolOpenChange={props.onEncounterToolOpenChange}
      onSetBossHp={props.onSetBossHp}
      onApplyBossHpPreset={props.onApplyBossHpPreset}
      onRestart={props.onRestart}
      replayPractice={props.replayPractice}
      encounterSession={props.encounterSession}
    />
  );
  const replayPane =
    isReplaying && replay ? (
      <div className="osm-tools__transport" data-tutorial="replay-controls">
        <ReplayControls
          compact
          moreMenu
          {...replay}
          replayPractice={props.replayPractice}
          onExitReplay={() => dispatch({ type: 'close' })}
        />
      </div>
    ) : (
      <p className="osm-tools__note">{hasRecording ? 'Opening replay…' : 'No fight recorded yet.'}</p>
    );
  const menuPane = (
    <div className={`osm-tools__menu${showBrowse ? ' osm-tools__menu--browse' : ''}`}>
      <button
        type="button"
        tabIndex={-1}
        className="osm-tools__browse"
        aria-label={showBrowse ? 'Back to Menu' : 'Browse'}
        onClick={() => setBrowsing(!showBrowse)}
      >
        {showBrowse && (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m7 2-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
        {!showBrowse && <LauncherIcon glyph="menu" />}
        <span>{showBrowse ? 'Menu' : 'Browse'}</span>
      </button>
      <div ref={setMenuHost} className="osm-tools__menu-host" />
    </div>
  );
  const panes: Record<ToolTab, React.ReactNode> = { practice: practicePane, replay: replayPane, menu: menuPane };

  return (
    <div
      className={`osm-tools${view.forced ? ' osm-tools--forced' : ''}`}
      data-replay-viewer-chrome={isReplaying ? '' : undefined}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer-only guard that keeps tapped buttons from taking focus; keyboard navigation is a non-goal. */}
      <div
        className={`osm-tools__window${isReplaying ? ' osm-tools__window--replay' : ''}`}
        hidden={!view.open || win.width <= 0 || win.height <= 0}
        data-narrow-slot={win.width < 150 || undefined}
        data-short-slot={win.height < 200 || undefined}
        data-tiny-slot={win.height < 120 || undefined}
        data-compact-slot={compact || undefined}
        style={{
          left: win.x,
          top: win.y,
          width: win.width,
          height: win.height,
          zIndex: view.forced ? 1200 : props.zIndex,
        }}
        onMouseDown={preventButtonFocus}
      >
        <div className="osm-tools__body" hidden={!paneShown}>
          {compact && (
            <div className="osm-tools__compact-note" role="note">
              <p>More room needed.</p>
              <p>Increase interface scaling or enlarge the view.</p>
            </div>
          )}
          {TOOL_TABS.map((tab) => (
            <div
              key={tab}
              ref={(node) => {
                paneRefs.current[tab] = node;
              }}
              className={`osm-tools__pane osm-tools__pane--${tab}`}
              data-tutorial={tab === 'practice' ? 'mobile-practice' : undefined}
              hidden={!paneShown || compact || tab !== view.tab}
            >
              {panes[tab]}
            </div>
          ))}
        </div>
        <div className="osm-tools__tabs" style={{ flexBasis: dock.height }}>
          {TOOL_TABS.map((tab) => (
            <button
              key={tab}
              ref={(node) => {
                tabRefs.current[tab] = node;
              }}
              type="button"
              tabIndex={-1}
              className={`osm-tools__tab${paneShown && view.tab === tab ? ' osm-tools__tab--on' : ''}`}
              aria-label={TOOL_TAB_LABELS[tab]}
              data-tool-tab={tab}
              aria-pressed={paneShown && view.tab === tab}
              disabled={compact}
              onClick={() => dispatch(paneShown && view.tab === tab ? { type: 'close' } : { type: 'select', tab })}
            >
              {win.width < 126 || dock.height < 22 ? <LauncherIcon glyph={tab} /> : TOOL_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>
      <div
        className="osm-tools__dock"
        style={{
          left: dock.x,
          top: dock.y,
          width: dock.width,
          height: dock.height,
          zIndex: view.forced ? 1200 : props.zIndex,
        }}
      >
        <HoverHintButton
          type="button"
          tabIndex={-1}
          className="osm-tools__dock-button"
          aria-label={view.open ? 'Close tools' : 'Open tools'}
          aria-expanded={view.open}
          onMouseDown={preventButtonFocus}
          onClick={() => dispatch({ type: 'dock' })}
        >
          {dock.width < 28 || dock.height < 20 ? <LauncherIcon glyph="menu" /> : 'Tools'}
        </HoverHintButton>
      </div>
    </div>
  );
};
