/// <reference types="vitest" />

import { statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import glsl from 'vite-plugin-glsl';
import { licenseNoticesPlugin } from './scripts/licenseNotices.ts';

function contentTypeFixPlugin(): Plugin {
  return {
    name: 'content-type-fix',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (url.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
        }
        // Fix MIME type for JS modules served to non-localhost clients
        if (
          url.match(/\.js(\?.*)?$/) &&
          (url.includes('/node_modules/') || url.includes('/@vite/') || url.startsWith('/src/'))
        ) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
        next();
      });
    },
  };
}

function assetCachePlugin(): Plugin {
  return {
    name: 'asset-cache-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (url.startsWith('/assets/')) {
          // Two-tier dev caching: asset edits must show up on reload, yet genuinely
          // content-addressed URLs should stay hard-cached.
          //   • A version/hash query (?v=, ?t=, ?ver=, ?rev=, ?hash=) means the URL
          //     itself changes whenever the content changes, so it is safe to cache
          //     for a year and skip revalidation entirely.
          //   • Everything else is a stable-named public/assets/* file whose bytes
          //     can change under the same URL (e.g. swapping a sprite). `immutable`
          //     would pin the stale bytes for a year; `no-cache` instead makes the
          //     browser revalidate via ETag — an unchanged asset returns 304 and
          //     reuses cached bytes (no re-download), a changed one returns fresh 200.
          // Production caching is the host's job, not this dev-only middleware.
          const isContentAddressed = /[?&](?:hash|rev|ver|v|t)=/.test(url);
          res.setHeader('Cache-Control', isContentAddressed ? 'public, max-age=31536000, immutable' : 'no-cache');
        }
        next();
      });
    },
  };
}

const VITEST_JSON_PREFIX = '\0vitest-json:';

/**
 * Vitest only: a JSON import of 256 KB or more (of the imported tables, only the equipment table) is
 * read and parsed from disk inside the test. Vite would inline it as a string literal, which the test
 * module runner loads into every suite that imports it at a higher CPU cost than JSON.parse of the
 * file. The data, its default export and module identity within a suite are unchanged.
 */
function vitestJsonFromDiskPlugin(): Plugin {
  return {
    name: 'vitest-json-from-disk',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.endsWith('.json')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external || !resolved.id.endsWith('.json')) return null;
      // Not ending in `.json`, which Vite's own JSON transform would claim.
      return statSync(resolved.id).size >= 256 * 1024 ? `${VITEST_JSON_PREFIX}${resolved.id}.js` : null;
    },
    load(id) {
      if (!id.startsWith(VITEST_JSON_PREFIX)) return null;
      const file = id.slice(VITEST_JSON_PREFIX.length, -'.js'.length);
      return `import { readFileSync } from 'node:fs';\nexport default JSON.parse(readFileSync(${JSON.stringify(file)}, 'utf-8'));\n`;
    },
  };
}

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  return {
    plugins: [
      {
        name: 'dev-server-access',
        apply: 'serve',
        config(config) {
          // Vite treats allowedHosts=true as absorbing during config merges, so a CLI override must be cleared in place first.
          if (config.server) config.server.allowedHosts = [];
          return {
            server: {
              host: process.env.SCIM_DEV_LAN === '1' ? '0.0.0.0' : '127.0.0.1',
              cors: false,
              allowedHosts: ['localhost'],
            },
          };
        },
      },
      ...(process.env.VITEST ? [vitestJsonFromDiskPlugin()] : []),
      contentTypeFixPlugin(),
      assetCachePlugin(),
      react(),
      // Shaders are string literals to the bundler, so its minifier never touches
      // them: without this, every GLSL comment and indent ships verbatim. Kept off
      // in dev so shader compile errors still report real line numbers.
      glsl({ minify: isBuild }),
      // Emits dist/licenses.txt. The minifier below strips every dependency's
      // @license banner, so this file is the only place the notices MIT and
      // BSD require in a binary distribution actually survive.
      licenseNoticesPlugin(),
    ],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['@foxglove/wasm-bz2'],
      rolldownOptions: {
        external: ['env', 'wasi_snapshot_preview1'],
      },
    },
    assetsInclude: ['**/*.wasm'],
    build: {
      // Syntax support matches src/polyfills.ts; CSS minification inherits this
      // target too, including lowering nesting for Safari/iOS 15.
      target: ['chrome98', 'edge98', 'firefox94', 'safari15', 'ios15'],
      // 'oxc' is also the Vite 8 default, but the exact minify shape is pinned
      // here so a future default change cannot silently relax the output.
      minify: 'oxc',
      rolldownOptions: {
        external: ['env', 'wasi_snapshot_preview1'],
        output: {
          // Vite spreads user `output` over its own defaults, so this object
          // wins over the plain `minify: true` it would otherwise pass.
          minify: {
            // dropConsole stays off on purpose: console.error/warn are the only
            // signal a user can hand back in a bug report. Logger already gates
            // everything below WARN behind an opt-in level.
            compress: { dropDebugger: true },
            mangle: { toplevel: true },
            codegen: { removeWhitespace: true },
          },
          // Drop every comment class - annotations, JSDoc, and @license/@preserve
          // banners. Third-party attribution lives in THIRD_PARTY_NOTICES.md.
          comments: false,
        },
      },
    },
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/core/**/*', 'src/components/**/*'],
      },
      pool: 'threads',
      // Never oversubscribe the box. A dev machine has plenty of cores, but a slower
      // machine has 2-4 - and a fixed pool of 8 there inflates every test's wall clock
      // past vitest's 5s default, timing out a different test on each run.
      maxWorkers: Math.min(8, availableParallelism()),
      fileParallelism: true,
      // The ESM build the app bundles. Node would otherwise load picogl's `main` UMD build, whose
      // wrapper reads the browser global `self` and forces every importing suite into a DOM environment.
      alias: [
        { find: /^picogl$/, replacement: join(import.meta.dirname, 'node_modules/picogl/build/module/picogl.js') },
      ],
    },
  };
});
