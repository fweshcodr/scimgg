// Run with Node 22.18+ (type stripping; not tsx, whose __name helpers cannot cross page.evaluate):
//   node scripts/verify-subpixel.mts --url <URL> [--preset <name>] [--selector <css>]
// Requires the running dev server (`npm run dev`) and Puppeteer's Chrome. `npm install` does not download
// it (.puppeteerrc.cjs sets skipDownload); install it once with `npx puppeteer browsers install chrome`.
//
// Chrome runs with its sandbox on, and --url must be an http(s) URL on a loopback host (localhost,
// 127.0.0.1, [::1]): the verifier only ever measures your own dev server. If Chrome cannot start
// sandboxed, the run stops with exit 2 and says how to enable the sandbox; it never disables it.
//
// The two-browser LCD-text differential (docs/agent-reference.md#lcd-text). The same harness page is
// rendered in two headless Chromium instances that differ only by `--disable-lcd-text`, and each text
// element under the selector is captured in both:
//
//   pixels differ    -> that element was drawn with LCD (subpixel) AA
//   pixels identical -> it had already fallen back to grayscale AA
//
// Exit codes: 0 every measured element keeps LCD text; 1 at least one is grayscale; 2 nothing valid
// could be measured (bad arguments, no browser or no usable sandbox, harness not ready, fonts missing,
// selector absent, no text sampled, a dev-server update during the run). Only 0 is a pass.
import { parseArgs } from 'node:util';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import sharp from 'sharp';

interface Preset {
  readonly description: string;
  /** Harness path and query, appended to the --url origin. */
  readonly path: string;
  /** Root element whose descendant text is measured. */
  readonly selector: string;
  /** Evaluated in the page after the harness is ready, before the selector is awaited. */
  readonly prepare?: string;
}

// Each preset is one harness load: `?open=` routes the surface through App's own handlers
// (src/harness/ui/harnessSurfaces.ts, docs/testing/ui-harness.md#surfaces).
const PRESETS: Record<string, Preset> = {
  settings: {
    description: 'Settings drawer, every section expanded',
    path: '/ui-harness.html?open=settings&chrome=0',
    selector: '.controls-overlay',
    // Repeat until every section stays open: a click that lands mid-slide can be lost.
    prepare: `
      const closed = () => document.querySelectorAll('.controls-overlay .collapsible-header[aria-expanded="false"]');
      for (let attempt = 0; attempt < 10 && closed().length > 0; attempt++) {
        for (const header of closed()) header.click();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (closed().length > 0) throw new Error(closed().length + ' Settings section(s) would not expand');
    `,
  },
  plugins: {
    description: 'Plugins drawer in the Inferno (both group headings)',
    path: '/ui-harness.html?encounter=inferno&open=plugins&chrome=0',
    selector: '.plugins-overlay',
  },
  menu: {
    description: 'Top chrome Menu pane',
    path: '/ui-harness.html?encounter=sol_heredit&open=menu&chrome=0',
    selector: '.launcher-pane[data-pane="menu"]',
  },
  shortcuts: {
    description: 'Keyboard Shortcuts modal',
    path: '/ui-harness.html?open=shortcuts&chrome=0',
    selector: '.shortcuts-modal-card',
  },
  credits: {
    description: 'Credits modal',
    path: '/ui-harness.html?open=credits&chrome=0',
    selector: '.credits-modal-card',
  },
};

/** The top-left part of each text element that is captured and compared. */
const SAMPLE = { width: 280, height: 30 };
/** A pixel counts as different when any channel moves by more than this (0-255). */
const CHANNEL_DELTA = 2;
/** An element is LCD when more than this percentage of its sample differs between the browsers. */
const LCD_DIFF_PERCENT = 0.3;
/** Informational only: an ink pixel whose channel spread exceeds this is counted as chromatic. */
const CHROMA_SPREAD = 24;
const DEFAULT_VIEWPORT = { width: 1600, height: 1000 };
const BOOT_TIMEOUT_MS = 45_000;
const SELECTOR_TIMEOUT_MS = 10_000;
const SETTLE_MS = 1200;
const FONT_FAMILY_PREFIX = 'RuneScape';

const HELP = `Usage: node scripts/verify-subpixel.mts --url <URL> [--preset <name>] [--selector <css>]

Two-browser LCD-text differential: renders a UI harness page in a normal headless
Chromium and in one launched with --disable-lcd-text, then compares every text
element under the selector. Text whose pixels are identical in both has fallen
back to grayscale AA.

  --url <URL>         Without --preset: the full harness page URL, e.g.
                        http://localhost:5173/ui-harness.html?open=settings&chrome=0
                      With --preset: the dev server origin only, e.g.
                        http://localhost:5173 (the preset appends its path and query).
                      Use the URL \`npm run dev\` prints. Only http(s) on a loopback
                      host (localhost, 127.0.0.1, [::1]) is accepted.
  --preset <name>     A tested harness surface (see below).
  --selector <css>    Root element whose text is measured. Required without --preset;
                      overrides the preset's selector with one.
  --viewport <WxH>    Window size (default ${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height}).
  --verbose           List every measured and skipped element, not only the grayscale ones.
  --help              Show this help.

Presets:
${Object.entries(PRESETS)
  .map(([name, p]) => `  ${name.padEnd(10)} ${p.description}\n             ${p.path}  [${p.selector}]`)
  .join('\n')}

Exit codes: 0 every measured element keeps LCD text; 1 at least one is grayscale;
2 nothing valid was measured (bad arguments, no browser or no usable Chrome
sandbox, harness not ready, pixel fonts missing, selector absent, no text sampled,
or the dev server hot-updated or reloaded the page mid-run; rerun once file edits
settle). Only 0 is a pass.

The thresholds (a channel delta above ${CHANNEL_DELTA}/255 on more than ${LCD_DIFF_PERCENT}% of a
${SAMPLE.width}x${SAMPLE.height} sample) were tuned on Puppeteer's headless Chromium at device
scale factor 1. They are not promised to hold on other Chromium builds, GPUs or
operating systems; a pass says nothing about Firefox or Safari. Chromatic-pixel
counts are reported for context only and never decide the verdict.`;

/** A run that cannot produce a valid verdict. Exits 2, never as a pass. */
class Unmeasurable extends Error {}

/** `URL.hostname` keeps the brackets of an IPv6 literal. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackHttpUrl(url: URL): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname);
}

interface Options {
  readonly target: URL;
  readonly selector: string;
  readonly prepare: string;
  readonly viewport: { width: number; height: number };
  readonly verbose: boolean;
  readonly injectCss: string | undefined;
}

function parseOptions(): Options | null {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse();
  } catch (error) {
    throw new Unmeasurable(`${error instanceof Error ? error.message : String(error)}\nRun with --help for usage.`);
  }
  const { values } = parsed;
  if (values.help) {
    console.log(HELP);
    return null;
  }
  if (!values.url) throw new Unmeasurable('Missing --url. Run with --help for usage.');
  let url: URL;
  try {
    url = new URL(values.url);
  } catch {
    throw new Unmeasurable(`--url is not a URL: ${values.url}`);
  }
  if (!isLoopbackHttpUrl(url))
    throw new Unmeasurable(
      `--url must be http(s) on a loopback host (${[...LOOPBACK_HOSTS].join(', ')}), i.e. your own dev server; ` +
        `got ${values.url}`,
    );

  let target = url;
  let selector = values.selector;
  let prepare = '';
  if (values.preset !== undefined) {
    const preset = PRESETS[values.preset];
    if (!preset)
      throw new Unmeasurable(`Unknown --preset "${values.preset}". Known: ${Object.keys(PRESETS).join(', ')}.`);
    if (url.pathname !== '/' || url.search || url.hash)
      throw new Unmeasurable(
        `With --preset, --url is the dev server origin only (e.g. ${url.origin}); got ${values.url}. ` +
          'Pass a full harness URL without --preset instead.',
      );
    target = new URL(preset.path, url.origin);
    selector ??= preset.selector;
    prepare = preset.prepare ?? '';
  }
  if (!selector) throw new Unmeasurable('Missing --selector (required without --preset).');

  let viewport = DEFAULT_VIEWPORT;
  if (values.viewport !== undefined) {
    const m = /^(\d+)x(\d+)$/.exec(values.viewport);
    if (!m) throw new Unmeasurable(`--viewport must be <width>x<height>, e.g. 844x390; got ${values.viewport}`);
    viewport = { width: Number(m[1]), height: Number(m[2]) };
  }
  return {
    target,
    selector,
    prepare,
    viewport,
    verbose: values.verbose ?? false,
    injectCss: values['inject-css'],
  };
}

function parse() {
  return parseArgs({
    strict: true,
    allowPositionals: false,
    options: {
      url: { type: 'string' },
      preset: { type: 'string' },
      selector: { type: 'string' },
      viewport: { type: 'string' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean' },
      // Undocumented in --help on purpose: a stylesheet injected into both browsers before the page's
      // first paint, for proving the differential fails (e.g. `.controls-overlay, .controls-overlay *
      // { background-color: rgba(30, 24, 18, 0.85) !important }`). Leave it off for real verification.
      'inject-css': { type: 'string' },
    },
  });
}

async function launch(disableLcd: boolean): Promise<Browser> {
  // Chrome's sandbox stays on: never add --no-sandbox or --disable-setuid-sandbox here.
  const args = ['--force-color-profile=srgb', '--force-device-scale-factor=1', '--hide-scrollbars'];
  // Headless Chromium already draws LCD text; only the negative instance needs a flag.
  if (disableLcd) args.push('--disable-lcd-text');
  let browser: Browser;
  try {
    browser = await puppeteer.launch({ browser: 'chrome', headless: true, args });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Unmeasurable(`Could not launch Puppeteer's Chrome: ${message}\n${launchFix(message)}`);
  }
  const version = await browser.version();
  if (!/^(Headless)?Chrome\/\d+/.test(version)) {
    await browser.close();
    throw new Unmeasurable(`Unsupported browser "${version}": this check needs Chromium.`);
  }
  return browser;
}

/** How to fix a failed launch: a missing browser, or a sandbox Chrome cannot start (never bypassed). */
function launchFix(message: string): string {
  if (!/sandbox|namespace|running as root/i.test(message))
    return 'Install it with `npx puppeteer browsers install chrome`.';
  return [
    'Chrome could not start its sandbox, and this verifier does not run without it. To fix the sandbox:',
    '  - Run as a normal user, not root (Chrome refuses to sandbox as root).',
    '  - On Ubuntu 23.10+, AppArmor blocks the unprivileged user namespaces the sandbox uses; see',
    '    https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md',
    '  - More: https://pptr.dev/troubleshooting#setting-up-chrome-linux-sandbox',
  ].join('\n');
}

/**
 * The dev server pushes file edits into open pages (a hot update or a full reload). One arriving in
 * one browser between its captures and the other's can read as LCD or grayscale, so any such update
 * makes the run unmeasurable. Returns a check that throws once one has been seen.
 */
function watchDevServer(page: Page, origin: string, label: string): () => void {
  let navigations = 0;
  let update: string | null = null;
  page.on('framenavigated', (frame) => {
    // The first navigation to the dev server is the load itself; any later one is a reload.
    if (frame === page.mainFrame() && frame.url().startsWith(origin) && ++navigations > 1)
      update ??= 'the page reloaded';
  });
  page.on('console', (message) => {
    const text = message.text();
    if (/^\[vite\] (?:hot updated|css hot updated|server connection lost)/.test(text)) update ??= text;
  });
  return () => {
    if (update)
      throw new Unmeasurable(
        `[${label}] The dev server changed the page during the run (${update}). Rerun once file edits settle.`,
      );
  };
}

async function prepare(page: Page, options: Options, label: string): Promise<void> {
  await page.setViewport({ ...options.viewport, deviceScaleFactor: 1 });
  if (options.injectCss !== undefined) {
    // Present from the first paint. Added after the surface had rastered, a veto did not reliably
    // re-raster its tiles (measured: the same style flipped some runs to grayscale and left others LCD).
    await page.evaluateOnNewDocument((css: string) => {
      const add = () => {
        const style = document.createElement('style');
        style.textContent = css;
        document.documentElement.append(style);
      };
      if (document.documentElement) add();
      else
        new MutationObserver((_, observer) => {
          if (!document.documentElement) return;
          observer.disconnect();
          add();
        }).observe(document, { childList: true });
    }, options.injectCss);
  }
  try {
    await page.goto(options.target.href, { waitUntil: 'load', timeout: BOOT_TIMEOUT_MS });
  } catch (error) {
    throw new Unmeasurable(
      `[${label}] Could not load ${options.target.href}: ${error instanceof Error ? error.message : String(error)}\n` +
        'Is `npm run dev` running, and is this the URL it printed?',
    );
  }

  // The harness sets data-harness-ready (or data-harness-error) on <body>; never a fixed sleep.
  try {
    await page.waitForFunction(
      () => document.body?.dataset.harnessReady === 'true' || document.body?.dataset.harnessError === 'true',
      { timeout: BOOT_TIMEOUT_MS },
    );
  } catch {
    throw new Unmeasurable(
      `[${label}] The page never set data-harness-ready within ${BOOT_TIMEOUT_MS / 1000}s. ` +
        'Is --url a /ui-harness.html page on the dev server?',
    );
  }
  const failed = await page.evaluate(() =>
    document.body.dataset.harnessError === 'true'
      ? (document.querySelector('[data-testid="harness-status"]')?.textContent ?? '(no status: load with chrome=1)')
      : null,
  );
  if (failed !== null) throw new Unmeasurable(`[${label}] The harness failed to boot (data-harness-error): ${failed}`);

  const fonts = await page.evaluate(async (prefix: string) => {
    const faces = Array.from(document.fonts).filter((face) =>
      face.family.replace(/^["']|["']$/g, '').startsWith(prefix),
    );
    await Promise.allSettled(faces.map((face) => face.load()));
    return {
      total: faces.length,
      failed: faces.filter((face) => face.status !== 'loaded').map((face) => face.family),
    };
  }, FONT_FAMILY_PREFIX);
  if (fonts.total === 0 || fonts.failed.length > 0)
    throw new Unmeasurable(
      `[${label}] The pixel fonts did not load (${fonts.failed.join(', ') || 'no RuneScape @font-face found'}). ` +
        'Run `npm run setup` once to generate public/fonts/.',
    );

  if (options.prepare) {
    try {
      await page.evaluate(`(async () => { ${options.prepare} })()`);
    } catch (error) {
      throw new Unmeasurable(
        `[${label}] The preset could not prepare the surface: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    await page.waitForSelector(options.selector, { visible: true, timeout: SELECTOR_TIMEOUT_MS });
  } catch {
    throw new Unmeasurable(
      `[${label}] No visible element matches --selector "${options.selector}" within ${SELECTOR_TIMEOUT_MS / 1000}s.`,
    );
  }
  // Let drawer slides and disclosure expansions settle before capturing.
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

interface TaggedTexts {
  measured: { id: number; label: string }[];
  skipped: { label: string; reason: string }[];
}

interface TagOptions {
  selector: string;
  viewport: { width: number; height: number };
  sample: { width: number; height: number };
}

/**
 * Runs in the page (serialized by `page.evaluate`): keep every helper inside it. Tags each
 * measurable text element with `data-aa`, testing the screenshot's sample rectangle (not just
 * the element's window bounds) against the viewport, clipping ancestors and occlusion.
 */
function tagTexts({ selector, viewport, sample: limit }: TagOptions): TaggedTexts {
  const root = document.querySelector(selector);
  const measured: TaggedTexts['measured'] = [];
  const skipped: TaggedTexts['skipped'] = [];
  for (const el of document.querySelectorAll('[data-aa]')) el.removeAttribute('data-aa');
  if (!root) return { measured, skipped };
  const transparent = (color: string) => color === 'transparent' || /(?:,|\/)\s*0(?:\.0+)?\s*\)$/.test(color);
  let i = 0;
  for (const el of Array.from(root.querySelectorAll('*'))) {
    let direct = '';
    for (const c of Array.from(el.childNodes)) if (c.nodeType === 3) direct += c.textContent || '';
    if (!direct.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 6) continue;
    const id = i++;
    const cls =
      (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/)[0] || el.tagName.toLowerCase();
    const label = `${cls} "${direct.trim().slice(0, 28)}"`;
    const sample = {
      left: r.left,
      top: r.top,
      right: r.left + Math.min(r.width, limit.width),
      bottom: r.top + Math.min(r.height, limit.height),
    };
    let reason = '';
    if (sample.top < 0 || sample.left < 0 || sample.bottom > viewport.height || sample.right > viewport.width)
      reason = 'outside viewport';
    for (let ancestor = el.parentElement; ancestor && !reason; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const a = ancestor.getBoundingClientRect();
      const scaleX = ancestor.offsetWidth ? a.width / ancestor.offsetWidth : 1;
      const scaleY = ancestor.offsetHeight ? a.height / ancestor.offsetHeight : 1;
      const left = a.left + ancestor.clientLeft * scaleX;
      const top = a.top + ancestor.clientTop * scaleY;
      const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
      const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      if (
        (clipX && (sample.left < left - 0.5 || sample.right > left + ancestor.clientWidth * scaleX + 0.5)) ||
        (clipY && (sample.top < top - 0.5 || sample.bottom > top + ancestor.clientHeight * scaleY + 0.5))
      ) {
        reason = `ancestor clip: ${ancestor.className || ancestor.tagName}`;
      }
    }
    if (!reason) {
      const hit = document.elementFromPoint((sample.left + sample.right) / 2, (sample.top + sample.bottom) / 2);
      if (!hit || (hit !== el && !el.contains(hit) && !hit.contains(el)))
        reason = `sample point occluded: ${hit ? hit.className || hit.tagName : 'no hit'}`;
      else if (hit !== el && hit.contains(el)) {
        // An ancestor hit can be a pointer-transparent label's paint-free hit
        // target. Read its pseudos without changing styles or suppressing them.
        for (const pseudo of ['::before', '::after']) {
          const p = getComputedStyle(hit, pseudo);
          if (p.content === 'none' || p.content === 'normal') continue;
          const content = p.content !== '""' && p.content !== "''";
          const border = ['top', 'right', 'bottom', 'left'].some(
            (side) =>
              parseFloat(p.getPropertyValue(`border-${side}-width`)) > 0 &&
              p.getPropertyValue(`border-${side}-style`) !== 'none' &&
              !transparent(p.getPropertyValue(`border-${side}-color`)),
          );
          const outline = parseFloat(p.outlineWidth) > 0 && p.outlineStyle !== 'none' && !transparent(p.outlineColor);
          if (
            content ||
            !transparent(p.backgroundColor) ||
            p.backgroundImage !== 'none' ||
            border ||
            outline ||
            p.boxShadow !== 'none'
          ) {
            reason = `ancestor pseudo may paint: ${pseudo}`;
            break;
          }
        }
      }
    }
    if (reason) {
      skipped.push({ label, reason });
      continue;
    }
    el.setAttribute('data-aa', String(id));
    measured.push({ id, label });
  }
  return { measured, skipped };
}

async function capture(page: Page, selector: string): Promise<{ data: Buffer; width: number; height: number }> {
  const el = await page.$(selector);
  const box = await el?.boundingBox();
  if (!box || box.width < 4) throw new Unmeasurable(`Tagged text disappeared before capture: ${selector}`);
  const png = await page.screenshot({
    clip: { x: box.x, y: box.y, width: Math.min(box.width, SAMPLE.width), height: Math.min(box.height, SAMPLE.height) },
    type: 'png',
    // Beyond-viewport capture can shift nested scrollers, measuring blank/occluded pixels instead of text.
    captureBeyondViewport: false,
  });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

interface SampleStats {
  pixels: number;
  /** Pixels that differ from the sample's most common color in the LCD browser: the glyphs. */
  ink: number;
  /** Pixels whose color differs between the two browsers. */
  differing: number;
  chromaLcd: number;
  chromaGray: number;
}

/** Both captures are packed RGB. Returns null when the two have different sizes. */
function compare(
  lcd: { data: Buffer; width: number; height: number },
  gray: { data: Buffer; width: number; height: number },
): SampleStats | null {
  if (lcd.width !== gray.width || lcd.height !== gray.height) return null;
  const pixels = lcd.width * lcd.height;
  const counts = new Map<number, number>();
  for (let i = 0; i < pixels; i++) {
    const key = (lcd.data[i * 3] << 16) | (lcd.data[i * 3 + 1] << 8) | lcd.data[i * 3 + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let background = 0;
  let best = -1;
  for (const [key, n] of counts) {
    if (n > best) {
      best = n;
      background = key;
    }
  }
  const bg = [(background >> 16) & 255, (background >> 8) & 255, background & 255];
  const stats: SampleStats = { pixels, ink: 0, differing: 0, chromaLcd: 0, chromaGray: 0 };
  const spread = (d: Buffer, o: number) => Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2]);
  for (let i = 0; i < pixels; i++) {
    const o = i * 3;
    let delta = 0;
    let inkDelta = 0;
    for (let c = 0; c < 3; c++) {
      delta = Math.max(delta, Math.abs(lcd.data[o + c] - gray.data[o + c]));
      inkDelta = Math.max(inkDelta, Math.abs(lcd.data[o + c] - bg[c]), Math.abs(gray.data[o + c] - bg[c]));
    }
    if (delta > CHANNEL_DELTA) stats.differing++;
    if (inkDelta > CHANNEL_DELTA) {
      stats.ink++;
      if (spread(lcd.data, o) > CHROMA_SPREAD) stats.chromaLcd++;
      if (spread(gray.data, o) > CHROMA_SPREAD) stats.chromaGray++;
    }
  }
  return stats;
}

async function main(): Promise<number> {
  const options = parseOptions();
  if (!options) return 0;

  const launched = await Promise.allSettled([launch(false), launch(true)]);
  const failure = launched.find((result) => result.status === 'rejected');
  if (failure) {
    await Promise.all(launched.map((result) => (result.status === 'fulfilled' ? result.value.close() : null)));
    throw failure.reason;
  }
  const [withLcd, noLcd] = launched.map((result) => (result as PromiseFulfilledResult<Browser>).value);
  try {
    const [versionLcd, versionGray] = await Promise.all([withLcd.version(), noLcd.version()]);
    if (versionLcd !== versionGray) throw new Unmeasurable(`Browser versions differ: ${versionLcd} vs ${versionGray}`);
    console.log(`Chromium:  ${versionLcd} (headless, DSF 1)`);
    console.log(`Page:      ${options.target.href}`);
    console.log(`Selector:  ${options.selector}`);
    if (options.injectCss !== undefined) console.log(`Injected:  ${options.injectCss}  (test-only; not a real result)`);

    const [pA, pB] = await Promise.all([withLcd.newPage(), noLcd.newPage()]);
    const origin = options.target.origin;
    const watches = [watchDevServer(pA, origin, 'LCD'), watchDevServer(pB, origin, '--disable-lcd-text')];
    const undisturbed = () => {
      for (const watch of watches) watch();
    };
    try {
      return await measure(pA, pB, options, undisturbed);
    } catch (error) {
      // A dev-server update explains most mid-run failures (vanished text, differing coverage); say so.
      undisturbed();
      throw error;
    }
  } finally {
    await Promise.all([withLcd.close(), noLcd.close()]);
  }
}

async function measure(pA: Page, pB: Page, options: Options, undisturbed: () => void): Promise<number> {
  // Sequential, not Promise.all: two harnesses booting at once can starve one of them, whose pending
  // evaluate then fails. The two browsers are independent, so ordering them costs only time.
  await prepare(pA, options, 'LCD');
  await prepare(pB, options, '--disable-lcd-text');

  const tagOptions: TagOptions = { selector: options.selector, viewport: options.viewport, sample: SAMPLE };
  const [tagged, taggedGray] = await Promise.all([
    pA.evaluate(tagTexts, tagOptions),
    pB.evaluate(tagTexts, tagOptions),
  ]);
  undisturbed();
  if (JSON.stringify(tagged) !== JSON.stringify(taggedGray))
    throw new Unmeasurable(
      `Text coverage differs between the browsers: ${JSON.stringify({ lcd: tagged, gray: taggedGray })}`,
    );
  // Skips are expected (scrolled-off rows, clipped labels); list them when asked or when nothing is left.
  if (options.verbose || tagged.measured.length === 0)
    for (const entry of tagged.skipped) console.log(`  skipped  ${entry.reason}: ${entry.label}`);

  const totals: SampleStats = { pixels: 0, ink: 0, differing: 0, chromaLcd: 0, chromaGray: 0 };
  const lines: { lcd: boolean; line: string }[] = [];
  let measured = 0;
  let blank = 0;
  for (const { id, label } of tagged.measured) {
    const sel = `[data-aa="${id}"]`;
    const stats = compare(await capture(pA, sel), await capture(pB, sel));
    if (!stats) throw new Unmeasurable(`Capture sizes differ between the browsers: ${label}`);
    if (stats.ink === 0) {
      // A sample with no glyph pixels is identical in both browsers whatever the AA; it proves nothing.
      blank++;
      if (options.verbose) console.log(`  skipped  blank sample: ${label}`);
      continue;
    }
    measured++;
    for (const key of Object.keys(totals) as (keyof SampleStats)[]) totals[key] += stats[key];
    const percent = (stats.differing / stats.pixels) * 100;
    const lcd = percent > LCD_DIFF_PERCENT;
    lines.push({
      lcd,
      line: `  ${lcd ? 'LCD      ' : 'GRAYSCALE'} ${percent.toFixed(2).padStart(6)}% differ  ${String(stats.ink).padStart(5)} ink px  ${label}`,
    });
  }
  undisturbed();

  const grayscale = lines.filter((entry) => !entry.lcd);
  for (const entry of options.verbose ? lines : grayscale) console.log(entry.line);
  console.log('');
  console.log(`Text elements: ${measured} measured, ${tagged.skipped.length + blank} skipped (${blank} blank samples)`);
  console.log(`Text pixels:   ${totals.ink} ink of ${totals.pixels} sampled`);
  console.log(`Differing:     ${totals.differing} pixels between the two browsers`);
  console.log(`Chromatic ink: ${totals.chromaLcd} LCD browser, ${totals.chromaGray} --disable-lcd-text (context only)`);
  if (measured === 0 || totals.ink === 0)
    throw new Unmeasurable(`No text was sampled under "${options.selector}"; this proves nothing.`);
  console.log(`LCD text:      ${measured - grayscale.length}/${measured} elements`);
  if (grayscale.length > 0) {
    console.log(
      `\nFAIL: ${grayscale.length} element(s) drew grayscale text. Look for an outer box-shadow on the element\n` +
        'painting their background, a scroller with no background of its own, or another veto in\n' +
        'docs/agent-reference.md#lcd-text.',
    );
    return 1;
  }
  console.log('\nPASS: every measured text element kept LCD AA in this Chromium.');
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof Unmeasurable) {
    console.error(`\nERROR (no verdict): ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error(error);
    process.exitCode = 2;
  }
}
