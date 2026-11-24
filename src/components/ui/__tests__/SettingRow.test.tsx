// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { cssRuleBlocks } from '../../../test/helpers/cssRules';
import { OsrsCheckbox } from '../OsrsCheckbox';
import { SettingRow } from '../SettingRow';

describe('SettingRow', () => {
  it('keeps inline checkbox geometry independent of the checkmark baseline', () => {
    // happy-dom has no layout: lock the shared rule here; the real harness checks the gap.
    const css = readFileSync(join(__dirname, '../OsrsCheckbox.css'), 'utf8');
    const rule = cssRuleBlocks(css).find((block) => block.selectors.includes('.osrs-checkbox'));
    expect(rule?.body).toMatch(/display:\s*inline-flex\s*;/);
    expect(rule?.body).toMatch(/vertical-align:\s*top\s*;/);
  });

  it('aligns only checkbox hints with their label and preserves the reset gutter', () => {
    const css = readFileSync(join(__dirname, '../SettingRow.css'), 'utf8');
    const rules = cssRuleBlocks(css);
    const hint = rules.find((block) => block.selectors.includes('.setting-row:has(.osrs-checkbox) .setting-row__hint'));
    expect(hint?.body).toContain('padding-left: calc(24px + 2 * var(--unscaled-px, 1px))');
    const column = rules.find((block) => block.selectors.includes('.setting-row__content'));
    expect(column?.body).toMatch(/gap:\s*4px\s*;/);
    const control = rules.find((block) => block.selectors.includes('.setting-row__content > .osrs-checkbox'));
    expect(control?.body).toMatch(/align-self:\s*flex-start\s*;/);
    const line = rules.find((block) => block.selectors.includes('.setting-row__content > .settings-inline-row'));
    expect(line?.body).toMatch(/min-height:\s*var\(--setting-reset-size\)\s*;/);
    const swatch = rules.find((block) => block.selectors.includes('.setting-row:has(.osrs-checkbox) .ti-swatch'));
    expect(swatch?.body).toMatch(/margin-bottom:\s*0\s*;/);
  });

  it.each([
    { checked: false, modified: false },
    { checked: true, modified: false },
    { checked: false, modified: true },
    { checked: true, modified: true },
  ])('keeps checkbox, hint and reset markup stable for $checked/$modified', ({ checked, modified }) => {
    const { container } = render(
      <SettingRow searchId={null} isModified={modified} onReset={() => {}} hint="Example explanation.">
        <OsrsCheckbox checked={checked} onChange={() => {}} label="Example option" />
      </SettingRow>,
    );
    expect(screen.getByRole('checkbox', { name: 'Example option' })).toHaveAttribute('aria-checked', String(checked));
    expect(container.querySelector('.osrs-checkbox__mark') !== null).toBe(checked);
    const hint = screen.getByText('Example explanation.');
    const row = container.querySelector('.setting-row');
    expect(row).toContainElement(hint);
    expect(hint.parentElement?.className).toBe('setting-row__content');
    expect(hint.parentElement?.parentElement).toBe(row);
    expect(container.querySelector('.setting-row__reset')).toHaveAttribute('aria-hidden', String(!modified));
  });

  it('hides the reset button when not modified', () => {
    render(
      <SettingRow searchId={null} isModified={false} onReset={() => {}}>
        <span>child</span>
      </SettingRow>,
    );
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
    expect(screen.getByText('child').parentElement).toHaveClass('setting-row');
  });

  it('renders the reset button as disabled and aria-hidden when not modified', () => {
    render(
      <SettingRow searchId={null} isModified={false} onReset={() => {}}>
        <span>child</span>
      </SettingRow>,
    );
    const button = screen.getByRole('button', { hidden: true });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-label', 'Reset to default');
    expect(button).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the reset button via accessible name when modified', () => {
    render(
      <SettingRow searchId={null} isModified onReset={() => {}}>
        <span>child</span>
      </SettingRow>,
    );
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument();
  });

  it('invokes onReset when the reset button is clicked', () => {
    const onReset = vi.fn();
    render(
      <SettingRow searchId={null} isModified onReset={onReset}>
        <span>child</span>
      </SettingRow>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('hides the built-in reset button when hideReset is set, even if modified', () => {
    render(
      <SettingRow searchId={null} isModified hideReset onReset={() => {}}>
        <span>child</span>
      </SettingRow>,
    );
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
  });
});
