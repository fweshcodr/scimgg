// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OsrsNumberInput } from '../OsrsNumberInput';

describe('OsrsNumberInput', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('disables only the arrow whose bound the value has reached', () => {
    const onChange = vi.fn();
    const { rerender } = render(<OsrsNumberInput value={10} min={1} max={10} onChange={onChange} />);
    const increment = screen.getByRole('button', { name: 'Increment' });
    const decrement = screen.getByRole('button', { name: 'Decrement' });

    expect(increment).toBeDisabled();
    expect(decrement).toBeEnabled();

    rerender(<OsrsNumberInput value={1} min={1} max={10} onChange={onChange} />);
    expect(increment).toBeEnabled();
    expect(decrement).toBeDisabled();

    rerender(<OsrsNumberInput value={5} min={1} max={10} onChange={onChange} />);
    expect(increment).toBeEnabled();
    expect(decrement).toBeEnabled();
  });

  it('keeps both arrows enabled for a mid-edit draft string', () => {
    render(<OsrsNumberInput value="" min={1} max={10} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Increment' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Decrement' })).toBeEnabled();
  });

  it('keeps a rejected keystroke on screen instead of restoring the old value', () => {
    const Host = () => {
      const [value, setValue] = useState(1);
      return (
        <OsrsNumberInput
          value={value}
          min={0.1}
          step={0.1}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            if (Number.isFinite(next) && next > 0) setValue(next);
          }}
        />
      );
    };
    render(<Host />);
    const field = screen.getByRole('spinbutton');

    fireEvent.change(field, { target: { value: '' } });
    expect(field).toHaveValue(null);

    fireEvent.change(field, { target: { value: '.1' } });
    expect(field).toHaveValue(0.1);
  });

  it('drops an abandoned draft back to the last accepted value on blur', () => {
    render(<OsrsNumberInput value={7} min={1} onChange={vi.fn()} />);
    const field = screen.getByRole('spinbutton');

    fireEvent.change(field, { target: { value: '' } });
    expect(field).toHaveValue(null);

    fireEvent.blur(field);
    expect(field).toHaveValue(7);
  });

  it('keeps a clamped draft while focused but replaces it with a value set from elsewhere', () => {
    let setFromElsewhere: (value: number) => void = () => {};
    const Host = () => {
      const [value, setValue] = useState(5);
      setFromElsewhere = setValue;
      return (
        <OsrsNumberInput
          value={value}
          min={1}
          max={10}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10);
            if (Number.isInteger(next)) setValue(Math.min(Math.max(next, 1), 10));
          }}
        />
      );
    };
    render(<Host />);
    const field = screen.getByRole('spinbutton');
    field.focus();

    fireEvent.change(field, { target: { value: '0' } });
    expect(field).toHaveValue(0);

    act(() => setFromElsewhere(8));
    expect(document.activeElement).toBe(field);
    expect(field).toHaveValue(8);

    // The next edit drafts again.
    fireEvent.change(field, { target: { value: '' } });
    expect(field).toHaveValue(null);
  });

  it('stops a held arrow repeat when a controlled rerender reaches the bound', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    vi.spyOn(HTMLInputElement.prototype, 'stepUp').mockImplementation(function (this: HTMLInputElement) {
      fireEvent.change(this, { target: { value: String(Number(this.value) + 1) } });
    });
    const { rerender } = render(<OsrsNumberInput value={9} min={1} max={10} onChange={onChange} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Increment' }));
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(<OsrsNumberInput value={10} min={1} max={10} onChange={onChange} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
