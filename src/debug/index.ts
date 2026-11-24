/**
 * Dev-only WebGL debugging bootstrap.
 *
 * Loaded as a side-effect from `src/main.tsx` only when debug mode is enabled
 * in dev (`?debug=1` or `localStorage.yamaDebug = '1'`). The whole module —
 * and its `webgl-lint`, `tweakpane`, `stats.js` deps — is tree-shaken out of
 * production builds.
 */

import 'webgl-lint';
import Stats from 'stats.js';
import { Pane } from 'tweakpane';

/** Public debug surface, attached to `window.__yamaDebug` when UI is enabled. */
export interface YamaDebug {
  pane: Pane;
  stats: Stats;
  /**
   * Tag a WebGL object so webgl-lint references it by name in error messages.
   * Safe to call from anywhere; no-op if the lint extension isn't present.
   */
  tagObject: (gl: WebGLRenderingContext | WebGL2RenderingContext, obj: object, name: string) => void;
}

declare global {
  interface Window {
    __yamaDebug?: YamaDebug;
    /** Idempotency guard against HMR / accidental double-import. */
    __yamaDebugInstalled?: boolean;
  }
}

function isDebugUiEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('debug');
  const urlEnabled = param === '' || param === '1' || param === 'true';
  return urlEnabled || window.localStorage?.getItem('yamaDebug') === '1';
}

const VISIBLE_UI = isDebugUiEnabled();

function tagObject(gl: WebGLRenderingContext | WebGL2RenderingContext, obj: object, name: string): void {
  const ext = gl.getExtension('GMAN_debug_helper') as { tagObject(o: object, n: string): void } | null;
  ext?.tagObject(obj, name);
}

function installVisibleUI(): YamaDebug {
  // Stats overlay (top-left). Canonical begin/end/rAF pattern.
  const stats = new Stats();
  stats.showPanel(0); // 0 = FPS
  stats.dom.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;opacity:0.85;pointer-events:auto';
  document.body.appendChild(stats.dom);

  const statsLoop = (): void => {
    stats.begin();
    stats.end();
    requestAnimationFrame(statsLoop);
  };
  requestAnimationFrame(statsLoop);

  const pane = new Pane({ title: 'Yama Debug', expanded: true });
  pane.element.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;width:280px';

  return { pane, stats, tagObject };
}

if (!window.__yamaDebugInstalled) {
  if (VISIBLE_UI) {
    window.__yamaDebug = installVisibleUI();
  }
  window.__yamaDebugInstalled = true;

  // eslint-disable-next-line no-console
  console.info(
    '[debug] webgl-lint active.' +
      (VISIBLE_UI
        ? ' Stats + Tweakpane mounted.'
        : ' Add ?debug=1 or set localStorage.yamaDebug=1 for the visible panel.'),
  );
}
