// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StartingHitpointsField } from '../StartingHitpointsField';

describe('StartingHitpointsField', () => {
  it('renders the label, current value, and maximum suffix', () => {
    render(<StartingHitpointsField value={10} max={99} onChange={vi.fn()} />);

    expect(screen.getByText('Starting Hitpoints')).toBeInTheDocument();
    expect(screen.getByLabelText('Starting Hitpoints')).toHaveValue(10);
    expect(screen.getByText('/ 99')).toBeInTheDocument();
  });

  it('commits a typed value', () => {
    const onChange = vi.fn();
    render(<StartingHitpointsField value={10} max={99} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Starting Hitpoints'), { target: { value: '25' } });

    expect(onChange).toHaveBeenCalledWith(25);
  });

  it('clamps committed values to the allowed range', () => {
    const onChange = vi.fn();
    render(<StartingHitpointsField value={10} max={99} onChange={onChange} />);
    const input = screen.getByLabelText('Starting Hitpoints');

    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.change(input, { target: { value: '0' } });

    expect(onChange).toHaveBeenNthCalledWith(1, 99);
    expect(onChange).toHaveBeenNthCalledWith(2, 1);
  });

  it('holds a partial number in the field while the parent value is unchanged', () => {
    render(<StartingHitpointsField value={10} max={99} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Starting Hitpoints');

    fireEvent.change(input, { target: { value: '1' } });

    expect(input).toHaveValue(1);
  });

  it('clears the draft on blur and returns to the committed value', () => {
    render(<StartingHitpointsField value={10} max={99} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Starting Hitpoints');
    fireEvent.change(input, { target: { value: '1' } });

    fireEvent.blur(input);

    expect(input).toHaveValue(10);
  });

  it('associates the input with its label and offers the explanation as a help mark', () => {
    render(<StartingHitpointsField value={10} max={99} onChange={vi.fn()} />);
    const input = screen.getByLabelText('Starting Hitpoints');
    const label = screen.getByText('Starting Hitpoints');
    const mark = screen.getByRole('button', { name: 'About Starting Hitpoints' });
    const region = document.querySelector('.starthp-label.info-hint-region');

    expect(input.id).not.toBe('');
    expect(label).toHaveAttribute('for', input.id);
    // The explanation is the mark's to disclose, not a caption: the label row's rendered
    // text is the label alone, and the mark sits inside the region that hovers open.
    expect(region?.textContent).toBe('Starting Hitpoints');
    expect(region?.contains(mark)).toBe(true);
    expect(screen.queryByText('Wretched Strength: your minimum hit rises as health falls.')).toBeNull();
  });

  it('opens the Wretched Strength explanation from the help mark', () => {
    render(<StartingHitpointsField value={10} max={99} onChange={vi.fn()} />);
    const mark = screen.getByRole('button', { name: 'About Starting Hitpoints' });

    fireEvent.focus(mark);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
      'Wretched Strength: your minimum hit rises as health falls.',
    );
    expect(mark.getAttribute('aria-describedby')).toBe(document.querySelector('[role="tooltip"]')?.id);

    fireEvent.blur(mark);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('renders as an ordinary field, not a rail section', () => {
    const { container } = render(<StartingHitpointsField value={10} max={99} onChange={vi.fn()} />);

    expect(container.querySelector('.starthp-field')).not.toBeNull();
    expect(container.querySelector('.rail-section')).toBeNull();
    expect(container.querySelector('.section-label')).toBeNull();
  });
});
