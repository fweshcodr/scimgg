export const withoutCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Split selector lists without shredding commas inside :is() or attribute selectors. */
function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

/** Declaration blocks, including rules nested in @media/@supports; not a CSS cascade engine. */
export function cssRuleBlocks(css: string): { selectors: string[]; body: string; index: number }[] {
  const out: { selectors: string[]; body: string; index: number }[] = [];
  // Innermost blocks hold declarations rather than nested at-rules. Indices refer to comment-free CSS.
  for (const match of withoutCssComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    // Keep the whole prelude: selector lists routinely span many lines.
    const prelude = match[1].trim().replace(/\s+/g, ' ');
    if (!prelude || prelude.startsWith('@')) continue;
    out.push({ selectors: splitSelectorList(prelude), body: match[2], index: match.index });
  }
  return out;
}
