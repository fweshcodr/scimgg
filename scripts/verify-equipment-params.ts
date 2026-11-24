/**
 * Verifies ObjType combat-stat params against OSRS Wiki bonuses using the pinned full cache that
 * `npm run setup` leaves in `.setup-cache/`. Every id is cross-read on every witness so
 * `unpinnedParams` can prove the expected mapping is the only assignment the evidence admits.
 *
 * Usage: npx tsx scripts/verify-equipment-params.ts
 * Read-only and offline: it fails if the setup cache is missing rather than downloading one.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCacheLoaders } from '../src/test/helpers/real-cache';
import { paramsUnderTest, unpinnedParams, WITNESSES } from './equipmentParamWitnesses';

async function main(): Promise<void> {
  const { objTypeLoader } = await loadCacheLoaders('pinned');
  const cached = new Map(WITNESSES.map((witness) => [witness.item, objTypeLoader.load(witness.item).params]));

  const readings = new Map(
    WITNESSES.map((witness) => {
      const params = cached.get(witness.item);
      const row = new Map<number, number>();
      for (const param of paramsUnderTest(WITNESSES)) {
        const value = params?.get(param);
        if (typeof value === 'number') row.set(param, value);
      }
      return [witness.item, row] as const;
    }),
  );

  const unpinned = unpinnedParams(WITNESSES, readings);
  if (unpinned.length > 0) {
    console.error('FAIL — the witness set cannot tell these ids apart, so a pass would prove nothing:');
    for (const entry of unpinned) console.error(`  - ${entry}`);
    process.exitCode = 1;
    return;
  }

  const failures: string[] = [];
  let checks = 0;

  for (const witness of WITNESSES) {
    const params = cached.get(witness.item);
    for (const [param, label, expected] of witness.wiki) {
      checks += 1;
      const actual = params?.get(param);
      if (actual !== expected) {
        failures.push(`${witness.name} (${witness.item}) param ${param} [${label}]: cache=${actual} wiki=${expected}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`FAIL — ${failures.length}/${checks} param mappings disagree with the wiki:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK — ${checks} param mappings across ${WITNESSES.length} items match the wiki's published bonuses.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error: unknown) => {
    console.error('[verify-equipment-params] Failed:', error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
