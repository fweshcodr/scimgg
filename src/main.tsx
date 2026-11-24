import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installInputLatencyProfiler } from './debug/inputLatencyProfiler';
import { installRenderProfiler } from './debug/renderProfiler';
import { installInputModality } from './util/inputModality';
import { log } from './util/Logger';

document.addEventListener('dragstart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
installInputModality();

// No bzip2 bootstrap here: the production mirror is gzip-only, and CacheManager loads bzip2 on
// demand only when a cache may need it (dev's OpenRS2 mode, or a manifest without
// containerCompressions).

const REQUIRED_FONTS = [
  'RuneScape Plain 11',
  'RuneScape Plain 12',
  'RuneScape Bold 12',
  'RuneScape Quill 8',
  'RuneScape Small',
];

async function loadFonts(): Promise<void> {
  const loads = REQUIRED_FONTS.map((name) => document.fonts.load(`16px "${name}"`).catch(() => {}));
  await Promise.all(loads);
}

log.init();
// Dev-only, like the debug chunk below: `window.__perf` and its F2 toggle never ship.
if (import.meta.env.DEV) {
  void import('./util/PerfManager').then(({ perfManager }) => perfManager.init());
}

function shouldLoadDebugTools(): boolean {
  if (import.meta.env.MODE === 'test') return false;
  const param = new URLSearchParams(window.location.search).get('debug');
  if (param === '' || param === '1' || param === 'true') return true;
  return window.localStorage?.getItem('yamaDebug') === '1';
}

// The `import.meta.env.DEV &&` guard has to be the first operand: Vite replaces
// it with `false` in a production build, which lets the bundler drop the whole
// branch, and with it the dynamic import that would otherwise emit a ~204 kB
// debug chunk (webgl-lint + tweakpane + stats.js) that prod can never load.
const debugReady =
  import.meta.env.DEV && shouldLoadDebugTools()
    ? import('./debug').catch((e) => log.warn('App', '[debug] failed to load debug tooling:', e))
    : Promise.resolve();

installRenderProfiler();
installInputLatencyProfiler();

debugReady
  .then(() => loadFonts())
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
