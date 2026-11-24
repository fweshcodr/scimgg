// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchControls, type TouchControlsProps } from '../TouchControls';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function props(overrides: Partial<TouchControlsProps> = {}): TouchControlsProps {
  return {
    touchLongPressMs: 300,
    onTouchLongPressMsChange: vi.fn(),
    touchMenuRowHeight: 28,
    onTouchMenuRowHeightChange: vi.fn(),
    touchHapticsEnabled: true,
    onTouchHapticsEnabledChange: vi.fn(),
    showHaptics: true,
    mobileLayout: true,
    mobileInterfaceScaling: 400,
    onMobileInterfaceScalingChange: vi.fn(),
    mobileHotkeys: [6, 8, 9, 21, 23],
    onMobileHotkeysChange: vi.fn(),
    mobileHotkeysOpenOnLeft: false,
    onMobileHotkeysOpenOnLeftChange: vi.fn(),
    ...overrides,
  };
}

describe('TouchControls', () => {
  it('shows only the reset hint when hovering modified Menu Row Height with a mouse in Mobile layout', () => {
    vi.useFakeTimers();
    const p = props({ touchMenuRowHeight: 30 });
    render(<TouchControls {...p} />);
    const reset = screen.getByRole('button', { name: 'Reset menu row height to default' });
    expect(reset.closest('.info-hint-region')).toBeNull();
    const labelGroup = reset.closest('.slider-label-text');
    expect(labelGroup?.querySelector('.info-hint-region')).toHaveTextContent('Menu Row Height');
    // Entering a descendant from outside also enters each ancestor region in the browser.
    for (let entered: HTMLElement | null = reset; entered; entered = entered.parentElement) {
      fireEvent.pointerEnter(entered, { pointerType: 'mouse' });
    }
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset menu row height to default');
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reset menu row height to default');
    fireEvent.click(reset);
    expect(p.onTouchMenuRowHeightChange).toHaveBeenCalledWith(28);
  });

  it("steps Long Tap Delay over the touch input's own range", () => {
    const p = props();
    render(<TouchControls {...p} />);
    const slider = screen.getByRole('slider', { name: 'Long Tap Delay' });
    expect([slider.getAttribute('min'), slider.getAttribute('max'), slider.getAttribute('step')]).toEqual([
      '100',
      '1000',
      '50',
    ]);
    fireEvent.change(slider, { target: { value: '450' } });
    expect(p.onTouchLongPressMsChange).toHaveBeenCalledWith(450);
  });

  it('steps the menu row height and toggles vibration', () => {
    const p = props();
    render(<TouchControls {...p} />);
    const rows = screen.getByRole('slider', { name: 'Menu Row Height' });
    expect([rows.getAttribute('min'), rows.getAttribute('max'), rows.getAttribute('step')]).toEqual(['20', '48', '2']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Vibrate on long tap' }));
    expect(p.onTouchHapticsEnabledChange).toHaveBeenCalledWith(false);
  });

  it('can hide vibration without hiding the long-tap and menu-row settings', () => {
    render(<TouchControls {...props({ mobileLayout: false, showHaptics: false })} />);
    expect(screen.getByRole('slider', { name: 'Long Tap Delay' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Menu Row Height' })).toBeDefined();
    expect(screen.queryByRole('checkbox', { name: 'Vibrate on long tap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'About Vibrate on long tap' })).toBeNull();
  });

  it('hints only where the label is unclear, and never with a title', () => {
    const { container } = render(<TouchControls {...props()} />);
    expect(container.querySelectorAll('[title]:not([title=""])')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Long Tap Delay/ })).toBeNull();
    fireEvent.focus(screen.getByRole('button', { name: /Menu Row Height/ }));
    expect(document.body.textContent).toContain('For menus opened by a long tap.');
  });

  it('assigns one slot at a time, offering only hotkeys the simulator can act on', () => {
    const p = props();
    render(<TouchControls {...p} />);
    const slot3 = within(screen.getByText('Slot 3').closest('label') as HTMLElement).getByRole('combobox');
    const offered = [...(slot3 as HTMLSelectElement).options].map((option) => option.textContent);
    expect(offered).toEqual([
      'Empty',
      'Inventory Tab',
      'Equipment Tab',
      'Prayer Tab',
      'Spellbook Tab',
      'Combat Tab',
      'Stats Tab',
      'Settings Tab',
      'Quick-prayers',
      'Toggle run',
      'Special attack',
    ]);
    fireEvent.change(slot3, { target: { value: '22' } });
    expect(p.onMobileHotkeysChange).toHaveBeenCalledWith([6, 8, 22, 21, 23]);
    fireEvent.change(slot3, { target: { value: '0' } });
    expect(p.onMobileHotkeysChange).toHaveBeenLastCalledWith([6, 8, 0, 21, 23]);
  });

  it('offers left-side panels, and hides the hotkey rows outside the Mobile layout', () => {
    const p = props();
    const { rerender } = render(<TouchControls {...p} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hotkeys open side panels on the left' }));
    expect(p.onMobileHotkeysOpenOnLeftChange).toHaveBeenCalledWith(true);

    rerender(<TouchControls {...p} mobileLayout={false} />);
    expect(screen.queryByText('Slot 1')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Long Tap Delay' })).toBeTruthy();
  });

  it('offers Interface scaling from 175% to 400% in the Mobile layout only', () => {
    const p = props({ mobileInterfaceScaling: 300 });
    const { rerender } = render(<TouchControls {...p} />);
    const select = screen.getByRole('combobox', { name: 'Interface scaling' }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      '175%',
      '200%',
      '225%',
      '250%',
      '275%',
      '300%',
      '325%',
      '350%',
      '375%',
      '400%',
    ]);
    expect(select.value).toBe('300');
    fireEvent.change(select, { target: { value: '175' } });
    expect(p.onMobileInterfaceScalingChange).toHaveBeenCalledWith(175);

    rerender(<TouchControls {...p} mobileLayout={false} />);
    expect(screen.queryByRole('combobox', { name: 'Interface scaling' })).toBeNull();
  });
});
