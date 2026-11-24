import { type ClientLayoutMode, FIXED_CHAT, FIXED_CHAT_CONTROLS, type Rect, type Size } from './osrsClientLayout';

/**
 * Where the chatbox (interface group 162) sits in each layout, and how far overlays keep clear of it.
 *
 * Every desktop toplevel mounts the same 519x165 CHAT_CONTAINER, sized 519x165 outside mobile.
 * Fixed puts it at (0, 338) inside the 765x503 frame; both resizable layouts (enums 1130/1131) pin
 * it to the screen's bottom-left over the scene. Collapsed, only the 23px controls row is left.
 *
 * Mobile has no entry: its chat (601:49) is a different shape behind its own chat button, which
 * the simulator does not draw.
 */
export interface ChatboxPlacement {
  /** The chatbox's box in the overlay layer's CSS pixels. */
  readonly rect: Rect;
  /** Cache pixels to CSS pixels for everything drawn inside it. */
  readonly scale: number;
}

export interface ChatboxPlacementInput {
  readonly layout: ClientLayoutMode;
  readonly visible: boolean;
  /** The overlay layer's CSS size: the fixed frame, or the resizable viewport. */
  readonly frame: Size;
  /** Fixed: the frame's stretch factor. */
  readonly fixedScale: number;
  /** Resizable: the scale the side panel and minimap are drawn at. */
  readonly resizableScale: number;
  /** Resizable: CSS pixels a sidebar covers on the left, which the chatbox moves past like the launcher row. */
  readonly insetLeft: number;
}

export function chatboxPlacement(input: ChatboxPlacementInput): ChatboxPlacement | null {
  const shown = input.visible ? FIXED_CHAT : FIXED_CHAT_CONTROLS;
  switch (input.layout) {
    case 'mobile':
      return null;
    case 'fixed': {
      // Frame coordinates times the stretch, as the rest of the fixed chatbox is drawn.
      const scale = input.fixedScale;
      return {
        scale,
        rect: { x: shown.x * scale, y: shown.y * scale, width: shown.width * scale, height: shown.height * scale },
      };
    }
    case 'classic':
    case 'modern': {
      // Never wider than the room beside a sidebar: past that the tabs fall off the screen.
      const room = Math.max(0, input.frame.width - input.insetLeft);
      const scale = Math.max(0, Math.min(input.resizableScale, room / FIXED_CHAT.width));
      const height = shown.height * scale;
      return {
        scale,
        rect: { x: input.insetLeft, y: input.frame.height - height, width: FIXED_CHAT.width * scale, height },
      };
    }
  }
}

/**
 * How far above the layer's bottom edge something must start to sit clear of the chatbox. Not
 * rounded: the chatbox's own top is on whatever fraction its scale puts it, and a rounded
 * clearance would set a gap above it off by up to half a pixel.
 */
export function chatboxClearance(placement: ChatboxPlacement | null, frameHeight: number): number {
  return placement ? Math.max(0, frameHeight - placement.rect.y) : 0;
}
