// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../../core/SimulationEngine';
import { buildZukControls } from '../../encounters/zuk/controls';
import { createZukWaveEncounter } from '../../test/helpers/zukWave';
import { BossHealthControl } from '../BossHealthControl';

function setup(hp = 1200, phases = true) {
  const engine = new SimulationEngine({ encounter: createZukWaveEncounter(1) });
  engine.setBossHp(hp);
  const targetNpc = engine.getState().npcs.find((npc) => npc.role === 'boss');
  if (!targetNpc) throw new TypeError('Missing Zuk fixture');
  const onSetBossHp = vi.fn();
  const onApplyPreset = vi.fn();
  const result = render(
    createElement(BossHealthControl, {
      targetNpc,
      onSetBossHp,
      onApplyPreset,
      presets: phases ? buildZukControls().bossHpPresets : [],
    }),
  );
  return { ...result, onSetBossHp, onApplyPreset };
}

describe('BossHealthControl', () => {
  it('groups the three phase shortcuts separately from the health slider', () => {
    setup();

    const phases = screen.getByRole('group', { name: 'Jump to phase' });

    expect(within(phases).getAllByRole('button')).toHaveLength(3);
    expect(within(phases).getByRole('button', { name: 'Set TzKal-Zuk to Pre-Jad (480 HP)' })).toBeDefined();
    expect(within(phases).getByRole('button', { name: 'Set TzKal-Zuk to Pre-Healers (240 HP)' })).toBeDefined();
    expect(phases).not.toContainElement(screen.getByRole('slider', { name: 'Set TzKal-Zuk health' }));
  });

  it('explains each phase in a hover card, not a native title', () => {
    setup();
    const preJad = screen.getByRole('button', { name: 'Set TzKal-Zuk to Pre-Jad (480 HP)' });

    expect(preJad.hasAttribute('title')).toBe(false);
    fireEvent.focus(preJad);

    const card = screen.getByRole('tooltip');
    expect(card.textContent).toBe('No minions. Damage Zuk to spawn Jad. Heals the shield in place.');
    expect(preJad.getAttribute('aria-describedby')).toBe(card.id);
  });

  it('applies phase shortcuts without calling the raw HP setter', () => {
    const { onSetBossHp, onApplyPreset } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Set TzKal-Zuk to Pre-Jad (480 HP)' }));

    expect(onApplyPreset).toHaveBeenCalledExactlyOnceWith(480);
    expect(onSetBossHp).not.toHaveBeenCalled();
  });

  it('changes slider HP without entering a phase', () => {
    const { onSetBossHp, onApplyPreset } = setup();

    fireEvent.change(screen.getByRole('slider'), { target: { value: '239' } });

    expect(onSetBossHp).toHaveBeenCalledExactlyOnceWith(239);
    expect(onApplyPreset).not.toHaveBeenCalled();
  });

  it.each([1200, 480, 479, 400, 240, 239])('does not infer active phase state from %i HP', (hp) => {
    const { container } = setup(hp);

    expect(container.querySelector('.boss-health-preset.is-active')).toBeNull();
    expect(screen.getAllByRole('button').every((button) => !button.hasAttribute('aria-pressed'))).toBe(true);
  });

  it('omits the phase group when no presets are supplied', () => {
    setup(1200, false);

    expect(screen.queryByRole('group', { name: 'Jump to phase' })).toBeNull();
    expect(screen.getByRole('slider')).toBeDefined();
  });
});
