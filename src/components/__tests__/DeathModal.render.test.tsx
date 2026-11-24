// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DamageHistoryEntry } from '../../types/simulation';
import { DeathModal, type DeathModalProps } from '../DeathModal';
import { makeReplayPractice } from './ReplayPractice.fixtures';

function makeProps(overrides: Partial<DeathModalProps> = {}): DeathModalProps {
  return {
    failedCondition: 'YamaAttack',
    damageHistory: [],
    onRestart: vi.fn(),
    visible: true,
    ...overrides,
  };
}

const makeEntry = (overrides: Partial<DamageHistoryEntry> = {}): DamageHistoryEntry => ({
  tick: 1,
  source: 'ZukAttack',
  targetId: 'player',
  baseDamage: 10,
  attackType: 'melee',
  activePrayer: null,
  prayedCorrectly: null,
  effectiveDamage: 10,
  hpBefore: 99,
  hpAfter: 89,
  ...overrides,
});

const deathCss = readFileSync(join(process.cwd(), 'src/components/DeathModal.css'), 'utf8').replace(/\s+/g, ' ');

const overlayOf = (_container: HTMLElement): HTMLElement | null => document.body.querySelector('.death-modal-overlay');

const readDamageRows = (_container: HTMLElement) =>
  [...document.body.querySelectorAll<HTMLElement>('.death-modal-row')]
    .map((row) => {
      const source = row.querySelector<HTMLElement>('.death-modal-source');
      return {
        tick: Number(row.querySelector('.death-modal-tick')?.textContent),
        name: source?.firstChild?.textContent ?? null,
        style: source?.querySelector('.death-modal-attack-style')?.textContent ?? null,
      };
    })
    .sort((a, b) => a.tick - b.tick);

describe('DeathModal focus', () => {
  // Keyboard and focus policy: a pointer and touch dialog, so it moves no focus and traps no Tab.
  it('takes no focus when it opens', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    try {
      render(<DeathModal {...makeProps({ onReturnToLobby: vi.fn() })} />);
      expect(screen.getByRole('dialog')).not.toHaveAttribute('tabindex');
      expect(outside).toHaveFocus();
    } finally {
      outside.remove();
    }
  });

  it('marks itself modal so assistive tech treats the page behind as inert', () => {
    render(<DeathModal {...makeProps()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});

describe('DeathModal overlay layout', () => {
  it('portals above live practice controls and other root application chrome', () => {
    render(<DeathModal {...makeProps()} />);
    expect(screen.getByRole('dialog').parentElement).toBe(document.body);
  });
  it('keeps full restart ordinary and a fixed destination explicit while practicing', () => {
    const replayPractice = makeReplayPractice();
    const onRestart = vi.fn();
    const view = render(<DeathModal {...makeProps({ replayPractice, onRestart, onEnterReplay: vi.fn() })} />);
    expect(screen.queryByRole('button', { name: /Practice last/ })).toBeNull();
    view.rerender(<DeathModal {...makeProps({ replayPractice: { ...replayPractice, startTick: 124 }, onRestart })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart from tick 124' }));
    expect(replayPractice.onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Restart fight' }));
    expect(onRestart).toHaveBeenCalledOnce();
  });
  it('invokes the callback from the optional Return to Lobby button', async () => {
    const user = userEvent.setup();
    const onReturnToLobby = vi.fn();
    render(<DeathModal {...makeProps({ onReturnToLobby })} />);

    await user.click(screen.getByRole('button', { name: 'Return to Lobby' }));

    expect(onReturnToLobby).toHaveBeenCalledOnce();
  });

  // The crest centers within the *visible* viewport: a base gutter keeps it off the edges, and
  // the open sidebars (App's --ui-inset-left/right) stack on top so it slides clear of a panel.
  it("pads each side by the base gutter plus that side's sidebar inset", () => {
    const rule = deathCss.match(/\.death-modal-overlay \{([^}]*)\}/)?.[1];
    expect(rule).toContain(
      'padding-inline: calc(16px + var(--ui-inset-left, 0px)) calc(16px + var(--ui-inset-right, 0px));',
    );
    expect(rule).toContain('transition: padding');
  });

  describe('visibility gating', () => {
    it('renders nothing when not visible', () => {
      const { container } = render(<DeathModal {...makeProps({ visible: false })} />);
      expect(container.firstChild).toBeNull();
      expect(overlayOf(container)).toBeNull();
    });

    it('renders nothing while a replay is active, even when visible', () => {
      const { container } = render(<DeathModal {...makeProps({ visible: true, isReplaying: true })} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders the crest when visible and not replaying', () => {
      const { container } = render(<DeathModal {...makeProps({ visible: true, isReplaying: false })} />);
      expect(overlayOf(container)).not.toBeNull();
    });
  });
});

describe('DeathModal damage sources', () => {
  it('names each Inferno attacker behind the shared ZukAttack source', () => {
    const { container } = render(
      <DeathModal
        {...makeProps({
          failedCondition: 'ZukAttack',
          damageHistory: [
            makeEntry({ tick: 1, sourceNpcTypeId: 7703, attackType: 'magic' }),
            makeEntry({ tick: 2, sourceNpcTypeId: 7702, attackType: 'range' }),
            makeEntry({ tick: 3, sourceNpcTypeId: 7706, attackType: 'range' }),
            makeEntry({ tick: 4, sourceNpcTypeId: 7704, attackType: 'melee' }),
            makeEntry({ tick: 5, sourceNpcTypeId: 7705, attackType: 'melee' }),
          ],
        })}
      />,
    );

    expect(readDamageRows(container)).toEqual([
      { tick: 1, name: 'Jal-Zek', style: 'magic' },
      { tick: 2, name: 'Jal-Xil', style: 'ranged' },
      { tick: 3, name: 'TzKal-Zuk', style: 'ranged' },
      { tick: 4, name: 'JalTok-Jad', style: 'melee' },
      { tick: 5, name: 'Yt-HurKot', style: 'melee' },
    ]);
  });

  it('shows the monster data name verbatim instead of running it through the source prettifier', () => {
    const { container } = render(
      <DeathModal {...makeProps({ damageHistory: [makeEntry({ tick: 1, sourceNpcTypeId: 7704 })] })} />,
    );

    expect(readDamageRows(container)).toEqual([{ tick: 1, name: 'JalTok-Jad', style: 'melee' }]);
  });

  it('keeps the generic source label for entries recorded without an attacker id', () => {
    const { container } = render(
      <DeathModal
        {...makeProps({
          damageHistory: [
            makeEntry({ tick: 1, source: 'ZukAttack', attackType: 'magic' }),
            makeEntry({ tick: 2, source: 'YamaAttack', attackType: 'range' }),
          ],
        })}
      />,
    );

    expect(readDamageRows(container)).toEqual([
      { tick: 1, name: 'Zuk Attack', style: 'magic' },
      { tick: 2, name: 'Yama', style: 'ranged' },
    ]);
  });

  it('falls back to the source label when the attacker id has no monster data', () => {
    const { container } = render(
      <DeathModal {...makeProps({ damageHistory: [makeEntry({ tick: 1, sourceNpcTypeId: 999_999 })] })} />,
    );

    expect(readDamageRows(container)).toEqual([{ tick: 1, name: 'Zuk Attack', style: 'melee' }]);
  });

  it('labels spark landings by the healers that cast them, with no attack style', () => {
    const { container } = render(
      <DeathModal
        {...makeProps({ damageHistory: [makeEntry({ tick: 1, source: 'ZukSpark', attackType: 'typeless' })] })}
      />,
    );

    expect(readDamageRows(container)).toEqual([{ tick: 1, name: 'Healer spark', style: null }]);
  });
});
