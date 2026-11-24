export type Tick = number;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface TileCoord {
  x: number;
  y: number;
  level?: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function rgba(r: number, g: number, b: number, a = 1): ColorRGBA {
  return { r, g, b, a };
}

export function rgbaFromHex(hex: string, alpha = 1): ColorRGBA {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0, a: alpha };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
    a: alpha,
  };
}

export function rgbaToCSS(c: ColorRGBA): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
}
