/**
 * Regenerates `sceneObjectDrawGoldens.json` and `animatedLocDrawGoldens.json`. The scenarios,
 * cache loading and digest come from this tree; `SceneObjectRenderer` and `LocRenderer`, with
 * everything they import, come from `--renderer-root`. Each fixture's `regenerate` field holds the
 * command.
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { LocRendererLike } from '../../render/environment/__tests__/animatedLocDrawStream';
import type { SceneObjectRendererLike } from '../../render/graphics/__tests__/sceneObjectDrawStream';
import type { SceneObjectLocModelLoader } from '../../render/graphics/SceneObjectRenderer';
import {
  findTestCacheForGenerator,
  openTestCache,
  regenerateCommand,
  rendererRootArgument,
  writeGoldenFixture,
} from './cacheFixtures';
import { buildScenarioGolden, type DrawGoldenFile, type ScenarioGolden } from './meshDrawStream';

const SCENE_OBJECT_GOLDENS = fileURLToPath(
  new URL('../../render/graphics/__tests__/sceneObjectDrawGoldens.json', import.meta.url),
);
const ANIMATED_LOC_GOLDENS = fileURLToPath(
  new URL('../../render/environment/__tests__/animatedLocDrawGoldens.json', import.meta.url),
);

async function main(): Promise<void> {
  // picogl's UMD build, reached through the encounter registry, needs a browser global before the
  // scenario modules load.
  (globalThis as { self?: unknown }).self ??= globalThis;
  const { LOC_GOLDEN_DIGEST, loadEncounterSceneries, recordLocDrawStream } = await import(
    '../../render/environment/__tests__/animatedLocDrawStream'
  );
  const { loadRealCacheFixture, recordDrawStream, SCENE_OBJECT_GOLDEN_DIGEST } = await import(
    '../../render/graphics/__tests__/sceneObjectDrawStream'
  );
  const root = rendererRootArgument();
  const { path: cachePath, sha256 } = await findTestCacheForGenerator();
  const cache = { file: '.test-cache/disk.zip', sha256 };
  const regenerate = regenerateCommand('src/test/helpers/generateLocDrawGoldens.ts');
  const pinned = (path: string) => import(pathToFileURL(resolve(root, path)).href);

  const { SceneObjectRenderer } = (await pinned('src/render/graphics/SceneObjectRenderer.ts')) as {
    SceneObjectRenderer: new (loader: SceneObjectLocModelLoader) => SceneObjectRendererLike;
  };
  const sceneObjects = await loadRealCacheFixture(cachePath);
  const sceneObjectScenarios: Record<string, ScenarioGolden> = {};
  for (const scenario of sceneObjects.scenarios) {
    const play = (vertices: 'own' | 'gpu') =>
      recordDrawStream(new SceneObjectRenderer(sceneObjects.loader), scenario, vertices, SCENE_OBJECT_GOLDEN_DIGEST);
    sceneObjectScenarios[scenario.name] = buildScenarioGolden(play('own'), play('gpu'));
  }
  writeGoldenFixture(SCENE_OBJECT_GOLDENS, {
    about:
      'SceneObjectRenderer draw digests recorded from the renderer at --renderer-root: per drawn frame, the draw count ' +
      'and a hash of each draw (part and frame, render state, matrix, positions, colors, alphas, face bias, uvs, ' +
      'texture ids, world-space vertices; normals excluded), plus the draws whose mesh-id keyed GPU data was not ' +
      'their own bake on that renderer.',
    regenerate,
    cache,
    digest: 'SCENE_OBJECT_GOLDEN_DIGEST in src/render/graphics/__tests__/sceneObjectDrawStream.ts',
    scenarios: sceneObjectScenarios,
  } satisfies DrawGoldenFile);

  const { LocRenderer } = (await pinned('src/render/environment/LocRenderer.ts')) as {
    LocRenderer: new () => LocRendererLike;
  };
  const { loader, maps } = await openTestCache(cachePath);
  const locScenarios: Record<string, ScenarioGolden> = {};
  for (const scenery of await loadEncounterSceneries(loader, maps)) {
    const play = (vertices: 'own' | 'gpu') =>
      recordLocDrawStream(new LocRenderer(), loader, scenery, vertices, LOC_GOLDEN_DIGEST);
    locScenarios[scenery.name] = buildScenarioGolden(await play('own'), await play('gpu'));
  }
  writeGoldenFixture(ANIMATED_LOC_GOLDENS, {
    about:
      'LocRenderer draw digests recorded from the renderer at --renderer-root, as in sceneObjectDrawGoldens.json; ' +
      'static merged LOC meshes also exclude alphas.',
    regenerate,
    cache,
    digest: 'LOC_GOLDEN_DIGEST in src/render/environment/__tests__/animatedLocDrawStream.ts',
    scenarios: locScenarios,
  } satisfies DrawGoldenFile);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
