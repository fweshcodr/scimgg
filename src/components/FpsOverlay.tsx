import type React from 'react';
import { useEffect, useRef } from 'react';
import { fpsReporter } from '../render/core/fpsReporter';
import { THEME } from '../theme';
import './FpsOverlay.css';

interface FpsOverlayProps {
  visible: boolean;
  /**
   * Window pixels for the readout's top-right corner: `right` from the window's right edge. The
   * desktop top chrome passes one, so the readout sits under Plugins, flush with its right edge
   * (layout/topChromeLayout.ts `fpsPosition`). Absent, it sits in its corner.
   */
  position?: { readonly right: number; readonly top: number } | null;
  /**
   * A small opaque backing (the panel's solid fill, a 1px border), so the readout stays legible over
   * the minimap and the packs' stone art. Click-through all the same. The desktop top chrome's.
   */
  backed?: boolean;
  /** Plugins is sliding with its drawer: the readout under it follows on the drawer's curve. */
  sliding?: boolean;
}

/** The readout's own corner: 4px down, 8px in from the window's right edge. */
export const FPS_OVERLAY_INSET = { top: 4, right: 8 } as const;

/**
 * What the readout reserves for a value with `digits` digits: as many of the face's widest digit.
 * RuneScape Plain 12 has no tabular figures; its digits advance 6 to 8px, and "8" is one of the
 * widest (with 0, 2, 6 and 9). So 59 and 61, or 140 and 145, take the same box, and the readout's
 * width steps only when the count of digits does. The placeholder dash is one digit wide.
 */
export function fpsSizer(digits: number): string {
  return '8'.repeat(Math.max(1, digits));
}

/**
 * Lightweight FPS counter overlay. Displays the *actual rendered* frame rate
 * published by the active viewport render loop via {@link fpsReporter} — so it
 * reflects an FPS cap rather than the browser's raw vsync cadence (which keeps
 * firing at the display refresh regardless of any cap).
 */
/**
 * How far in from the box's left edge a value `valueWidth` wide starts in a sizer `sizerWidth` wide:
 * centered, on a whole pixel, so the pixel face is never drawn at a half-pixel offset. A value wider
 * than its sizer (a face wider than Plain 12) starts at the edge and the box grows to it.
 */
export function fpsValueOffset(sizerWidth: number, valueWidth: number): number {
  return Math.floor(Math.max(0, sizerWidth - valueWidth) / 2);
}

export const FpsOverlay: React.FC<FpsOverlayProps> = ({ visible, position, backed = false, sliding = false }) => {
  const valueRef = useRef<HTMLSpanElement>(null);
  const sizerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible) return;
    // Written straight to the DOM, once a second, without a render. The sizer changes only with the
    // number of digits; the value is centered in it (144 in 888's box, 60 in 88's).
    const show = (fps: number) => {
      const value = valueRef.current;
      const sizerNode = sizerRef.current;
      const text = `${fps}`;
      if (value) value.textContent = text;
      const sizer = fpsSizer(text.length);
      if (sizerNode && sizerNode.textContent !== sizer) sizerNode.textContent = sizer;
      if (value && sizerNode) value.style.marginLeft = `${fpsValueOffset(sizerNode.offsetWidth, value.offsetWidth)}px`;
    };
    // Seed with the latest known value so the overlay isn't blank for up to a
    // second after opening.
    const seed = fpsReporter.get();
    if (seed > 0) show(seed);
    return fpsReporter.subscribe(show);
  }, [visible]);

  if (!visible) return null;

  // Fixed at 1x rather than following Auto: the RuneScape faces are crisp only at 16px
  // (unitsPerEm 16), and it sits above the open drawer's close button. Plain 12 has the
  // em-dash placeholder glyph; Plain 11 does not.
  return (
    <div
      data-testid="fps-overlay"
      className={`fps-overlay${backed ? ' fps-overlay--backed' : ''}${sliding ? ' fps-overlay--sliding' : ''}`}
      style={{
        ...(position
          ? { position: 'fixed', right: position.right, top: position.top }
          : { position: 'absolute', top: FPS_OVERLAY_INSET.top, right: FPS_OVERLAY_INSET.right }),
        fontFamily: '"RuneScape Plain 12", sans-serif',
        fontSize: 16,
        lineHeight: '16px',
        color: THEME.colors.textSecondary,
        pointerEvents: 'none',
        textShadow: '1px 1px 0 #000',
        userSelect: 'none',
      }}
    >
      {/* The value and an invisible sizer share one cell: the box is the sizer's width, the value
          centered in it, so the box holds still as the value changes. */}
      <span className="fps-overlay__box">
        <span ref={sizerRef} className="fps-overlay__sizer" aria-hidden="true">
          {fpsSizer(1)}
        </span>
        <span ref={valueRef} className="fps-overlay__value">
          —
        </span>
      </span>
    </div>
  );
};
