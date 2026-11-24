---
name: ui-harness
description: Drive, inspect or screenshot Scim.GG's DOM UI (game panel, launchers and panes, orbs, overlays, sidebars, modals, tutorial overlay) in a browser through the /ui-harness.html dev page instead of the full app.
---

# UI harness

`/ui-harness.html` mounts the real `<App/>` with dev-only seams that skip the
cache download, per-encounter cache round-trips, the landing intro and WebGL, so
a deterministic UI state is one page load away. The manual,
[`docs/testing/ui-harness.md`](../../../docs/testing/ui-harness.md), has the URL
parameters, the `window.uiHarness` API, the seams and the full surface list. Read
it before driving the page.

Not for the 3D scene (see [`webgl-debug`](../webgl-debug/SKILL.md)) or for tick,
combat, pathing and encounter logic, which belong in Vitest.

## What it cannot show

Cache-backed UI is inert: item names, tooltips, right-click menus,
rune-availability shading, NPC models, terrain and the scene itself. The scene
area is black by design. Cover that logic with focused tests and say that
in-world confirmation is still needed (the browser reach limit in
[`AGENTS.md`](../../../AGENTS.md#testing-and-browser-limits)).

## Workflow

1. Start it with `./dev harness 'tab=prayer&chrome=0'`, which opens the page on
   whatever port Vite picks. Without the helper, run `npm run dev` and append
   `/ui-harness.html?tab=prayer&chrome=0` to the URL Vite prints.
2. Reach the state with URL parameters rather than clicks: `encounter`, `preset`,
   `tab`, `ticks`, and `open` for surfaces such as `?open=settings` or
   `?open=tutorial:yama-waves`. Use `chrome=0` for screenshots; the harness
   toolbar is not a defect. Leave `autoAdvance` off so screens are reproducible.
3. Wait for `document.body.dataset.harnessReady === 'true'`, never a fixed sleep.
4. Await the asynchronous controls (`enterEncounter`, `reset`, `setAutoAdvance`,
   `open`); otherwise the next tick or capture races the transition and reads the
   previous scene.
5. Assert against the engine, not pixels: press a control, `tick(1)`, then read
   state. That proves the wiring, not just the sprite.
6. Check the console for errors.

Example, in the DevTools console of `/ui-harness.html?tab=prayer&chrome=0`:

```js
document.body.dataset.harnessReady; // 'true'
// The prayer book activates on mousedown, so a bare .click() does nothing.
document.querySelector('[data-prayer="ProtectMagic"]')
  .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
uiHarness.tick(1);
uiHarness.getEngine().getState().activePrayer; // 'ProtectMagic'
```

`uiHarness.getState()` returns App's committed state, which lands a render later;
read the engine for a same-call assertion. To script it, the project's own
`playwright` or `puppeteer` dev dependency can run the same steps, where
`page.getByRole('button', { name: 'Protect from Magic' }).click()` sends real
mouse events.

Harness storage is namespaced (`ui-harness:`) and its settings broadcasts are
suppressed, so your own settings are untouched. A surface that turns on a setting
carries into the next load. To start clean, use a disposable browser profile, or
remove only the harness's keys; `localStorage.clear()` would also wipe your real
settings on the same origin:

```js
Object.keys(localStorage).filter((k) => k.startsWith('ui-harness:')).forEach((k) => localStorage.removeItem(k))
```

## When the harness needs to grow

It runs the real App, so most changes need nothing. If a new boot effect fetches
or probes the GPU, switch it off in the seam that owns it (`useCacheBootstrap`,
`useEncounterManager`, `rendererType: 'none'` in `Grid`, or the harness entry
[`src/harness/uiHarness.tsx`](../../../src/harness/uiHarness.tsx)), behind a
leading `import.meta.env.DEV &&`. Never fork or reimplement a component to make it
mountable; a forked panel is no evidence about the real one.

After touching App's boot path, run `npx vitest run src/harness`; it fails if the
harness boot creates a WebGL context or issues a `fetch`.
