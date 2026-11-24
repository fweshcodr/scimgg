---
name: webgl-debug
description: Debug a visible WebGL rendering bug in Scim.GG's PicoGL renderer (wrong colors, missing geometry, shader or GL errors, depth or blend artifacts) when reading the source, recent diffs and tests has not explained it.
---

# WebGL debugging

The renderer is
[`src/render/backends/picogl/PicoGLRenderer.ts`](../../../src/render/backends/picogl/PicoGLRenderer.ts).
The dev-only tooling in [`src/debug/index.ts`](../../../src/debug/index.ts)
(webgl-lint, Tweakpane, stats.js) is loaded by
[`src/main.tsx`](../../../src/main.tsx) only in a dev build with debug mode on, and
never ships.

Diagnose from the source, recent changes (`git diff`, `git log -p -- src/render/`)
and tests (`npx vitest run src/render`) first. Use the tools below only when those
cannot explain a visible symptom.

## Debug mode

Start the dev server with `./dev` (or `npm run dev`), open the URL Vite prints,
and add `?debug=1` to it. Alternatively set `localStorage.yamaDebug = '1'` once; it
persists until removed. It works in every encounter despite the name.

webgl-lint is not on in normal dev, so without debug mode a clean console proves
nothing. In debug mode it wraps the context and throws synchronously on GL errors,
NaN or undefined arguments, unset uniforms, broken shaders and bad attributes.
Turn on "Pause on caught exceptions" in DevTools to stop at the failing call, then
read the error literally.

Debug mode also mounts a stats.js FPS overlay and a Tweakpane panel. The console
gets only `window.__yamaDebug`, holding `pane`, `stats` and `tagObject`; it has no
handle on the camera, renderer or scene. To inspect a live value, add a temporary
binding in the code that owns the object:

```ts
window.__yamaDebug?.pane.addBinding(params, 'someField', { min: 0, max: 1 });
```

`window.__yamaDebug?.tagObject(gl, obj, 'terrainShader')` names a GPU object in
webgl-lint errors. Use it only after an error where the handle is ambiguous; do
not wire it into the renderer ahead of time.

Remove every binding, tag and `console.log` before the fix lands.

## Which tool for which symptom

| Symptom | Tool |
|---|---|
| GL error, unset uniform, NaN | Debug mode and webgl-lint |
| Draw missing, wrong color or texture | A frame capture: inspect the failing draw's program, uniforms, textures and framebuffer rather than guessing |
| Wrong layering (depth, normals, UVs) | A temporary debug shader that outputs the channel as color |
| Per-pixel or pipeline-stage questions | A GPU-level capture, last |
| Only on one machine | `chrome://gpu` (ANGLE backend, WebGL2 status, disabled features) before capturing |
| Slow or janky | The FPS overlay and the profilers in [Testing and workflow details](../../../docs/agent-reference.md#testing-and-workflow-details) |

FPS is a symptom. A low frame rate alone does not show whether the CPU or the GPU
is the bottleneck; measure before deciding.

Frame capture is optional and local: Spector.js (a browser extension, whose shader
editor can live-test a GLSL fix) or RenderDoc. Captures, extracted textures and
rendered game frames stay on your machine and are never committed.

## Limits

[`/ui-harness.html`](../../../docs/testing/ui-harness.md) has no GL context by
design, so it cannot reproduce a rendering bug. Do not automate a browser through
the cache download, into a fight, to a mechanic, or to aim the camera to reach a
frame (the browser reach limit in
[`AGENTS.md`](../../../AGENTS.md#testing-and-browser-limits)). Cover what you can in
Vitest or a `tsx` driver, then say what still needs a manual in-world check.

## Reporting

Give the exact file and line, the evidence behind the lead (the capture's draw-call
number or the literal webgl-lint error), and the minimal fix. Do not refactor
while diagnosing.
