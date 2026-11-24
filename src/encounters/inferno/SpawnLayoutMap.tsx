import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { infernoIdentity } from '../../npcs/inferno/actors';
import type { Coordinate } from '../../types/simulation';
import { ZUK_PLAYER_START } from '../zuk/constants';
import { arenaTileBox, fitArenaTileSize, INFERNO_ARENA_MAP_IMAGE } from './arenaMapImage';
import { INFERNO_ARENA_BOUNDS, INFERNO_LANDING_TILE, INFERNO_SPAWN_SLOTS, LAST_PILLAR_WAVE } from './constants';
import { INFERNO_PILLARS, PILLAR_SIZE, type PillarKey } from './pillars';
import type { SlotKind } from './spawnLayout';
import { startTileApplies } from './startTile';
import { WAVE_NPC_NAMES } from './waveInfo';

const SLOT_NAMES = [
  'North-west',
  'West',
  'South-west',
  'Inner south-west',
  'South',
  'South-east',
  'Center',
  'East',
  'North-east',
];
// The diagram includes two tiles of terrain beyond the playable bounds, so edge pillars
// sit inside the arena picture rather than being mistaken for part of its frame.
const MAP_BOUNDS = INFERNO_ARENA_MAP_IMAGE.bounds;
const MAP_WIDTH = MAP_BOUNDS.maxX - MAP_BOUNDS.minX + 1;
const MAP_HEIGHT = MAP_BOUNDS.maxY - MAP_BOUNDS.minY + 1;
const ARENA_WIDTH = INFERNO_ARENA_BOUNDS.maxX - INFERNO_ARENA_BOUNDS.minX + 1;
const ARENA_HEIGHT = INFERNO_ARENA_BOUNDS.maxY - INFERNO_ARENA_BOUNDS.minY + 1;
const GRID_PATH = [
  ...Array.from({ length: ARENA_WIDTH + 1 }, (_, x) => `M${x} 0V${ARENA_HEIGHT}`),
  ...Array.from({ length: ARENA_HEIGHT + 1 }, (_, y) => `M0 ${y}H${ARENA_WIDTH}`),
].join('');

export function kindLabel(kind: SlotKind): string {
  const name = WAVE_NPC_NAMES[kind].one;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Drawn boxes win over expanded targets. In overlapping touch margins, choose the nearest box. */
export function nearestMapTarget(
  x: number,
  y: number,
  targets: readonly { left: number; top: number; width: number; height: number }[],
): number | null {
  let best: { index: number; distance: number; centre: number } | null = null;
  for (const [index, rect] of targets.entries()) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (Math.abs(x - cx) > Math.max(44, rect.width) / 2 || Math.abs(y - cy) > Math.max(44, rect.height) / 2) continue;
    const dx = Math.max(rect.left - x, 0, x - rect.left - rect.width);
    const dy = Math.max(rect.top - y, 0, y - rect.top - rect.height);
    const distance = dx * dx + dy * dy;
    const centre = (x - cx) ** 2 + (y - cy) ** 2;
    if (!best || distance < best.distance || (distance === best.distance && centre < best.centre))
      best = { index, distance, centre };
  }
  return best?.index ?? null;
}

export interface SpawnLayoutMapProps {
  readonly wave: number;
  readonly kinds: readonly SlotKind[];
  readonly slots: readonly (SlotKind | null)[];
  readonly destroyedPillars: Readonly<Record<PillarKey, boolean>>;
  readonly playerTile: Readonly<Coordinate>;
  readonly onSlotsChange: (slots: (SlotKind | null)[]) => void;
  readonly onPillarChange: (key: PillarKey) => void;
  readonly onStartChange: (tile: Coordinate) => void;
  readonly actions?: React.ReactNode;
  readonly caption?: React.ReactNode;
}

/** One pointer surface: spots place/replace/remove, pillars toggle, and bare floor sets the start. */
export function SpawnLayoutMap({
  wave,
  kinds,
  slots,
  destroyedPillars,
  playerTile,
  onSlotsChange,
  onPillarChange,
  onStartChange,
  actions,
  caption,
}: SpawnLayoutMapProps) {
  const [picker, setPicker] = useState<{ index: number; left: number; top: number } | null>(null);
  const [armedKind, setArmedKind] = useState<SlotKind | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const [plane, setPlane] = useState({ tileSize: 8, left: 0, top: 0 });
  useLayoutEffect(() => {
    const map = mapRef.current!;
    const measure = () => {
      if (!map.clientWidth || !map.clientHeight) return;
      const tileSize = fitArenaTileSize(map.clientWidth, map.clientHeight);
      const rect = map.getBoundingClientRect();
      // Bias toward the leading edge: a half-pixel centered host must not gain a
      // trailing overflow pixel when the integer plane exactly fills its width.
      const left = Math.floor(rect.left + (map.clientWidth - MAP_WIDTH * tileSize) / 2) - rect.left;
      const top = Math.floor(rect.top + (map.clientHeight - MAP_HEIGHT * tileSize) / 2) - rect.top;
      setPlane((old) =>
        old.tileSize === tileSize && old.left === left && old.top === top ? old : { tileSize, left, top },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(map);
    return () => observer.disconnect();
  }, []);
  const tileBox = (position: Readonly<Coordinate>, size: number, height = size) =>
    arenaTileBox(position, size, plane.tileSize, height);
  useEscapeLayer(1400, picker !== null, () => setPicker(null));
  useEffect(() => {
    if (!picker) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && pickerRef.current?.contains(event.target)) return;
      setPicker(null);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [picker]);

  const remaining = [...kinds];
  for (const kind of slots) {
    if (kind === null) continue;
    const index = remaining.indexOf(kind);
    if (index >= 0) remaining.splice(index, 1);
  }
  const armedAvailable = armedKind !== null && remaining.includes(armedKind);
  useEffect(() => {
    if (!armedAvailable) setArmedKind(null);
  }, [armedAvailable]);
  const choices = [...new Set(remaining)].filter((kind) => picker === null || kind !== slots[picker.index]);
  const swaps =
    picker !== null && slots[picker.index]
      ? slots.flatMap((kind, index) => (kind && kind !== slots[picker.index] ? [{ kind, index }] : []))
      : [];
  const place = (kind: SlotKind | null) => {
    if (!picker) return;
    const next = [...slots];
    next[picker.index] = kind;
    onSlotsChange(next);
    setPicker(null);
  };
  const shownTile = wave === 1 ? INFERNO_LANDING_TILE : wave === 69 ? ZUK_PLAYER_START : playerTile;
  const selectSlot = (index: number, rect: DOMRect) => {
    const kind = slots[index];
    if (!kind && remaining.length === 0) return;
    if (!kind && armedAvailable && armedKind) {
      const next = [...slots];
      next[index] = armedKind;
      onSlotsChange(next);
      setPicker(null);
      return;
    }
    const swapCount = kind ? slots.filter((other) => other && other !== kind).length : 0;
    const height = Math.min(320, (new Set(remaining).size + (kind ? 1 : 0)) * 44 + swapCount * 52 + 40);
    setPicker({
      index,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 188)),
      top: Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 4 : rect.top - height - 4),
    });
  };
  return (
    <>
      <fieldset className="spawn-progress" aria-label="Wave monsters">
        {[...new Set(kinds)].map((kind) => {
          const total = kinds.filter((entry) => entry === kind).length;
          const placed = slots.filter((entry) => entry === kind).length;
          const done = placed === total;
          return (
            <button
              key={kind}
              type="button"
              tabIndex={-1}
              className={`spawn-progress__chip spawn-kind--${kind}${done ? ' is-complete' : ''}`}
              disabled={done}
              aria-pressed={armedAvailable && armedKind === kind}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setPicker(null);
                setArmedKind(armedKind === kind ? null : kind);
              }}
            >
              <span className="spawn-progress__swatch" aria-hidden="true" />
              {kindLabel(kind)} {placed}/{total}
            </button>
          );
        })}
      </fieldset>
      <div className="spawn-map-frame">
        <div className="spawn-map__tools">{actions}</div>
        {caption}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer/touch map; game hotkeys must not become keyboard navigation. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: project keyboard policy, floor picking uses pointer/touch only. */}
        <div
          ref={mapRef}
          className="spawn-map"
          style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
          data-testid="arena-map"
          onClick={(event) => {
            const box = planeRef.current!.getBoundingClientRect();
            const inside =
              event.clientX >= box.left &&
              event.clientX < box.right &&
              event.clientY >= box.top &&
              event.clientY < box.bottom;
            const targets = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-spawn-slot], [data-pillar]'),
            ].filter((button) => !button.disabled);
            const nearest = inside
              ? nearestMapTarget(
                  event.clientX,
                  event.clientY,
                  targets.map((button) => (button.closest('.spawn-map__spot') ?? button).getBoundingClientRect()),
                )
              : null;
            // Programmatic button activation still uses its explicit target; pointer selection
            // arbitrates the expanded areas rather than depending on DOM stacking order.
            const target =
              nearest === null ? (event.target as Element).closest<HTMLButtonElement>('button') : targets[nearest];
            if (target?.dataset.spawnSlot !== undefined) {
              selectSlot(Number(target.dataset.spawnSlot), target.getBoundingClientRect());
              return;
            }
            if (target?.dataset.pillar) {
              onPillarChange(target.dataset.pillar as PillarKey);
              return;
            }
            if (!inside || !startTileApplies(wave)) return;
            onStartChange([
              MAP_BOUNDS.minX + Math.floor(((event.clientX - box.left) / box.width) * MAP_WIDTH),
              MAP_BOUNDS.maxY - Math.floor(((event.clientY - box.top) / box.height) * MAP_HEIGHT),
            ]);
          }}
        >
          <div
            ref={planeRef}
            className="spawn-map__plane"
            data-compact={plane.tileSize <= 9}
            data-tile-size={plane.tileSize}
            style={{
              left: plane.left,
              top: plane.top,
              width: MAP_WIDTH * plane.tileSize,
              height: MAP_HEIGHT * plane.tileSize,
            }}
          >
            <img
              className="spawn-map__terrain"
              src={INFERNO_ARENA_MAP_IMAGE.url}
              width={INFERNO_ARENA_MAP_IMAGE.width}
              height={INFERNO_ARENA_MAP_IMAGE.height}
              crossOrigin="anonymous"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <span className="spawn-map__terrain-wash" aria-hidden="true" />
            <svg
              className="spawn-map__grid"
              style={tileBox([INFERNO_ARENA_BOUNDS.minX, INFERNO_ARENA_BOUNDS.minY], ARENA_WIDTH, ARENA_HEIGHT)}
              viewBox={`0 0 ${ARENA_WIDTH} ${ARENA_HEIGHT}`}
              preserveAspectRatio="none"
              shapeRendering="crispEdges"
              aria-hidden="true"
            >
              <path d={GRID_PATH} vectorEffect="non-scaling-stroke" />
            </svg>
            {kinds.length > 0 &&
              INFERNO_SPAWN_SLOTS.map((position, index) => {
                const kind = slots[index];
                const size = kind
                  ? infernoIdentity(kind === 'mager' || kind === 'ranger' ? { kind, variant: 'ordinary' } : kind).size
                  : 4;
                return (
                  <span
                    key={SLOT_NAMES[index]}
                    className={`spawn-map__spot${size < 4 ? ' has-small-npc' : ''}`}
                    data-spawn-hit={index}
                    style={tileBox(position, 4)}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      data-spawn-slot={index}
                      className={`spawn-map__slot${kind ? ` is-filled spawn-kind--${kind}` : ''}${size < 4 ? ' is-small' : ''}`}
                      style={{ left: 0, bottom: 0, width: size * plane.tileSize, height: size * plane.tileSize }}
                      aria-label={`${SLOT_NAMES[index]}: ${kind ? kindLabel(kind) : 'empty spawn'}`}
                      aria-expanded={picker?.index === index}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      {kind && <span className="spawn-map__npc-label">{kindLabel(kind)}</span>}
                    </button>
                  </span>
                );
              })}
            {wave <= LAST_PILLAR_WAVE &&
              INFERNO_PILLARS.map((pillar) => {
                const down = destroyedPillars[pillar.key];
                return (
                  <button
                    key={pillar.key}
                    type="button"
                    tabIndex={-1}
                    className={`spawn-map__pillar${down ? ' is-down' : ''}`}
                    data-pillar={pillar.key}
                    style={tileBox(pillar.position, PILLAR_SIZE)}
                    aria-label={`${pillar.key === 'northEast' ? 'North-east' : pillar.key === 'west' ? 'West' : 'South'} pillar`}
                    aria-pressed={down}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <span className="spawn-map__pillar-label">{down ? 'Down' : 'Pillar'}</span>
                  </button>
                );
              })}
            <span
              className="spawn-map__player"
              style={tileBox(shownTile, 1)}
              role="img"
              aria-label={`Your start: ${shownTile[0]}, ${shownTile[1]}${startTileApplies(wave) ? '. Tap floor to move.' : ' (fixed)'}`}
            >
              <span
                className={`spawn-map__player-label${shownTile[1] >= INFERNO_ARENA_BOUNDS.maxY - 1 ? ' is-below' : ''}`}
              >
                You
              </span>
            </span>
          </div>
        </div>
        {picker &&
          createPortal(
            <div
              ref={pickerRef}
              className="spawn-picker"
              style={{ left: picker.left, top: picker.top }}
              role="dialog"
              aria-label={`Monster at ${SLOT_NAMES[picker.index]}`}
            >
              <p className="spawn-picker__heading">{SLOT_NAMES[picker.index]} spot</p>
              {choices.map((kind) => (
                <button
                  type="button"
                  tabIndex={-1}
                  key={kind}
                  className={`spawn-picker__choice spawn-kind--${kind}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => place(kind)}
                >
                  <span aria-hidden="true" />
                  {kindLabel(kind)}
                </button>
              ))}
              {swaps.map(({ kind, index }) => (
                <button
                  type="button"
                  tabIndex={-1}
                  key={index}
                  className={`spawn-picker__choice spawn-kind--${kind}`}
                  aria-label={`Swap with ${SLOT_NAMES[index]} ${kindLabel(kind)}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const next = [...slots];
                    [next[index], next[picker.index]] = [next[picker.index], next[index]];
                    onSlotsChange(next);
                    setPicker(null);
                  }}
                >
                  <span aria-hidden="true" />
                  <span className="spawn-picker__swap">
                    Swap {kindLabel(kind)}
                    <small>{SLOT_NAMES[index]}</small>
                  </span>
                </button>
              ))}
              {slots[picker.index] && (
                <button
                  type="button"
                  tabIndex={-1}
                  className="spawn-picker__remove"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => place(null)}
                >
                  Remove
                </button>
              )}
            </div>,
            document.body,
          )}
      </div>
    </>
  );
}
