import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssRuleBlocks, withoutCssComments } from '../test/helpers/cssRules';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const SCROLLBAR_GATE = /@supports\s+not\s+selector\(\s*::-webkit-scrollbar\s*\)\s*\{/g;
const SIZING = new Set(['height', 'max-height', 'min-height']);
const VH = /\d[\d.]*vh\b/;

interface Sheet {
  file: string;
  css: string;
}

interface Block {
  file: string;
  selectors: string[];
  body: string;
  /** Inside `@supports not selector(::-webkit-scrollbar)`, i.e. reaches Firefox only. */
  gated: boolean;
}

function projectSheets(): Sheet[] {
  const out: Sheet[] = [];
  for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.css')) continue;
    const path = join(entry.parentPath, entry.name);
    out.push({ file: path.slice(SRC.length), css: readFileSync(path, 'utf8') });
  }
  return out;
}

function gatedRanges(css: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of css.matchAll(SCROLLBAR_GATE)) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    out.push([m.index, i]);
  }
  return out;
}

function blocksOf(sheets: Sheet[]): Block[] {
  const out: Block[] = [];
  for (const { file, css: raw } of sheets) {
    const css = withoutCssComments(raw);
    const ranges = gatedRanges(css);
    for (const { selectors, body, index } of cssRuleBlocks(css)) {
      out.push({
        file,
        selectors,
        body,
        gated: ranges.some(([start, end]) => index > start && index < end),
      });
    }
  }
  return out;
}

/** Declarations in `body` as `[property, value]`, both normalized for comparison. */
function declarations(body: string): [string, string][] {
  return body
    .split(';')
    .map((d) => d.split(':'))
    .filter((p) => p.length >= 2)
    .map(
      ([prop, ...rest]) =>
        [prop.trim().toLowerCase(), rest.join(':').trim().replace(/\s+/g, ' ').toLowerCase()] as [string, string],
    );
}

/** `.foo::-webkit-scrollbar-thumb:hover` -> `.foo`; a bare pseudo yields `''`. */
const base = (selector: string): string => selector.split('::')[0].trim();

// Each check is a pure function over stylesheets so the fixtures at the bottom can prove it
// actually fires. A check that only ever asserts "no offenders" passes just as happily when
// its own parser is broken.

/**
 * WebKit's `::-webkit-textfield-decoration-container` is a flex box holding the input's inner
 * editor, not just its decorations, and Safari builds it only for inputs that have a
 * decoration. Styling it reaches the editable region of exactly those inputs (e.g. a password
 * field), which can shrink to its padding height and drop keystrokes on Safari. The
 * prohibition is absolute rather than a list of dangerous declarations: `width: 0` and
 * `overflow: hidden` break it as thoroughly as `display: none`.
 */
function findDecorationContainerRules(sheets: Sheet[]): string[] {
  return blocksOf(sheets)
    .filter((b) => b.selectors.some((s) => s.includes('::-webkit-textfield-decoration-container')))
    .map((b) => `${b.file}: ${b.selectors.join(', ')}`);
}

/**
 * Unprefixed `appearance` is Safari 15.4+; below that a styled `<button>` or `<select>` keeps
 * its native OS chrome. The twin must carry the SAME value — `-webkit-appearance: auto` beside
 * `appearance: none` is a pair on paper and a native widget on screen.
 */
function findUnpairedAppearance(sheets: Sheet[]): string[] {
  const out: string[] = [];
  for (const block of blocksOf(sheets)) {
    const decls = declarations(block.body);
    for (const [prop, value] of decls) {
      if (prop !== 'appearance') continue;
      if (decls.some(([p, v]) => p === '-webkit-appearance' && v === value)) continue;
      out.push(`${block.file}: ${block.selectors.join(', ')} { appearance: ${value} }`);
    }
  }
  return out;
}

/**
 * Chrome 121+ and Safari 18.2+ support scrollbar-width/scrollbar-color, and setting either
 * makes them discard that element's ::-webkit-scrollbar rules wholesale. Every themed scroller
 * here is authored with the pseudo-elements, so the standard properties may only reach engines
 * with no pseudo-element support at all — Firefox, selected by the gate. Styling an element
 * with ONLY the standard properties is fine and sometimes the point: tutorial.css sets
 * scrollbar-color precisely to force Chrome off its overlay scrollbar. Only both together conflict.
 */
function findConflictingScrollbarRules(sheets: Sheet[]): string[] {
  const blocks = blocksOf(sheets);
  const withPseudo = new Set<string>();
  for (const block of blocks) {
    for (const selector of block.selectors) {
      if (selector.includes('::-webkit-scrollbar') && base(selector)) withPseudo.add(base(selector));
    }
  }

  const out: string[] = [];
  for (const block of blocks) {
    if (block.gated) continue;
    if (!declarations(block.body).some(([p]) => p === 'scrollbar-width' || p === 'scrollbar-color')) continue;
    for (const selector of block.selectors) {
      if (withPseudo.has(base(selector))) out.push(`${block.file}: ${selector}`);
    }
  }
  return out;
}

/**
 * iOS Safari resolves `vh` against the LARGE viewport, so a `vh`-sized box sits partly under
 * the dynamic toolbar; `dvh` tracks the visible height. The pair is a fallback, not a
 * duplicate, so order and value both matter: the `dvh` declaration must come AFTER its `vh`
 * twin, or the `vh` one wins wherever it parses, and must be the same length expression, or
 * the two declarations size the box differently.
 */
function findUnpairedViewportHeights(sheets: Sheet[]): string[] {
  const out: string[] = [];
  for (const block of blocksOf(sheets)) {
    const decls = declarations(block.body);
    decls.forEach(([prop, value], i) => {
      if (!SIZING.has(prop) || !VH.test(value)) return;
      const wanted = value.replace(/(\d[\d.]*)vh\b/g, '$1dvh');
      if (decls.slice(i + 1).some(([p, v]) => p === prop && v === wanted)) return;
      out.push(`${block.file}: ${block.selectors.join(', ')} { ${prop}: ${value} }`);
    });
  }
  return out;
}

describe('cross-browser CSS invariants', () => {
  const sheets = projectSheets();

  it('suppresses every outline, with no opt-in ring', () => {
    const rules = blocksOf(sheets.filter(({ file }) => file === 'index.css'));
    const focus = rules.find(({ selectors }) => selectors.includes('*:focus'));
    expect(declarations(focus?.body ?? '')).toEqual([['outline', 'none !important']]);
    expect(blocksOf(sheets).filter(({ selectors }) => selectors.some((s) => s.includes('.focus-ring')))).toEqual([]);
  });

  // Keyboard and focus policy (docs/agent-reference.md): chrome is driven by pointer and touch,
  // so only the loadout editor (the keyboard exception) and text fields style their focus.
  it('styles focus only in the loadout editor and on text fields', () => {
    const allowedFiles = new Set([
      'components/LoadoutPicker.css',
      'components/SlotPickerPopover.css',
      'components/RunePouchRow.css',
      'components/EquipmentSettings.css',
      'components/CacheExplorer.css',
    ]);
    const allowedSelectors = [
      '.inventory-slot',
      '.select-input',
      '.num-input',
      '.combat-stats__input',
      '.combat-stats__tile',
    ];
    const strays = blocksOf(sheets)
      .filter(({ file }) => !allowedFiles.has(file))
      .flatMap(({ file, selectors }) =>
        selectors
          .filter((s) => /:focus-(visible|within)/.test(s))
          .filter((s) => !allowedSelectors.some((allowed) => s.includes(allowed)))
          .map((s) => `${file}: ${s}`),
      );
    expect(strays).toEqual([]);
  });

  // A pointer press can leave :focus-visible matching (WASD after a click flips Chrome's
  // heuristic), so what focus styling remains shows only after keyboard input.
  it('gates the remaining focus treatments on keyboard input', () => {
    const ringRules = blocksOf(sheets).filter(
      (rule) =>
        rule.selectors.some((s) => s.includes(':focus-visible')) &&
        // Hover-equivalent borders (the loadout delete) are not rings; the test above still
        // confines them to the loadout editor and text fields.
        !rule.selectors.some((s) => s.includes(':hover')) &&
        declarations(rule.body).some(
          ([property, value]) =>
            ['outline', 'outline-color', 'box-shadow', 'border-color'].includes(property) &&
            value !== 'none' &&
            value !== 'none !important',
        ),
    );
    expect(ringRules.length).toBeGreaterThan(0);
    expect(
      ringRules.flatMap((rule) => rule.selectors.filter((s) => !s.startsWith(':root[data-focus-source="keyboard"] '))),
    ).toEqual([]);
  });

  it('never styles the WebKit text-field decoration container', () => {
    expect(findDecorationContainerRules(sheets)).toEqual([]);
  });

  it('always pairs appearance with a matching -webkit-appearance', () => {
    expect(findUnpairedAppearance(sheets)).toEqual([]);
  });

  it('never gives one element both ::-webkit-scrollbar rules and ungated standard properties', () => {
    expect(findConflictingScrollbarRules(sheets)).toEqual([]);
  });

  it('pairs every vh-sized height with a matching dvh fallback after it', () => {
    expect(findUnpairedViewportHeights(sheets)).toEqual([]);
  });
});

describe('cross-browser CSS invariants — the detectors fire', () => {
  const sheet = (css: string): Sheet[] => [{ file: 'fixture.css', css }];

  it('catches a decoration-container rule that never mentions display', () => {
    expect(findDecorationContainerRules(sheet('.a::-webkit-textfield-decoration-container { width: 0 }'))).toHaveLength(
      1,
    );
  });

  it('catches a decoration-container selector that is not the last of its list', () => {
    expect(
      findDecorationContainerRules(sheet('.a::-webkit-textfield-decoration-container,\n.b {\n  display: none;\n}')),
    ).toHaveLength(1);
  });

  it('catches -webkit-appearance carrying a different value', () => {
    expect(findUnpairedAppearance(sheet('.a { -webkit-appearance: auto; appearance: none }'))).toHaveLength(1);
    expect(findUnpairedAppearance(sheet('.a { -webkit-appearance: none; appearance: none }'))).toEqual([]);
  });

  it('catches a standard scrollbar property on any line of a grouped selector', () => {
    const css = '.a::-webkit-scrollbar { width: 4px }\n.z,\n.a {\n  scrollbar-width: thin;\n}';
    expect(findConflictingScrollbarRules(sheet(css))).toEqual(['fixture.css: .a']);
  });

  it('allows standard scrollbar properties behind the Firefox gate', () => {
    const css =
      '.a::-webkit-scrollbar { width: 4px }\n@supports not selector(::-webkit-scrollbar) {\n  .z,\n  .a {\n    scrollbar-width: thin;\n  }\n}';
    expect(findConflictingScrollbarRules(sheet(css))).toEqual([]);
  });

  it('catches a dvh fallback declared before its vh twin, or sized differently', () => {
    expect(findUnpairedViewportHeights(sheet('.a { max-height: 80dvh; max-height: 80vh }'))).toHaveLength(1);
    expect(findUnpairedViewportHeights(sheet('.a { max-height: 80vh; max-height: 70dvh }'))).toHaveLength(1);
    expect(findUnpairedViewportHeights(sheet('.a { max-height: 80vh; max-height: 80dvh }'))).toEqual([]);
  });

  it('keeps a comma inside :is() out of the selector split', () => {
    const blocks = blocksOf(sheet('.panel :is(input[type="text"], textarea) { color: red }'));
    expect(blocks[0]?.selectors).toEqual(['.panel :is(input[type="text"], textarea)']);
  });
});
