// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isMobileUi,
  isPhoneSheet,
  MOBILE_UI_ATTRIBUTE,
  PHONE_SHEET_QUERY,
  sheet,
  useMobileUiRoot,
} from '../mobileSheet';

function Root({ active }: { active: boolean }) {
  useMobileUiRoot(active);
  return null;
}

afterEach(() => {
  document.documentElement.removeAttribute(MOBILE_UI_ATTRIBUTE);
  vi.unstubAllGlobals();
});

describe('isMobileUi', () => {
  it('is on for a touch-only device or the Mobile layout, and off only when neither applies', () => {
    expect(isMobileUi({ touchOnly: false, mobileLayout: false })).toBe(false);
    expect(isMobileUi({ touchOnly: true, mobileLayout: false })).toBe(true);
    expect(isMobileUi({ touchOnly: false, mobileLayout: true })).toBe(true);
    expect(isMobileUi({ touchOnly: true, mobileLayout: true })).toBe(true);
  });
});

describe('useMobileUiRoot', () => {
  it('publishes the flag on the document root, follows changes and clears it on unmount', () => {
    const root = document.documentElement;
    const view = render(<Root active={false} />);
    expect(root.hasAttribute(MOBILE_UI_ATTRIBUTE)).toBe(false);

    view.rerender(<Root active />);
    expect(root.hasAttribute(MOBILE_UI_ATTRIBUTE)).toBe(true);

    view.rerender(<Root active={false} />);
    expect(root.hasAttribute(MOBILE_UI_ATTRIBUTE)).toBe(false);

    view.rerender(<Root active />);
    view.unmount();
    expect(root.hasAttribute(MOBILE_UI_ATTRIBUTE)).toBe(false);
  });
});

describe('isPhoneSheet', () => {
  const stubMatch = (matches: boolean) => {
    const matchMedia = vi.fn((query: string) => ({ matches: matches && query === PHONE_SHEET_QUERY }));
    vi.stubGlobal('matchMedia', matchMedia);
    return matchMedia;
  };

  it('needs both the mobile flag and a phone-sized viewport', () => {
    stubMatch(true);
    expect(isPhoneSheet()).toBe(false);
    document.documentElement.setAttribute(MOBILE_UI_ATTRIBUTE, '');
    expect(isPhoneSheet()).toBe(true);
    stubMatch(false);
    expect(isPhoneSheet()).toBe(false);
  });
});

describe('sheet roles', () => {
  it('neutralizes centered-card layout offsets in fullscreen phone sheets', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/ui/MobileSheet.css'), 'utf8');
    const phoneRules = css.slice(css.indexOf(`@media ${PHONE_SHEET_QUERY}`));
    const cardRule = phoneRules.match(/:root\[data-mobile-ui\] \[data-msheet="card"\]\s*\{([^}]*)\}/)?.[1];
    expect(cardRule).toMatch(/left:\s*0;/);
    expect(cardRule).toMatch(/top:\s*0;/);
  });

  it('spread a data-msheet attribute naming the role', () => {
    const { container } = render(
      <div {...sheet.overlay}>
        <section {...sheet.card}>
          <header {...sheet.head}>
            <button type="button" {...sheet.close}>
              Close
            </button>
          </header>
          <div {...sheet.body} />
          <footer {...sheet.foot} />
        </section>
      </div>,
    );
    const roles = [...container.querySelectorAll('[data-msheet]')].map((el) => el.getAttribute('data-msheet'));
    expect(roles).toEqual(['overlay', 'card', 'head', 'close', 'body', 'foot']);
  });

  it('match the stylesheet: every phone rule keyed on the shared query and the root flag', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/ui/MobileSheet.css'), 'utf8');
    expect(css).toContain(`@media ${PHONE_SHEET_QUERY}`);
    for (const role of Object.keys(sheet)) {
      expect(css).toContain(`[data-msheet="${role}"]`);
    }
    // Nothing in the layer may apply outside mobile UI.
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((chunk) => chunk.split('}').pop()?.trim() ?? '')
      .filter((sel) => sel && !sel.startsWith('@') && !/^(from|to|\d+%)$/.test(sel));
    for (const sel of selectors) expect(sel).toMatch(/^:root\[data-mobile-ui\]/);
  });
});
