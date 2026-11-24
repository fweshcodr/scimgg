/**
 * webgl-lint ships no types. It's a side-effect import that monkey-patches
 * `HTMLCanvasElement.prototype.getContext` to wrap WebGL/WebGL2 contexts with
 * runtime error checking. The wrapped context exposes a `GMAN_debug_helper`
 * extension for object tagging and configuration; access it via
 * `gl.getExtension('GMAN_debug_helper')` rather than through this module.
 */
declare module 'webgl-lint';
