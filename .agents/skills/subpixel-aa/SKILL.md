---
name: subpixel-aa
description: >-
  Measure whether Scim.GG chrome text keeps Chrome's LCD (subpixel) antialiasing, using the
  two-browser --disable-lcd-text differential in scripts/verify-subpixel.mts. Use after adding or
  changing a panel, drawer, modal, popover, pane or scroller that paints a background behind text,
  or when text looks soft, blurry or grayscale and you need to find which element lost LCD AA.
---

# Subpixel / LCD text AA: measuring it

Chrome decides LCD text per compositing layer, and CSS cannot force it, only avoid vetoes. The rules
are in [`docs/agent-reference.md`, LCD text](../../../docs/agent-reference.md#lcd-text) (part of
[UI rendering safeguards](../../../docs/agent-reference.md#ui-rendering-safeguards)), and
[`AGENTS.md`](../../../AGENTS.md) requires this measurement for text-bearing chrome. This skill is
the measurement workflow; it does not restate those rules.

## Vetoes named in CSS comments

Some stylesheets cite "Veto N in the subpixel-aa skill". Vetoes 1 and 2 are the first two rules in the
LCD text section. Veto 3 is described only here:

1. **Veto 1:** an outer `box-shadow` on the element painting the background behind text.
2. **Veto 2:** a scroller (`overflow-y: auto`) with no opaque background of its own.
3. **Veto 3:** a transparent positioned wrapper (for example a full-window `position: fixed; inset: 0`
   host, or a row whose gaps show the scene) around opaque controls. Blink can promote it to its own
   non-opaque layer, which turns every label in it grayscale even though each control paints an opaque
   fill. Position the opaque controls themselves and keep wrappers `display: contents`, as the top
   chrome (`src/components/launcher/TopChrome.tsx`) does for each launcher and pane.

## Run the differential

```bash
npm run setup          # once: generates public/fonts/ (the verifier refuses to run without them)
npx puppeteer browsers install chrome   # once: `npm install` does not download it (.puppeteerrc.cjs)
npm run dev            # or ./dev harness '<query>'; note the URL it prints
node scripts/verify-subpixel.mts --url http://localhost:5173 --preset settings
node scripts/verify-subpixel.mts --url 'http://localhost:5173/ui-harness.html?open=plugins&chrome=0' \
  --selector .plugins-overlay --verbose
```

Use the origin your dev server printed, not necessarily `5173`. Node 22.18 or later runs the script
directly (type stripping; not `tsx`). It uses the `puppeteer` devDependency's Chrome, which
[`.puppeteerrc.cjs`](../../../.puppeteerrc.cjs) keeps `npm install` from downloading; install it with
`npx puppeteer browsers install chrome`, and again after a Puppeteer upgrade pins a newer build.
`--help` prints every option.

- **Loopback only.** `--url` must be `http:` or `https:` on `localhost`, `127.0.0.1` or `[::1]`; any
  other scheme or host is refused with exit 2. The verifier only measures your own dev server.
- **Sandbox on.** Both browsers launch with Chrome's sandbox; the script never passes `--no-sandbox` or
  `--disable-setuid-sandbox`. If Chrome cannot start sandboxed (running as root, or Ubuntu 23.10+
  AppArmor blocking unprivileged user namespaces), the run stops with exit 2 and points to the fixes:
  run as a normal user, or follow Chromium's AppArmor and Puppeteer's sandbox documentation. Do not add
  the flags back to get a result.
- **`--url` with `--preset`** is the dev server origin only. The preset appends its harness path and
  query, and an origin with a path or query is rejected.
- **`--url` without `--preset`** is the full `/ui-harness.html?...` page, and `--selector` is required.
  Build the query from the harness's [URL parameters and surfaces](../../../docs/testing/ui-harness.md#surfaces).
  The verifier always waits for `data-harness-ready`, so it cannot measure the app root.
- `--selector` names the root whose text is measured, and it overrides a preset's selector.
- `--viewport <W>x<H>` changes the 1600×1000 window, for example for `open=mobile` surfaces.

The supported presets each open one harness surface by `?open=`:

| Preset | Surface | Selector |
|---|---|---|
| `settings` | Settings drawer, collapsed sections expanded | `.controls-overlay` |
| `plugins` | Plugins drawer in the Inferno | `.plugins-overlay` |
| `menu` | Top chrome Menu pane (Sol Heredit) | `.launcher-pane[data-pane="menu"]` |
| `shortcuts` | Keyboard Shortcuts modal | `.shortcuts-modal-card` |
| `credits` | Credits modal | `.credits-modal-card` |

For anything else, pass a full harness URL and a selector. Add a preset only after it passes, and
after a negative control on it fails as described below.

## Reading the result

The verifier renders the page in two headless Chromium instances that differ only in
`--disable-lcd-text`. It tags each visible text element under the selector and captures the top-left
280×30 px of each in both. An element is **LCD** when more than 0.3% of its sample differs, by more
than 2/255 in a channel, between the two browsers. When the pixels are identical, the text had
already fallen back to grayscale.

- **Exit 0, `PASS`:** every measured element kept LCD text in this Chromium. The summary gives
  measured and skipped elements, ink (glyph) pixels out of the sampled pixels, pixels that differ
  between the browsers, and chromatic ink pixels in each browser.
- **Exit 1, `FAIL`:** the `GRAYSCALE` lines name the elements whose samples matched. If every element
  under the root fails, look for a veto on a container layer (a shadow, `will-change`, a filter, a
  transparent wrapper). If only a few fail, check their own paint and their nearest scroller.
- **Exit 2, `ERROR (no verdict)`:** nothing valid was measured. This covers a bad argument or a
  non-loopback URL, a browser that will not launch or cannot start its sandbox, a page that never
  reports `data-harness-ready` or that sets `data-harness-error`, missing pixel fonts, no visible
  selector, no text sampled, and a hot update or reload from the dev server during the run. Fix the
  setup, or rerun once file edits settle.
  An exit-2 run is neither a pass nor a negative control.

The chromatic counts are context only. Colored text, tinted fills and text shadows are chromatic in
both browsers, so a fringe count cannot decide LCD.

**Negative control.** To check that the differential still detects grayscale text on a surface, use
the test-only `--inject-css` flag (not in `--help`). It adds a stylesheet to both browsers before the
first paint. A translucent fill over the measured root works on every preset:

```bash
node scripts/verify-subpixel.mts --url http://localhost:5173 --preset settings \
  --inject-css '.controls-overlay, .controls-overlay * { background-color: rgba(30, 24, 18, 0.85) !important; }'
```

On headless Chrome 157 (Puppeteer 25, sandboxed, 2026-11-24), `settings` measured 28/28 LCD and exited
0; with this stylesheet it measured 0/28, no pixels differed, and the run exited 1. Chrome 148 gave
the same counts. On Chrome 148, some other styles did not work as negative controls:

- On `.controls-overlay`, an outer `box-shadow` alone and a transparent `.controls-content` scroller
  each still measured 28/28.
- `opacity: 0.99` on `.plugins-overlay` still measured 24/24.
- `will-change: transform` on the sliding drawer gave a different result on each run (see below).

Use a style that you have seen fail.

## What it cannot prove

- **Other browsers and machines.** The thresholds were tuned on Puppeteer's headless Chromium at
  device scale factor 1. A pass does not cover other Chromium builds, GPUs or operating systems,
  headful windows, Firefox or Safari, or platforms where the browser never draws LCD text.
- **Text it skipped.** Samples that are outside the viewport, clipped by a scrolling or overflow
  ancestor, occluded at their center, or blank are skipped, and `--verbose` lists them with reasons.
  Long drawers push most rows off screen, so scroll them into view in a custom harness state, or use a
  taller `--viewport`.
- **Other states.** It measures only the state the URL opens, after the transitions settle. It does
  not cover hover, other scroll positions, a moving drawer or a running animation.
- **Differences that are not AA.** Any difference between the two renders counts as LCD. A layer that
  kept `will-change: transform` while it slid in can raster at a different sub-pixel offset in each
  browser, and that difference reads as LCD. With `will-change: transform` injected, the settings
  drawer sometimes measured 27/28 LCD and sometimes 0/28. A dev-server update during the run would
  have the same effect, so the verifier stops with exit 2 when it sees a hot update or a reload in
  either page. Do not run it while files are being edited.
- **Visual faithfulness.** A pass shows only that LCD AA survived, not that a CSS fix looks unchanged.
  To check that, compare before and after in one page under `--disable-lcd-text`, so the AA change
  cannot confound it. Take a no-op capture first as the noise floor. Two independently loaded pages
  drift more than real fixes do.
- **Large text.** Text about 50px or larger never gets LCD AA, because Skia draws it as paths. A lone
  grayscale result on the largest heading is expected, so do not shrink the heading to fix it.
