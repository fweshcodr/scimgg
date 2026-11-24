import { canShowNpcHealthBar } from '../../core/actors/NpcActor';
import {
  type GameEvent,
  type HitsplatType,
  isCoreEvent,
  type OverheadTextAnchor,
  type OverheadTextSegment,
} from '../../core/events/types';
import type { NpcSnapshot, SimulationState } from '../../types/simulation';
import { PrayerType } from '../../types/simulation';
import { type TzhaarHpTrackerOptions, tzhaarHpLocationFor, tzhaarHpTextColor } from '../../types/tzhaarHpTracker';
import { resolveTickColor, type TickColorOverrides } from '../../util/tickColor';
import type { Projection2D } from '../core/camera';
import type { RenderQueue } from '../core/commands';
import type { NpcOverlayHeights } from '../npc/NpcInstanceManager';
import { interpolateNpcPosition, npcCrawlProgress } from '../npc/npcRenderPosition';
import { isNpcStandingAt } from '../npc/npcStanding';
import { getTerrainHeightInterpolated } from '../shared/renderUtils';
import { npcDespawnTimerRatio } from './npcDespawnTimer';

/** The player's overhead for each active prayer that has one; the preloader warms every entry. */
export const PRAYER_OVERHEAD_ICON_PATHS: Readonly<Partial<Record<string, string>>> = {
  [PrayerType.ProtectMagic]: '/assets/ui/overhead_magic.png',
  [PrayerType.ProtectRange]: '/assets/ui/overhead_missiles.png',
  [PrayerType.ProtectMelee]: '/assets/ui/overhead_melee.png',
  // Redemption carries an overhead in OSRS (RuneLite HeadIcon.REDEMPTION). The sprite is frame 5
  // of the HEADICONS_PRAYER sheet (cache sprite 440), the same sheet frames 0-2 of which are the
  // three protection icons above.
  [PrayerType.Redemption]: '/assets/ui/overhead_redemption.png',
};

interface HitsplatEntry {
  amount: number;
  type: 'damage' | 'block' | 'poison' | 'venom' | 'heal' | 'doom' | 'burn';
  spawnTick: number;
  expiryTick: number;
}

const OVERLAY_TYPE_BY_HITSPLAT_TYPE: Partial<Record<HitsplatType, HitsplatEntry['type']>> = {
  damage: 'damage',
  block: 'block',
  poison: 'poison',
  venom: 'venom',
  doom: 'doom',
  heal: 'heal',
  burn: 'burn',
};

interface ActorHitsplatState {
  slots: (HitsplatEntry | null)[];
  roundRobin: number;
  healthBarVisibleUntilTick: number;
}

/** Placement shared by every number drawn over the player's head. */
export interface OverheadNumberPlacement {
  readonly fontSize: number;
  /** Clear the prayer overhead icon rather than sitting over it. */
  readonly abovePrayerIcon: boolean;
  /** Screen-pixel nudge off the anchor. Positive is right and UP. */
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface TickCounterPresentation extends OverheadNumberPlacement {
  /** Cycle length: the counter runs 1..max. */
  readonly max: number;
  readonly colors?: TickColorOverrides;
}

/** The player's overhead numbers; null hides one. */
export interface PlayerOverheadNumbers {
  readonly tickCounter: TickCounterPresentation | null;
  readonly attackCooldown: OverheadNumberPlacement | null;
}

interface OverheadNumberEntry {
  placement: OverheadNumberPlacement;
  text: string;
  textColor: string;
  key: string;
}

interface OverheadTextEntry {
  anchor: OverheadTextAnchor;
  text: string;
  textColor: string;
  segments?: readonly OverheadTextSegment[];
  expiryTick: number;
}

/**
 * 16px digit advances, in px, of RuneLite's RS Small (the default dynamic-overlay font, which TzHaar
 * HP Tracker measures its string with) and RS Bold (which it draws in, the same face and advances as
 * our 'RuneScape Bold 12'), from the fonts' hmtx tables (RuneLite runescape_small.ttf and
 * runescape_bold.ttf, BSD-2).
 */
const RS_SMALL_DIGIT_ADVANCES = [7, 4, 7, 6, 5, 6, 7, 6, 7, 7] as const;
const RS_BOLD_DIGIT_ADVANCES = [9, 7, 9, 8, 8, 8, 9, 7, 9, 9] as const;
/** RS Small's line height at 16px (ascent 11 + descent 1), TzHaar HP Tracker's stacking step. */
const HP_TEXT_STACK_LINE_HEIGHT = 12;
/** How far the overhead text layer's 16px line box reaches below the baseline ('RuneScape Bold 12' descent 18.75%). */
const OVERHEAD_TEXT_DESCENT = 3;

function digitsWidth(text: string, advances: readonly number[]): number {
  let width = 0;
  for (let index = 0; index < text.length; index++) width += advances[text.charCodeAt(index) - 48] ?? 0;
  return width;
}

/**
 * Extracted UI overlay renderer: hitsplats, health bar, and prayer overhead icons.
 */
export class UIOverlayRenderer {
  // Visible for 2 game ticks, disappears instantly on the 3rd tick (no fade)
  private static readonly HITSPLAT_DURATION_TICKS = 2;
  // OSRS int5 = 70 cycles (1.4s), but refreshes on each hit. Using 8 ticks (4.8s)
  // so the bar stays visible long enough between hits (each hit resets the timer).
  private static readonly HEALTHBAR_DURATION_TICKS = 8;
  private static readonly OSRS_HEALTHBAR_WIDTH = 40;
  private static readonly OSRS_HEALTHBAR_HEIGHT = 7;
  private static readonly OSRS_HITSPLAT_SIZE = 24;
  private static readonly OSRS_HITSPLAT_FONT_SIZE = 16;
  private static readonly OSRS_OVERHEAD_ICON_SIZE = 25;
  private static readonly OSRS_OVERHEAD_TEXT_COLOR = '#ffff00';
  private static readonly OSRS_OVERHEAD_TEXT_FONT_SIZE = 16;
  private static readonly OVERHEAD_NUMBER_GAP = 2;
  /** TzHaar HP's "Above HP bar" clearance over the bar: 25 model units (logical height + 40 vs + 15). */
  private static readonly HP_TEXT_ABOVE_BAR_HEIGHT = 25 / 128;
  // The Attack Timer Metronome plugin-hub default color.
  private static readonly ATTACK_COOLDOWN_TICKS_COLOR = '#00ffff';

  private static readonly PLAYER_HEAD_WORLD_HEIGHT = 2.2;

  /**
   * Height for hitsplats: OSRS draws hitsplats at `actor.defaultHeight / 2`
   * while overheads/health bars are at `actor.defaultHeight + 15`.
   * defaultHeight=200, so hitsplats go at 100 vs overheads at 215.
   * Ratio: 100/215 ≈ 0.465 of HEAD height.
   */
  private static readonly PLAYER_MODEL_CENTER_HEIGHT = UIOverlayRenderer.PLAYER_HEAD_WORLD_HEIGHT * (100 / 215);

  /**
   * Multi-hitsplat screen offsets in pixels:
   *   Hitsplat 0: (0, 0)     — center
   *   Hitsplat 1: (0, -20)   — above center
   *   Hitsplat 2: (-15, -10) — left
   *   Hitsplat 3: (+15, -10) — right
   */
  private static readonly HITSPLAT_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -20 },
    { dx: -15, dy: -10 },
    { dx: 15, dy: -10 },
  ];

  /**
   * Four fixed slots fill round-robin and never move during a hitsplat's lifetime. When full,
   * damageType 0 replaces the earliest expiry and damageType 1 the lowest damage. The offsets
   * and replacement policy are retained unsourced values.
   */
  // Per-actor hitsplat + health bar state (player + NPCs)
  private actorHitsplatState = new Map<string, ActorHitsplatState>();
  private overheadTextState = new Map<string, OverheadTextEntry>();
  private lastObservedTick = Number.NEGATIVE_INFINITY;
  private terrainHeights: Int32Array[] | null = null;
  private npcOverlayHeights = new Map<string, NpcOverlayHeights>();

  setTerrainHeights(heights: Int32Array[] | null): void {
    this.terrainHeights = heights;
  }

  setNpcOverlayHeights(heights: Map<string, NpcOverlayHeights>): void {
    this.npcOverlayHeights = heights;
  }

  update(currentTick: number, events: GameEvent[]): void {
    if (currentTick < this.lastObservedTick) {
      this.actorHitsplatState.clear();
      this.overheadTextState.clear();
    }
    this.lastObservedTick = currentTick;

    this.updateHitsplatState(currentTick, events);
    this.updateOverheadTextState(events);
    this.pruneInactiveActorState(currentTick);
    this.pruneInactiveOverheadTextState(currentTick);
  }

  dispose(): void {
    this.actorHitsplatState.clear();
    this.overheadTextState.clear();
    this.terrainHeights = null;
    this.npcOverlayHeights = new Map();
    this.lastObservedTick = Number.NEGATIVE_INFINITY;
  }

  buildOverheadTexts(
    queue: RenderQueue,
    projection: Projection2D,
    state: SimulationState,
    interpolatedTick: number,
    interpFraction = 0,
  ): void {
    if (this.overheadTextState.size === 0) return;

    for (const [key, entry] of this.overheadTextState) {
      if (interpolatedTick >= entry.expiryTick) continue;

      const screenPos = this.projectOverheadText(entry.anchor, projection, state, interpFraction);
      if (!screenPos) continue;

      if (!queue.overheadTexts) queue.overheadTexts = [];
      queue.overheadTexts.push({
        screenX: screenPos.screenX,
        screenY: screenPos.screenY,
        text: entry.text,
        textColor: entry.textColor,
        ...(entry.segments ? { segments: entry.segments } : {}),
        fontSize: UIOverlayRenderer.OSRS_OVERHEAD_TEXT_FONT_SIZE,
        key,
      });
    }
  }

  buildPrayerOverheads(
    queue: RenderQueue,
    projection: Projection2D,
    state: SimulationState,
    visualPos: [number, number],
  ): void {
    const iconPath = UIOverlayRenderer.prayerOverheadIconPath(state);
    if (!iconPath) return;

    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, visualPos[0], visualPos[1]) / 128;
    const headWorldZ = terrainHeight + UIOverlayRenderer.PLAYER_HEAD_WORLD_HEIGHT;

    const screenPos = projection.tileToScreen({
      x: visualPos[0] + 0.5,
      y: visualPos[1] + 0.5,
      level: headWorldZ,
    });
    if (!screenPos) return;

    const iconSize = UIOverlayRenderer.OSRS_OVERHEAD_ICON_SIZE;

    if (!queue.overheadIcons) {
      queue.overheadIcons = [];
    }

    queue.overheadIcons.push({
      screenX: screenPos.x,
      screenY: screenPos.y - iconSize / 2,
      iconPath,
      key: `prayer-overhead-player`,
      width: iconSize,
      height: iconSize,
    });
  }

  buildHitsplats(
    queue: RenderQueue,
    projection: Projection2D,
    _state: SimulationState,
    visualPos: [number, number],
    interpolatedTick: number,
  ): void {
    const actorState = this.actorHitsplatState.get('player');
    if (!actorState) return;
    const hasAny = actorState.slots.some((s) => s !== null);
    if (!hasAny) return;

    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, visualPos[0], visualPos[1]) / 128;
    const modelCenterZ = terrainHeight + UIOverlayRenderer.PLAYER_MODEL_CENTER_HEIGHT;

    const screenPos = projection.tileToScreen({
      x: visualPos[0] + 0.5,
      y: visualPos[1] + 0.5,
      level: modelCenterZ,
    });
    if (!screenPos) return;

    if (!queue.hitsplats) {
      queue.hitsplats = [];
    }

    for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
      const h = actorState.slots[slotIdx];
      if (!h) continue;

      const elapsed = interpolatedTick - h.spawnTick;
      const progress = Math.min(elapsed / UIOverlayRenderer.HITSPLAT_DURATION_TICKS, 1);

      const offset = UIOverlayRenderer.HITSPLAT_OFFSETS[slotIdx];

      queue.hitsplats.push({
        screenX: screenPos.x + offset.dx,
        screenY: screenPos.y + offset.dy,
        amount: h.amount,
        type: h.type,
        key: `hitsplat-slot-${slotIdx}`,
        progress,
        width: UIOverlayRenderer.OSRS_HITSPLAT_SIZE,
        height: UIOverlayRenderer.OSRS_HITSPLAT_SIZE,
        fontSize: UIOverlayRenderer.OSRS_HITSPLAT_FONT_SIZE,
      });
    }
  }

  buildHealthBar(
    queue: RenderQueue,
    projection: Projection2D,
    state: SimulationState,
    visualPos: [number, number],
    interpolatedTick: number,
  ): void {
    const actorState = this.actorHitsplatState.get('player');
    if (!actorState || interpolatedTick > actorState.healthBarVisibleUntilTick) return;

    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, visualPos[0], visualPos[1]) / 128;
    const barWorldZ = terrainHeight + UIOverlayRenderer.PLAYER_HEAD_WORLD_HEIGHT;

    const screenPos = projection.tileToScreen({
      x: visualPos[0] + 0.5,
      y: visualPos[1] + 0.5,
      level: barWorldZ,
    });
    if (!screenPos) return;

    const elapsed =
      interpolatedTick - (actorState.healthBarVisibleUntilTick - UIOverlayRenderer.HEALTHBAR_DURATION_TICKS);
    const progress = Math.min(elapsed / UIOverlayRenderer.HEALTHBAR_DURATION_TICKS, 1);

    const ratio = state.maxHP > 0 ? Math.max(0, state.playerHP / state.maxHP) : 1;

    if (!queue.healthBars) {
      queue.healthBars = [];
    }

    queue.healthBars.push({
      screenX: screenPos.x,
      screenY: screenPos.y + UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
      ratio,
      width: UIOverlayRenderer.OSRS_HEALTHBAR_WIDTH,
      height: UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
      key: 'player-healthbar',
      progress,
    });
  }

  /**
   * Shifted by one tick so the bar reaches full black on the FINAL cooldown
   * tick (remaining == 1) rather than on the ready tick: the auto-attack fires
   * on the ready tick and refills the bar in the same frame, so an unshifted
   * bar would never show empty.
   */
  private static attackCooldownRatio(nextAttackTick: number, attackSpeed: number, currentTick: number): number | null {
    const remaining = nextAttackTick - currentTick;
    if (remaining <= 0) return null;
    return Math.max(0, Math.min(1, (remaining - 1) / Math.max(1, attackSpeed - 1)));
  }

  /** Center y of the bar `row` places below a health bar anchored at `anchorY`; row 1 sits flush beneath it. */
  private static stackedBarY(anchorY: number, row: number): number {
    return anchorY + UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT + (UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT + 2) * row;
  }

  buildPlayerAttackTimerBar(
    queue: RenderQueue,
    projection: Projection2D,
    state: SimulationState,
    visualPos: [number, number],
    _interpolatedTick: number,
  ): void {
    const ratio = UIOverlayRenderer.attackCooldownRatio(
      state.playerNextAttackTick,
      state.playerAttackSpeed,
      state.currentTick,
    );
    if (ratio === null) return;

    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, visualPos[0], visualPos[1]) / 128;
    const barWorldZ = terrainHeight + UIOverlayRenderer.PLAYER_HEAD_WORLD_HEIGHT;

    const screenPos = projection.tileToScreen({
      x: visualPos[0] + 0.5,
      y: visualPos[1] + 0.5,
      level: barWorldZ,
    });
    if (!screenPos) return;

    if (!queue.timerBars) queue.timerBars = [];
    queue.timerBars.push({
      screenX: screenPos.x,
      screenY: UIOverlayRenderer.stackedBarY(screenPos.y, 1),
      ratio,
      width: UIOverlayRenderer.OSRS_HEALTHBAR_WIDTH,
      height: UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
      key: 'player-attack-timer-metronome',
    });
  }

  /**
   * Every player overhead number (Tick Counter, attack cooldown) is laid out
   * here together so they share placement rules and stack instead of overlapping.
   *
   * Each number's preferred spot is centered on the prayer icon slot, or, with
   * `abovePrayerIcon`, a gap above whatever the slot holds, in SCREEN pixels:
   * the icon is a fixed 25px sprite at every camera distance, so a world-space
   * gap sized to clear it up close shrinks to nothing zoomed out. Overlaying
   * the icon only reads as "on top" because the tick-counter layer is stacked
   * above the icon layer in RenderViewport{,3D}.
   *
   * Visible numbers then stack upward in order (on-icon before above-icon, the
   * Tick Counter first), each clearing the one below. Offsets are manual nudges
   * applied after stacking, so they can reintroduce overlap.
   */
  buildOverheadNumbers(
    queue: RenderQueue,
    projection: Projection2D,
    state: SimulationState,
    visualPos: [number, number],
    { tickCounter, attackCooldown }: PlayerOverheadNumbers,
  ): void {
    const entries: OverheadNumberEntry[] = [];
    if (tickCounter && tickCounter.max > 0) {
      const cycleValue = ((state.currentTick - 1) % tickCounter.max) + 1;
      entries.push({
        placement: tickCounter,
        text: cycleValue.toString(),
        textColor: resolveTickColor(cycleValue, tickCounter.max, tickCounter.colors),
        key: 'player-tick-counter',
      });
    }
    const cooldownRemaining = state.playerNextAttackTick - state.currentTick;
    if (attackCooldown && cooldownRemaining > 0) {
      entries.push({
        placement: attackCooldown,
        text: cooldownRemaining.toString(),
        textColor: UIOverlayRenderer.ATTACK_COOLDOWN_TICKS_COLOR,
        key: 'player-attack-cooldown-ticks',
      });
    }
    if (entries.length === 0) return;

    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, visualPos[0], visualPos[1]) / 128;
    const headWorldZ = terrainHeight + UIOverlayRenderer.PLAYER_HEAD_WORLD_HEIGHT;

    const screenPos = projection.tileToScreen({
      x: visualPos[0] + 0.5,
      y: visualPos[1] + 0.5,
      level: headWorldZ,
    });
    if (!screenPos) return;

    // buildPrayerOverheads hangs its icon off the same head anchor, occupying
    // the one icon-height directly above it. On-icon numbers use the slot's
    // center whether or not a prayer is up, so toggling one never nudges them.
    // Numbers render centered on their y, hence the half-heights.
    const iconSlotCentre = screenPos.y - UIOverlayRenderer.OSRS_OVERHEAD_ICON_SIZE / 2;
    const iconClearance = UIOverlayRenderer.prayerOverheadIconPath(state)
      ? UIOverlayRenderer.OSRS_OVERHEAD_ICON_SIZE
      : 0;
    const gap = UIOverlayRenderer.OVERHEAD_NUMBER_GAP;

    if (!queue.tickCounters) queue.tickCounters = [];
    // Stable sort: on-icon numbers stay in insertion order below above-icon ones.
    entries.sort((a, b) => Number(a.placement.abovePrayerIcon) - Number(b.placement.abovePrayerIcon));
    let stackTop = Number.POSITIVE_INFINITY;
    for (const { placement, ...text } of entries) {
      const { fontSize, abovePrayerIcon, offsetX, offsetY } = placement;
      const preferredY = abovePrayerIcon ? screenPos.y - iconClearance - fontSize / 2 - gap : iconSlotCentre;
      const y = Math.min(preferredY, stackTop - gap - fontSize / 2);
      stackTop = y - fontSize / 2;
      queue.tickCounters.push({
        ...text,
        screenX: screenPos.x + offsetX,
        // Negated because the setting is authored in the direction its stepper's
        // arrows point: up is positive, while screen y grows downward.
        screenY: y - offsetY,
        fontSize,
      });
    }
  }

  private static prayerOverheadIconPath(state: SimulationState): string | undefined {
    const { activePrayer } = state;
    if (!activePrayer) return undefined;
    return PRAYER_OVERHEAD_ICON_PATHS[activePrayer];
  }

  private updateOverheadTextState(events: GameEvent[]): void {
    for (const event of events) {
      if (!isCoreEvent(event, 'overhead_text')) {
        continue;
      }

      const key = UIOverlayRenderer.overheadAnchorKey(event.anchor);
      const text = event.overheadText.trim();
      if (text.length === 0 || event.overheadCycle <= 0) {
        this.overheadTextState.delete(key);
        continue;
      }

      this.overheadTextState.set(key, {
        anchor: event.anchor,
        text: event.overheadText,
        textColor: event.overheadTextColor ?? UIOverlayRenderer.OSRS_OVERHEAD_TEXT_COLOR,
        ...(event.overheadTextSegments ? { segments: event.overheadTextSegments } : {}),
        expiryTick: event.tick + event.overheadCycle,
      });
    }
  }

  private pruneInactiveOverheadTextState(currentTick: number): void {
    for (const [key, entry] of this.overheadTextState) {
      if (currentTick >= entry.expiryTick) {
        this.overheadTextState.delete(key);
      }
    }
  }

  /**
   * Interpolated NPC center in tile units, matching the per-frame model
   * render position (see NpcInstanceManager.syncInstances) so overhead
   * overlays glide with the NPC instead of snapping to the true sim tile.
   */
  private interpolatedNpcCenter(
    npc: NpcSnapshot,
    interpFraction: number,
    currentTick: number,
  ): { cx: number; cy: number } {
    const half = npc.size / 2;
    const [x, y] =
      interpFraction > 0 || npcCrawlProgress(npc, interpFraction, currentTick) !== null
        ? interpolateNpcPosition(npc, interpFraction, currentTick)
        : npc.position;
    return { cx: x + half, cy: y + half };
  }

  private npcBarAnchor(
    npc: NpcSnapshot,
    projection: Projection2D,
    interpFraction: number,
    currentTick: number,
  ): { x: number; y: number; width: number } | null {
    const { cx: npcCenterX, cy: npcCenterY } = this.interpolatedNpcCenter(npc, interpFraction, currentTick);
    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, npcCenterX, npcCenterY) / 128;
    const overlayHeights = this.npcOverlayHeights.get(npc.id);
    const barWorldZ = (overlayHeights?.baseHeight ?? terrainHeight) + (overlayHeights?.healthBarHeight ?? 1.5);
    const screenPos = projection.tileToScreen({ x: npcCenterX, y: npcCenterY, level: barWorldZ });
    if (!screenPos) return null;
    return {
      x: screenPos.x,
      y: screenPos.y,
      width: overlayHeights?.healthBarWidth ?? UIOverlayRenderer.OSRS_HEALTHBAR_WIDTH,
    };
  }

  private static hasDespawnTimer(npc: NpcSnapshot): npc is NpcSnapshot & { spawnTick: number; despawnTick: number } {
    return npc.alive && npc.spawnTick != null && npc.despawnTick != null && npc.despawnTick > npc.spawnTick;
  }

  private projectOverheadText(
    anchor: OverheadTextAnchor,
    projection: Projection2D,
    state: SimulationState,
    interpFraction: number,
  ): { screenX: number; screenY: number } | null {
    // Dead-but-present NPCs still render: a boss keeps its snapshot entry for the
    // length of its death animation, and that window is exactly when Yama says his
    // parting line. Actors removed from the snapshot drop out via the find() miss.
    const npc = state.npcs.find((candidate) => candidate.id === anchor.actorId);
    if (!npc) return null;

    const { cx: npcCenterX, cy: npcCenterY } = this.interpolatedNpcCenter(npc, interpFraction, state.currentTick);
    const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, npcCenterX, npcCenterY) / 128;
    const overlayHeights = this.npcOverlayHeights.get(npc.id);
    // OSRS draws forced-chat directly BELOW the head health bar. Anchor the
    // text to the same head point as the bar (see buildNpcHealthBars), then
    // drop its baseline beneath the bar in screen space. The bar spans
    // [screenY + HEALTHBAR_HEIGHT, screenY + 2*HEALTHBAR_HEIGHT]; the overlay
    // span is bottom-anchored (translate(-50%,-100%)), so offset by the bar
    // depth plus one text line so the whole line clears it.
    const barWorldZ = (overlayHeights?.baseHeight ?? terrainHeight) + (overlayHeights?.healthBarHeight ?? 1.5);
    const screenPos = projection.tileToScreen({ x: npcCenterX, y: npcCenterY, level: barWorldZ });
    if (!screenPos) return null;
    return {
      screenX: screenPos.x,
      screenY:
        screenPos.y + UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT * 2 + UIOverlayRenderer.OSRS_OVERHEAD_TEXT_FONT_SIZE + 2,
    };
  }

  private static overheadAnchorKey(anchor: OverheadTextAnchor): string {
    return `actor:${anchor.actorId}`;
  }

  private updateHitsplatState(currentTick: number, events: GameEvent[]): void {
    for (const event of events) {
      if (event.type !== 'hitsplat_spawned') {
        continue;
      }

      const hitsplatEvent = event as Extract<GameEvent, { type: 'hitsplat_spawned' }>;

      const actorId = hitsplatEvent.targetId;
      let actorState = this.actorHitsplatState.get(actorId);
      if (!actorState) {
        actorState = {
          slots: [null, null, null, null],
          roundRobin: 0,
          healthBarVisibleUntilTick: -1,
        };
        this.actorHitsplatState.set(actorId, actorState);
      }

      const type = OVERLAY_TYPE_BY_HITSPLAT_TYPE[hitsplatEvent.hitsplatType] ?? 'damage';
      this.assignHitsplatSlot(actorState, hitsplatEvent.amount, type, hitsplatEvent.tick);
      actorState.healthBarVisibleUntilTick = hitsplatEvent.tick + UIOverlayRenderer.HEALTHBAR_DURATION_TICKS;
    }

    for (const actorState of this.actorHitsplatState.values()) {
      for (let i = 0; i < 4; i++) {
        const slot = actorState.slots[i];
        if (slot && currentTick >= slot.expiryTick) {
          actorState.slots[i] = null;
        }
      }
    }
  }

  private pruneInactiveActorState(currentTick: number): void {
    for (const [actorId, actorState] of this.actorHitsplatState) {
      const hasActiveHitsplats = actorState.slots.some((slot) => slot !== null);
      const healthBarVisible = currentTick < actorState.healthBarVisibleUntilTick;
      if (!hasActiveHitsplats && !healthBarVisible) {
        this.actorHitsplatState.delete(actorId);
      }
    }
  }

  private assignHitsplatSlot(
    actorState: ActorHitsplatState,
    amount: number,
    type: 'damage' | 'block' | 'poison' | 'venom' | 'heal' | 'doom' | 'burn',
    spawnTick: number,
  ): void {
    const expiryTick = spawnTick + UIOverlayRenderer.HITSPLAT_DURATION_TICKS;
    const entry: HitsplatEntry = { amount, type, spawnTick, expiryTick };

    const allOccupied = actorState.slots.every((s) => s !== null && s.expiryTick > spawnTick);
    const allExpired = actorState.slots.every((s) => s === null || s.expiryTick <= spawnTick);

    if (allOccupied) {
      let replaceIdx = 0;
      let earliestExpiry = actorState.slots[0]!.expiryTick;
      for (let i = 1; i < 4; i++) {
        if (actorState.slots[i]!.expiryTick < earliestExpiry) {
          earliestExpiry = actorState.slots[i]!.expiryTick;
          replaceIdx = i;
        }
      }
      actorState.slots[replaceIdx] = entry;
    } else {
      if (allExpired) {
        actorState.roundRobin = 0;
      }
      for (let i = 0; i < 4; i++) {
        const idx = actorState.roundRobin;
        actorState.roundRobin = (actorState.roundRobin + 1) % 4;
        const slot = actorState.slots[idx];
        if (slot === null || slot.expiryTick <= spawnTick) {
          actorState.slots[idx] = entry;
          break;
        }
      }
    }
  }

  buildNpcHitsplats(
    queue: RenderQueue,
    projection: Projection2D,
    npcs: NpcSnapshot[],
    interpolatedTick: number,
    interpFraction = 0,
    currentTick = interpolatedTick - interpFraction,
  ): void {
    for (const npc of npcs) {
      const actorState = this.actorHitsplatState.get(npc.id);
      if (!actorState) continue;
      const hasAny = actorState.slots.some((s) => s !== null);
      if (!hasAny) continue;

      const { cx: npcCenterX, cy: npcCenterY } = this.interpolatedNpcCenter(npc, interpFraction, currentTick);
      const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, npcCenterX, npcCenterY) / 128;
      const overlayHeights = this.npcOverlayHeights.get(npc.id);
      const modelCenterZ = (overlayHeights?.baseHeight ?? terrainHeight) + (overlayHeights?.hitsplatHeight ?? 1.0);

      const screenPos = projection.tileToScreen({
        x: npcCenterX,
        y: npcCenterY,
        level: modelCenterZ,
      });
      if (!screenPos) continue;

      if (!queue.hitsplats) queue.hitsplats = [];
      for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
        const h = actorState.slots[slotIdx];
        if (!h) continue;
        const elapsed = interpolatedTick - h.spawnTick;
        const progress = Math.min(elapsed / UIOverlayRenderer.HITSPLAT_DURATION_TICKS, 1);
        const offset = UIOverlayRenderer.HITSPLAT_OFFSETS[slotIdx];
        queue.hitsplats.push({
          screenX: screenPos.x + offset.dx,
          screenY: screenPos.y + offset.dy,
          amount: h.amount,
          type: h.type,
          key: `hitsplat-${npc.id}-slot-${slotIdx}`,
          progress,
          width: UIOverlayRenderer.OSRS_HITSPLAT_SIZE,
          height: UIOverlayRenderer.OSRS_HITSPLAT_SIZE,
          fontSize: UIOverlayRenderer.OSRS_HITSPLAT_FONT_SIZE,
        });
      }
    }
  }

  buildNpcHealthBars(
    queue: RenderQueue,
    projection: Projection2D,
    npcs: NpcSnapshot[],
    interpolatedTick: number,
    dyingActorIds: ReadonlySet<string>,
    interpFraction = 0,
    currentTick = interpolatedTick - interpFraction,
  ): void {
    for (const npc of npcs) {
      if (!canShowNpcHealthBar(npc, interpolatedTick)) continue;
      const pinned = npc.alwaysShowHealthBar === true;
      const actorState = this.actorHitsplatState.get(npc.id);

      if (pinned) {
        // Shown, at 0 if need be, while the NPC stands (a queued death before its death animation) and
        // through the death animation; hidden once it is over.
        if (!isNpcStandingAt(npc, interpolatedTick * 30) && !dyingActorIds.has(npc.id)) continue;
      } else if (!actorState || interpolatedTick > actorState.healthBarVisibleUntilTick) {
        continue;
      }

      const anchor = this.npcBarAnchor(npc, projection, interpFraction, currentTick);
      if (!anchor) continue;

      let progress: number;
      if (pinned || !actorState) {
        // Pinned bars are fully visible, no fade.
        progress = 0;
      } else {
        const elapsed =
          interpolatedTick - (actorState.healthBarVisibleUntilTick - UIOverlayRenderer.HEALTHBAR_DURATION_TICKS);
        progress = Math.min(elapsed / UIOverlayRenderer.HEALTHBAR_DURATION_TICKS, 1);
      }
      const ratio = npc.maxHp > 0 ? Math.max(0, npc.hp / npc.maxHp) : 1;

      if (!queue.healthBars) queue.healthBars = [];
      queue.healthBars.push({
        screenX: anchor.x,
        screenY: anchor.y + UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
        ratio,
        width: anchor.width,
        height: UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
        key: `npc-healthbar-${npc.id}`,
        progress,
      });
    }
  }

  buildNpcTimerBars(
    queue: RenderQueue,
    projection: Projection2D,
    npcs: NpcSnapshot[],
    interpolatedTick: number,
    interpFraction = 0,
    currentTick = interpolatedTick - interpFraction,
  ): void {
    for (const npc of npcs) {
      const ratio = npcDespawnTimerRatio(npc, interpolatedTick);
      if (ratio === null) continue;
      const anchor = this.npcBarAnchor(npc, projection, interpFraction, currentTick);
      if (!anchor) continue;

      if (!queue.timerBars) queue.timerBars = [];
      queue.timerBars.push({
        screenX: anchor.x,
        screenY: UIOverlayRenderer.stackedBarY(anchor.y, 1),
        ratio,
        width: anchor.width,
        height: UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
        key: `npc-timerbar-${npc.id}`,
      });
    }
  }

  /**
   * TzHaar HP Tracker's number over each NPC given: its current hitpoints, none at 0, placed as the
   * plugin's overlay places it with its default fonts (TzhaarHPTrackerOverlay.drawHp):
   *
   * - Height: "Above HP bar" is the logical height + 40 units, 25 over our bar (logical height + 15),
   *   whether or not the bar shows; "Center" half the logical height; "Bottom" the ground.
   * - The baseline sits on that point. The plugin centers the string by the width it would have in
   *   RuneLite's dynamic-overlay font (RS Small) but draws it in RS Bold, so it starts at
   *   `x - trunc(smallWidth / 2)` and leans right of center.
   * - An NPC on the same south-west tile as one already drawn is written at the first one's point,
   *   one RS Small line (12px) higher for each NPC before it.
   */
  buildNpcHpTexts(
    queue: RenderQueue,
    projection: Projection2D,
    npcs: readonly NpcSnapshot[],
    options: TzhaarHpTrackerOptions,
    interpFraction = 0,
    currentTick = 0,
  ): void {
    if (options.showHp === 'off') return;
    const stacks = new Map<string, { x: number; y: number; count: number }>();
    for (const npc of npcs) {
      const hp = Math.trunc(npc.hp);
      if (hp <= 0) continue;
      const text = String(hp);
      const stackKey = `${npc.position[0]},${npc.position[1]}`;
      let stack = stacks.get(stackKey);
      let lift = 0;
      if (stack) {
        lift = stack.count * HP_TEXT_STACK_LINE_HEIGHT;
        stack.count += 1;
      } else {
        const { cx, cy } = this.interpolatedNpcCenter(npc, interpFraction, currentTick);
        const terrainHeight = -getTerrainHeightInterpolated(this.terrainHeights, cx, cy) / 128;
        const heights = this.npcOverlayHeights.get(npc.id);
        const base = heights?.baseHeight ?? terrainHeight;
        const placement = tzhaarHpLocationFor(npc.npcTypeId, options.showHp);
        const level =
          placement === 'bottom'
            ? base
            : placement === 'center'
              ? base + (heights?.hitsplatHeight ?? 1.0)
              : base + (heights?.healthBarHeight ?? 1.5) + UIOverlayRenderer.HP_TEXT_ABOVE_BAR_HEIGHT;
        const screenPos = projection.tileToScreen({ x: cx, y: cy, level });
        if (!screenPos) continue;
        stack = { x: screenPos.x, y: screenPos.y, count: 1 };
        stacks.set(stackKey, stack);
      }
      if (!queue.overheadTexts) queue.overheadTexts = [];
      queue.overheadTexts.push({
        // The overhead text layer centers each string and stands its line box on screenY.
        screenX:
          stack.x -
          Math.trunc(digitsWidth(text, RS_SMALL_DIGIT_ADVANCES) / 2) +
          digitsWidth(text, RS_BOLD_DIGIT_ADVANCES) / 2,
        screenY: stack.y - lift + OVERHEAD_TEXT_DESCENT,
        text,
        textColor: tzhaarHpTextColor(npc, options),
        fontSize: UIOverlayRenderer.OSRS_OVERHEAD_TEXT_FONT_SIZE,
        key: `npc-hp-${npc.id}`,
      });
    }
  }

  buildNpcAttackTimerBars(
    queue: RenderQueue,
    projection: Projection2D,
    npcs: NpcSnapshot[],
    currentTick: number,
    interpFraction = 0,
  ): void {
    for (const npc of npcs) {
      if (!npc.alive || !npc.attackTimer) continue;
      const ratio = UIOverlayRenderer.attackCooldownRatio(
        npc.attackTimer.nextAttackTick,
        npc.attackTimer.attackSpeed,
        currentTick,
      );
      if (ratio === null) continue;
      const anchor = this.npcBarAnchor(npc, projection, interpFraction, currentTick);
      if (!anchor) continue;

      if (!queue.timerBars) queue.timerBars = [];
      queue.timerBars.push({
        screenX: anchor.x,
        screenY: UIOverlayRenderer.stackedBarY(anchor.y, UIOverlayRenderer.hasDespawnTimer(npc) ? 2 : 1),
        ratio,
        width: anchor.width,
        height: UIOverlayRenderer.OSRS_HEALTHBAR_HEIGHT,
        key: `npc-attack-timer-${npc.id}`,
      });
    }
  }
}
