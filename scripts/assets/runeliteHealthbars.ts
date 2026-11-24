/**
 * The overhead health bars: RuneLite's "2010" interface-style bars, fetched at setup from one pinned
 * RuneLite commit (BSD-2-Clause; see THIRD_PARTY_NOTICES.md), plus our two recolors of them.
 *
 * The cache's own health-bar sprites are flat 5px bars, not the shaded 7px bars the game view
 * draws, so these are not derived from it. Nothing here is committed: setup downloads each original,
 * checks it against its SHA-256 pin, and computes the recolors from it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { download } from '../httpsDownload';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const HEALTHBAR_DIR = path.join(REPO_ROOT, 'public/assets/ui/healthbar');

/** The last commit to touch the healthbar resources (2025-01-04). */
export const RUNELITE_COMMIT = 'ae11244136b396dcbf976b38974a3877bbe62cd6';
const SOURCE_BASE = `https://raw.githubusercontent.com/runelite/runelite/${RUNELITE_COMMIT}/runelite-client/src/main/resources/net/runelite/client/plugins/interfacestyles/2010/healthbar`;

/** Every width `HEALTHBAR_WIDTH_BY_SIZE` (src/render/npc/NpcInstanceManager.ts) can draw. */
export const HEALTHBAR_WIDTHS = [40, 60, 80, 100, 120] as const;

/** SHA-256 of each original at `RUNELITE_COMMIT`. */
export const HEALTHBAR_PINS: Readonly<Record<string, string>> = {
  'default_front_40px.png': 'a3fc2aaddd13e39e4089dbab913169c397f2f750954d9020246b9695c0be3e17',
  'default_front_60px.png': '9ea91e9eb09b13ae252854b43a2e64cfdf23a2923641e519032abfce9750c936',
  'default_front_80px.png': '1914314d801569e3ca40f0af06295a5691be5959d481e24dacd13f6e6043bb82',
  'default_front_100px.png': 'f5cf6b6fe853fb15aec2ef05164495de04536f191065e213a1c603b06153c401',
  'default_front_120px.png': 'd6e0c55aa952084f00f0e9983abcd97d909f6fad44858de9ac177710f96db063',
  'default_back_40px.png': '1151351c2653294905b0ad9c864ccf698be8aa004a9f166165ade70abc83785c',
  'default_back_60px.png': '186cc0064a042a46641f73bae70218c19b59907fdbb52bd6008494f94b90c2ce',
  'default_back_80px.png': '64e06fc8dba67fe3251ad303155e04582127fba986aa5d8afafb4cb901d6edce',
  'default_back_100px.png': 'd65e024924bda80f65038ec7fd35dcb222d7361f4821e18f90309230932c391f',
  'default_back_120px.png': 'e666051706f554653a16398ee907a71997e7b1eda5ad24b4d4b1f91d7a6356cb',
};

type Rgb = readonly [number, number, number];

/**
 * The NPC bars: a dark back and a yellow front, recolored from RuneLite's red back and green
 * front. Alpha is kept; only opaque pixels change.
 */
export const HEALTHBAR_RECOLOURS = [
  {
    prefix: 'dark_back',
    from: 'default_back',
    // Grayscale at 40% of BT.601 luma.
    colour: ([r, g, b]: Rgb): Rgb => {
      const grey = Math.floor((0.299 * r + 0.587 * g + 0.114 * b) * 0.4);
      return [grey, grey, grey];
    },
  },
  {
    prefix: 'yellow_front',
    from: 'default_front',
    // The green channel becomes red, and 78% of it green: green ramps to the same yellow ramp.
    colour: ([, g, b]: Rgb): Rgb => [g, Math.floor(g * 0.78), b],
  },
] as const;

/** Every file the healthbar step leaves in `HEALTHBAR_DIR`. */
export function healthbarFiles(): string[] {
  return [
    ...Object.keys(HEALTHBAR_PINS),
    ...HEALTHBAR_RECOLOURS.flatMap(({ prefix }) => HEALTHBAR_WIDTHS.map((width) => `${prefix}_${width}px.png`)),
  ];
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Originals missing from disk or not matching their pin. */
export function unpinnedHealthbars(): string[] {
  return Object.entries(HEALTHBAR_PINS)
    .filter(([name, pin]) => {
      const file = path.join(HEALTHBAR_DIR, name);
      return !existsSync(file) || sha256(readFileSync(file)) !== pin;
    })
    .map(([name]) => name);
}

export async function recolourHealthbar(original: Buffer, colour: (rgb: Rgb) => Rgb): Promise<Buffer> {
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = colour([data[i]!, data[i + 1]!, data[i + 2]!]);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function writeAtomically(file: string, bytes: Buffer): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, file);
}

/** Downloads (unless `offline`) and verifies the originals, then writes the recolors. */
export async function ensureHealthbars({ offline = false }: { offline?: boolean } = {}): Promise<void> {
  mkdirSync(HEALTHBAR_DIR, { recursive: true });
  const todo = unpinnedHealthbars();
  if (todo.length > 0 && offline) {
    throw new Error(
      `[healthbars] --offline, and ${todo.length} RuneLite healthbar(s) are not on disk, e.g. ${todo[0]}. ` +
        `Run \`npm run setup\` online once, or place them in ${path.relative(REPO_ROOT, HEALTHBAR_DIR)}/ ` +
        `from ${SOURCE_BASE}/`,
    );
  }
  for (const name of todo) {
    const url = `${SOURCE_BASE}/${name}`;
    const { status, body } = await download(url).catch((err: unknown) => {
      throw new Error(`[healthbars] Could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`);
    });
    if (!body) throw new Error(`[healthbars] HTTP ${status} fetching ${url}`);
    const actual = sha256(body);
    if (actual !== HEALTHBAR_PINS[name]) {
      throw new Error(`[healthbars] ${url} has sha256 ${actual}, not the pinned ${HEALTHBAR_PINS[name]}.`);
    }
    writeAtomically(path.join(HEALTHBAR_DIR, name), body);
  }
  for (const { prefix, from, colour } of HEALTHBAR_RECOLOURS) {
    for (const width of HEALTHBAR_WIDTHS) {
      const original = readFileSync(path.join(HEALTHBAR_DIR, `${from}_${width}px.png`));
      writeAtomically(path.join(HEALTHBAR_DIR, `${prefix}_${width}px.png`), await recolourHealthbar(original, colour));
    }
  }
  console.log(
    `[healthbars] ${healthbarFiles().length} healthbar sprites in place (RuneLite ${RUNELITE_COMMIT.slice(0, 10)}).`,
  );
}
