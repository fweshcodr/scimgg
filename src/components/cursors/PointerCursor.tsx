/**
 * The on-screen pointer shared by the tutorial demonstration cursor and the replay cursor.
 * The viewBox is the normal size in CSS pixels, so a point in the path is a pixel offset from the
 * cursor's position: the tip sits on the hotspot, which `.demo-cursor-arrow`'s transform-origin
 * also names, so scaling the arrow never moves where it points.
 */
export const POINTER_CURSOR_SIZE = { width: 21, height: 32 } as const;
export const POINTER_CURSOR_HOTSPOT = { x: 1, y: 1 } as const;

/** Tip, the straight left edge, the base the tail leaves from, the square-ended tail, the wing. */
const POINTER_CURSOR_PATH = 'M1 1L1 25.5L6.04 24.1L8.85 30.8L13.46 28.86L10.9 22.75L19 20.5Z';

export function CursorArrow() {
  return (
    <svg
      className="demo-cursor-arrow"
      width={POINTER_CURSOR_SIZE.width}
      height={POINTER_CURSOR_SIZE.height}
      viewBox={`0 0 ${POINTER_CURSOR_SIZE.width} ${POINTER_CURSOR_SIZE.height}`}
      fill="none"
      aria-hidden="true"
    >
      <path className="demo-cursor-pointer" d={POINTER_CURSOR_PATH} />
    </svg>
  );
}
