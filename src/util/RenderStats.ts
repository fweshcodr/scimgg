import { LogLevel, log } from './Logger';

export interface FrameRenderStats {
  drawCalls: number;
  triangles: number;
  bufferUploads: number;
  bufferUploadBytes: number;
  textureBinds: number;
  vaoCacheHits: number;
  vaoCacheMisses: number;
  /** Animated meshes whose vertex count changed and were rewritten in place instead of rebuilt. */
  vaoRebuildsAvoided: number;
  /** Mesh buffers that outgrew their storage and were reallocated (grow-only). */
  bufferReallocations: number;
  shaderSwitches: number;
  commandCount: number;
  transparentSkippedSort: number;
  transparentFullSort: number;
  visibilityCacheHits: number;
  visibilityCacheMisses: number;
}

export interface RenderStatsSnapshot {
  frameCount: number;
  current: FrameRenderStats;
  avg: FrameRenderStats;
  max: FrameRenderStats;
  vaoCacheSize: number;
  textureCount: number;
  estimatedGpuMemoryMB: number;
}

const HISTORY_SIZE = 300;
const REPORT_INTERVAL_MS = 5000;

function emptyFrameStats(): FrameRenderStats {
  return {
    drawCalls: 0,
    triangles: 0,
    bufferUploads: 0,
    bufferUploadBytes: 0,
    textureBinds: 0,
    vaoCacheHits: 0,
    vaoCacheMisses: 0,
    vaoRebuildsAvoided: 0,
    bufferReallocations: 0,
    shaderSwitches: 0,
    commandCount: 0,
    transparentSkippedSort: 0,
    transparentFullSort: 0,
    visibilityCacheHits: 0,
    visibilityCacheMisses: 0,
  };
}

class RenderStats {
  private enabled = false;
  private current: FrameRenderStats = emptyFrameStats();
  private history: FrameRenderStats[] = [];
  private historyIndex = 0;
  private historyFull = false;
  private totalFrames = 0;
  private lastReportTime = 0;
  private reportIntervalMs = REPORT_INTERVAL_MS;

  private _vaoCacheSize = 0;
  private _textureCount = 0;
  private _estimatedGpuMemoryBytes = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.lastReportTime = performance.now();
      log.info('Perf', 'Enabled - reporting every %ds', this.reportIntervalMs / 1000);
    } else {
      log.info('Perf', 'Disabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setReportInterval(ms: number): void {
    this.reportIntervalMs = ms;
  }

  reset(): void {
    this.history = [];
    this.historyIndex = 0;
    this.historyFull = false;
    this.totalFrames = 0;
    this.lastReportTime = performance.now();
  }

  beginFrame(): void {
    if (!this.enabled) return;
    this.current = emptyFrameStats();
  }

  recordDrawCall(triangleCount: number): void {
    if (!this.enabled) return;
    this.current.drawCalls++;
    this.current.triangles += triangleCount;
  }

  recordBufferUpload(bytes: number): void {
    if (!this.enabled) return;
    this.current.bufferUploads++;
    this.current.bufferUploadBytes += bytes;
  }

  recordTextureBind(): void {
    if (!this.enabled) return;
    this.current.textureBinds++;
  }

  recordVaoCacheHit(): void {
    if (!this.enabled) return;
    this.current.vaoCacheHits++;
  }

  recordVaoCacheMiss(): void {
    if (!this.enabled) return;
    this.current.vaoCacheMisses++;
  }

  recordVaoRebuildAvoided(): void {
    if (!this.enabled) return;
    this.current.vaoRebuildsAvoided++;
  }

  recordBufferReallocation(): void {
    if (!this.enabled) return;
    this.current.bufferReallocations++;
  }

  recordShaderSwitch(): void {
    if (!this.enabled) return;
    this.current.shaderSwitches++;
  }

  recordCommandCount(count: number): void {
    if (!this.enabled) return;
    this.current.commandCount = count;
  }

  recordTransparentSkippedSort(): void {
    if (!this.enabled) return;
    this.current.transparentSkippedSort++;
  }

  recordTransparentFullSort(): void {
    if (!this.enabled) return;
    this.current.transparentFullSort++;
  }

  recordVisibilityCacheHit(): void {
    if (!this.enabled) return;
    this.current.visibilityCacheHits++;
  }

  recordVisibilityCacheMiss(): void {
    if (!this.enabled) return;
    this.current.visibilityCacheMisses++;
  }

  setVaoCacheSize(size: number): void {
    this._vaoCacheSize = size;
  }

  setTextureCount(count: number): void {
    this._textureCount = count;
  }

  /** Allocated mesh buffer bytes (capacity, not just the drawn range); textures are not included. */
  setEstimatedGpuMemoryBytes(bytes: number): void {
    this._estimatedGpuMemoryBytes = bytes;
  }

  endFrame(): void {
    if (!this.enabled) return;
    this.totalFrames++;

    if (this.history.length < HISTORY_SIZE) {
      this.history.push({ ...this.current });
    } else {
      this.history[this.historyIndex] = { ...this.current };
      this.historyFull = true;
    }
    this.historyIndex = (this.historyIndex + 1) % HISTORY_SIZE;

    const now = performance.now();
    if (now - this.lastReportTime >= this.reportIntervalMs) {
      this.report();
      this.lastReportTime = now;
    }
  }

  getSnapshot(): RenderStatsSnapshot {
    const entries = this.historyFull ? this.history : this.history.slice(0, this.history.length);
    const count = entries.length;

    const avg = emptyFrameStats();
    const max = emptyFrameStats();

    if (count > 0) {
      for (const e of entries) {
        const keys = Object.keys(avg) as (keyof FrameRenderStats)[];
        for (const k of keys) {
          (avg[k] as number) += e[k];
          if (e[k] > max[k]) (max[k] as number) = e[k];
        }
      }
      const keys = Object.keys(avg) as (keyof FrameRenderStats)[];
      for (const k of keys) {
        (avg[k] as number) /= count;
      }
    }

    return {
      frameCount: this.totalFrames,
      current: { ...this.current },
      avg,
      max,
      vaoCacheSize: this._vaoCacheSize,
      textureCount: this._textureCount,
      estimatedGpuMemoryMB: this._estimatedGpuMemoryBytes / (1024 * 1024),
    };
  }

  report(): void {
    const snap = this.getSnapshot();
    if (snap.frameCount === 0) return;
    if (!log.isEnabled(LogLevel.INFO, 'Perf')) return;

    const lines = [
      `===== RENDER STATS REPORT =====`,
      `  Draw calls: avg=${snap.avg.drawCalls.toFixed(1)} max=${snap.max.drawCalls} current=${snap.current.drawCalls}`,
      `  Triangles:  avg=${snap.avg.triangles.toFixed(0)} max=${snap.max.triangles} current=${snap.current.triangles}`,
      `  Commands/frame: avg=${snap.avg.commandCount.toFixed(0)} max=${snap.max.commandCount}`,
      `  Shader switches/frame: avg=${snap.avg.shaderSwitches.toFixed(1)} max=${snap.max.shaderSwitches}`,
      `  Buffer uploads/frame: avg=${snap.avg.bufferUploads.toFixed(1)} bytes/frame: avg=${(snap.avg.bufferUploadBytes / 1024).toFixed(1)}KB`,
      `  Texture binds/frame: avg=${snap.avg.textureBinds.toFixed(1)}`,
      `  VAO cache: hits=${snap.avg.vaoCacheHits.toFixed(1)} misses=${snap.avg.vaoCacheMisses.toFixed(1)} size=${snap.vaoCacheSize}`,
      `  VAO rebuilds avoided/frame: avg=${snap.avg.vaoRebuildsAvoided.toFixed(1)} | buffer reallocations/frame: avg=${snap.avg.bufferReallocations.toFixed(2)}`,
      `  GPU memory estimate: ${snap.estimatedGpuMemoryMB.toFixed(1)}MB | Textures: ${snap.textureCount}`,
      `  --- SpotAnim Code Paths ---`,
      `  Transparent: skipSort=${snap.avg.transparentSkippedSort.toFixed(0)} fullSort=${snap.avg.transparentFullSort.toFixed(0)}`,
      `  Visibility cache: hits=${snap.avg.visibilityCacheHits.toFixed(0)} misses=${snap.avg.visibilityCacheMisses.toFixed(0)}`,
      `  ====================================`,
    ];
    console.log(lines.join('\n'));
  }
}

export const renderStats = new RenderStats();
