import { packHsl } from '../../../rs/util/ColorUtil';

export const COLOR_BASE_STONE = packHsl(0, 0, 18);
export const COLOR_LIGHT_STONE = packHsl(0, 0, 24);
export const COLOR_DARK_STONE = packHsl(0, 0, 12);
export const COLOR_ACCENT_STONE = packHsl(0, 160, 32);
export const COLOR_ACCENT_DARK = packHsl(0, 128, 24);
export const COLOR_DECO_STONE = packHsl(0, 0, 18);
export const COLOR_EDGE_STONE = packHsl(0, 0, 14);
export const COLOR_GROUT = packHsl(0, 0, 8);
export const COLOR_DROP_DARK = packHsl(0, 0, 4);
export const COLOR_MAGIC_TEAL = packHsl(0, 224, 100);
export const COLOR_MAGIC_VIOLET = packHsl(0, 192, 80);

export function unpackHsl(packed: number): { h: number; s: number; l: number } {
  return {
    h: ((packed >> 10) & 0x3f) * 4,
    s: ((packed >> 7) & 0x07) * 32,
    l: (packed & 0x7f) * 2,
  };
}

export function darken(packed: number, amount: number): number {
  const { h, s, l } = unpackHsl(packed);
  return packHsl(h, s, Math.max(0, l - amount));
}

export function jitterLuminance(packed: number, amount: number): number {
  const { h, s, l } = unpackHsl(packed);
  return packHsl(h, s, Math.max(0, Math.min(255, l + amount)));
}
