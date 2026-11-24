import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAT_HIGHLIGHT_COLORS } from '../core/events/gameMessages';
import type { OverheadTextSegment } from '../core/events/types';
import { makeWheelDetentReader } from '../input/wheelDetents';
import {
  FIXED_CHAT,
  FIXED_CHAT_AREA,
  FIXED_CHAT_BUTTON_Y,
  FIXED_CHAT_CONTROLS,
  FIXED_CHAT_DISPLAY,
  FIXED_CHAT_INPUT,
  FIXED_CHAT_LINE_HEIGHT,
  FIXED_CHAT_LINE_X,
  FIXED_CHAT_REPORT_SIZE,
  FIXED_CHAT_REPORT_X,
  FIXED_CHAT_SCROLL_ARROW,
  FIXED_CHAT_SCROLLAREA,
  FIXED_CHAT_SCROLLBAR,
  FIXED_CHAT_TAB_SIZE,
  FIXED_CHAT_TAB_SLOT_X,
  type Rect,
} from '../layout/osrsClientLayout';
import { CHATBOX, SCROLLBAR } from '../resourcePack';
import type { ChatLogEntry } from './chatLog';
import './Chatbox.css';
import { CHAT_ARROW_STEP, CHAT_WHEEL_STEP, chatScrollFromDragger, chatScrollGeometry } from './chatboxScroll';
import { PixelComposedLayer, tileFill } from './PixelComposedLayer';

/**
 * Labels for components 4/7/11/15/19/23/27, in slot order. `CHAT_FRIENDSCHAT`
 * is the fifth slot — the client has labeled it "Channel" since friends chat
 * was renamed, so the gameval name and the on-screen word differ here.
 */
const CHAT_TABS = ['All', 'Game', 'Public', 'Private', 'Channel', 'Clan', 'Trade'] as const;

/**
 * Every message shows, as under the client's All tab, so All is the selected tab and the other
 * six are drawn but never respond to the pointer.
 *
 * Clicking the selected All tab hides the chat, and clicking All while hidden reopens it. While
 * hidden no tab is selected, so All is drawn plain.
 *
 * DELIBERATE DEVIATION: the client only does this in the resizable modes. Here All toggles in
 * Fixed too, as Collapse already does: by simulator policy, hiding the chat works the same in
 * both modes.
 */
const ALL_TAB = 0;

/**
 * Every tab is two lines: the label (e.g. "Trade") over a blank line, with the filter state
 * drawn by a SECOND text component over the blank line — from the second tab up, which is why
 * "All" is the one single-line tab.
 *
 * The state strings live in enum 3844; every filter defaults to on, so "On" is what a fresh
 * client shows. #0dc10d is the green the client uses for this class of stone-button label.
 */
const TAB_FILTER_LABEL = 'On';
const TAB_FILTER_COLOR = '#0dc10d';
const FIRST_FILTERED_TAB = 1;

/**
 * Two lines have to fit inside a 22px button, which is why the tabs are on the
 * p11 face rather than the p12 the chat lines use: two 12-tall rows overflow the
 * stone and the filter state spills out under the button. 10 rather than 11 so
 * the pair is 20 in a 22px stone and the filter state is not jammed against the
 * bottom edge.
 */
const TAB_LINE_HEIGHT = 10;

/**
 * The em box these TTFs are cut for: `ascent-override: 81.25%` in index.css is
 * 13/16, so 16 is what puts a 13px ascent on the 14px line the client uses.
 */
const FONT_SIZE = 16;

/**
 * Tab labels are white on every stone, selected or not, and shadowed — the
 * chat lines are the black-on-parchment ones. The filter state underneath is
 * the only part that carries a color, and it is the state's color rather
 * than the label's: green while a filter is on, and the client uses other
 * colors for the states this chatbox never enters (orange for Friends, red
 * for Off).
 */
const TAB_LABEL_COLOR = '#ffffff';

/**
 * The client shows the local player's display name and a caret on the input row.
 * "Player" is what Practice's Stats already calls them, so the two agree rather than this
 * inventing a name.
 */
const INPUT_NAME = 'Player';

const MESSAGE_ORIGIN_X = FIXED_CHAT_SCROLLAREA.x + FIXED_CHAT_LINE_X;

/**
 * NPC public chat (chat type 116) is drawn as two components: "Name:" in the message color, then the text in the public chat color, set
 * `parawidth(name) + 3` to the right and wrapped in its own column.
 */
const SPEAKER_GAP = 3;

/**
 * How the text is drawn on each background. The messages and the input row are black without a
 * shadow on the opaque chatbox and white with a shadow on the transparent one, with blue for
 * public chat and the input caret: `0000ff` opaque, `9090ff` transparent, the struct defaults
 * RuneLite (BSD-2) records as `JagexColors.CHAT_PUBLIC_TEXT_{OPAQUE,TRANSPARENT}_BACKGROUND`.
 *
 * `CHAT_HIGHLIGHT_COLORS` are the `@mes_hl_red@`/`@mes_hl_gre@` colors the transparent and
 * mobile chatboxes use. The opaque chatbox draws a darker pair instead, so only it remaps
 * them. Literal colors (the grapple taunt's white body part and
 * #ff0000 tail) are drawn as sent on both, as the client does.
 */
interface ChatboxInk {
  readonly message: string;
  readonly publicText: string;
  readonly caret: string;
  readonly shadow: boolean;
  readonly highlights: Readonly<Record<string, string>>;
}

const OPAQUE_INK: ChatboxInk = {
  message: '#000000',
  publicText: '#0000ff',
  caret: '#0000ff',
  shadow: false,
  highlights: {
    [CHAT_HIGHLIGHT_COLORS.red]: '#e00a19',
    [CHAT_HIGHLIGHT_COLORS.green]: '#06600c',
  },
};

const TRANSPARENT_INK: ChatboxInk = {
  message: '#ffffff',
  publicText: '#9090ff',
  caret: '#9090ff',
  shadow: true,
  highlights: {},
};

/** The client's text shadow: black, one cache pixel down and right. */
function textShadow(ink: ChatboxInk, scale: number): string | undefined {
  return ink.shadow ? `${scale}px ${scale}px 0 #000` : undefined;
}

/** A straight line through (x0, y0) and (x1, y1), in truncating integer arithmetic. */
function interpolate(y0: number, y1: number, x0: number, x1: number, x: number): number {
  return y0 + Math.trunc(((y1 - y0) * (x - x0)) / (x1 - x0));
}

/** Interface transparency 0-255 as canvas alpha. */
const transAlpha = (trans: number) => (255 - trans) / 255;

/**
 * The transparent background outside mobile: CHATAREA in
 * 20 black bands fading from trans 253 at the top to 193 at the bottom, and two white hairlines
 * across CHATDISPLAY, at its top and 15 up from its bottom, in 20 segments fading from trans 200
 * on the left to 253 on the right.
 */
const TRANSPARENT_BANDS = 20;
/** The opaque chatbox's line over the input row, 15 up from CHATDISPLAY's bottom. */
const OPAQUE_INPUT_RULE = '#807660';
const INPUT_RULE_FROM_BOTTOM = 15;
/**
 * The controls row's stone backing is at transparency 155 on a transparent chatbox, and the
 * scrollbar is redrawn from the transparent set at 235 (track and dragger) and 180 (arrows).
 */
const TRANSPARENT_CONTROLS_TRANS = 155;
const TRANSPARENT_DRAGGER_TRANS = 235;
const TRANSPARENT_ARROW_TRANS = 180;

function drawTransparentBackground(flat: CanvasRenderingContext2D, chatAreaTop: number, displayTop: number): void {
  const areaHeight = FIXED_CHAT_AREA.height;
  const band = Math.trunc(areaHeight / TRANSPARENT_BANDS);
  const displayX = FIXED_CHAT_DISPLAY.x - FIXED_CHAT_AREA.x;
  const segment = Math.trunc(FIXED_CHAT_DISPLAY.width / TRANSPARENT_BANDS);
  const ruleY = displayTop + FIXED_CHAT_DISPLAY.height - INPUT_RULE_FROM_BOTTOM - 1;
  for (let i = 0; i < TRANSPARENT_BANDS; i++) {
    const last = i === TRANSPARENT_BANDS - 1;
    flat.fillStyle = `rgba(0, 0, 0, ${transAlpha(interpolate(253, 193, 0, TRANSPARENT_BANDS, i))})`;
    flat.fillRect(0, chatAreaTop + band * i, FIXED_CHAT_AREA.width, last ? areaHeight - band * i : band);
    flat.fillStyle = `rgba(255, 255, 255, ${transAlpha(interpolate(200, 253, 0, TRANSPARENT_BANDS, i))})`;
    flat.fillRect(displayX + segment * i, displayTop, segment, 1);
    flat.fillRect(displayX + segment * i, ruleY, segment, 1);
  }
}

/** Holding an arrow scrolls one step per 20ms client cycle. */
const ARROW_REPEAT_MS = 20;

/**
 * All and Collapse keep no focus after a click, where Space would press them again instead of
 * reaching the replay or the game (docs/agent-reference.md, Keyboard and focus policy).
 */
const preventFocusOnClick = (event: React.MouseEvent) => event.preventDefault();

function Segments({ segments, ink }: { readonly segments: readonly OverheadTextSegment[]; readonly ink: ChatboxInk }) {
  return segments.map((segment, index) => (
    <span
      // Segments are an immutable, ordered array per message; the index is their identity.
      // biome-ignore lint/suspicious/noArrayIndexKey: see above
      key={index}
      style={segment.color === undefined ? undefined : { color: ink.highlights[segment.color] ?? segment.color }}
    >
      {segment.text}
    </span>
  ));
}

const ChatLine = memo(function ChatLine({
  entry,
  scale,
  ink,
}: {
  readonly entry: ChatLogEntry;
  readonly scale: number;
  readonly ink: ChatboxInk;
}) {
  if (entry.kind === 'public' && entry.speaker !== undefined) {
    return (
      <div className="chatbox__line chatbox__line--speaker">
        <span className="chatbox__speaker" style={{ marginRight: SPEAKER_GAP * scale }}>
          {`${entry.speaker}:`}
        </span>
        <span className="chatbox__said" style={{ color: ink.publicText }}>
          <Segments segments={entry.segments} ink={ink} />
        </span>
      </div>
    );
  }
  return (
    <div className="chatbox__line">
      <Segments segments={entry.segments} ink={ink} />
    </div>
  );
});

/**
 * Track and arrows as the client sizes them; the dragger is sized and placed by
 * `chatScrollGeometry`, so it fills the trough until there is more than a screenful.
 *
 * Its own raster rather than part of the chatbox's: every dragger position is a new composed
 * bitmap, and caching one for the whole 519x165 chatbox per position would fill the shared
 * raster cache with megabyte surfaces. Inside this one raster the arrows, trough and dragger
 * still cannot round apart.
 */
interface ScrollbarArt {
  readonly track: string;
  readonly thumbTop: string;
  readonly thumbMiddle: string;
  readonly thumbBottom: string;
  readonly arrowUp: string;
  readonly arrowDown: string;
  /** Canvas alpha for the track and dragger, and for the arrows. */
  readonly draggerAlpha: number;
  readonly arrowAlpha: number;
}

function scrollbarArt(transparent: boolean): ScrollbarArt {
  return transparent
    ? {
        track: SCROLLBAR.transparentTrack,
        thumbTop: SCROLLBAR.transparentThumbTop,
        thumbMiddle: SCROLLBAR.transparentThumbMiddle,
        thumbBottom: SCROLLBAR.transparentThumbBottom,
        arrowUp: SCROLLBAR.transparentArrowUp,
        arrowDown: SCROLLBAR.transparentArrowDown,
        draggerAlpha: transAlpha(TRANSPARENT_DRAGGER_TRANS),
        arrowAlpha: transAlpha(TRANSPARENT_ARROW_TRANS),
      }
    : {
        track: SCROLLBAR.track,
        thumbTop: SCROLLBAR.thumbTop,
        thumbMiddle: SCROLLBAR.thumbMiddle,
        thumbBottom: SCROLLBAR.thumbBottom,
        arrowUp: SCROLLBAR.arrowUp,
        arrowDown: SCROLLBAR.arrowDown,
        draggerAlpha: 1,
        arrowAlpha: 1,
      };
}

function drawScrollbar(
  flat: CanvasRenderingContext2D,
  images: ReadonlyMap<string, HTMLImageElement>,
  art: ScrollbarArt,
  thumbTop: number,
  thumbHeight: number,
): void {
  const { width, height } = FIXED_CHAT_SCROLLBAR;
  const trackTop = FIXED_CHAT_SCROLL_ARROW;
  const trackHeight = height - FIXED_CHAT_SCROLL_ARROW * 2;

  flat.globalAlpha = art.draggerAlpha;
  const track = images.get(art.track);
  if (track) tileFill(flat, track, 0, trackTop, width, trackHeight);

  const capTop = images.get(art.thumbTop);
  const middle = images.get(art.thumbMiddle);
  const capBottom = images.get(art.thumbBottom);
  if (capTop && middle && capBottom) {
    const capHeight = capTop.naturalHeight;
    const middleHeight = thumbHeight - capHeight * 2;
    flat.drawImage(capTop, 0, thumbTop, width, capHeight);
    if (middleHeight > 0) tileFill(flat, middle, 0, thumbTop + capHeight, width, middleHeight);
    flat.drawImage(capBottom, 0, thumbTop + thumbHeight - capHeight, width, capHeight);
  }

  flat.globalAlpha = art.arrowAlpha;
  const arrowUp = images.get(art.arrowUp);
  if (arrowUp) flat.drawImage(arrowUp, 0, 0, width, FIXED_CHAT_SCROLL_ARROW);
  const arrowDown = images.get(art.arrowDown);
  if (arrowDown) flat.drawImage(arrowDown, 0, height - FIXED_CHAT_SCROLL_ARROW, width, FIXED_CHAT_SCROLL_ARROW);
  flat.globalAlpha = 1;
}

interface ChatboxProps {
  /**
   * Where the chatbox sits in its overlay layer, in CSS pixels, from `chatboxPlacement`: fixed
   * draws it inside the frame, the resizable layouts at the screen's bottom-left.
   */
  readonly rect: Rect;
  /** Logical cache pixels to physical CSS pixels, for everything drawn inside it. */
  readonly scale: number;
  readonly visible: boolean;
  /**
   * The client's "Transparent chatbox": no parchment, white shadowed text. Resizable only; the
   * caller passes false for Fixed, where the client refuses it.
   */
  readonly transparent?: boolean;
  /**
   * The client's "Click through transparent chatbox", read only while transparent. Clicks on the
   * message area reach the scene behind; the controls row and the scrollbar stay buttons, and the
   * wheel over the message area still scrolls the chat and never reaches the scene (CHAT_BACKGROUND
   * passes clicks through but not scrolls).
   */
  readonly clickThrough?: boolean;
  /**
   * The scene's input surface, whose wheel (the camera zoom) a click-through message area takes
   * for the chat. Only a wheel aimed at this element is taken: anything else over the chatbox,
   * such as a dialog portalled elsewhere, keeps its own. Without it the chat claims no wheel
   * beyond its own controls.
   */
  readonly sceneRef?: React.RefObject<HTMLElement | null>;
  readonly onToggle: () => void;
  /**
   * The run's chat lines at the displayed tick, oldest first, at most `CHAT_LOG_LIMIT`. Segment
   * colors are resolved hex; highlight colors come from `CHAT_HIGHLIGHT_COLORS`.
   */
  readonly messages: readonly ChatLogEntry[];
}

export const Chatbox = memo(function Chatbox({
  rect,
  scale,
  visible,
  transparent = false,
  clickThrough: clickThroughSetting = false,
  sceneRef,
  onToggle,
  messages,
}: ChatboxProps) {
  const ink = transparent ? TRANSPARENT_INK : OPAQUE_INK;
  const clickThrough = transparent && clickThroughSetting;
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  /** Where on the dragger the pointer took hold, in cache pixels; null while not dragging. */
  const dragGrab = useRef<number | null>(null);
  const [reportHovered, setReportHovered] = useState(false);
  const [allHovered, setAllHovered] = useState(false);
  const allSelected = visible;
  const allLit = allHovered;
  /** Logical height of the shown lines, wrapped, as laid out. */
  const [contentHeight, setContentHeight] = useState(0);
  /** Distance the view sits above the newest line; see `chatScrollGeometry`. */
  const [fromBottom, setFromBottom] = useState(0);
  const linesRef = useRef<HTMLDivElement>(null);
  const [wheelNotches] = useState(makeWheelDetentReader);
  const arrowTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Collapsed, only the controls row is mounted, so the surface starts there and
  // every cache rectangle below is measured from whichever top is in play.
  const origin = visible ? FIXED_CHAT : FIXED_CHAT_CONTROLS;
  const controlsTop = FIXED_CHAT_CONTROLS.y - origin.y;
  const buttonTop = controlsTop + FIXED_CHAT_BUTTON_Y;
  const chatAreaTop = FIXED_CHAT_AREA.y - origin.y;
  const displayTop = FIXED_CHAT_DISPLAY.y - origin.y;
  const scrollAreaTop = FIXED_CHAT_SCROLLAREA.y - origin.y;
  const scrollbarTop = FIXED_CHAT_SCROLLBAR.y - origin.y;
  const inputTop = FIXED_CHAT_INPUT.y - origin.y;

  const scroll = chatScrollGeometry(contentHeight, fromBottom);
  const maxScrollRef = useRef(scroll.maxScroll);
  maxScrollRef.current = scroll.maxScroll;

  // Wrapping depends on the font and the scale, so the height is read back from layout rather
  // than counted. Measure content/scale changes and reopening, plus an observer for size changes
  // and the late font swap, which re-wraps without a render. `offsetHeight`, not the
  // client rect: a fitted replay scales the whole frame by a transform, which the rect would
  // carry and `scale` does not.
  const measureLines = useCallback(() => {
    const lines = linesRef.current;
    setContentHeight(lines ? Math.round(lines.offsetHeight / scale) : 0);
  }, [scale]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages and visibility invalidate the measured DOM content, not the measuring callback.
  useLayoutEffect(measureLines, [measureLines, messages, visible]);
  const attachLines = useCallback(
    (lines: HTMLDivElement | null) => {
      linesRef.current = lines;
      if (!lines || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measureLines);
      observer.observe(lines);
      return () => {
        observer.disconnect();
        linesRef.current = null;
      };
    },
    [measureLines],
  );

  const scrollBy = useCallback((deltaY: number) => {
    // Scrolling down (towards newer lines) brings the view closer to the bottom.
    setFromBottom((previous) => Math.min(Math.max(previous - deltaY, 0), maxScrollRef.current));
  }, []);

  const stopArrow = useCallback(() => {
    if (arrowTimer.current !== null) clearInterval(arrowTimer.current);
    arrowTimer.current = null;
  }, []);
  // Collapsing unmounts the arrow mid-hold, so its pointerup never arrives.
  useEffect(() => {
    if (!visible) stopArrow();
    return stopArrow;
  }, [visible, stopArrow]);

  const startArrow = (deltaY: number) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    stopArrow();
    scrollBy(deltaY);
    arrowTimer.current = setInterval(() => scrollBy(deltaY), ARROW_REPEAT_MS);
  };

  const onWheel = (event: React.WheelEvent) => {
    // Ctrl is the browser's zoom and Alt the panel-resize gesture; both belong to their owners.
    if (event.ctrlKey || event.altKey) return;
    const notches = wheelNotches(event.nativeEvent);
    if (notches !== 0) scrollBy(notches * CHAT_WHEEL_STEP);
  };

  // Click-through takes the message area out of hit-testing, so the wheel over it lands on the
  // scene instead. The client keeps it: the chat scrolls, and the scene never sees it. Caught on
  // the way down, before the scene's own wheel listener, and only when the scene is what the
  // wheel landed on: anything else over the chatbox (a panel, a portalled dialog) answers its own.
  useEffect(() => {
    if (!clickThrough || !visible || !sceneRef) return;
    const onWindowWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.altKey) return;
      const root = rootRef.current;
      const area = scrollAreaRef.current;
      const scene = sceneRef.current;
      if (!root || !area || !scene) return;
      if (!(event.target instanceof Node) || !scene.contains(event.target)) return;
      // In client pixels, so a fitted replay's transform on the frame is already in the box.
      const box = root.getBoundingClientRect();
      const { clientX: x, clientY: y } = event;
      const chatAreaBottom = box.top + (box.height * FIXED_CHAT_AREA.height) / FIXED_CHAT.height;
      if (x < box.left || x >= box.right || y < box.top || y >= chatAreaBottom) return;
      event.preventDefault();
      event.stopPropagation();
      const lines = area.getBoundingClientRect();
      if (x < lines.left || x >= lines.right || y < lines.top || y >= lines.bottom) return;
      const notches = wheelNotches(event);
      if (notches !== 0) scrollBy(notches * CHAT_WHEEL_STEP);
    };
    window.addEventListener('wheel', onWindowWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWindowWheel, { capture: true });
  }, [clickThrough, visible, sceneRef, wheelNotches, scrollBy]);

  /**
   * The pointer's height down the scrollbar, in cache pixels. Measured against the scrollbar's
   * drawn height rather than divided by `scale`, which misses a fitted replay's outer transform.
   */
  const scrollbarY = (clientY: number) => {
    const box = scrollbarRef.current?.getBoundingClientRect();
    return box && box.height > 0 ? ((clientY - box.top) * FIXED_CHAT_SCROLLBAR.height) / box.height : 0;
  };
  const dragTo = (clientY: number, grab: number) => {
    setFromBottom(chatScrollFromDragger(contentHeight, scrollbarY(clientY) - grab - FIXED_CHAT_SCROLL_ARROW));
  };
  // A press on the dragger holds it where it was taken; on a press on the trough beside it the
  // dragger jumps to center on the pointer and is held there. Either way the drag runs until release.
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const y = scrollbarY(event.clientY);
    const onDragger = y >= scroll.thumbTop && y < scroll.thumbTop + scroll.thumbHeight;
    const grab = onDragger ? y - scroll.thumbTop : Math.trunc(scroll.thumbHeight / 2);
    dragGrab.current = grab;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (!onDragger) dragTo(event.clientY, grab);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragGrab.current !== null) dragTo(event.clientY, dragGrab.current);
  };
  const endDrag = () => {
    dragGrab.current = null;
  };

  // Rebuilt every render on purpose: these are pack-dependent getters, and the
  // layer diffs `sources` by content. Memoizing them would pin the chatbox to
  // whichever pack was active when it mounted.
  const sources = [
    CHATBOX.background,
    CHATBOX.buttonsBackgroundStones,
    CHATBOX.button,
    CHATBOX.buttonHovered,
    CHATBOX.buttonSelected,
    CHATBOX.buttonSelectedHovered,
    CHATBOX.reportButton,
    CHATBOX.reportButtonHovered,
  ];

  const draw = useCallback(
    (flat: CanvasRenderingContext2D, images: ReadonlyMap<string, HTMLImageElement>) => {
      if (visible && transparent) {
        drawTransparentBackground(flat, chatAreaTop, displayTop);
      } else if (visible) {
        const background = images.get(CHATBOX.background);
        if (background) {
          flat.drawImage(background, 0, chatAreaTop, FIXED_CHAT_AREA.width, FIXED_CHAT_AREA.height);
        }
        flat.fillStyle = OPAQUE_INPUT_RULE;
        flat.fillRect(
          FIXED_CHAT_DISPLAY.x - FIXED_CHAT_AREA.x,
          displayTop + FIXED_CHAT_DISPLAY.height - INPUT_RULE_FROM_BOTTOM - 1,
          FIXED_CHAT_DISPLAY.width,
          1,
        );
      }

      const stones = images.get(CHATBOX.buttonsBackgroundStones);
      if (stones) {
        flat.globalAlpha = transparent ? transAlpha(TRANSPARENT_CONTROLS_TRANS) : 1;
        flat.drawImage(stones, 0, controlsTop, FIXED_CHAT_CONTROLS.width, FIXED_CHAT_CONTROLS.height);
        flat.globalAlpha = 1;
      }

      FIXED_CHAT_TAB_SLOT_X.forEach((x, index) => {
        // Four states: selected, selected and hovered, hovered, plain.
        const isAll = index === ALL_TAB;
        const selected = isAll && allSelected;
        const lit = isAll && allLit;
        const src = selected
          ? lit
            ? CHATBOX.buttonSelectedHovered
            : CHATBOX.buttonSelected
          : lit
            ? CHATBOX.buttonHovered
            : CHATBOX.button;
        const art = images.get(src);
        if (art) flat.drawImage(art, x, buttonTop, FIXED_CHAT_TAB_SIZE.width, FIXED_CHAT_TAB_SIZE.height);
      });

      const report = images.get(reportHovered ? CHATBOX.reportButtonHovered : CHATBOX.reportButton);
      if (report) {
        flat.drawImage(
          report,
          FIXED_CHAT_REPORT_X,
          buttonTop,
          FIXED_CHAT_REPORT_SIZE.width,
          FIXED_CHAT_REPORT_SIZE.height,
        );
      }
    },
    [visible, transparent, reportHovered, allSelected, allLit, controlsTop, buttonTop, chatAreaTop, displayTop],
  );

  const scrollbar = scrollbarArt(transparent);
  const scrollbarSources = [
    scrollbar.arrowUp,
    scrollbar.arrowDown,
    scrollbar.track,
    scrollbar.thumbTop,
    scrollbar.thumbMiddle,
    scrollbar.thumbBottom,
  ];
  const { thumbTop, thumbHeight } = scroll;
  const drawScrollbarLayer = useCallback(
    (flat: CanvasRenderingContext2D, images: ReadonlyMap<string, HTMLImageElement>) =>
      drawScrollbar(flat, images, scrollbarArt(transparent), thumbTop, thumbHeight),
    [transparent, thumbTop, thumbHeight],
  );

  /*
   * The cache calls this the report button and its sprite is `report_button`, but the only
   * thing it does here is fold the chatbox away — labeling it "Report" named the sprite's
   * origin rather than the behavior, on the one control the chatbox actually has.
   */
  const toggleLabel = visible ? 'Collapse' : 'Expand';
  const reportTitle = visible ? 'Collapse the chatbox' : 'Expand the chatbox';

  return (
    <div
      ref={rootRef}
      className={`chatbox${transparent ? ' chatbox--transparent' : ''}${clickThrough ? ' chatbox--click-through' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <PixelComposedLayer
        cacheKey={`chatbox|${sources.join('|')}|${visible}|${transparent}|${reportHovered}|${allSelected}|${allLit}`}
        width={origin.width}
        height={origin.height}
        cssSize={{ width: origin.width * scale, height: origin.height * scale }}
        sources={sources}
        draw={draw}
      />

      {visible && (
        <div
          ref={scrollAreaRef}
          className="chatbox__scrollarea"
          style={{
            left: FIXED_CHAT_SCROLLAREA.x * scale,
            top: scrollAreaTop * scale,
            width: FIXED_CHAT_SCROLLAREA.width * scale,
            height: FIXED_CHAT_SCROLLAREA.height * scale,
          }}
          onWheel={onWheel}
        >
          <div
            ref={attachLines}
            className="chatbox__lines"
            style={{
              left: FIXED_CHAT_LINE_X * scale,
              width: (FIXED_CHAT_SCROLLAREA.width - FIXED_CHAT_LINE_X) * scale,
              bottom: scroll.linesBottom * scale,
              fontSize: FONT_SIZE * scale,
              lineHeight: `${FIXED_CHAT_LINE_HEIGHT * scale}px`,
              color: ink.message,
              textShadow: textShadow(ink, scale),
            }}
          >
            {messages.map((entry) => (
              <ChatLine key={entry.key} entry={entry} scale={scale} ink={ink} />
            ))}
          </div>
        </div>
      )}

      {visible && (
        <div
          ref={scrollbarRef}
          className="chatbox__scrollbar"
          style={{
            left: FIXED_CHAT_SCROLLBAR.x * scale,
            top: scrollbarTop * scale,
            width: FIXED_CHAT_SCROLLBAR.width * scale,
            height: FIXED_CHAT_SCROLLBAR.height * scale,
          }}
          onWheel={onWheel}
        >
          <PixelComposedLayer
            cacheKey={`chatbox-scrollbar|${scrollbarSources.join('|')}|${thumbTop}|${thumbHeight}`}
            width={FIXED_CHAT_SCROLLBAR.width}
            height={FIXED_CHAT_SCROLLBAR.height}
            cssSize={{ width: FIXED_CHAT_SCROLLBAR.width * scale, height: FIXED_CHAT_SCROLLBAR.height * scale }}
            sources={scrollbarSources}
            draw={drawScrollbarLayer}
          />
          {/* Pointer-only, like the wheel: the chat has no keyboard scrolling to stand in for. */}
          <div
            className="chatbox__trough"
            aria-hidden
            style={{
              top: FIXED_CHAT_SCROLL_ARROW * scale,
              height: (FIXED_CHAT_SCROLLBAR.height - FIXED_CHAT_SCROLL_ARROW * 2) * scale,
            }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          />
          <div
            className="chatbox__arrow"
            aria-hidden
            style={{ top: 0, height: FIXED_CHAT_SCROLL_ARROW * scale }}
            onPointerDown={startArrow(-CHAT_ARROW_STEP)}
            onPointerUp={stopArrow}
            onPointerLeave={stopArrow}
            onPointerCancel={stopArrow}
          />
          <div
            className="chatbox__arrow"
            aria-hidden
            style={{ bottom: 0, height: FIXED_CHAT_SCROLL_ARROW * scale }}
            onPointerDown={startArrow(CHAT_ARROW_STEP)}
            onPointerUp={stopArrow}
            onPointerLeave={stopArrow}
            onPointerCancel={stopArrow}
          />
        </div>
      )}

      {visible && (
        <div
          className="chatbox__input"
          style={{
            left: MESSAGE_ORIGIN_X * scale,
            top: inputTop * scale,
            height: FIXED_CHAT_INPUT.height * scale,
            fontSize: FONT_SIZE * scale,
            color: ink.message,
            textShadow: textShadow(ink, scale),
          }}
        >
          {`${INPUT_NAME}: `}
          <span style={{ color: ink.caret }}>*</span>
        </div>
      )}

      {/* The controls row blocks clicks between its buttons too (CONTROLS takes clicks); only
          matters once click-through has taken the rest of the chatbox out. */}
      <div
        className="chatbox__controls"
        aria-hidden
        style={{ top: controlsTop * scale, height: FIXED_CHAT_CONTROLS.height * scale }}
      />

      {FIXED_CHAT_TAB_SLOT_X.map((x, index) => {
        const style = {
          left: x * scale,
          top: buttonTop * scale,
          width: FIXED_CHAT_TAB_SIZE.width * scale,
          height: FIXED_CHAT_TAB_SIZE.height * scale,
          fontSize: FONT_SIZE * scale,
          lineHeight: `${TAB_LINE_HEIGHT * scale}px`,
          color: TAB_LABEL_COLOR,
        };
        const label = (
          <>
            <span>{CHAT_TABS[index]}</span>
            {index >= FIRST_FILTERED_TAB && <span style={{ color: TAB_FILTER_COLOR }}>{TAB_FILTER_LABEL}</span>}
          </>
        );
        return index === ALL_TAB ? (
          <button
            type="button"
            key={CHAT_TABS[index]}
            className="chatbox__tab chatbox__tab--toggle"
            style={style}
            onMouseEnter={() => setAllHovered(true)}
            onMouseLeave={() => setAllHovered(false)}
            onMouseDown={preventFocusOnClick}
            onClick={onToggle}
            aria-expanded={visible}
          >
            {label}
          </button>
        ) : (
          <div key={CHAT_TABS[index]} className="chatbox__tab" aria-hidden style={style}>
            {label}
          </div>
        );
      })}

      <button
        type="button"
        className="chatbox__report"
        style={{
          left: FIXED_CHAT_REPORT_X * scale,
          top: buttonTop * scale,
          width: FIXED_CHAT_REPORT_SIZE.width * scale,
          height: FIXED_CHAT_REPORT_SIZE.height * scale,
          fontSize: FONT_SIZE * scale,
          color: TAB_LABEL_COLOR,
        }}
        onMouseEnter={() => setReportHovered(true)}
        onMouseLeave={() => setReportHovered(false)}
        onMouseDown={preventFocusOnClick}
        onClick={onToggle}
        title={reportTitle}
        aria-label={reportTitle}
        aria-expanded={visible}
      >
        {toggleLabel}
      </button>
    </div>
  );
});
