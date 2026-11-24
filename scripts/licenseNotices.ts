/**
 * Builds `dist/licenses.txt`, the attribution file this app's bundle ships with.
 *
 * `vite.config.ts` sets `output.comments: false` and mangles top-level names, so
 * every `@license` banner a dependency ships is stripped from `dist/`. MIT and
 * BSD both require the copyright notice be reproduced in binary distributions,
 * and a minified bundle with no notices anywhere satisfies neither. This file is
 * where those notices go instead — deleting it re-breaks roughly thirty licenses
 * at once, silently, because nothing else in the build would notice.
 *
 * `collectPackageNotices` THROWS on a production dependency with no discoverable
 * license. That is the point: an unlicensed package is one we have no grant to
 * ship at all, and a build failure is the only thing that reliably catches it
 * before it reaches users.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';
import { assertLicensePolicy } from './licensePolicy.ts';
import { VENDORED_NOTICES, type VendoredNotice } from './vendoredNotices.ts';

export const NOTICES_FILE_NAME = 'licenses.txt';

/**
 * Matches `LICENSE`, `LICENSE.md`, `COPYING`, `NOTICE` — and the suffixed forms
 * a multi-licensed package uses, such as rc's `LICENSE.MIT` / `LICENSE.BSD` /
 * `LICENSE.APACHE2`.
 */
const LICENSE_FILE_PATTERN = /^(licen[cs]e|copying|notice)([-._][a-z0-9]+)*$/i;

/** Source and metadata files whose names collide with the pattern above. */
const NON_LICENSE_EXTENSION = /\.(js|cjs|mjs|ts|tsx|json|map|lock|ya?ml|toml|h|c)$/i;

/**
 * Our choice where a dependency offers one. Recording it is not bookkeeping:
 * an unrecorded election leaves the GPL branch of a dual license arguably live
 * against this MIT-licensed bundle.
 */
const LICENSE_ELECTIONS: Readonly<Record<string, string>> = { jszip: 'MIT' };

/**
 * Extra in-package files carrying a license the root file leaves out.
 *
 * pako declares `(MIT AND Zlib)` but its root LICENSE is the MIT half alone; the
 * zlib notice covering the ported C sources sits in `lib/zlib/README`. Read from
 * the installed package rather than copied here so it tracks the upstream text,
 * and a missing path THROWS — an upgrade that relocates the file must fail the
 * build rather than silently drop the notice again.
 */
const EXTRA_LICENSE_FILES: Readonly<Record<string, readonly string[]>> = { pako: ['lib/zlib/README'] };

/**
 * Text signatures proving a named license is actually present in what we
 * reproduce. Used only to audit `AND` compounds, where every conjunct binds us
 * and a root license file may cover just one of them.
 */
const LICENSE_TEXT_MARKERS: Readonly<Record<string, RegExp>> = {
  MIT: /Permission is hereby granted, free of charge/i,
  Zlib: /Permission is granted to anyone to use this software for any purpose/i,
  'Apache-2.0': /Apache License/i,
  'BSD-2-Clause': /Redistribution and use in source and binary forms/i,
  'BSD-3-Clause': /Redistribution and use in source and binary forms/i,
  ISC: /Permission to use, copy, modify, and(\/or)? distribute/i,
};

/**
 * Restrictive licenses recognized from their own text, ordered so the narrower
 * GNU headers win before the generic one.
 *
 * The policy gate keys on a package's DECLARED license. A package that declares
 * nothing in `package.json` is judged by its text instead: one of these makes it
 * fail as that license, and any other text sends it to review as `NOASSERTION`.
 * Only restrictive licenses are inferred, because a permissive-looking text can
 * carry extra terms that a pattern would miss.
 */
const TEXT_INFERRED_LICENSES: readonly { readonly pattern: RegExp; readonly spdx: string }[] = [
  { pattern: /GNU AFFERO GENERAL PUBLIC LICENSE/i, spdx: 'AGPL-3.0' },
  { pattern: /GNU LESSER GENERAL PUBLIC LICENSE/i, spdx: 'LGPL-3.0' },
  { pattern: /GNU GENERAL PUBLIC LICENSE/i, spdx: 'GPL-3.0' },
  { pattern: /Server Side Public License/i, spdx: 'SSPL-1.0' },
  { pattern: /Mozilla Public License/i, spdx: 'MPL-2.0' },
  { pattern: /Eclipse Public License/i, spdx: 'EPL-2.0' },
  { pattern: /Creative Commons Attribution-NonCommercial/i, spdx: 'CC-BY-NC-4.0' },
];

function inferLicenseFromText(text: string): string | undefined {
  return TEXT_INFERRED_LICENSES.find(({ pattern }) => pattern.test(text))?.spdx;
}

const SEPARATOR = '='.repeat(80);

export interface PackageNotice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly repository?: string;
  /** Verbatim license files, else its README's license section, or `undefined` when it has neither. */
  readonly text?: string;
}

interface PackageManifest {
  readonly name?: string;
  readonly version?: string;
  readonly license?: string | { readonly type?: string };
  readonly licenses?: readonly { readonly type?: string }[];
  readonly repository?: string | { readonly url?: string };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

export class MissingLicenseError extends Error {
  constructor(packages: readonly string[]) {
    super(
      `No license found for ${packages.length} production ${packages.length === 1 ? 'dependency' : 'dependencies'}:\n` +
        packages.map((name) => `  - ${name}`).join('\n') +
        '\n\nA package with no license grants us no right to redistribute it. ' +
        'Remove it, or replace it with a licensed equivalent.',
    );
    this.name = 'MissingLicenseError';
  }
}

function readManifest(directory: string): PackageManifest | undefined {
  const manifestPath = join(directory, 'package.json');
  if (!existsSync(manifestPath)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  return typeof parsed === 'object' && parsed !== null ? (parsed as PackageManifest) : undefined;
}

/**
 * Node's own resolution order: nearest `node_modules` first, then upwards. It
 * stops at `rootDirectory` so a hoisted install cannot pull an attribution out
 * of a parent checkout that is not part of this build.
 */
function resolvePackageDirectory(name: string, fromDirectory: string, rootDirectory: string): string | undefined {
  let current = fromDirectory;
  for (;;) {
    const candidate = join(current, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (current === rootDirectory) return undefined;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function readLicenseText(directory: string, packageName: string): string | undefined {
  const parts: string[] = [];

  // Every match, not the first: a package offering a choice ships one file per
  // license, and taking only `readdir`'s first entry reproduces an arbitrary
  // one of them. Sorted so the output does not depend on directory order.
  const matches = readdirSync(directory)
    .filter((entry) => LICENSE_FILE_PATTERN.test(entry) && !NON_LICENSE_EXTENSION.test(entry))
    .sort();

  for (const entry of matches) {
    const filePath = join(directory, entry);
    if (!statSync(filePath).isFile()) continue;
    const text = readFileSync(filePath, 'utf-8').trim();
    if (text.length > 0) parts.push(matches.length > 1 ? `${entry}:\n\n${text}` : text);
  }

  for (const relativePath of EXTRA_LICENSE_FILES[packageName] ?? []) {
    const extraPath = join(directory, relativePath);
    if (!existsSync(extraPath)) {
      throw new Error(
        `${packageName} no longer ships "${relativePath}", which carried part of its license. ` +
          'Find where that notice moved and update EXTRA_LICENSE_FILES in scripts/licenseNotices.ts.',
      );
    }
    parts.push(readFileSync(extraPath, 'utf-8').trim());
  }

  return parts.length > 0 ? parts.join('\n\n---\n\n') : undefined;
}

const README_FILE_PATTERN = /^readme(\.(md|markdown|txt))?$/i;
const README_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/**
 * The "License" section of a package's README, for a package that ships no license file.
 *
 * Some small packages (isarray) keep their copyright notice only in the README, and without this
 * `licenses.txt` would carry a pointer to a repository in its place. The section runs from a
 * `License`/`Licence` heading to the next heading of the same or a higher level, and is used only if
 * it names a copyright holder: a bare "MIT" says nothing the declaration does not. The README's HTML
 * entities for `<`, `>` and `&` are decoded, as a reader of the rendered README sees them.
 */
function readReadmeLicenseSection(directory: string): string | undefined {
  const readme = readdirSync(directory)
    .filter((entry) => README_FILE_PATTERN.test(entry))
    .sort()[0];
  if (readme === undefined) return undefined;

  const lines = readFileSync(join(directory, readme), 'utf-8').split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = README_HEADING.exec(line);
    return heading !== null && /^licen[cs]e\b/i.test(heading[2]);
  });
  if (start === -1) return undefined;

  const level = (README_HEADING.exec(lines[start]) as RegExpExecArray)[1].length;
  const relativeEnd = lines.slice(start + 1).findIndex((line) => {
    const heading = README_HEADING.exec(line);
    return heading !== null && heading[1].length <= level;
  });
  const body = lines
    .slice(start + 1, relativeEnd === -1 ? undefined : start + 1 + relativeEnd)
    .join('\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

  return /copyright/i.test(body) ? `From ${readme}, "${lines[start].replace(/^#+\s*/, '')}":\n\n${body}` : undefined;
}

/**
 * Conjuncts of an `AND` expression we cannot find in the text we reproduce.
 *
 * Unknown identifiers are skipped rather than reported: a license with no marker
 * cannot be verified either way, and failing on it would make every unusual
 * SPDX id a build break.
 */
function unrepresentedConjuncts(declared: string, text: string): string[] {
  if (!/\sAND\s/i.test(declared)) return [];

  return declared
    .replace(/[()]/g, '')
    .split(/\s+AND\s+/i)
    .map((term) => term.trim())
    .filter((term) => {
      const marker = LICENSE_TEXT_MARKERS[term];
      return marker !== undefined && !marker.test(text);
    });
}

export class IncompleteLicenseTextError extends Error {
  constructor(packages: readonly { name: string; declared: string; missing: readonly string[] }[]) {
    super(
      'License text is missing part of what these packages declare:\n' +
        packages
          .map((p) => `  - ${p.name} declares "${p.declared}" but ships no ${p.missing.join(' or ')} text`)
          .join('\n') +
        '\n\nEvery half of an AND expression binds us, so reproducing only one under-attributes.\n' +
        'Locate the missing notice inside the package and add its path to EXTRA_LICENSE_FILES\n' +
        'in scripts/licenseNotices.ts.',
    );
    this.name = 'IncompleteLicenseTextError';
  }
}

function declaredLicense(manifest: PackageManifest): string | undefined {
  const { license, licenses } = manifest;
  if (typeof license === 'string' && license.length > 0) return license;
  if (typeof license === 'object' && license !== null && license.type !== undefined) return license.type;
  if (licenses !== undefined) {
    const types = licenses.map((entry) => entry.type).filter((type): type is string => type !== undefined);
    if (types.length > 0) return types.join(' OR ');
  }
  return undefined;
}

function repositoryUrl(manifest: PackageManifest): string | undefined {
  const { repository } = manifest;
  const raw = typeof repository === 'string' ? repository : repository?.url;
  // `git://` is GitHub's retired unauthenticated protocol; a reader can only follow the https form.
  return raw
    ?.replace(/^git\+/, '')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/\.git$/, '');
}

/**
 * Every package reachable from the root `dependencies`, transitively.
 *
 * devDependencies are deliberately absent: they are build tooling that is never
 * redistributed, so their licenses carry no distribution obligation. Adding them
 * would bury the ~30 entries that DO matter under several hundred that do not.
 */
export function collectPackageNotices(rootDirectory: string): PackageNotice[] {
  const rootManifest = readManifest(rootDirectory);
  if (rootManifest === undefined) throw new Error(`No package.json at ${rootDirectory}`);

  const notices = new Map<string, PackageNotice>();
  const unlicensed: string[] = [];
  const incomplete: { name: string; declared: string; missing: readonly string[] }[] = [];
  const policyEntries: { subject: string; declared: string; elected?: string }[] = [];
  const seen = new Set<string>();
  const queue: { name: string; from: string }[] = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({
    name,
    from: rootDirectory,
  }));

  while (queue.length > 0) {
    const { name, from } = queue.shift() as { name: string; from: string };
    const directory = resolvePackageDirectory(name, from, rootDirectory);
    if (directory === undefined) continue;
    if (seen.has(directory)) continue;
    seen.add(directory);

    const manifest = readManifest(directory);
    if (manifest === undefined) continue;

    const version = manifest.version ?? '0.0.0';
    const text = readLicenseText(directory, name) ?? readReadmeLicenseSection(directory);
    const declared = declaredLicense(manifest);
    if (text === undefined && declared === undefined) {
      unlicensed.push(`${name}@${version}`);
    } else {
      const elected = LICENSE_ELECTIONS[name];
      const license =
        elected === undefined
          ? (declared ?? 'See license text below')
          : `${elected} (elected from "${declared ?? elected}")`;
      notices.set(`${name}@${version}`, { name, version, license, repository: repositoryUrl(manifest), text });
      if (declared !== undefined) {
        policyEntries.push({ subject: name, declared, elected });
        const missing = text === undefined ? [] : unrepresentedConjuncts(declared, text);
        if (missing.length > 0) incomplete.push({ name, declared, missing });
      } else if (text !== undefined) {
        // With no declaration the gate has only the text. A restrictive license it recognizes
        // fails outright; anything else goes to review as NOASSERTION rather than passing unread.
        policyEntries.push({ subject: name, declared: inferLicenseFromText(text) ?? 'NOASSERTION' });
      }
    }

    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      queue.push({ name: dependency, from: directory });
    }
  }

  if (unlicensed.length > 0) throw new MissingLicenseError(unlicensed.sort());
  if (incomplete.length > 0) throw new IncompleteLicenseTextError(incomplete);
  assertLicensePolicy(policyEntries);

  return [...notices.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function renderVendored(notice: VendoredNotice): string {
  // `applies` is deliberately absent: it names our own tree, which no permissive
  // license asks us to disclose and which a reader holding only the bundle
  // cannot check anything against.
  const attribution = notice.attribution === undefined ? [] : ['', ...notice.attribution];
  return [
    notice.component,
    `Source:  ${notice.source}`,
    `License: ${notice.elected === undefined ? notice.license : `${notice.elected} (elected from "${notice.license}")`}`,
    ...attribution,
    '',
    notice.text,
  ].join('\n');
}

function renderPackage(notice: PackageNotice): string {
  const header = [
    `${notice.name}@${notice.version}`,
    notice.repository === undefined ? undefined : `Source:  ${notice.repository}`,
    `License: ${notice.license}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');

  // A package declaring a license but shipping no file is common and legitimate
  // (npm strips it, or the author never added one). Saying so is honest; inventing
  // the standard text under a copyright holder we guessed at is not.
  const body =
    notice.text ??
    `This package declares "${notice.license}" but distributes no license file.\nSee ${
      notice.repository ?? 'the package repository'
    } for the full terms.`;

  return `${header}\n\n${body}`;
}

/**
 * `projectLicense` is this project's own LICENSE text. It leads the file because a fork that
 * distributes only the build must still carry the MIT notice, and the bundle has no other copy.
 */
export function renderLicenseNotices(
  packages: readonly PackageNotice[],
  vendored: readonly VendoredNotice[] = VENDORED_NOTICES,
  projectLicense?: string,
): string {
  // Ported code carries the same obligations as an installed package, and no
  // manifest walk can see it. Without this, adding a GPL port to
  // vendoredNotices.ts would relicense the bundle and still build green.
  assertLicensePolicy(
    vendored.map((notice) => ({ subject: notice.component, declared: notice.license, elected: notice.elected })),
  );

  const project =
    projectLicense === undefined
      ? []
      : [SEPARATOR, 'THIS PROJECT', SEPARATOR, '', projectLicense.trim(), '', '-'.repeat(80), ''];

  const sections = [
    'Scim.GG — Licenses',
    '',
    'Generated at build time by scripts/licenseNotices.ts. Do not edit by hand.',
    '',
    "This build's own license, then the third-party software it includes, each",
    'reproduced with the license it is distributed under. Scim.GG is an unofficial',
    'fan project and is not endorsed by or affiliated with Jagex Ltd. Old School',
    'RuneScape and its game assets and trademarks belong to Jagex Ltd.',
    '',
    ...project,
    SEPARATOR,
    `PORTED AND VENDORED MATERIAL (${vendored.length})`,
    SEPARATOR,
    '',
    'Code and data adapted into this project, and the statement covering game',
    'content, none of which a dependency manifest records.',
    '',
    ...vendored.flatMap((notice) => [renderVendored(notice), '', '-'.repeat(80), '']),
    SEPARATOR,
    `NPM PACKAGES (${packages.length})`,
    SEPARATOR,
    '',
    ...packages.flatMap((notice) => [renderPackage(notice), '', '-'.repeat(80), '']),
  ];

  return `${sections.join('\n').trimEnd()}\n`;
}

/** Read rather than copied, so the shipped notice cannot drift from the repository's LICENSE. */
function readProjectLicense(rootDirectory: string): string {
  const licensePath = join(rootDirectory, 'LICENSE');
  if (!existsSync(licensePath)) {
    throw new Error(`No LICENSE at ${rootDirectory}: the build must ship this project's own license notice.`);
  }
  return readFileSync(licensePath, 'utf-8');
}

export function buildLicenseNotices(rootDirectory: string): string {
  return renderLicenseNotices(
    collectPackageNotices(rootDirectory),
    VENDORED_NOTICES,
    readProjectLicense(rootDirectory),
  );
}

/**
 * Emits the notices as a build asset and serves the same bytes in dev.
 *
 * Dev matters because the in-app link to `/licenses.txt` would otherwise 404
 * everywhere except a production build, which is exactly where a broken link
 * goes unnoticed.
 */
export function licenseNoticesPlugin(): Plugin {
  let rootDirectory = process.cwd();

  return {
    name: 'license-notices',
    configResolved(config) {
      rootDirectory = config.root;
    },
    configureServer(server) {
      server.middlewares.use(`/${NOTICES_FILE_NAME}`, (_request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end(buildLicenseNotices(rootDirectory));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: NOTICES_FILE_NAME, source: buildLicenseNotices(rootDirectory) });
    },
  };
}
