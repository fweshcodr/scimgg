import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpellCastContext } from '../../core/combat/runeAvailability';
import type { ReplayClickType } from '../../core/ReplayRecorder';
import { DEATH_CHARGE_SPELL, MARK_OF_DARKNESS_SPELL } from '../../data/spellRunes';
import { useRafDrag } from '../../hooks/useRafDrag';
import { THEME } from '../../theme';
import type { SpellFilterOptions } from '../../types/panelFilters';
import { ALL_SPELL_CATEGORIES, type SpellCategory } from '../../types/panelFilters';
import type { SpellbookType } from '../../types/spellbook';
import { unstretchedClientPoint } from '../../util/viewportBounds';
import { buildSpellContextMenu, buildSpellReorderContextMenu, useContextMenu } from '../ContextMenu';
import { NineSliceBg } from '../NineSliceBg';
import { PixelSprite } from '../PixelSprite';
import { type LayerSprite, PixelSpriteLayer } from '../PixelSpriteLayer';
import { usePanelContentScale } from '../panelContentScale';
import { buildSpellTooltip, useTooltip } from '../Tooltip';
import { FilterMenu, type FilterMenuRow } from './FilterMenu';
import {
  calculateSpellbookLayout,
  filterSpellGrid,
  getSpellIconPath,
  isSpellSlotEnabled,
  SPELLBOOKS,
  sortSpellGrid,
} from './spellbookFilterUtils';

// Re-exported so call sites that already reach for these here keep working;
// their home is src/types/panelFilters.ts, which is what the replay contract imports.
export { SPELLBOOKS } from './spellbookFilterUtils';
export type { SpellbookType };

interface SpellbookContentProps {
  spellbook?: SpellbookType;
  onMarkOfDarknessCast?: () => void;
  onHomeTeleportCast?: () => void;
  onDeathChargeCast?: () => void;
  onReplayCursorClick?: (clientX: number, clientY: number, type: ReplayClickType, nowMs?: number) => void;
  /**
   * Runes/gear the player has right now. Drives the grayed-out icon variant for
   * spells they cannot pay for, and blocks arming them.
   */
  runeContext?: SpellCastContext | null;
  /** Spell armed for a manual cast, awaiting a target click. */
  armedSpell?: string | null;
  /** Arm (or, when passed the armed spell, disarm) a combat spell for manual casting. */
  onArmSpell?: (spellName: string | null) => void;
  reorderMode: boolean;
  filteringEnabled: boolean;
  /** Playback owns the whole arrangement, so the controls that would edit it are withheld. */
  replayControlled?: boolean;
  /**
   * Whether the filter screen is up. Owned by `GamePanel` rather than here so a replay
   * can restore it: the screen REPLACES the grid, and a cursor recorded over an icon
   * otherwise lands on a filter row.
   */
  filterViewOpen: boolean;
  onFilterViewOpenChange: (open: boolean) => void;
  filterSettings: {
    hidden: Record<string, string[]>;
    order: Record<string, string[] | null>;
    activeCategories: SpellCategory[];
    filterOptions: SpellFilterOptions;
  };
  /**
   * The base (unboosted) Magic level. The level filter passes a spell whose requirement
   * EITHER the base or the boosted level meets, so it needs both and `runeContext` carries
   * the boosted one.
   */
  baseMagicLevel?: number;
  onToggleHidden: (spellbook: SpellbookType, icon: string) => void;
  onReorder: (spellbook: SpellbookType, order: string[] | null) => void;
  onToggleCategory: (category: SpellCategory) => void;
  onToggleFilterOption: (key: keyof SpellFilterOptions) => void;
  antiDragEnabled?: boolean;
  dragOnShiftOnly?: boolean;
  antiDragDelay?: number;
  antiDragCtrlToDrag?: boolean;
}

interface DragState {
  sourceIndex: number;
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
  canDrag: boolean;
  dragThresholdMs: number;
}

const DRAG_TIME_THRESHOLD_MS = 100;
const DRAG_PIXEL_THRESHOLD = 5;

function getSlotIndexFromPoint(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  scale: number,
  cols: number,
  slotCount: number,
  slotSize: number,
  startX: number,
  startY: number,
  gapX: number,
  gapY: number,
): number | null {
  const relX = (clientX - containerRect.left) / scale - startX;
  const relY = (clientY - containerRect.top) / scale - startY;
  const stepX = slotSize + gapX;
  const stepY = slotSize + gapY;

  const col = Math.floor(relX / stepX);
  const row = Math.floor(relY / stepY);
  if (col < 0 || col >= cols || row < 0) return null;

  const inCellX = relX - col * stepX;
  const inCellY = relY - row * stepY;
  if (inCellX < 0 || inCellX > slotSize || inCellY < 0 || inCellY > slotSize) return null;

  const index = row * cols + col;
  return index >= 0 && index < slotCount ? index : null;
}

/** The client's category row labels, which are not the `spell_type` param names. */
const CATEGORY_LABELS: Record<SpellCategory, string> = {
  combat: 'Combat',
  teleport: 'Teleport',
  utility: 'Utility',
};

/** Matches the client's `<col=ffffff>` runs inside a filter label. */
const LabelHighlight: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: THEME.colors.textHighlight }}>{children}</span>
);

export const SpellbookContent: React.FC<SpellbookContentProps> = ({
  spellbook = 'arceuus',
  onMarkOfDarknessCast,
  onHomeTeleportCast,
  onDeathChargeCast,
  onReplayCursorClick,
  runeContext,
  armedSpell = null,
  onArmSpell,
  reorderMode,
  filteringEnabled,
  replayControlled = false,
  filterViewOpen,
  onFilterViewOpenChange,
  filterSettings,
  onToggleHidden,
  onReorder,
  onToggleCategory,
  onToggleFilterOption,
  baseMagicLevel,
  antiDragEnabled,
  dragOnShiftOnly,
  antiDragDelay,
  antiDragCtrlToDrag,
}) => {
  const { bindTooltip } = useTooltip();
  const uiScale = usePanelContentScale();
  const { bindContextMenu } = useContextMenu();
  const def = SPELLBOOKS[spellbook];

  const [dragState, setDragState] = useState<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const hoverOverlayRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(uiScale);
  const committedDragRef = useRef(false);
  scaleRef.current = uiScale;
  const hiddenIcons = filterSettings.hidden[spellbook] ?? [];
  const customOrder = filterSettings.order[spellbook] ?? null;
  const { activeCategories, filterOptions } = filterSettings;
  const hiddenSet = useMemo(() => new Set(hiddenIcons), [hiddenIcons]);
  const activeCategorySet = useMemo(() => new Set(activeCategories), [activeCategories]);
  const availability = useMemo(() => ({ baseMagicLevel, runeContext }), [baseMagicLevel, runeContext]);

  const sortedGrid = useMemo(() => sortSpellGrid(customOrder, def.grid), [customOrder, def.grid]);

  const displayGrid = useMemo(
    () =>
      filterSpellGrid(
        sortedGrid,
        hiddenSet,
        activeCategorySet,
        filterOptions,
        filteringEnabled,
        reorderMode,
        availability,
      ),
    [hiddenSet, activeCategorySet, filterOptions, filteringEnabled, reorderMode, sortedGrid, availability],
  );
  const displayGridDragResetKey = useMemo(() => displayGrid.map((slot) => slot.icon).join('|'), [displayGrid]);
  const displayGridRef = useRef(displayGrid);
  displayGridRef.current = displayGrid;
  const previousDisplayGridDragResetKeyRef = useRef(displayGridDragResetKey);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onMarkOfDarknessCastRef = useRef(onMarkOfDarknessCast);
  onMarkOfDarknessCastRef.current = onMarkOfDarknessCast;
  const onHomeTeleportCastRef = useRef(onHomeTeleportCast);
  onHomeTeleportCastRef.current = onHomeTeleportCast;
  const onDeathChargeCastRef = useRef(onDeathChargeCast);
  onDeathChargeCastRef.current = onDeathChargeCast;
  const spellbookRef = useRef(spellbook);
  spellbookRef.current = spellbook;
  const runeContextRef = useRef(runeContext);
  runeContextRef.current = runeContext;

  useEffect(() => {
    if (previousDisplayGridDragResetKeyRef.current === displayGridDragResetKey) return;
    previousDisplayGridDragResetKeyRef.current = displayGridDragResetKey;
    if (dragRef.current) {
      dragRef.current = null;
      setDragState(null);
    }
  }, [displayGridDragResetKey]);

  const layout = useMemo(
    () => calculateSpellbookLayout(filteringEnabled, displayGrid.length, spellbook, filterOptions.iconResizing),
    [filteringEnabled, displayGrid.length, spellbook, filterOptions.iconResizing],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const getPosition = useCallback(
    (index: number) => {
      const col = index % layout.cols;
      const row = Math.floor(index / layout.cols);
      return {
        x: layout.startX + col * (layout.slotSize + layout.gapX),
        y: layout.startY + row * (layout.slotSize + layout.gapY),
      };
    },
    [layout],
  );

  const { startDrag: startRafDrag } = useRafDrag({
    onMove: (clientX, clientY, eventTime) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.currentX = clientX;
      drag.currentY = clientY;

      if (!drag.isDragging) {
        if (!drag.canDrag) return;
        const dx = clientX - drag.startX;
        const dy = clientY - drag.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const elapsed = Math.max(0, eventTime - drag.startTime);
        if (elapsed >= drag.dragThresholdMs && distance >= DRAG_PIXEL_THRESHOLD) {
          drag.isDragging = true;
        }
      }

      if (drag.isDragging && !committedDragRef.current) {
        committedDragRef.current = true;
        setDragState({ ...drag });
      }

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const point = unstretchedClientPoint(containerRef.current, rect, clientX, clientY);
        const curLayout = layoutRef.current;

        if (floatRef.current) {
          const x = (point.clientX - rect.left) / scaleRef.current - curLayout.slotSize / 2;
          const y = (point.clientY - rect.top) / scaleRef.current - curLayout.slotSize / 2;
          floatRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }

        if (hoverOverlayRef.current && drag.isDragging) {
          const slotIndex = getSlotIndexFromPoint(
            point.clientX,
            point.clientY,
            rect,
            scaleRef.current,
            curLayout.cols,
            displayGridRef.current.length,
            curLayout.slotSize,
            curLayout.startX,
            curLayout.startY,
            curLayout.gapX,
            curLayout.gapY,
          );
          const nextHover = slotIndex !== drag.sourceIndex ? slotIndex : null;
          if (nextHover !== null) {
            const col = nextHover % curLayout.cols;
            const row = Math.floor(nextHover / curLayout.cols);
            const hx = curLayout.startX + col * (curLayout.slotSize + curLayout.gapX);
            const hy = curLayout.startY + row * (curLayout.slotSize + curLayout.gapY);
            hoverOverlayRef.current.style.display = '';
            hoverOverlayRef.current.style.transform = `translate3d(${hx}px, ${hy}px, 0)`;
          } else {
            hoverOverlayRef.current.style.display = 'none';
          }
        }
      }
    },
    onEnd: (clientX, clientY) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const point = unstretchedClientPoint(containerRef.current, rect, clientX, clientY);
        const curLayout = layoutRef.current;
        const targetIndex = getSlotIndexFromPoint(
          point.clientX,
          point.clientY,
          rect,
          scaleRef.current,
          curLayout.cols,
          displayGridRef.current.length,
          curLayout.slotSize,
          curLayout.startX,
          curLayout.startY,
          curLayout.gapX,
          curLayout.gapY,
        );
        if (targetIndex !== null && targetIndex !== drag.sourceIndex) {
          const nextOrder = displayGridRef.current.map((slot) => slot.icon);
          const [moved] = nextOrder.splice(drag.sourceIndex, 1);
          nextOrder.splice(targetIndex, 0, moved);
          onReorderRef.current(spellbookRef.current, nextOrder);
        }
      } else {
        const clickedSlot = displayGridRef.current[drag.sourceIndex];
        // Same gate as the plain click path below: a spell the player cannot pay for stays inert
        // when the click happens to have ended a drag.
        if (clickedSlot && isSpellSlotEnabled(clickedSlot, runeContextRef.current)) {
          if (clickedSlot.label === MARK_OF_DARKNESS_SPELL) {
            onMarkOfDarknessCastRef.current?.();
          } else if (clickedSlot.label === DEATH_CHARGE_SPELL) {
            onDeathChargeCastRef.current?.();
          } else if (clickedSlot.icon === 'home_teleport') {
            onHomeTeleportCastRef.current?.();
          }
        }
      }

      dragRef.current = null;
      committedDragRef.current = false;
      setDragState(null);
    },
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (!reorderMode || e.button !== 0 || e.altKey) return;

      const ctrlBypass = antiDragCtrlToDrag && e.ctrlKey;
      const canDrag = ctrlBypass || !(antiDragEnabled && dragOnShiftOnly && !e.shiftKey);
      const dragThresholdMs = ctrlBypass
        ? 0
        : antiDragEnabled && !dragOnShiftOnly
          ? (antiDragDelay ?? DRAG_TIME_THRESHOLD_MS)
          : DRAG_TIME_THRESHOLD_MS;

      const state: DragState = {
        sourceIndex: index,
        startX: e.clientX,
        startY: e.clientY,
        startTime: e.timeStamp,
        currentX: e.clientX,
        currentY: e.clientY,
        isDragging: false,
        canDrag,
        dragThresholdMs,
      };
      dragRef.current = state;
      committedDragRef.current = false;
      setDragState(state);
      e.preventDefault();
      startRafDrag(e);
    },
    [antiDragCtrlToDrag, antiDragDelay, antiDragEnabled, dragOnShiftOnly, reorderMode, startRafDrag],
  );

  // Every spell icon paints into ONE canvas behind the transparent slot buttons. See
  // PixelSpriteLayer for why a canvas per sprite hitched on every tab switch.
  const gridSprites: LayerSprite[] =
    filterViewOpen && filteringEnabled
      ? []
      : displayGrid.map((slot, index) => {
          const pos = getPosition(index);
          const slotAlpha =
            dragState?.isDragging && dragState.sourceIndex === index
              ? 0.3
              : dragState !== null && !dragState.isDragging && dragState.sourceIndex === index
                ? 0.7
                : 1;
          return {
            src: getSpellIconPath(def.iconDir, slot.icon, layout.slotSize, isSpellSlotEnabled(slot, runeContext)),
            x: pos.x,
            y: pos.y,
            w: layout.slotSize,
            h: layout.slotSize,
            width: layout.slotSize,
            height: layout.slotSize,
            opacity: slotAlpha * (hiddenSet.has(slot.icon) ? 0.3 : 1),
          };
        });

  /**
   * The client's seven filter rows, in its order and with its labels verbatim.
   */
  const filterRows: FilterMenuRow[] = [
    ...ALL_SPELL_CATEGORIES.map((category) => ({
      key: category,
      label: (
        <>
          Show <LabelHighlight>{CATEGORY_LABELS[category]}</LabelHighlight> spells
        </>
      ),
      checked: activeCategorySet.has(category),
      onToggle: () => onToggleCategory(category),
    })),
    {
      key: 'showLackLevel',
      label: 'Show spells you lack the Magic level to cast',
      checked: filterOptions.showLackLevel,
      onToggle: () => onToggleFilterOption('showLackLevel'),
    },
    {
      key: 'showLackRunes',
      label: 'Show spells you lack the runes to cast',
      checked: filterOptions.showLackRunes,
      onToggle: () => onToggleFilterOption('showLackRunes'),
    },
    {
      key: 'showLackRequirements',
      label: 'Show spells you lack the requirements to cast',
      checked: filterOptions.showLackRequirements,
      onToggle: () => onToggleFilterOption('showLackRequirements'),
    },
    {
      key: 'showUnsimulated',
      label: 'Show spells this simulator cannot cast',
      checked: filterOptions.showUnsimulated,
      onToggle: () => onToggleFilterOption('showUnsimulated'),
    },
    {
      key: 'iconResizing',
      label: 'Enable icon resizing',
      checked: filterOptions.iconResizing,
      onToggle: () => onToggleFilterOption('iconResizing'),
    },
  ];

  return (
    <div ref={containerRef} style={{ width: 204, height: 275, position: 'relative' }}>
      <PixelSpriteLayer width={204} height={275} sprites={gridSprites} />
      {filterViewOpen && filteringEnabled ? (
        <FilterMenu rows={filterRows} />
      ) : (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {filteringEnabled && displayGrid.length === 0 && (
            // The client draws this in place of the grid rather than leaving the panel
            // blank.
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 12px',
                boxSizing: 'border-box',
                fontFamily: '"RuneScape Plain 12", sans-serif',
                fontSize: '16px',
                lineHeight: '13px',
                color: THEME.colors.native.orange,
                textShadow: '1px 1px 0 #000',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              No spells match your selected filters.
            </div>
          )}
          {displayGrid.map((slot, index) => {
            const pos = getPosition(index);
            const hidden = hiddenSet.has(slot.icon);
            const isHomeTeleport = slot.icon === 'home_teleport';
            const isCastable =
              isHomeTeleport || slot.label === MARK_OF_DARKNESS_SPELL || slot.label === DEATH_CHARGE_SPELL;
            const enabled = isSpellSlotEnabled(slot, runeContext);
            // Spells that resolve on the caster and so need no target, unlike a combat spell,
            // which is only ARMED by a click and waits for one.
            //
            // Gated on `enabled` so a spell the player cannot pay for is inert everywhere at once:
            // left-click, the context menu's Cast entry, and reorder mode all read this one value.
            // The engine refuses the cast anyway, so an ungated click would look like a dead button
            // rather than a grayed-out spell.
            const selfCast = !enabled
              ? undefined
              : isHomeTeleport
                ? onHomeTeleportCast
                : slot.label === MARK_OF_DARKNESS_SPELL
                  ? onMarkOfDarknessCast
                  : slot.label === DEATH_CHARGE_SPELL
                    ? onDeathChargeCast
                    : undefined;
            const isManualCastable = !isCastable && enabled && slot.category === 'combat';
            const isArmed = armedSpell === slot.label;

            const tooltipContent =
              isCastable || isManualCastable
                ? {
                    lines: [
                      {
                        spans: [
                          { text: 'Cast ', color: '#00ff00' },
                          { text: isHomeTeleport ? 'Teleport to Lobby' : slot.label, color: THEME.colors.native.info },
                        ],
                      },
                    ],
                  }
                : buildSpellTooltip(slot.label);

            const contextMenuProps = bindContextMenu(() => {
              if (reorderMode) {
                return buildSpellReorderContextMenu(slot.label, hidden, {
                  onCast: selfCast,
                  onToggleHidden: () => onToggleHidden(spellbook, slot.icon),
                });
              }

              if (isCastable) {
                const castAction = isHomeTeleport ? 'Teleport to Lobby' : 'Cast';
                return {
                  entries: [{ action: castAction, target: slot.label, onClick: selfCast }, { action: 'Cancel' }],
                };
              }

              if (isManualCastable && onArmSpell) {
                return {
                  entries: [
                    { action: 'Cast', target: slot.label, onClick: () => onArmSpell(isArmed ? null : slot.label) },
                    { action: 'Cancel' },
                  ],
                };
              }

              return buildSpellContextMenu(slot.label);
            });

            return (
              <button
                key={slot.icon}
                type="button"
                data-spell={slot.icon}
                onMouseDown={(e) => {
                  contextMenuProps.onMouseDown(e);
                  if (e.button === 0) {
                    handleMouseDown(e, index);
                    if (!reorderMode && !isHomeTeleport && selfCast) {
                      selfCast();
                      onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
                    } else if (!reorderMode && isManualCastable && onArmSpell) {
                      // OSRS arms the spell and waits for a target; clicking the armed
                      // spell again puts it away.
                      onArmSpell(isArmed ? null : slot.label);
                      onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
                    }
                  }
                }}
                onContextMenu={contextMenuProps.onContextMenu}
                onPointerDownCapture={contextMenuProps.onPointerDownCapture}
                {...(dragState?.isDragging ? {} : bindTooltip(tooltipContent))}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: layout.slotSize,
                  height: layout.slotSize,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  boxShadow: isArmed ? `inset 0 0 0 1px ${THEME.colors.native.orange}` : 'none',
                  cursor: 'default',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                }}
                onClick={
                  !reorderMode && isHomeTeleport && selfCast
                    ? (e) => {
                        selfCast();
                        onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
                      }
                    : undefined
                }
                aria-label={slot.label}
              />
            );
          })}
        </div>
      )}
      {dragState?.isDragging &&
        containerRef.current &&
        (() => {
          const sourceSlot = displayGrid[dragState.sourceIndex];
          if (!sourceSlot) return null;
          const drag = dragRef.current;
          const curLayout = layoutRef.current;
          const rect = containerRef.current.getBoundingClientRect();
          const point = drag ? unstretchedClientPoint(containerRef.current, rect, drag.currentX, drag.currentY) : null;
          const floatX = point ? (point.clientX - rect.left) / uiScale - curLayout.slotSize / 2 : 0;
          const floatY = point ? (point.clientY - rect.top) / uiScale - curLayout.slotSize / 2 : 0;
          const hidden = hiddenSet.has(sourceSlot.icon);

          return (
            <div
              ref={floatRef}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate3d(${floatX}px, ${floatY}px, 0)`,
                width: curLayout.slotSize,
                height: curLayout.slotSize,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 100,
              }}
            >
              <PixelSprite
                src={getSpellIconPath(
                  def.iconDir,
                  sourceSlot.icon,
                  curLayout.slotSize,
                  isSpellSlotEnabled(sourceSlot, runeContext),
                )}
                alt={sourceSlot.label}
                style={{
                  width: curLayout.slotSize,
                  height: curLayout.slotSize,
                  opacity: hidden ? 0.3 : 1,
                  pointerEvents: 'none',
                  imageRendering: 'pixelated',
                }}
              />
            </div>
          );
        })()}

      {dragState?.isDragging && (
        <div
          ref={hoverOverlayRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layout.slotSize,
            height: layout.slotSize,
            background: 'rgba(255, 255, 255, 0.12)',
            pointerEvents: 'none',
            display: 'none',
            zIndex: 50,
          }}
        />
      )}

      {reorderMode && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(255, 0, 0, 0.08)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {filteringEnabled && !reorderMode && !replayControlled && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <button
            type="button"
            aria-pressed={filterViewOpen}
            onClick={() => onFilterViewOpenChange(!filterViewOpen)}
            style={{
              position: 'relative',
              width: 56,
              height: 18,
              border: 'none',
              background: 'transparent',
              padding: '1px 0',
              margin: 0,
              cursor: 'default',
              outline: 'none',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"RuneScape Bold 12", sans-serif',
              fontSize: '14px',
              color: filterViewOpen ? THEME.colors.textHighlight : THEME.colors.native.orange,
              textShadow: '1px 1px 0 #000',
            }}
          >
            <NineSliceBg selected={filterViewOpen} />
            <span style={{ position: 'relative', zIndex: 1 }}>Filters</span>
          </button>
        </div>
      )}
    </div>
  );
};
