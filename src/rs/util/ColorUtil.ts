/**
 * HSL-to-RGB ported from rs-map-viewer. RS packs color as
 * (hue << 10) | (saturation << 7) | lightness:
 * - Hue: 6 bits (0-63) stored in bits 10-15
 * - Saturation: 3 bits (0-7) stored in bits 7-9
 * - Lightness: 7 bits (0-127) stored in bits 0-6
 */

/** Invalid/unset color marker */
export const INVALID_HSL_COLOR = 12345678;

export function brightenRgb(rgb: number, brightness: number): number {
  let r = (rgb >> 16) / 256.0;
  let g = ((rgb >> 8) & 255) / 256.0;
  let b = (rgb & 255) / 256.0;

  r = r ** brightness;
  g = g ** brightness;
  b = b ** brightness;

  const newR = (r * 256.0) | 0;
  const newG = (g * 256.0) | 0;
  const newB = (b * 256.0) | 0;

  return (newR << 16) | (newG << 8) | newB;
}

export function buildHslRgbPalette(brightness: number = 0.8, startSat: number = 0, endSat: number = 512): Int32Array {
  const palette = new Int32Array(0xffff);

  let paletteIndex = startSat * 128;

  for (let satHueIndex = startSat; satHueIndex < endSat; satHueIndex++) {
    // Extract hue (bits 3-8) and saturation (bits 0-2) from combined index
    const hue = (satHueIndex >> 3) / 64.0 + 0.0078125;
    const sat = (satHueIndex & 7) / 8.0 + 0.0625;

    for (let lightIndex = 0; lightIndex < 128; lightIndex++) {
      const light = lightIndex / 128.0;
      let r = light;
      let g = light;
      let b = light;

      if (sat !== 0.0) {
        let q: number;
        if (light < 0.5) {
          q = light * (1.0 + sat);
        } else {
          q = light + sat - light * sat;
        }

        const p = 2.0 * light - q;

        let hueR = hue + 0.3333333333333333;
        if (hueR > 1.0) hueR--;

        if (6.0 * hueR < 1.0) {
          r = p + (q - p) * 6.0 * hueR;
        } else if (2.0 * hueR < 1.0) {
          r = q;
        } else if (3.0 * hueR < 2.0) {
          r = p + (q - p) * (0.6666666666666666 - hueR) * 6.0;
        } else {
          r = p;
        }

        if (6.0 * hue < 1.0) {
          g = p + (q - p) * 6.0 * hue;
        } else if (2.0 * hue < 1.0) {
          g = q;
        } else if (3.0 * hue < 2.0) {
          g = p + (q - p) * (0.6666666666666666 - hue) * 6.0;
        } else {
          g = p;
        }

        let hueB = hue - 0.3333333333333333;
        if (hueB < 0.0) hueB++;

        if (6.0 * hueB < 1.0) {
          b = p + (q - p) * 6.0 * hueB;
        } else if (2.0 * hueB < 1.0) {
          b = q;
        } else if (3.0 * hueB < 2.0) {
          b = p + (q - p) * (0.6666666666666666 - hueB) * 6.0;
        } else {
          b = p;
        }
      }

      const ri = (r * 256.0) | 0;
      const gi = (g * 256.0) | 0;
      const bi = (b * 256.0) | 0;
      const rgb = (ri << 16) + (gi << 8) + bi;

      let finalRgb = brightenRgb(rgb, brightness);
      if (finalRgb === 0) {
        finalRgb = 1;
      }

      palette[paletteIndex++] = finalRgb;
    }
  }

  return palette;
}

export const HSL_RGB_MAP = buildHslRgbPalette(0.8, 0, 512);

export function packHsl(hue: number, saturation: number, lightness: number): number {
  // RS reduces saturation at high lightness values
  if (lightness > 179) {
    saturation = (saturation / 2) | 0;
  }
  if (lightness > 192) {
    saturation = (saturation / 2) | 0;
  }
  if (lightness > 217) {
    saturation = (saturation / 2) | 0;
  }
  if (lightness > 243) {
    saturation = (saturation / 2) | 0;
  }

  return ((saturation / 32) << 7) + ((hue / 4) << 10) + ((lightness / 2) | 0);
}

export function adjustUnderlayLight(hsl: number, light: number): number {
  if (hsl === -1) {
    return INVALID_HSL_COLOR;
  }

  light = ((hsl & 127) * light) >> 7;

  if (light < 2) {
    light = 2;
  } else if (light > 126) {
    light = 126;
  }

  return (hsl & 0xff80) + light;
}

export function adjustOverlayLight(hsl: number, light: number): number {
  if (hsl === -2) {
    return INVALID_HSL_COLOR;
  }

  if (hsl === -1) {
    if (light < 2) {
      light = 2;
    } else if (light > 126) {
      light = 126;
    }
    return light;
  }

  light = ((hsl & 127) * light) >> 7;

  if (light < 2) {
    light = 2;
  } else if (light > 126) {
    light = 126;
  }

  return (hsl & 0xff80) + light;
}

export function rgbToHsl(rgb: number): number {
  const r = ((rgb >> 16) & 255) / 256.0;
  const g = ((rgb >> 8) & 255) / 256.0;
  const b = (rgb & 255) / 256.0;

  let minRgb = r;
  if (g < r) minRgb = g;
  if (b < minRgb) minRgb = b;

  let maxRgb = r;
  if (g > r) maxRgb = g;
  if (b > maxRgb) maxRgb = b;

  let hueTemp = 0.0;
  let sat = 0.0;
  const light = (minRgb + maxRgb) / 2.0;

  if (minRgb !== maxRgb) {
    if (light < 0.5) {
      sat = (maxRgb - minRgb) / (minRgb + maxRgb);
    }
    if (light >= 0.5) {
      sat = (maxRgb - minRgb) / (2.0 - maxRgb - minRgb);
    }

    if (maxRgb === r) {
      hueTemp = (g - b) / (maxRgb - minRgb);
    } else if (maxRgb === g) {
      hueTemp = 2.0 + (b - r) / (maxRgb - minRgb);
    } else if (maxRgb === b) {
      hueTemp = 4.0 + (r - g) / (maxRgb - minRgb);
    }
  }

  hueTemp /= 6.0;

  const hue = (hueTemp * 256.0) | 0;
  let saturation = (sat * 256.0) | 0;
  let lightness = (light * 256.0) | 0;

  if (saturation < 0) saturation = 0;
  else if (saturation > 255) saturation = 255;

  if (lightness < 0) lightness = 0;
  else if (lightness > 255) lightness = 255;

  return packHsl(hue, saturation, lightness);
}

export function mixHsl(hslA: number, hslB: number): number {
  if (hslA === INVALID_HSL_COLOR || hslB === INVALID_HSL_COLOR) {
    return INVALID_HSL_COLOR;
  }
  if (hslA === -1) {
    return hslB;
  }
  if (hslB === -1) {
    return hslA;
  }

  let hue = (hslA >> 10) & 0x3f;
  let saturation = (hslA >> 7) & 0x7;
  let lightness = hslA & 0x7f;

  const hueB = (hslB >> 10) & 0x3f;
  const saturationB = (hslB >> 7) & 0x7;
  const lightnessB = hslB & 0x7f;

  hue += hueB;
  saturation += saturationB;
  lightness += lightnessB;

  hue >>= 1;
  saturation >>= 1;
  lightness >>= 1;

  return (hue << 10) + (saturation << 7) + lightness;
}
