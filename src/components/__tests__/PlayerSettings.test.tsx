// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultStats, createStatsFromBaseLevels, type PlayerStats } from '../../types/playerState';
import { PlayerSettings } from '../PlayerSettings';

function lowStats(): PlayerStats {
  return createStatsFromBaseLevels({
    attack: 70,
    strength: 71,
    defence: 72,
    ranged: 73,
    magic: 74,
    prayer: 75,
    hitpoints: 76,
    agility: 77,
  });
}

function renderPanel(stats: PlayerStats = lowStats()) {
  const onStatsChange = vi.fn();
  const view = render(<PlayerSettings stats={stats} onStatsChange={onStatsChange} />);
  return { onStatsChange, ...view };
}

function renderStatefulPanel() {
  const onStatsChange = vi.fn();
  function StatefulPanel() {
    const [stats, setStats] = useState(lowStats);
    return (
      <PlayerSettings
        stats={stats}
        onStatsChange={(next) => {
          onStatsChange(next);
          setStats(next);
        }}
      />
    );
  }
  render(<StatefulPanel />);
  return { onStatsChange };
}

describe('PlayerSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows levels and account unlocks without opening a disclosure', () => {
    render(
      <PlayerSettings
        stats={lowStats()}
        onStatsChange={vi.fn()}
        accountUnlocks={
          <label>
            <input type="checkbox" />
            Account unlock
          </label>
        }
      />,
    );
    expect(screen.getByRole('heading', { name: 'Player' })).toBeInTheDocument();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(8);
    expect(screen.getByRole('checkbox', { name: 'Account unlock' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Account unlocks' })).toContainElement(
      screen.getByRole('checkbox', { name: 'Account unlock' }),
    );
    expect(screen.queryByRole('button', { name: /Player/ })).not.toBeInTheDocument();
  });

  it('offers no account-mode selector', () => {
    renderPanel();

    expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
  });

  it('renders eight labeled numeric inputs showing current base levels', () => {
    renderPanel();

    expect(screen.getByLabelText('Attack')).toHaveValue(70);
    expect(screen.getByLabelText('Strength')).toHaveValue(71);
    expect(screen.getByLabelText('Defence')).toHaveValue(72);
    expect(screen.getByLabelText('Ranged')).toHaveValue(73);
    expect(screen.getByLabelText('Magic')).toHaveValue(74);
    expect(screen.getByLabelText('Prayer')).toHaveValue(75);
    expect(screen.getByLabelText('Hitpoints')).toHaveValue(76);
    expect(screen.getByLabelText('Agility')).toHaveValue(77);
    expect(screen.getByLabelText('Agility')).toHaveAttribute('min', '1');
    expect(screen.getByLabelText('Agility')).toHaveAttribute('max', '99');
  });

  it('renders native skill artwork through canvas and lifts only the dark Agility ink without a backing', () => {
    const { container } = renderPanel();

    expect(container.querySelectorAll('.combat-stats__tile canvas[data-src]')).toHaveLength(8);
    expect(container.querySelector('.combat-stats__grid img')).toBeNull();
    const agilityIcon = container.querySelector('canvas[data-src="/assets/ui/skill-agility.png"]');
    expect(agilityIcon).toHaveAttribute('aria-hidden', 'true');
    expect(agilityIcon).toHaveClass('combat-stats__icon--silhouette');
    expect(container.querySelectorAll('.combat-stats__icon--silhouette')).toHaveLength(1);
    expect(container.querySelector('.combat-stats__icon-slot--agility')).toBeNull();
    // Text must paint before accelerated sprites so the opaque tile keeps its LCD eligibility.
    for (const tile of container.querySelectorAll('.combat-stats__tile')) {
      expect(tile.firstElementChild?.tagName).toBe('LABEL');
      expect(tile.children[1].tagName).toBe('CANVAS');
    }
  });

  it('commits an edited stat with current pinned to max', () => {
    const { onStatsChange } = renderPanel();

    fireEvent.change(screen.getByLabelText('Attack'), { target: { value: '85' } });

    expect(onStatsChange).toHaveBeenCalledTimes(1);
    const next = onStatsChange.mock.calls[0][0] as PlayerStats;
    expect(next.attack).toEqual({ current: 85, max: 85 });
    expect(next.strength).toEqual({ current: 71, max: 71 });
  });

  it('clamps stat edits to each stat range', () => {
    const { onStatsChange } = renderPanel();

    fireEvent.change(screen.getByLabelText('Agility'), { target: { value: '0' } });
    expect((onStatsChange.mock.calls.at(-1)?.[0] as PlayerStats).agility).toEqual({ current: 1, max: 1 });
    fireEvent.change(screen.getByLabelText('Agility'), { target: { value: '120' } });
    expect((onStatsChange.mock.calls.at(-1)?.[0] as PlayerStats).agility).toEqual({ current: 99, max: 99 });

    fireEvent.change(screen.getByLabelText('Magic'), { target: { value: '150' } });
    expect((onStatsChange.mock.calls.at(-1)?.[0] as PlayerStats).magic).toEqual({ current: 99, max: 99 });

    fireEvent.change(screen.getByLabelText('Prayer'), { target: { value: '0' } });
    expect((onStatsChange.mock.calls.at(-1)?.[0] as PlayerStats).prayer).toEqual({ current: 1, max: 1 });

    fireEvent.change(screen.getByLabelText('Hitpoints'), { target: { value: '0' } });
    expect((onStatsChange.mock.calls.at(-1)?.[0] as PlayerStats).hitpoints).toEqual({ current: 10, max: 10 });
  });

  it('resets every stat to 99 via the Set all to 99 action', () => {
    const { onStatsChange } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Set all to 99' }));

    expect(onStatsChange).toHaveBeenCalledWith(createDefaultStats());
  });

  it('ends a focused stat edit before resetting emitted and displayed levels to 99', () => {
    const { onStatsChange } = renderStatefulPanel();
    const attack = screen.getByLabelText('Attack');
    act(() => attack.focus());
    fireEvent.change(attack, { target: { value: '85' } });
    expect(attack).toHaveFocus();
    expect(attack).toHaveValue(85);

    const reset = screen.getByRole('button', { name: 'Set all to 99' });
    expect(fireEvent.mouseDown(reset)).toBe(false);
    fireEvent.click(reset);

    expect(onStatsChange).toHaveBeenLastCalledWith(createDefaultStats());
    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input).toHaveValue(99);
    }
    expect(attack).not.toHaveFocus();
    expect(reset).not.toHaveFocus();
  });

  it('marks stats that fall short of the selected loadout requirements', () => {
    render(<PlayerSettings stats={lowStats()} onStatsChange={vi.fn()} requirements={{ attack: 85, magic: 90 }} />);

    const attackReq = screen.getByText('Attack 85');
    expect(attackReq).toBeInTheDocument();
    expect(screen.getByLabelText('Attack')).toHaveAttribute('aria-describedby', attackReq.getAttribute('id'));
    expect(screen.getByText('Magic 90')).toBeInTheDocument();
    expect(attackReq.closest('.combat-stats__tile')).toBeNull();
    expect(screen.getByText('Magic 90').parentElement).toBe(attackReq.parentElement);
    expect(screen.getByLabelText('Strength')).not.toHaveAttribute('aria-describedby');
  });
});
