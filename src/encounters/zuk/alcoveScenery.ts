import type { LocAnchor } from '../../render/environment/locRenderOptions';
import { ZUK_INTRO } from './constants';

/** One alcove LOC as wave 69's scene shows it on a tick (shape 10, rotation in quarter turns). */
export interface ZukAlcoveLoc {
  /** Stable per slot, so a state change re-bakes that slot only. */
  readonly slot: string;
  readonly locId: number;
  readonly localX: number;
  readonly localY: number;
  readonly rotation: number;
  /** A one-shot LOC animation and the tick it started, when the slot is playing one. */
  readonly animation?: { readonly seqId: number; readonly startTick: number };
}

type Slot = {
  readonly slot: string;
  readonly localX: number;
  readonly localY: number;
  /** The cache (pre-fight) LOC, rotation from the map square (test cache, region 9043). */
  readonly sealed: { readonly locId: number; readonly rotation: number };
  /** From C-8 (`loc_add_change` in both captures); null where the slot is removed (`loc_del`). */
  readonly opening: { readonly locId: number; readonly rotation: number } | null;
  /** From C, where the slot changes again. */
  readonly open?: { readonly locId: number; readonly rotation: number };
  /** Played from C-7 (`loc_anim`). */
  readonly openingSeqId?: number;
};

/**
 * The alcove's prison walls and static glyph: inferno-waves-69-zuk t18/t19/t26 and
 * inferno-waves-tbow-69-zuk t19/t20/t27 (C-8, C-7, C; docs/encounters/zuk-facts-spec.md, Intro).
 * The final states are the ones a run started on wave 69 has always opened with.
 */
const SLOTS: readonly Slot[] = [
  {
    slot: 'wall-left-floor',
    localX: 27,
    localY: 52,
    sealed: { locId: 30333, rotation: 3 },
    opening: { locId: 30340, rotation: 1 },
  },
  {
    slot: 'wall-right-floor',
    localX: 35,
    localY: 52,
    sealed: { locId: 30332, rotation: 3 },
    opening: { locId: 30339, rotation: 3 },
  },
  {
    slot: 'wall-left-join',
    localX: 27,
    localY: 54,
    sealed: { locId: 30324, rotation: 3 },
    opening: { locId: 30342, rotation: 1 },
  },
  {
    slot: 'wall-right-join',
    localX: 35,
    localY: 54,
    sealed: { locId: 30334, rotation: 3 },
    opening: { locId: 30341, rotation: 3 },
  },
  {
    slot: 'wall-left-collapsing',
    localX: 28,
    localY: 52,
    sealed: { locId: 30337, rotation: 3 },
    opening: { locId: 30344, rotation: 3 },
    open: { locId: 30346, rotation: 3 },
    openingSeqId: 7560,
  },
  {
    slot: 'wall-right-collapsing',
    localX: 33,
    localY: 52,
    sealed: { locId: 30336, rotation: 3 },
    opening: { locId: 30343, rotation: 3 },
    open: { locId: 30345, rotation: 3 },
    openingSeqId: 7559,
  },
  // The static glyph, deleted as the moving one is added on its tile.
  { slot: 'static-glyph', localX: 30, localY: 51, sealed: { locId: 30338, rotation: 3 }, opening: null },
];

/** The cache LOCs these slots replace, which the static scene must leave to the scene controller. */
export const ZUK_ALCOVE_STATIC_LOCS: readonly LocAnchor[] = SLOTS.map(({ localX, localY, sealed }) => ({
  localX,
  localY,
  locId: sealed.locId,
}));

/**
 * The alcove on `tick`, for a run whose wave-69 control tick is `controlTick` (null: not headed for
 * wave 69 yet, so still sealed). Pure, so a replay seek lands on the right state.
 */
export function zukAlcoveLocs(controlTick: number | null, tick: number): ZukAlcoveLoc[] {
  const offset = controlTick === null ? Number.NEGATIVE_INFINITY : tick - controlTick;
  return SLOTS.flatMap((slot): ZukAlcoveLoc[] => {
    const base = { slot: slot.slot, localX: slot.localX, localY: slot.localY };
    if (offset < ZUK_INTRO.add) return [{ ...base, ...slot.sealed }];
    if (offset >= 0 && slot.open) return [{ ...base, ...slot.open }];
    if (!slot.opening) return [];
    const animating = slot.openingSeqId !== undefined && offset >= ZUK_INTRO.wallAnimation && controlTick !== null;
    return [
      {
        ...base,
        ...slot.opening,
        ...(animating && slot.openingSeqId !== undefined
          ? { animation: { seqId: slot.openingSeqId, startTick: controlTick + ZUK_INTRO.wallAnimation } }
          : {}),
      },
    ];
  });
}
