import { afterEach, beforeEach, vi } from 'vitest';
import { resetImageCache } from '../../../util/imageCache';
import { uninstallHarnessEnvironment } from '../harnessEnvironment';

/**
 * The environment every suite that mounts the real App through the UI harness runs in: measured
 * viewport frames, a WebGL context that is refused and a network that is unavailable.
 *
 * The harness's value rests on booting the real app WITHOUT the two expensive subsystems. Both are
 * easy to reintroduce by accident (a new effect that probes the GPU, or a hook that fetches on
 * mount), so the returned lists record every WebGL context and request the App asks for. They are
 * emptied before each test, keeping their identity.
 */
export function registerMountedAppEnvironment(): { readonly glContexts: string[]; readonly requests: string[] } {
  const glContexts: string[] = [];
  const requests: string[] = [];
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realFetch = globalThis.fetch;
  const realRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    glContexts.length = 0;
    requests.length = 0;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('game-viewport-frame')
        ? Number.parseFloat(this.style.width) || window.innerWidth
        : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('game-viewport-frame')
        ? Number.parseFloat(this.style.height) || window.innerHeight
        : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('game-viewport-stage'))
        return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      if (this.classList.contains('game-viewport-frame')) {
        const offset = (value: string, size: number) =>
          (Number.parseFloat(value) || 0) * (value.endsWith('%') ? size / 100 : 1);
        return new DOMRect(
          offset(this.style.left, window.innerWidth) + offset(this.style.marginLeft, window.innerWidth),
          offset(this.style.top, window.innerHeight) + offset(this.style.marginTop, window.innerHeight),
          this.offsetWidth,
          this.offsetHeight,
        );
      }
      return realRect.call(this);
    });
    HTMLCanvasElement.prototype.getContext = function patched(this: HTMLCanvasElement, type: string, ...rest: never[]) {
      if (type.startsWith('webgl')) {
        glContexts.push(type);
        return null;
      }
      return (realGetContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.fetch = ((input: RequestInfo | URL) => {
      requests.push(String(input));
      return Promise.reject(new Error('network is not available in the UI harness'));
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.doUnmock('../terminalFixtures');
    vi.restoreAllMocks();
    // Vitest's spy registry keeps every spy for the life of the file, and restoring one keeps its
    // recorded calls, `this` contexts and results. The prototype spies above record every element
    // they measure, so without this each test's unmounted App tree would stay reachable.
    vi.clearAllMocks();
    delete document.body.dataset.harnessReady;
    delete document.body.dataset.harnessError;
    delete window.uiHarness;
    localStorage.clear();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    globalThis.fetch = realFetch;
    // Storage namespace and the seeded GPU probe are module globals: leaving
    // them installed would leak into whatever suite shares this worker.
    uninstallHarnessEnvironment();
    // happy-dom never fires an image's load or error, so the cache's in-flight loads stay pending
    // and every mount's `.then` callbacks (holding its canvas refs, and so its tree) pile up on them.
    resetImageCache();
  });

  return { glContexts, requests };
}
