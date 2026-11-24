import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { npcDisplayName } from '../data/npcDisplayName';
import type { UIPosition } from '../hooks/usePersistedSettings';
import { BOSS_BAR_COMPACT_HEIGHT, bossBarDefault, type Rect } from '../layout/topChromeLayout';
import type { NpcSnapshot, SimulationState } from '../types/simulation';
import type { ExclusionRect } from './DraggablePanel';
import { DraggablePanel } from './DraggablePanel';
import { isBossPresented } from './hudModel';
import { BetaBadge } from './ui/StatusBadge';
import './BossHealthBarOverlay.css';

/**
 * Mirrors the in-game boss overlay (e.g. Doom of Mokhaiotl).
 */

/**
 * The width is exported because the Zuk set timer's default slot sits directly
 * under this one at the same x: two stacked overlays of different widths read as
 * a mistake, so they share the measurement rather than happening to agree.
 */
export const BOSS_HEALTH_BAR_WIDTH = 208;
const PANEL_WIDTH = BOSS_HEALTH_BAR_WIDTH;
const PANEL_HEIGHT = 42;

/** The slot without a `defaultSlot` (a Grid rendered on its own): near the top left. */
const DEFAULT_POSITION: UIPosition = { x: 359, y: 24, anchorX: 'left', anchorY: 'top' };

function selectTargetNpc(state: SimulationState): NpcSnapshot | undefined {
  return (
    state.npcs.find((npc) => npc.id === state.attackTarget && npc.hp > 0) ??
    state.npcs.find((npc) => npc.id === state.lastAttackTarget && npc.hp > 0) ??
    state.npcs.find((npc) => npc.role === 'boss' && isBossPresented(npc, state.currentTick))
  );
}

interface BossHealthBarOverlayProps {
  overlayScale?: number;
  enabled: boolean;
  simulationState: SimulationState;
  showName: boolean;
  showValues: boolean;
  showPercentage: boolean;
  /** Renders the compact Beta marker beside the name: the encounter is playable with known limitations. */
  beta?: boolean;
  /** Persisted panel position; null = DEFAULT_POSITION. */
  position?: UIPosition | null;
  onPositionChange?: (position: UIPosition) => void;
  /** Mobile layout: pinned at its native place (osmHud). */
  locked?: boolean;
  /** Unscaled width; the mobile client's bar is 150. Defaults to the desktop 208. */
  width?: number;
  /**
   * Where the bar goes until the user moves it, in the frame's pixels: the scene's top inset,
   * centered, beside the launcher row and clear of the minimap and Plugins; else the next line under
   * the row, in its normal or compact form (topChromeLayout.ts `bossBarDefault`). A position the
   * user saved is never moved, and keeps the normal form.
   */
  defaultSlot?: {
    readonly scene: Rect;
    readonly row: Rect | null;
    readonly zoom: number;
    /** The minimap (with its orbs) and Plugins, which the default keeps clear of. */
    readonly chrome?: readonly Rect[];
  };
  viewportWidth?: number;
  viewportHeight?: number;
  exclusionRects?: ExclusionRect[];
}

export const BossHealthBarOverlay: React.FC<BossHealthBarOverlayProps> = ({
  overlayScale = 1,
  enabled,
  simulationState,
  showName,
  showValues,
  showPercentage,
  beta = false,
  position,
  onPositionChange,
  locked,
  width = PANEL_WIDTH,
  defaultSlot,
  viewportWidth,
  viewportHeight,
  exclusionRects,
}) => {
  const targetNpc = useMemo(() => selectTargetNpc(simulationState), [simulationState]);
  const bossName = useMemo(() => (targetNpc ? npcDisplayName(targetNpc) : ''), [targetNpc]);
  // The desktop bar shows the whole name: it widens by what the name would otherwise lose to its
  // ellipsis. The mobile bar keeps the client's fixed width.
  const nameRef = useRef<HTMLSpanElement>(null);
  // Kept with the name it was measured for, so a new name starts again from the plain width.
  const [overflow, setOverflow] = useState({ name: '', px: 0 });
  const nameOverflow = overflow.name === bossName ? overflow.px : 0;
  // The normal form's width: the compact form never measures it, so the slot (decided from this
  // size) does not flip between forms as the bar takes one.
  const panelWidth = width + nameOverflow;
  const slot = useMemo(
    () =>
      defaultSlot
        ? bossBarDefault({
            scene: defaultSlot.scene,
            bar: { width: panelWidth * overlayScale, height: PANEL_HEIGHT * overlayScale },
            row: defaultSlot.row,
            zoom: defaultSlot.zoom,
            compact: { maxWidth: PANEL_WIDTH * overlayScale, height: BOSS_BAR_COMPACT_HEIGHT * overlayScale },
            chrome: defaultSlot.chrome,
          })
        : null,
    [defaultSlot, panelWidth, overlayScale],
  );
  const atDefault = slot !== null && !position;
  const compact = atDefault && slot.compact;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measured whenever the name or the readouts beside it change.
  useLayoutEffect(() => {
    if (compact) return;
    const name = nameRef.current;
    const next = name && width >= PANEL_WIDTH ? Math.max(0, name.scrollWidth - name.clientWidth) : 0;
    if (next > 0) {
      setOverflow((previous) => ({ name: bossName, px: (previous.name === bossName ? previous.px : 0) + next }));
    }
  }, [bossName, beta, showValues, showPercentage, width, compact]);
  const defaultPosition = useMemo<UIPosition>(
    () => (slot ? { x: Math.round(slot.x), y: Math.round(slot.y), anchorX: 'left', anchorY: 'top' } : DEFAULT_POSITION),
    [slot],
  );
  const shownWidth = compact ? Math.floor(slot.width / overlayScale) : panelWidth;
  const shownHeight = compact ? BOSS_BAR_COMPACT_HEIGHT : PANEL_HEIGHT;
  if (!enabled || !targetNpc) return null;

  const hp = Math.max(0, targetNpc.hp);
  const maxHp = Math.max(1, targetNpc.maxHp);
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const pct = ratio * 100;

  // The mobile bar (150 against the desktop 208) fits the name and one readout, not two: with
  // both, the name was cut to its first letter. The values carry the percentage's information
  // and the fill shows the proportion, so the percentage gives way.
  const narrow = width < PANEL_WIDTH;
  const percentShown = showPercentage && !(narrow && showValues);
  const showReadout = showValues || percentShown;

  return (
    <DraggablePanel
      defaultPosition={defaultPosition}
      // The slot is computed for this frame at the bar's scaled size: projecting it again from the
      // unscaled box would pull a centered bar off center at any scale but 1.
      defaultInFrame={defaultSlot !== undefined}
      position={position ?? undefined}
      width={shownWidth}
      height={shownHeight}
      scale={overlayScale}
      // Sized by Auto alone: Alt+scroll over it is taken and does nothing, so it never
      // reaches the camera or a panel underneath.
      scaleLocked
      onPositionChange={onPositionChange}
      locked={locked}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      exclusionRects={exclusionRects}
      pointerPassthrough
      altHintLabel="Boss HP"
      dataTutorial="boss-health-bar-panel"
    >
      {/* A browser page translation rewriting text nodes React owns tears the live game HUD
          down mid-render. The name and the readout change through the fight, so they opt out. */}
      <div className={`boss-hp${compact ? ' boss-hp--compact' : ''}`} role="presentation" translate="no">
        {(showName || showReadout) && (
          <div className="boss-hp__info">
            {showName && (
              <>
                <span ref={nameRef} className="boss-hp__name">
                  {bossName}
                </span>
                {beta && !compact && <BetaBadge compact />}
              </>
            )}
            {showReadout && (
              <span className="boss-hp__readout">
                {showValues && (
                  <span className="boss-hp__values">
                    {hp}
                    <span className="boss-hp__sep">/</span>
                    {maxHp}
                  </span>
                )}
                {percentShown && !(compact && showValues) && <span className="boss-hp__pct">{pct.toFixed(1)}%</span>}
              </span>
            )}
          </div>
        )}
        <div className="boss-hp__track">
          <div className="boss-hp__fill" style={{ width: `${pct}%`, minWidth: hp > 0 ? '2px' : '0' }} />
        </div>
      </div>
    </DraggablePanel>
  );
};
