// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VictoryModal } from '../VictoryModal';
import { makeReplayPractice } from './ReplayPractice.fixtures';
import { makeProps, makeSimulationState, YAMA_VICTORY_DESCRIPTOR } from './VictoryModal.fixtures';

describe('VictoryModal focus', () => {
  // Keyboard and focus policy: a pointer and touch dialog, so it moves no focus and traps no Tab.
  it('leaves focus where it was when a hidden modal becomes visible', () => {
    const { rerender } = render(
      <>
        <button type="button">Arena control</button>
        <VictoryModal {...makeProps({ visible: false })} />
      </>,
    );
    const arenaControl = screen.getByRole('button', { name: 'Arena control' });
    arenaControl.focus();

    rerender(
      <>
        <button type="button">Arena control</button>
        <VictoryModal {...makeProps({ visible: true })} />
      </>,
    );

    expect(arenaControl).toHaveFocus();
    expect(screen.getByRole('dialog')).not.toHaveAttribute('tabindex');
  });
});

describe('VictoryModal', () => {
  it('retries the fixed practice start without changing the meaning of Restart fight', () => {
    const replayPractice = makeReplayPractice({ startTick: 124 });
    const onRestart = vi.fn();
    render(<VictoryModal {...makeProps({ replayPractice, onRestart })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart from tick 124' }));
    expect(replayPractice.onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Restart fight' }));
    expect(onRestart).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Practice last/ })).toBeNull();
  });
  it('returns to the lobby from the optional footer action', async () => {
    const user = userEvent.setup();
    const onReturnToLobby = vi.fn();
    render(<VictoryModal {...makeProps({ onReturnToLobby })} />);

    await user.click(screen.getByRole('button', { name: 'Return to Lobby' }));

    expect(onReturnToLobby).toHaveBeenCalledOnce();
  });

  it('renders the cinematic victory cadence and ordered five-row fight record', () => {
    const props = makeProps();

    render(<VictoryModal {...props} />);

    expect(screen.getByText('Triumphant')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'VICTORY' })).toBeInTheDocument();
    expect(screen.getByText('YAMA DEFEATED')).toHaveClass('victory-modal-narrative');
    expect(screen.getByRole('heading', { level: 2, name: 'Fight record' })).toBeInTheDocument();
    expect(screen.queryByText('Encounter complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Fight summary')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.victory-modal-record-row')).toHaveLength(5);
    expect(Array.from(document.querySelectorAll('dt'), (cell) => cell.textContent)).toEqual([
      'Kill time',
      'Damage dealt',
      'Damage taken',
      'HP remaining',
      'Prayer remaining',
    ]);
    expect(Array.from(document.querySelectorAll('dd'), (cell) => cell.textContent)).toEqual([
      '1:15',
      '100',
      '18',
      '42 / 99',
      '17 / 99',
    ]);
    const content = document.querySelector('.victory-modal-content-wrapper');
    expect(Array.from(content?.children ?? [], (element) => element.className)).toEqual([
      'victory-modal-eyebrow',
      'victory-modal-heading',
      'victory-modal-emblem',
      'victory-modal-narrative',
      'victory-modal-record',
      'victory-modal-actions',
    ]);
    expect(screen.getByText('Ctrl+R').closest('button')).toBe(screen.getByRole('button', { name: 'Restart fight' }));
  });

  it('portals the blocking overlay above root application chrome', () => {
    render(<VictoryModal {...makeProps()} />);

    const overlay = screen.getByRole('dialog');

    expect(overlay.parentElement).toBe(document.body);
    expect(overlay).toHaveAttribute('aria-modal', 'true');
  });

  it('uses primary restart and supporting replay actions in DOM order', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    const onEnterReplay = vi.fn();
    render(<VictoryModal {...makeProps({ onRestart, onEnterReplay })} />);

    const fightAgain = screen.getByRole('button', { name: 'Restart fight' });
    const watchReplay = screen.getByRole('button', { name: 'Watch replay' });
    await user.click(fightAgain);
    await user.click(watchReplay);

    // Then: shared button variants and callbacks match the DeathModal sibling hierarchy.
    expect(screen.getAllByRole('button')).toEqual([fightAgain, watchReplay]);
    expect(fightAgain).toHaveClass('osrs-btn--primary');
    expect(fightAgain).not.toHaveClass('osrs-btn--full-width');
    expect(watchReplay).toHaveClass('osrs-btn--default');
    expect(watchReplay).not.toHaveClass('osrs-btn--full-width');
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onEnterReplay).toHaveBeenCalledTimes(1);
  });

  it("pads each side by the base gutter plus that side's sidebar inset, as the death crest", () => {
    const css = readFileSync(join(process.cwd(), 'src/components/VictoryModal.css'), 'utf8').replace(/\s+/g, ' ');
    const rule = css.match(/\.victory-modal-overlay \{([^}]*)\}/)?.[1];
    expect(rule).toContain(
      'padding-inline: calc(16px + var(--ui-inset-left, 0px)) calc(16px + var(--ui-inset-right, 0px));',
    );
    expect(rule).toContain('transition: padding');
  });

  it('renders nothing when hidden, replaying, or victory is incomplete', () => {
    const incomplete = makeSimulationState({
      encounterOutcome: { phase: 'active' },
    });

    const hidden = render(<VictoryModal {...makeProps({ visible: false })} />);
    const replaying = render(<VictoryModal {...makeProps({ isReplaying: true })} />);
    const active = render(<VictoryModal {...makeProps({ simulationState: incomplete })} />);

    expect(hidden.container.firstChild).toBeNull();
    expect(replaying.container.firstChild).toBeNull();
    expect(active.container.firstChild).toBeNull();
  });

  it('hides during replay, returns on exit, and clears after a reset snapshot', () => {
    const completeState = makeSimulationState();
    const activeState = makeSimulationState({
      currentTick: 0,
      encounterOutcome: { phase: 'active' },
    });
    const { container, rerender } = render(<VictoryModal {...makeProps({ simulationState: completeState })} />);
    expect(screen.getByRole('heading', { name: 'VICTORY' })).toBeInTheDocument();

    rerender(<VictoryModal {...makeProps({ simulationState: completeState, isReplaying: true })} />);
    expect(container.firstChild).toBeNull();

    rerender(<VictoryModal {...makeProps({ simulationState: completeState, isReplaying: false })} />);
    expect(screen.getByRole('heading', { name: 'VICTORY' })).toBeInTheDocument();

    rerender(<VictoryModal {...makeProps({ simulationState: activeState, visible: false })} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders descriptor-authored copy and accent for a Yama variant', () => {
    render(<VictoryModal {...makeProps({ victory: YAMA_VICTORY_DESCRIPTOR })} />);

    expect(screen.getByRole('heading', { level: 1, name: 'VICTORY' })).toBeInTheDocument();
    expect(screen.getByText('YAMA DEFEATED')).toHaveClass('victory-modal-narrative');
    expect(screen.getByRole('dialog')).toHaveClass('victory-modal-overlay--blood');
    expect(document.querySelectorAll('.victory-modal-record-row')).toHaveLength(5);
  });

  it('omits Watch Replay when no recording exists', () => {
    render(<VictoryModal {...makeProps({ hasRecording: false })} />);

    expect(screen.getByRole('button', { name: 'Restart fight' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Watch replay' })).not.toBeInTheDocument();
  });
});
