// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CollapsibleSection } from '../CollapsibleSection';

function wrapper(): HTMLElement {
  const el = screen.getByTestId('body').closest('.collapsible-content-wrapper');
  if (!(el instanceof HTMLElement)) throw new Error('Expected a content wrapper around the section body');
  return el;
}

function renderSection(defaultExpanded?: boolean) {
  return render(
    <CollapsibleSection searchId={null} title="Audio" defaultExpanded={defaultExpanded}>
      <input data-testid="body" />
    </CollapsibleSection>,
  );
}

describe('CollapsibleSection', () => {
  it('starts collapsed and keeps its content inert', () => {
    renderSection();

    expect(screen.getByRole('button', { name: 'Audio' }).getAttribute('aria-expanded')).toBe('false');
    expect(wrapper().hasAttribute('inert')).toBe(true);
  });

  /**
   * Collapsed content stays mounted so the height can animate, so `inert` is the only
   * thing keeping it out of the tab order. Without it a collapsed section holding a text
   * field can take a keystroke, or a password manager's fill, into a hidden control.
   */
  it('keeps collapsed content out of the tab order', async () => {
    renderSection();

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Audio' }));
    await userEvent.tab();
    expect(document.activeElement).not.toBe(screen.getByTestId('body'));
  });

  it('drops inert once the header expands it', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Audio' }));

    expect(screen.getByRole('button', { name: 'Audio' }).getAttribute('aria-expanded')).toBe('true');
    expect(wrapper().hasAttribute('inert')).toBe(false);
  });

  it('honors defaultExpanded by mounting already reachable', () => {
    renderSection(true);

    expect(wrapper().hasAttribute('inert')).toBe(false);
  });
});
