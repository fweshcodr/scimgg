import type { AssetManager } from '../../core/assets';
import type { Viewport } from '../../core/camera';
import type { FillStyle, RadialGradient, RenderCommand, StrokeStyle } from '../../core/commands';
import { isRadialGradient } from '../../core/commands';
import { getBackingStoreDimensions } from '../../core/raster';
import type { Renderer, RenderFrame } from '../../core/renderer';
import { createNullAssetManager } from '../../core/renderer';
import type { ColorRGBA, Vec2 } from '../../core/types';
import { rgbaToCSS } from '../../core/types';

export class Canvas2DRenderer implements Renderer {
  readonly id = 'canvas2d';
  readonly assets: AssetManager;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private viewport: Viewport = { width: 800, height: 600, dpr: 1 };

  // Pre-allocated buckets for z-index sorting (avoids array allocation + sort every frame)
  private readonly zBuckets: RenderCommand[][] = [];
  private readonly NUM_BUCKETS = 12;

  constructor() {
    this.assets = createNullAssetManager();
    for (let i = 0; i < this.NUM_BUCKETS; i++) {
      this.zBuckets[i] = [];
    }
  }

  supports(kind: '2d' | '3d'): boolean {
    return kind === '2d';
  }

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    // Opaque backing store: this canvas paints the full scene every frame
    // (queue.clear fills it), and an { alpha: false } context lets the
    // browser keep subpixel/bilevel text AA for fillText (tile labels etc.)
    // instead of degrading to grayscale on a transparent surface.
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) {
      throw new Error('Canvas2DRenderer: Failed to get 2D context');
    }
  }

  resize(viewport: Viewport): void {
    this.viewport = viewport;
    if (this.canvas) {
      const { width, height } = getBackingStoreDimensions(viewport);
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${viewport.width}px`;
      this.canvas.style.height = `${viewport.height}px`;
      if (this.ctx) {
        this.ctx.resetTransform();
        // Drawn in layout pixels; the backing store may be stretched per axis (Viewport.paintScale).
        this.ctx.scale(viewport.dpr * (viewport.paintScale?.x ?? 1), viewport.dpr * (viewport.paintScale?.y ?? 1));
      }
    }
  }

  render(frame: RenderFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const { queue } = frame;

    if (queue.clear) {
      ctx.fillStyle = rgbaToCSS(queue.clear.color);
      ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
    }

    for (let i = 0; i < this.NUM_BUCKETS; i++) {
      this.zBuckets[i].length = 0;
    }

    const commands = queue.commands;
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd.kind === 'mesh3d' || cmd.kind === 'sprite2d') continue;

      const z = cmd.zIndex ?? 0;
      const bucket = Math.min(Math.floor(z / 10), this.NUM_BUCKETS - 1);
      this.zBuckets[bucket].push(cmd);
    }

    for (let b = 0; b < this.NUM_BUCKETS; b++) {
      const bucket = this.zBuckets[b];
      for (let i = 0; i < bucket.length; i++) {
        this.executeCommand(ctx, bucket[i]);
      }
    }
  }

  private executeCommand(ctx: CanvasRenderingContext2D, cmd: RenderCommand): void {
    switch (cmd.kind) {
      case 'poly2d':
        this.drawPolygon(ctx, cmd.points, cmd.fill, cmd.stroke, cmd.closePath ?? true);
        break;
      case 'circle2d':
        this.drawCircle(ctx, cmd.center, cmd.radiusPx, cmd.fill, cmd.stroke);
        break;
      case 'ellipse2d':
        this.drawEllipse(ctx, cmd.center, cmd.radiusX, cmd.radiusY, cmd.fill, cmd.stroke);
        break;
      case 'text2d':
        this.drawText(ctx, cmd.position, cmd.text, cmd.color, cmd.font, cmd.shadow);
        break;
      case 'sprite2d':
      case 'mesh3d':
        break;
    }
  }

  private drawPolygon(
    ctx: CanvasRenderingContext2D,
    points: Vec2[],
    fill?: FillStyle,
    stroke?: StrokeStyle,
    closePath: boolean = true,
  ): void {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (closePath) {
      ctx.closePath();
    }

    if (fill) {
      ctx.fillStyle = this.toCanvasFill(ctx, fill);
      ctx.fill();
    }

    if (stroke) {
      ctx.strokeStyle = rgbaToCSS(stroke.color);
      ctx.lineWidth = stroke.widthPx;
      if (stroke.dash) {
        ctx.setLineDash(stroke.dash);
      }
      ctx.stroke();
      if (stroke.dash) {
        ctx.setLineDash([]);
      }
    }
  }

  private drawCircle(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radius: number,
    fill?: FillStyle,
    stroke?: StrokeStyle,
  ): void {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);

    if (fill) {
      ctx.fillStyle = this.toCanvasFill(ctx, fill, center, radius);
      ctx.fill();
    }

    if (stroke) {
      ctx.strokeStyle = rgbaToCSS(stroke.color);
      ctx.lineWidth = stroke.widthPx;
      ctx.stroke();
    }
  }

  private drawEllipse(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radiusX: number,
    radiusY: number,
    fill?: FillStyle,
    stroke?: StrokeStyle,
  ): void {
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);

    if (fill) {
      ctx.fillStyle = this.toCanvasFill(ctx, fill);
      ctx.fill();
    }

    if (stroke) {
      ctx.strokeStyle = rgbaToCSS(stroke.color);
      ctx.lineWidth = stroke.widthPx;
      ctx.stroke();
    }
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    position: Vec2,
    text: string,
    color: ColorRGBA,
    font?: string,
    shadow?: { color: ColorRGBA; blurPx: number; offsetPx: Vec2 },
  ): void {
    if (font) {
      ctx.font = font;
    }

    if (shadow) {
      ctx.shadowColor = rgbaToCSS(shadow.color);
      ctx.shadowBlur = shadow.blurPx;
      ctx.shadowOffsetX = shadow.offsetPx.x;
      ctx.shadowOffsetY = shadow.offsetPx.y;
    }

    ctx.fillStyle = rgbaToCSS(color);
    ctx.fillText(text, position.x, position.y);

    if (shadow) {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }

  private toCanvasFill(
    ctx: CanvasRenderingContext2D,
    fill: FillStyle,
    defaultCenter?: Vec2,
    defaultRadius?: number,
  ): string | CanvasGradient {
    if (!isRadialGradient(fill)) {
      return rgbaToCSS(fill);
    }

    const grad = fill as RadialGradient;
    const center = grad.center || defaultCenter || { x: 0, y: 0 };
    const radius = grad.radius || defaultRadius || 10;

    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
    for (const stop of grad.stops) {
      gradient.addColorStop(stop.offset, rgbaToCSS(stop.color));
    }
    return gradient;
  }

  dispose(): void {
    this.canvas = null;
    this.ctx = null;
  }
}

export function createCanvas2DRenderer(): Renderer {
  return new Canvas2DRenderer();
}
