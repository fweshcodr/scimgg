// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayoutScale } from '../../hooks/usePersistedSettings';
import { FIXED_SCALE_MAX } from '../../layout/osrsClientLayout';
import { FixedLayoutScaleField } from '../FixedLayoutScaleField';

describe('FixedLayoutScaleField', () => {
  let onFixedLayoutScaleChange: (scale: FixedLayoutScale) => void;
  let onIntegerScalingChange: (enabled: boolean) => void;

  beforeEach(() => {
    onFixedLayoutScaleChange = vi.fn();
    onIntegerScalingChange = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  function renderField(fixedLayoutScale: FixedLayoutScale, integerScaling = false) {
    return render(
      <FixedLayoutScaleField
        fixedLayoutScale={fixedLayoutScale}
        onFixedLayoutScaleChange={onFixedLayoutScaleChange}
        integerScaling={integerScaling}
        onIntegerScalingChange={onIntegerScalingChange}
      />,
    );
  }

  const select = () => screen.getByLabelText('Fixed layout scale') as HTMLSelectElement;
  const integerScaling = () => screen.queryByRole('checkbox', { name: 'Integer scaling' });

  it('is the reveal anchor for the Fixed layout scale', () => {
    const { container } = renderField('fit');
    expect(container.querySelector('[data-search-id="plugins.stretchedMode.fixed-layout-scale"]')).not.toBeNull();
  });

  it('labels each preset with the frame size it lands on', () => {
    renderField('fit');
    expect(screen.getByText('2× (1530 × 1006)')).toBeDefined();
  });

  it('emits the multiple when a preset is selected', () => {
    renderField('fit');
    fireEvent.change(screen.getByLabelText('Fixed layout scale'), { target: { value: '1.5' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith(1.5);
  });

  it('returns to fit-window mode', () => {
    renderField(2);
    fireEvent.change(screen.getByLabelText('Fixed layout scale'), { target: { value: 'fit' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith('fit');
  });

  it('offers Stretch to Window right after Fit Window', () => {
    renderField('fit');
    const options = Array.from(select().options).map((option) => option.textContent);
    expect(options.slice(0, 2)).toEqual(['Fit Window', 'Stretch to Window']);
    fireEvent.change(select(), { target: { value: 'stretch' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith('stretch');
  });

  it('shows Stretch to Window as selected, never as Custom', () => {
    renderField('stretch');
    expect(select().value).toBe('stretch');
    expect(screen.queryByLabelText('Fixed layout scale multiplier')).toBeNull();
  });

  it('seeds Custom with 1x when coming from Stretch to Window', () => {
    renderField('stretch');
    fireEvent.change(select(), { target: { value: 'custom' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith(1);
  });

  it.each(['fit', 'stretch'] as const)('offers Integer scaling under %s, and marks it when on', (scale) => {
    const { container } = renderField(scale, true);
    const checkbox = integerScaling();
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-search-id="plugins.stretchedMode.integer-scaling"]')).not.toBeNull();
    fireEvent.click(checkbox!);
    expect(onIntegerScalingChange).toHaveBeenCalledWith(false);
  });

  it('hides Integer scaling for an explicit multiple, which it does not affect', () => {
    renderField(2, true);
    expect(integerScaling()).toBeNull();
  });

  it('seeds Custom with 1x when coming from fit', () => {
    // Fit has no number to carry over, so Custom has to start somewhere; the
    // input itself only appears once the parent echoes that value back.
    renderField('fit');
    fireEvent.change(screen.getByLabelText('Fixed layout scale'), { target: { value: 'custom' } });
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith(1);
  });

  it('keeps the current multiple when switching from a preset to Custom', () => {
    renderField(2);
    fireEvent.change(screen.getByLabelText('Fixed layout scale'), { target: { value: 'custom' } });
    expect(onFixedLayoutScaleChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Fixed layout scale multiplier')).toBeDefined();
  });

  it('shows the multiplier input straight away for a non-preset multiple, with the size it lands on', () => {
    renderField(1.75);
    expect(screen.getByLabelText('Fixed layout scale multiplier')).toBeDefined();
    expect(screen.getByText('1339 × 880 px')).toBeDefined();
  });

  it('commits a typed multiple on blur', () => {
    renderField(1.75);
    const input = screen.getByLabelText('Fixed layout scale multiplier') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2.25' } });
    fireEvent.blur(input);
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith(2.25);
  });

  it('clamps a typed multiple to the allowed bounds', () => {
    renderField(1.75);
    const input = screen.getByLabelText('Fixed layout scale multiplier') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    expect(onFixedLayoutScaleChange).toHaveBeenCalledWith(FIXED_SCALE_MAX);
  });

  it('does not commit garbage, keeping the current multiple', () => {
    renderField(1.75);
    const input = screen.getByLabelText('Fixed layout scale multiplier') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onFixedLayoutScaleChange).not.toHaveBeenCalled();
  });
});
