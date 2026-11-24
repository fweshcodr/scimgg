// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewportSizeWarning } from '../ViewportSizeWarning';

const warningCss = readFileSync(join(process.cwd(), 'src/components/ViewportSizeWarning.css'), 'utf8');

describe('ViewportSizeWarning', () => {
  it('anchors to the browser rather than an oversized app container', () => {
    expect(warningCss).toMatch(/\.viewport-size-strip\s*\{\s*position:\s*fixed;/);
  });

  it('centers beside an open Plugins drawer rather than over it', () => {
    const rule = warningCss.match(/\.viewport-size-strip\s*\{([^}]*)\}/)?.[1];
    expect(rule).toContain('left: var(--ui-inset-left, 0px);');
    expect(rule).toContain('right: var(--ui-inset-right, 0px);');
  });

  it('moves the warning away from the bottom transport during replay', () => {
    const replayRule = warningCss.match(/:has\(\.replay-bar\)\s+\.viewport-size-strip\s*\{([^}]*)\}/)?.[1];
    expect(replayRule).toContain('top: 8px;');
    expect(replayRule).toContain('bottom: auto;');
  });
  it('stays out of the way while the settings sidebar owns the warning', () => {
    const { container } = render(<ViewportSizeWarning visible={false} width={1920} height={1080} />);
    expect(container.firstChild).toBeNull();
  });

  it('names the resolution the window cannot fit', () => {
    render(<ViewportSizeWarning visible width={1920} height={1080} />);
    expect(screen.getByRole('status').textContent).toContain('Window too small');
    expect(screen.getByText(/1920×1080/)).toBeDefined();
  });
});
