import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('navigation CSS', () => {
  it('keeps .grid-panel z-index as auto (no numeric stacking context)', () => {
    const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8');
    const gridPanelBlock = css.match(/\.grid-panel\s*\{[^}]*\}/s);

    expect(gridPanelBlock).toBeTruthy();

    const zIndexMatch = gridPanelBlock?.[0].match(/z-index\s*:\s*([^;]+);/);
    expect(zIndexMatch).toBeTruthy();

    const zIndexValue = zIndexMatch?.[1].trim();
    expect(zIndexValue).toBe('auto');
    expect(zIndexValue).not.toMatch(/^\d+$/);
  });
});
