import type { ByteBuffer } from '../../io/ByteBuffer';
import { Type } from '../Type';

export class UnderlayType extends Type {
  color: number = 0;

  hue: number = 0;
  saturation: number = 0;
  lightness: number = 0;
  hueMultiplier: number = 0;

  override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
    if (opcode === 1) {
      this.color = buffer.readUnsignedMedium();
    }
  }

  override post(): void {
    this.calculateHsl();
  }

  private calculateHsl(): void {
    const r = ((this.color >> 16) & 0xff) / 256;
    const g = ((this.color >> 8) & 0xff) / 256;
    const b = (this.color & 0xff) / 256;

    let min = r;
    if (g < min) min = g;
    if (b < min) min = b;

    let max = r;
    if (g > max) max = g;
    if (b > max) max = b;

    let hue = 0;
    let sat = 0;
    const light = (min + max) / 2;

    if (min !== max) {
      if (light < 0.5) {
        sat = (max - min) / (max + min);
      } else {
        sat = (max - min) / (2 - max - min);
      }

      if (r === max) {
        hue = (g - b) / (max - min);
      } else if (g === max) {
        hue = 2 + (b - r) / (max - min);
      } else {
        hue = 4 + (r - g) / (max - min);
      }
    }

    hue /= 6;

    this.hue = Math.floor(hue * 256);
    this.saturation = Math.floor(sat * 256);
    this.lightness = Math.floor(light * 256);

    if (this.saturation < 0) this.saturation = 0;
    else if (this.saturation > 255) this.saturation = 255;

    if (this.lightness < 0) this.lightness = 0;
    else if (this.lightness > 255) this.lightness = 255;

    if (light > 0.5) {
      this.hueMultiplier = Math.floor((1 - light) * sat * 512);
    } else {
      this.hueMultiplier = Math.floor(light * sat * 512);
    }

    if (this.hueMultiplier < 1) {
      this.hueMultiplier = 1;
    }

    this.hue = Math.floor((this.hue * this.hueMultiplier) / 256);
  }
}

export class OverlayType extends Type {
  color: number = 0;
  texture: number = -1;
  secondaryColor: number = -1;
  hideUnderlay: boolean = true;

  hue: number = 0;
  saturation: number = 0;
  lightness: number = 0;

  secondaryHue: number = 0;
  secondarySaturation: number = 0;
  secondaryLightness: number = 0;

  override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
    if (opcode === 1) {
      this.color = buffer.readUnsignedMedium();
    } else if (opcode === 2) {
      this.texture = buffer.readUnsignedByte();
    } else if (opcode === 3) {
      if (this.cacheInfo.game === 'runescape') {
        this.texture = buffer.readUnsignedShort();
      }
    } else if (opcode === 5) {
      this.hideUnderlay = false;
    } else if (opcode === 7) {
      this.secondaryColor = buffer.readUnsignedMedium();
    } else if (opcode === 8) {
      // blending - ignore
    } else if (opcode === 9) {
      // scale - RS3 only
      buffer.readUnsignedShort();
    } else if (opcode === 10) {
      // blocking - RS3 only
    } else if (opcode === 11) {
      // brightness - RS3 only
      buffer.readUnsignedByte();
    }
  }

  override post(): void {
    this.calculateHsl();
  }

  private calculateHsl(): void {
    if (this.secondaryColor !== -1) {
      this.calculateHslFrom(this.secondaryColor, true);
    }
    this.calculateHslFrom(this.color, false);
  }

  private calculateHslFrom(rgb: number, secondary: boolean): void {
    const r = ((rgb >> 16) & 0xff) / 256;
    const g = ((rgb >> 8) & 0xff) / 256;
    const b = (rgb & 0xff) / 256;

    let min = r;
    if (g < min) min = g;
    if (b < min) min = b;

    let max = r;
    if (g > max) max = g;
    if (b > max) max = b;

    let hue = 0;
    let sat = 0;
    const light = (min + max) / 2;

    if (min !== max) {
      if (light < 0.5) {
        sat = (max - min) / (max + min);
      } else {
        sat = (max - min) / (2 - max - min);
      }

      if (r === max) {
        hue = (g - b) / (max - min);
      } else if (g === max) {
        hue = 2 + (b - r) / (max - min);
      } else {
        hue = 4 + (r - g) / (max - min);
      }
    }

    hue /= 6;

    if (secondary) {
      this.secondaryHue = Math.floor(hue * 256);
      this.secondarySaturation = Math.floor(sat * 256);
      this.secondaryLightness = Math.floor(light * 256);
    } else {
      this.hue = Math.floor(hue * 256);
      this.saturation = Math.floor(sat * 256);
      this.lightness = Math.floor(light * 256);
    }
  }
}
