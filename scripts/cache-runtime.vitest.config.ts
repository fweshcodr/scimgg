/**
 * Runs only the runtime cache-coverage check (`npm run check:cache-runtime`), a manual, optional
 * check kept out of `npm test` because it takes minutes. One worker, one file, because the check
 * is a single long scenario sequence over the whole trimmed cache.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from '../vite.config';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    root,
    test: {
      include: ['scripts/cache-runtime.check.ts'],
      environment: 'happy-dom',
      maxWorkers: 1,
      fileParallelism: false,
      testTimeout: 30 * 60_000,
      hookTimeout: 10 * 60_000,
    },
  }),
);
