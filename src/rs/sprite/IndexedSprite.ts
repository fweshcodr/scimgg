export class IndexedSprite {
  width: number = 0;

  height: number = 0;

  subWidth: number = 0;

  subHeight: number = 0;

  xOffset: number = 0;

  yOffset: number = 0;

  pixels: Uint8Array = new Uint8Array(0);

  palette: Int32Array = new Int32Array(0);

  normalize(): void {
    if (this.subWidth !== this.width || this.subHeight !== this.height) {
      const pixels = new Uint8Array(this.width * this.height);
      let index = 0;

      for (let y = 0; y < this.subHeight; y++) {
        for (let x = 0; x < this.subWidth; x++) {
          pixels[x + (y + this.yOffset) * this.width + this.xOffset] = this.pixels[index++];
        }
      }

      this.pixels = pixels;
      this.subWidth = this.width;
      this.subHeight = this.height;
      this.xOffset = 0;
      this.yOffset = 0;
    }
  }

  flipHorizontally(): void {
    const pixels = new Uint8Array(this.pixels.length);
    let index = 0;

    for (let y = 0; y < this.subHeight; y++) {
      for (let x = this.subWidth - 1; x >= 0; x--) {
        pixels[index++] = this.pixels[x + y * this.subWidth];
      }
    }

    this.pixels = pixels;
    this.xOffset = this.width - this.subWidth - this.xOffset;
  }

  flipVertically(): void {
    const pixels = new Uint8Array(this.pixels.length);
    let index = 0;

    for (let y = this.subHeight - 1; y >= 0; y--) {
      for (let x = 0; x < this.subWidth; x++) {
        pixels[index++] = this.pixels[x + y * this.subWidth];
      }
    }

    this.pixels = pixels;
    this.yOffset = this.height - this.subHeight - this.yOffset;
  }
}

export function indexedSpriteToDataUrl(sprite: IndexedSprite): string {
  const { subWidth, subHeight, pixels, palette, xOffset, yOffset, width, height } = sprite;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < subHeight; y++) {
    for (let x = 0; x < subWidth; x++) {
      const paletteIndex = pixels[x + y * subWidth];
      if (paletteIndex === 0) continue;
      const color = palette[paletteIndex];
      const r = (color >> 16) & 0xff;
      const g = (color >> 8) & 0xff;
      const b = color & 0xff;
      const destX = x + xOffset;
      const destY = y + yOffset;
      const i = (destY * width + destX) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
