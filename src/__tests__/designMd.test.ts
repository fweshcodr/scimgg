import { readFileSync } from 'node:fs';
import { lint } from '@google/design.md/linter';
import { expect, it } from 'vitest';

const markdown = readFileSync(new URL('../../DESIGN.md', import.meta.url), 'utf8');

// The spec's canonical sections. Tools parse these exact names, so near-synonyms and new
// top-level sections are not allowed; omitting a section is.
const CANONICAL_SECTIONS = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
];

it('keeps DESIGN.md to the canonical sections, in order', () => {
  const sections = markdown
    .replace(/^```[\s\S]*?^```/gm, '')
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
  expect(
    sections,
    `DESIGN.md "## " headings must be a subset of, in this order: ${CANONICAL_SECTIONS.join(', ')}`,
  ).toEqual(CANONICAL_SECTIONS.filter((section) => sections.includes(section)));
});

it('keeps DESIGN.md free of spec errors', () => {
  const errors = lint(markdown).findings.filter((finding) => finding.severity === 'error');
  const message = [
    'Fix DESIGN.md errors listed below. Run the local linter from the repo root:',
    'node node_modules/.bin/design.md lint DESIGN.md',
    ...errors.map((finding) => `${finding.path ?? 'DESIGN.md'}: ${finding.message}`),
  ].join('\n');

  expect(errors, message).toEqual([]);
});
