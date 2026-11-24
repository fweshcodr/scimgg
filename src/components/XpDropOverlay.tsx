import type React from 'react';
import { useLayoutEffect, useState } from 'react';
import { useDisplayTimeline } from '../contexts/DisplayTimelineContext';
import type { XpSkill } from '../core/events/types';
import type { ReplayDisplayFrame } from '../core/ReplayRecorder';
import type { UIPosition } from '../hooks/usePersistedSettings';
import { OSRS_TICK_MS } from '../types/simulation';
import type { ExclusionRect } from './DraggablePanel';
import { DraggablePanel } from './DraggablePanel';
import { PixelSprite } from './PixelSprite';
import { PanelContentScaleProvider, usePanelContentScale } from './panelContentScale';
import { FADE_START_FRACTION, LIFETIME_MS, type XpDropEntry, XpDropProjection } from './xpDrops';
import './XpDropOverlay.css';

/**
 * Visual/behavioral parity target: the Plugin Hub "Customizable XP drops"
 * plugin (l2-/template-plugin, CustomizableXpDropsPlugin) at its defaults:
 *   - RuneScape Bold, white text with a hard shadow
 *   - drops rise straight up (default ~44 px/s) and live ~2s
 *   - alpha is full for the first 80% of the lifetime, then fades linearly
 *   - GROUPED (default): one drop per attack — summed amount, one icon per
 *     skill (2px gaps, icons sized to the font height)
 *   - UNGROUPED: one drop per skill, released 400ms apart (the plugin's
 *     20-frame groupedDelay), predicted hit attached to the first drop
 *   - optional predicted hit appended as " (N)"
 *
 * The sim emits one pre-grouped `xp_drop` event per player attack on the
 * ATTACK tick (see PlayerAutoAttackSystem). The drops on screen are a
 * projection of the displayed history (`xpDrops.ts`) at the displayed clock, so
 * live play and replay draw the same thing at the same simulation time, a seek
 * rebuilds the drops that were mid-flight at that moment, and a paused clock
 * holds them where they are.
 *
 * Because the panel is empty space most of the time it is fully click-through;
 * DraggablePanel makes its footprint visible and grabbable while Alt is held.
 *
 * Animation is direct-DOM from an imperative subscription to the timeline (no
 * per-frame React renders), matching how DraggablePanel and the drag
 * live-follow already work.
 */

/** Panel geometry: drops spawn near the bottom edge and rise through the box. */
export const XP_DROP_PANEL = { width: 170, height: 130 } as const;
const PANEL_WIDTH = XP_DROP_PANEL.width;
const PANEL_HEIGHT = XP_DROP_PANEL.height;
const SPAWN_BOTTOM_OFFSET_PX = 24;

/** Default slot: left of the minimap/orb cluster. */
const DEFAULT_POSITION: UIPosition = { x: 235, y: 96, anchorX: 'right', anchorY: 'top' };

const SKILL_ICON_URL: Record<XpSkill, string> = {
  attack: '/assets/ui/skill-attack.png',
  strength: '/assets/ui/skill-strength.png',
  defence: '/assets/ui/skill-defence.png',
  ranged: '/assets/ui/skill-ranged.png',
  magic: '/assets/ui/skill-magic.png',
  hitpoints: '/assets/ui/skill-hitpoints.png',
};

const XP_FORMAT = new Intl.NumberFormat('en-US');

interface XpDropOverlayProps {
  overlayScale?: number;
  /** Replay fit affects raster density, never the panel's logical geometry. */
  overlayOuterScale?: number;
  enabled: boolean;
  showPredictedHit: boolean;
  grouped: boolean;
  showIcons: boolean;
  /** Upward drift speed in px per second of displayed simulation time. */
  speed: number;
  /** Persisted panel position; null = DEFAULT_POSITION. */
  position?: UIPosition | null;
  onPositionChange?: (position: UIPosition) => void;
  /** Mobile layout: pinned at its native place (osmHud). */
  locked?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  exclusionRects?: ExclusionRect[];
}

interface DropNode {
  el: HTMLDivElement | null;
  readonly drop: XpDropEntry;
  transform: string;
  opacity: string;
  generation: number;
}

function DropContent({
  drop,
  showIcons,
  showPredictedHit,
  overlayOuterScale,
}: {
  drop: XpDropEntry;
  showIcons: boolean;
  showPredictedHit: boolean;
  overlayOuterScale: number;
}) {
  const appliedZoom = usePanelContentScale();
  const total = drop.skills.reduce((sum, skill) => sum + skill.amount, 0);
  return (
    <PanelContentScaleProvider value={appliedZoom * overlayOuterScale}>
      {/* Natural sprite dimensions preserve the original 1× layout. */}
      {showIcons &&
        drop.skills.map(({ skill }) => (
          <PixelSprite key={skill} className="xp-drop__icon" src={SKILL_ICON_URL[skill]} alt={skill} />
        ))}
      <span className="xp-drop__text">
        {showPredictedHit && drop.predictedHit > 0
          ? `${XP_FORMAT.format(total)} (${drop.predictedHit})`
          : XP_FORMAT.format(total)}
      </span>
    </PanelContentScaleProvider>
  );
}

function dropOpacity(ageMs: number): string {
  const fadeAge = ageMs / LIFETIME_MS;
  return fadeAge <= FADE_START_FRACTION
    ? '1'
    : String(Math.max(0, 1 - (fadeAge - FADE_START_FRACTION) / (1 - FADE_START_FRACTION)));
}

export const XpDropOverlay: React.FC<XpDropOverlayProps> = ({
  overlayScale = 1,
  overlayOuterScale = 1,
  enabled,
  showPredictedHit,
  grouped,
  showIcons,
  speed,
  position,
  onPositionChange,
  locked,
  viewportWidth,
  viewportHeight,
  exclusionRects,
}) => {
  const [renderedNodes, setRenderedNodes] = useState<readonly DropNode[]>([]);
  const timeline = useDisplayTimeline();

  // Projection changes rebuild the rows; React updates their text and icons.
  useLayoutEffect(() => {
    if (!enabled || !timeline) return;
    const projection = new XpDropProjection();
    const options = { grouped, speed };
    // `XpDropEntry.key` is unique only within one recording: every run numbers
    // its events from the same seed, so a loaded replay's first attack shares a
    // key with the last run's and must not inherit its row data.
    const nodes = new Map<string, DropNode>();
    let history: readonly ReplayDisplayFrame[] | undefined;
    let generation = 0;

    const draw = (): void => {
      let membershipChanged = false;
      const snapshot = timeline.getSnapshot();
      generation += 1;
      if (snapshot) {
        if (snapshot.history !== history) {
          history = snapshot.history;
          membershipChanged = true;
          nodes.clear();
        }
        const nowMs = snapshot.tick * OSRS_TICK_MS;
        for (const drop of projection.sample(snapshot, options)) {
          let node = nodes.get(drop.key);
          if (!node) {
            node = { el: null, drop, generation, transform: '', opacity: '' };
            nodes.set(drop.key, node);
            membershipChanged = true;
          }
          node.generation = generation;
          const ageMs = nowMs - drop.bornAtMs;
          const rise = (ageMs / 1000) * speed;
          node.transform = `translate(-50%, ${(drop.startOffsetPx - rise).toFixed(2)}px)`;
          node.opacity = dropOpacity(ageMs);
          if (node.el) {
            node.el.style.transform = node.transform;
            node.el.style.opacity = node.opacity;
          }
        }
      }
      for (const [key, node] of nodes) {
        if (node.generation !== generation) {
          nodes.delete(key);
          membershipChanged = true;
        }
      }
      // React alone owns the rows; clock-only updates just paint their existing refs.
      if (membershipChanged) setRenderedNodes([...nodes.values()]);
    };

    draw();
    const unsubscribe = timeline.subscribe(draw);
    return () => {
      unsubscribe();
      setRenderedNodes([]);
    };
  }, [enabled, timeline, grouped, speed]);

  if (!enabled) return null;

  return (
    <DraggablePanel
      defaultPosition={DEFAULT_POSITION}
      position={position ?? undefined}
      width={PANEL_WIDTH}
      height={PANEL_HEIGHT}
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
      altHintLabel="XP drops"
      dataTutorial="xp-drops-panel"
    >
      <div className="xp-drop-panel">
        <div className="xp-drop-overlay" style={{ top: PANEL_HEIGHT - SPAWN_BOTTOM_OFFSET_PX }} aria-hidden="true">
          {renderedNodes.map((node) => (
            <div
              key={node.drop.key}
              className="xp-drop"
              ref={(el) => {
                node.el = el;
                // Seed at the latest displayed age before paint, including a seek mid-flight.
                if (el) {
                  el.style.transform = node.transform;
                  el.style.opacity = node.opacity;
                }
              }}
            >
              <DropContent
                drop={node.drop}
                showIcons={showIcons}
                showPredictedHit={showPredictedHit}
                overlayOuterScale={overlayOuterScale}
              />
            </div>
          ))}
        </div>
      </div>
    </DraggablePanel>
  );
};
