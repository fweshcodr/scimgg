import type React from 'react';
import { Fragment, useId, useMemo, useRef, useState } from 'react';
import { type HoverCardPlacement, pointerHovers, useHoverCard } from './HoverCard';
import './InfoHint.css';

const MARK_WIDTH = 4;
const MARK_HEIGHT = 6;

/**
 * The RuneScape `?` re-cut at 4x6 — the face's own shape (two-pixel bowl, right shoulder, a
 * diagonal into the stem, detached dot) on the smallest grid that still reads as a question mark
 * rather than a 7.
 *
 * Deliberately SHORTER than the text it is set on: the label's ink measures 9px, so the face's
 * own 5x8 `?` stands as tall as the word it annotates and reads as a glyph inside it. Six pixels,
 * held above the baseline, reads as a superscript instead.
 */
const GLYPH_PIXELS: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 0],
  [0, 1],
  [3, 1],
  [3, 2],
  [2, 3],
  [2, 5],
];

/**
 * Integer coordinates in a viewBox of whole pixels, so the mark rasterizes bilevel at DPR 1 and
 * stays sharp at every whole ratio above it. A font glyph cannot do this job at 6px: the pixel
 * faces rasterize cleanly only at 16px and its multiples (DESIGN.md, "Pixel-font rules"), and
 * every smaller size lands glyph edges mid-pixel.
 */
const MarkGlyph: React.FC = () => (
  <svg
    width={MARK_WIDTH}
    height={MARK_HEIGHT}
    viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
    aria-hidden="true"
    focusable="false"
  >
    {GLYPH_PIXELS.map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
    ))}
  </svg>
);

/** A run of hint text. `color` paints it, for a fact the game itself shows in that color. */
export interface InfoHintSegment {
  readonly text: string;
  readonly color?: string;
}

/**
 * Segments render inline in order, so the card's text, and with it the accessible description,
 * is their plain concatenation.
 */
function renderHintText(text: string | readonly InfoHintSegment[]): React.ReactNode {
  if (typeof text === 'string') return text;
  return text.map((segment, index) =>
    segment.color ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are static copy, never reordered.
      <span key={index} style={{ color: segment.color }}>
        {segment.text}
      </span>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: segments are static copy, never reordered.
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );
}

interface InfoHintProps {
  /** What the hint is about, for the mark's accessible name. */
  label: string;
  text: string | readonly InfoHintSegment[];
  /**
   * The region a hovering pointer opens the hint from — the whole label the mark is set on. The
   * mark is drawn 4x6, far too small for a mouse to aim at, so a mouse never has to: resting on
   * the label is enough. Required for that reason: without a region a mouse would have to find
   * the mark itself.
   *
   * Touch and pen are the opposite. A tap on the region belongs to whatever control the region
   * holds and opens nothing; the mark is their trigger, through a hit area much larger than the
   * glyph (InfoHint.css). The one exception is `insideControl`, which has no mark to tap and
   * keeps the region's tap.
   *
   * The element it points at must also carry `.info-hint-region`, which paints the cursor and the
   * mark's hover state.
   */
  hoverRegionRef: React.RefObject<HTMLElement | null>;
  /**
   * The region is itself a control, and the mark sits ON its label. It stops being a button,
   * because a button inside a button is invalid HTML and swallows the mark's focus into the
   * control around it; the region's own focus opens the card instead.
   *
   * Nothing is lost to a screen reader by this, but only because a control that hosts a mark
   * this way already names in its own accessible label whatever the mark explains. Check that
   * before passing this.
   */
  insideControl?: boolean;
  placement?: HoverCardPlacement;
  /**
   * Opened by the caller and kept open, for a control reporting an outcome the player did not
   * ask to read. Pair it with `onDismiss`, or Escape closes a card this prop reopens on the
   * next render.
   */
  heldOpen?: boolean;
  /** Extra class on the card, for a caller whose copy is not a hint. */
  cardClassName?: string;
  onDismiss?: () => void;
}

/**
 * A superscript `?` set on a label, disclosing an explanation of the control that label names.
 *
 * The card is portalled to `<body>` rather than rendered next to the mark: the launcher panes
 * that host it clip (`.launcher-pane` is `overflow: hidden` and its body scrolls), which would
 * cut the card off.
 */
export const InfoHint: React.FC<InfoHintProps> = ({
  label,
  text,
  hoverRegionRef,
  insideControl = false,
  placement = 'inline',
  heldOpen = false,
  cardClassName,
  onDismiss,
}) => {
  const [focused, setFocused] = useState(false);
  // Opened by activating the mark: a tap, a pen, Enter/Space, or an assistive technology's click.
  const [toggled, setToggled] = useState(false);
  const markRef = useRef<HTMLButtonElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const cardId = useId();

  // A pointer press focuses the mark, and focus outlives the pointer. Without this the mark
  // latches open on click and stays open after the cursor has left the label, which is not what a
  // hover hint should do. Keyboard focus has no preceding pointerdown, so it still opens.
  const focusFromPointer = useRef(false);

  // The activation in progress, recorded where it starts (pointerdown) and spent by the click
  // that ends it. The click decides from the state as it was at the
  // START: a tap in Chrome focuses the mark between its pointerup and its click, and that focus
  // opens the card, so judging by the state at click time would shut the card the same tap opened.
  const activation = useRef<{ hovers: boolean; wasOpen: boolean } | null>(null);

  // Memoized: the card re-measures and re-places whenever its content changes identity, and a
  // segment list renders to a fresh node array on every call.
  const content = useMemo(() => renderHintText(text), [text]);
  const { open, card, close } = useHoverCard({
    content,
    // The card is aimed at the MARK, not at the region that opened it: the caret has to land on
    // the `?` for the card to read as that mark's footnote rather than as a tooltip on the row.
    anchorRef: insideControl ? inkRef : markRef,
    regionRef: hoverRegionRef,
    // Defaults beside the mark: the pickers are stacked, so a card below its own anchor covers
    // the setting the player was just comparing this one against.
    placement,
    // A `?` is asked, not passed over: nothing else in the row wants this pointer, so the only
    // thing a long dwell would filter here is the user's own question. Not zero — a hint that
    // opens on the frame the pointer crosses the label's edge fires while the eye is still
    // traveling, and the row flashes cards at anyone scrolling the column with a mouse on it.
    dwellMs: 90,
    cardId,
    cardClassName,
    forceOpen: heldOpen || (!insideControl && (focused || toggled)),
    // The mark runs its own focus so it can filter out the focus a pointer press brings with it,
    // which it can only do while it has focus to run. Inside a control it has none, and the
    // region's focus is the only keyboard path to the card.
    openOnFocus: insideControl,
    // A tap on the label is the control's: the mark is touch's trigger. Inside a control there is
    // no mark to tap, so the region keeps it.
    regionTouch: insideControl,
    onDismiss: () => {
      setFocused(false);
      setToggled(false);
      onDismiss?.();
    },
  });
  const openRef = useRef(open);
  openRef.current = open;

  if (insideControl) {
    return (
      <>
        {/* Ink, and hidden from the reader that already has this fact from the control's own
            accessible name — see `insideControl`. */}
        <span ref={inkRef} className={`info-hint${open ? ' is-open' : ''}`} aria-hidden="true">
          <MarkGlyph />
        </span>
        {card}
      </>
    );
  }

  return (
    <>
      <button
        ref={markRef}
        type="button"
        className={`info-hint${open ? ' is-open' : ''}`}
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? cardId : undefined}
        onPointerDown={(event) => {
          focusFromPointer.current = true;
          // Cleared on the next frame, because the focus this suppresses is dispatched during the
          // press itself. Safari does not focus a button on press at all, so a flag that only
          // cleared on blur would stay set there and swallow the user's next Tab into the mark.
          requestAnimationFrame(() => {
            focusFromPointer.current = false;
          });
          activation.current = { hovers: pointerHovers(event.pointerType), wasOpen: openRef.current };
        }}
        // A touch that turns into a scroll never clicks, and must not leave its start behind for
        // the next activation to read.
        onPointerCancel={() => {
          activation.current = null;
        }}
        // A mouse that presses and then drags off never clicks here either. Only a hovering
        // pointer: a tap's own leave lands between its pointerup and its click.
        onPointerLeave={(event) => {
          if (pointerHovers(event.pointerType)) activation.current = null;
        }}
        onClick={() => {
          const started = activation.current;
          activation.current = null;
          // A mouse already has the card from hovering the label, and leaving the label is what
          // closes it; a click toggling it as well would leave a card latched on a row the
          // pointer has moved off.
          if (started?.hovers) return;
          // No recorded start is an assistive technology's click, which can arrive with the focus
          // it moved here and so after that focus has opened the card. Only an open this mark
          // was asked for counts as open to it, so its activation never shuts what it just opened.
          const wasOpen = started ? started.wasOpen : toggled;
          if (wasOpen) close();
          else setToggled(true);
        }}
        // Focus arrives already committed, so it opens with no dwell: the dwell filters out
        // pointers merely passing over the label, and a focus never merely passes.
        onFocus={() => {
          if (!focusFromPointer.current) setFocused(true);
        }}
        // Leaving the mark by keyboard closes what Enter opened, as it closes what focus opened.
        onBlur={() => {
          focusFromPointer.current = false;
          activation.current = null;
          setFocused(false);
          setToggled(false);
        }}
        // Nothing here opens on hover: the region contains this button, so a second hover path
        // here would open the card the moment the pointer reached the mark, jumping the dwell.
      >
        <MarkGlyph />
      </button>
      {card}
    </>
  );
};
