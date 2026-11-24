// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  getKeybindingValue,
  KEYBINDING_DEFINITIONS,
  loadUnifiedKeybindStore,
} from '../../../hooks/keybindStore';
import { useAppHotkeys } from '../../../hooks/useAppHotkeys';
import { useGamePanelShortcuts } from '../../../hooks/useGamePanelShortcuts';
import { useZukSetTimer } from '../../../hooks/useZukSetTimer';
import { isCapturingKeybind } from '../../../input/keybindCapture';
import { __resetKeyStateForTest, isKeyHeld } from '../../../input/keyState';
import { deleteSetting, saveSetting } from '../../../util/storage';
import { KeybindingsContent } from '../KeybindingsContent';

const dismissalLabel = KEYBINDING_DEFINITIONS.find((binding) => binding.domain === 'ui')?.label;
const dismissalName = `General: ${dismissalLabel}`;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  __resetKeyStateForTest();
  deleteSetting('osrs-unified-keybinds');
});

function openEditor(name: string) {
  if (!name.startsWith('Zuk Set Timer:')) {
    fireEvent.click(
      screen.getByRole('tab', {
        name: name.startsWith('Panel:') || name.startsWith('General:') ? 'General' : 'Camera',
      }),
    );
  }
  fireEvent.click(screen.getByRole('button', { name: `Rebind ${name}` }));
}

function edit(name: string, key: string, modifiers: KeyboardEventInit = {}) {
  openEditor(name);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key, ...modifiers });
}

function bindingRow(name: string): HTMLElement {
  const row = screen.getByRole('button', { name: `Rebind ${name}` }).closest('.keybindings-row');
  if (!(row instanceof HTMLElement)) throw new Error(`Missing row: ${name}`);
  return row;
}

function mockVisibleRows(container: HTMLElement): void {
  for (const scroller of container.querySelectorAll<HTMLElement>('.keybindings-scroll')) {
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 240, 400));
  }
  for (const [index, row] of [...container.querySelectorAll<HTMLElement>('.keybindings-row')].entries()) {
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, index * 24, 220, 22));
  }
}

describe('newly unbound row highlights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('flashes only the explicitly unbound row, then uses the shared hold and fade timing', () => {
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    const inventory = bindingRow('Panel: Inventory');
    openEditor('Panel: Inventory');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    expect(inventory).toHaveAttribute('data-reveal-highlight', 'on');
    expect(view.container.querySelectorAll('[data-reveal-highlight]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Rebind Panel: Inventory' })).not.toHaveAttribute(
      'data-reveal-highlight',
    );
    act(() => vi.advanceTimersByTime(2500));
    expect(inventory).toHaveAttribute('data-reveal-highlight', 'fading');
    act(() => vi.advanceTimersByTime(700));
    expect(inventory).not.toHaveAttribute('data-reveal-highlight');
    expect(screen.getByRole('button', { name: 'Rebind Panel: Inventory' })).toHaveClass('is-unbound');
  });

  it('marks the displaced row, not the newly assigned field or an unrelated empty row', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { skills: '' } });
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    edit('Panel: Prayer', 'F1');
    expect(bindingRow('Panel: Combat')).toHaveAttribute('data-reveal-highlight', 'on');
    expect(bindingRow('Panel: Prayer')).not.toHaveAttribute('data-reveal-highlight');
    expect(bindingRow('Panel: Skills')).not.toHaveAttribute('data-reveal-highlight');
    expect(screen.getByRole('button', { name: 'Rebind Panel: Prayer' })).not.toHaveFocus();
  });

  it('marks every newly displaced visible row once', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { inventory: 'F1' } });
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    edit('Panel: Prayer', 'F1');
    expect(bindingRow('Panel: Combat')).toHaveAttribute('data-reveal-highlight', 'on');
    expect(bindingRow('Panel: Inventory')).toHaveAttribute('data-reveal-highlight', 'on');
    expect(view.container.querySelectorAll('[data-reveal-highlight]')).toHaveLength(2);
  });

  it('keeps off-tab targets in the footer without navigation or a later queued highlight', () => {
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    edit('Panel: Prayer', 'w');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Tilt Up');
    expect(view.container.querySelector('[data-reveal-highlight]')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Camera' }));
    mockVisibleRows(view.container);
    view.rerender(<KeybindingsContent />);
    expect(view.container.querySelector('[data-reveal-highlight]')).toBeNull();
    expect(screen.getByText('Free camera', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
  });

  it('does not scroll or mark an offscreen row, or queue a highlight for when it becomes visible', () => {
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    vi.mocked(bindingRow('Panel: Combat').getBoundingClientRect).mockReturnValue(new DOMRect(0, -40, 220, 22));
    const scroller = screen.getByRole('tabpanel', { name: 'General' });
    scroller.scrollTop = 40;
    fireEvent.click(screen.getByRole('button', { name: 'Rebind Panel: Prayer' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'F1' });
    expect(bindingRow('Panel: Combat')).not.toHaveAttribute('data-reveal-highlight');
    expect(scroller.scrollTop).toBe(40);
    expect(screen.getByRole('status')).toHaveTextContent('Combat');
    vi.mocked(bindingRow('Panel: Combat').getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 220, 22));
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    view.rerender(<KeybindingsContent />);
    expect(screen.getByRole('button', { name: 'Rebind Panel: Combat' })).toHaveClass('is-unbound');
    expect(bindingRow('Panel: Combat')).not.toHaveAttribute('data-reveal-highlight');
  });

  it('does not mark collapsed rows, open their disclosure or queue a highlight for when it opens', () => {
    const view = render(<KeybindingsContent category="Camera" />);
    mockVisibleRows(view.container);
    // Unlike movement keys shared between camera modes, the toggle conflicts with orbit controls.
    edit('Camera: Rotate Left', 'F10');
    expect(loadUnifiedKeybindStore().camera.toggleFreeform).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('Toggle Freeform');
    expect(bindingRow('Free Camera: Toggle Freeform')).not.toHaveAttribute('data-reveal-highlight');
    expect(screen.getByText('Free camera', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Free camera', { selector: 'summary' }));
    view.rerender(<KeybindingsContent category="Camera" />);
    expect(screen.getByText('Free camera', { selector: 'summary' }).closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Rebind Free Camera: Toggle Freeform' })).toHaveClass('is-unbound');
    expect(bindingRow('Free Camera: Toggle Freeform')).not.toHaveAttribute('data-reveal-highlight');
  });

  it('does not flash a rejected save', () => {
    const view = render(<KeybindingsContent group="Zuk Set Timer" />);
    mockVisibleRows(view.container);
    edit('Zuk Set Timer: Advance timer', 'r', { ctrlKey: true });
    expect(screen.getByRole('status')).toHaveTextContent(/reserved/i);
    expect(view.container.querySelector('[data-reveal-highlight]')).toBeNull();
  });

  it('uses the same mark for a visible row in an embedded editor', () => {
    const view = render(<KeybindingsContent group="Zuk Set Timer" compact />);
    mockVisibleRows(view.container);
    openEditor('Zuk Set Timer: Advance timer');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    expect(bindingRow('Zuk Set Timer: Advance timer')).toHaveAttribute('data-reveal-highlight', 'on');
  });

  it('clears the mark when recording again and disposes timers on unmount', () => {
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    openEditor('Panel: Inventory');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    const inventory = bindingRow('Panel: Inventory');
    openEditor('Panel: Inventory');
    expect(inventory).not.toHaveAttribute('data-reveal-highlight');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'j' });
    expect(inventory).not.toHaveAttribute('data-reveal-highlight');
    openEditor('Panel: Inventory');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    expect(inventory).toHaveAttribute('data-reveal-highlight', 'on');
    view.unmount();
    expect(inventory).not.toHaveAttribute('data-reveal-highlight');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up when the highlighted row leaves its tab, without marking it on return', () => {
    const view = render(<KeybindingsContent />);
    mockVisibleRows(view.container);
    openEditor('Panel: Inventory');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    const inventory = bindingRow('Panel: Inventory');
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(inventory).not.toHaveAttribute('data-reveal-highlight');
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(screen.getByRole('tab', { name: 'General' }));
    mockVisibleRows(view.container);
    view.rerender(<KeybindingsContent />);
    expect(bindingRow('Panel: Inventory')).not.toHaveAttribute('data-reveal-highlight');
  });
});

describe('KeybindingsContent', () => {
  it.each([
    { name: 'Panel: Prayer', domain: 'gamePanel', action: 'prayer' },
    { name: dismissalName, domain: 'ui', action: 'closeOverlay' },
    { name: 'Camera: Rotate Left', domain: 'camera', action: 'orbitRotateLeft' },
    { name: 'Zuk Set Timer: Advance timer', domain: 'plugins', action: 'zukSetTimerAdvance' },
  ] as const)('keeps $domain capture active for unsupported keys, then accepts a real key', (target) => {
    render(<KeybindingsContent group={target.domain === 'plugins' ? 'Zuk Set Timer' : undefined} />);
    openEditor(target.name);
    const field = screen.getByRole('button', { name: 'Record shortcut' });
    const before = loadUnifiedKeybindStore();
    for (const event of [
      { key: 'Alt', altKey: true },
      { key: 'Control', ctrlKey: true },
      { key: 'Meta', metaKey: true },
      { key: 'AltGraph', ctrlKey: true, altKey: true },
      { key: 'Dead' },
      { key: 'Unidentified' },
      { key: 'j', repeat: true },
      { key: 'j', isComposing: true },
    ]) {
      fireEvent.keyDown(field, event);
      expect(isCapturingKeybind()).toBe(true);
      expect(field).toHaveFocus();
      expect(loadUnifiedKeybindStore()).toEqual(before);
    }
    fireEvent.keyDown(field, { key: 'j' });
    expect(isCapturingKeybind()).toBe(false);
    expect(getKeybindingValue(loadUnifiedKeybindStore(), target)).toBe(target.domain === 'plugins' ? 'J' : 'j');
  });

  it.each([
    { modifier: 'Alt', flags: { altKey: true }, expected: 'Alt+J' },
    { modifier: 'Control', flags: { ctrlKey: true }, expected: 'Ctrl+J' },
  ])('waits for the key after $modifier, preserving plugin modifier chords', ({ modifier, flags, expected }) => {
    render(<KeybindingsContent group="Zuk Set Timer" />);
    openEditor('Zuk Set Timer: Advance timer');
    const field = screen.getByRole('button', { name: 'Record shortcut' });
    fireEvent.keyDown(field, { key: modifier, ...flags });
    expect(isCapturingKeybind()).toBe(true);
    fireEvent.keyDown(field, { key: 'j', ...flags });
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe(expected);
    expect(isCapturingKeybind()).toBe(false);
  });

  it('still records standalone Shift for the free-camera Fly Down control', () => {
    render(<KeybindingsContent />);
    edit('Free Camera: Fly Down', 'Shift', { shiftKey: true });
    expect(loadUnifiedKeybindStore().camera.freeformDown).toBe('Shift');
    expect(isCapturingKeybind()).toBe(false);
  });

  it('keeps the same key field and surrounding list mounted during capture', () => {
    render(<KeybindingsContent />);
    const list = screen.getByRole('tabpanel', { name: 'General' });
    const prayer = screen.getByRole('button', { name: 'Rebind Panel: Prayer' });
    const combat = screen.getByRole('button', { name: 'Rebind Panel: Combat' });

    fireEvent.click(prayer);

    expect(screen.getByRole('button', { name: 'Record shortcut' })).toBe(prayer);
    expect(prayer).toHaveTextContent('F5');
    expect(screen.getByRole('tabpanel', { name: 'General' })).toBe(list);
    expect(screen.getByRole('button', { name: 'Rebind Panel: Combat' })).toBe(combat);
    expect(list).not.toContainElement(screen.getByRole('button', { name: 'Unbind' }));
    expect(screen.getByRole('tab', { name: 'Camera' })).toBeVisible();
  });

  it('switches directly to another binding without changing the first', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');

    fireEvent.click(screen.getByRole('button', { name: 'Rebind Panel: Inventory' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'j' });

    expect(loadUnifiedKeybindStore().gamePanel.inventory).toBe('j');
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('F5');
  });

  it('releases capture when switching categories', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');

    fireEvent.click(screen.getByRole('tab', { name: 'Camera' }));

    expect(isCapturingKeybind()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Record shortcut' })).toBeNull();
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('F5');
  });

  it('keeps General, Camera and Plugins separate while preserving the dismissal divider', () => {
    render(<KeybindingsContent />);
    const list = screen.getByRole('tabpanel', { name: 'General' });
    expect(within(list).queryByText('Zuk Set Timer', { selector: 'summary' })).toBeNull();
    expect(within(list).getByRole('button', { name: `Rebind ${dismissalName}` })).toHaveTextContent('Esc');
    expect(
      [...list.querySelectorAll('[data-keybinding-group]')].map((element) =>
        element.getAttribute('data-keybinding-group'),
      ),
    ).toEqual(['Panel', 'General']);
    const general = within(list).getByRole('region', { name: 'General' });
    expect(general.firstElementChild).toBe(within(general).getByRole('separator'));
    expect(
      within(list).getByRole('button', { name: 'Rebind Panel: Keybinds' }).closest('section')?.nextElementSibling,
    ).toBe(general);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['General', 'Camera', 'Plugins']);
    fireEvent.click(screen.getByRole('tab', { name: 'Camera' }));

    expect(screen.getByRole('button', { name: 'Rebind Camera: Rotate Left' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Rebind Panel: Prayer' })).toBeNull();
    expect(screen.queryByRole('button', { name: `Rebind ${dismissalName}` })).toBeNull();
    expect(screen.queryByText('Zuk Set Timer', { selector: 'summary' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(screen.getByText('Zuk Set Timer', { selector: 'summary' }).closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Rebind Panel: Prayer' })).toBeNull();
    expect(screen.queryByRole('button', { name: `Rebind ${dismissalName}` })).toBeNull();
  });

  it('does not expose Simulation bindings even when stored settings carry them', () => {
    saveSetting('osrs-unified-keybinds', { ui: { restartSimulation: 'Ctrl+J', setPracticeStart: 'Alt+H' } });
    render(<KeybindingsContent />);
    expect(screen.queryByRole('tab', { name: 'Simulation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rebind Simulation:/ })).toBeNull();
    expect(loadUnifiedKeybindStore().ui).toEqual({ closeOverlay: 'Escape' });
  });

  it('edits a plugin shortcut directly from the Plugins tab', () => {
    render(<KeybindingsContent />);
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'j' });
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('J');
  });

  it('uses the shared stroked disclosure shape and toggles without starting capture', () => {
    render(<KeybindingsContent />);
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    const summary = screen.getByText('Zuk Set Timer', { selector: 'summary' });
    const chevron = summary.querySelector('svg');
    expect(chevron).toHaveClass('disclosure-chevron', 'keybindings-chevron');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron?.querySelector('path')).toHaveAttribute('d', 'M3 2 6 5 3 8');
    fireEvent.click(summary);
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(isCapturingKeybind()).toBe(false);
    expect(summary).not.toHaveFocus();
  });

  it('releases capture on entering Plugins and resets only that category', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { prayer: 'j' }, plugins: { zukSetTimerAdvance: 'k' } });
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');
    fireEvent.click(screen.getByRole('tab', { name: 'Plugins' }));
    expect(isCapturingKeybind()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Plugins bindings to defaults' }));
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('Z');
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('j');
    expect(loadUnifiedKeybindStore().gamePanel.inventory).toBe('F3');
  });

  it('keeps the hint with the final word and preserves the full accessible description', () => {
    render(<KeybindingsContent />);
    const help = screen.getByRole('button', { name: `About ${dismissalLabel}` });
    const finalWord = help.closest('.keybindings-hint-word');
    expect(finalWord?.firstElementChild).toHaveTextContent('cancel');
    expect(finalWord?.previousElementSibling).toHaveTextContent('Close or');
    expect(screen.getByRole('button', { name: `Rebind ${dismissalName}` })).toHaveAccessibleDescription(
      'Close or cancel Escape',
    );
  });

  it('explains dismissal on hover without starting key capture', async () => {
    render(<KeybindingsContent />);
    const help = screen.getByRole('button', { name: `About ${dismissalLabel}` });
    const region = help.closest('.info-hint-region');
    if (!region) throw new Error('Missing dismissal help region');
    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Closes the topmost menu, panel or dialog. Also cancels a selected spell or backs out of a replay.',
    );
    expect(isCapturingKeybind()).toBe(false);
    expect(help).not.toHaveFocus();
    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens dismissal help by touch and dismisses it with a second tap or outside press', () => {
    render(<KeybindingsContent />);
    const help = screen.getByRole('button', { name: `About ${dismissalLabel}` });
    const tap = () => {
      fireEvent.pointerDown(help, { pointerType: 'touch' });
      fireEvent.pointerUp(help, { pointerType: 'touch' });
      fireEvent.click(help);
    };
    tap();
    expect(screen.getByRole('tooltip')).toHaveTextContent('cancels a selected spell');
    expect(isCapturingKeybind()).toBe(false);
    tap();
    expect(screen.queryByRole('tooltip')).toBeNull();
    tap();
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(loadUnifiedKeybindStore().ui.closeOverlay).toBe('Escape');
  });

  it('saves an available plugin combination immediately', () => {
    render(<KeybindingsContent group="Zuk Set Timer" />);

    edit('Zuk Set Timer: Advance timer', 'j', { shiftKey: true });

    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('Shift+J');
    expect(isCapturingKeybind()).toBe(false);
  });

  it('drops the help line and shortens the idle hint in the compact embedded variant', () => {
    const help = 'Active during Zuk while Set Timer is on. Changes save immediately.';
    const first = render(<KeybindingsContent group="Zuk Set Timer" />);
    expect(screen.getByText(help)).toBeDefined();
    expect(screen.getByRole('status')).toHaveTextContent('Click a key to change it.');
    first.unmount();

    render(<KeybindingsContent group="Zuk Set Timer" compact />);
    expect(screen.queryByText(help)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Click a key to rebind.');
    // Compact is presentation only: the fields and their states stay fully there.
    expect(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeDefined();
  });

  it('automatically reassigns a conflicting key and announces the action unbound', () => {
    render(<KeybindingsContent group="Zuk Set Timer" />);

    edit('Zuk Set Timer: Advance timer', 'F5');

    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('');
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('F5');
    expect(screen.getByRole('status')).toHaveTextContent(/Unbound:.*Prayer/);
    expect(screen.getByRole('status').parentElement).toHaveClass('has-unbound');
    expect(screen.queryByRole('button', { name: /^Reassign/ })).toBeNull();
    expect(isCapturingKeybind()).toBe(false);
  });

  it('reports every action unbound when a key has multiple owners', () => {
    render(<KeybindingsContent />);

    edit('Panel: Prayer', 'w');

    expect(loadUnifiedKeybindStore().camera.orbitTiltUp).toBe('');
    expect(loadUnifiedKeybindStore().camera.freeformForward).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('Tilt Up');
    expect(screen.getByRole('status')).toHaveTextContent('Forward');
  });

  it('cancels capture without changing the stored binding', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(loadUnifiedKeybindStore().gamePanel).toEqual(DEFAULT_KEYBINDS);
    expect(isCapturingKeybind()).toBe(false);
  });

  it('records Escape as a normal panel shortcut instead of canceling', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');
    expect(screen.getByRole('status')).toHaveTextContent('Press a key.');
    expect(screen.getByRole('status')).not.toHaveTextContent(/Esc cancels/i);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'Escape' });

    expect(isCapturingKeybind()).toBe(false);
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('Escape');
    expect(loadUnifiedKeybindStore().gamePanel.inventory).toBe('F3');
    expect(loadUnifiedKeybindStore().ui.closeOverlay).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent(dismissalLabel ?? '');
    expect(screen.getByRole('button', { name: 'Rebind Panel: Prayer' })).toHaveTextContent('Esc');
  });

  it('records Escape for a feature shortcut', () => {
    render(<KeybindingsContent group="Zuk Set Timer" />);
    edit('Zuk Set Timer: Advance timer', 'Escape');
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('Escape');
    expect(isCapturingKeybind()).toBe(false);
  });

  it('edits, unbinds and resets dismissal through the existing controls without changing Inventory', () => {
    render(<KeybindingsContent />);
    edit(dismissalName, 'j');
    expect(loadUnifiedKeybindStore().ui.closeOverlay).toBe('j');
    expect(screen.getByRole('status')).toHaveTextContent(`${dismissalLabel} saved.`);

    openEditor(dismissalName);
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    expect(loadUnifiedKeybindStore().ui.closeOverlay).toBe('');
    expect(screen.getByRole('button', { name: `Rebind ${dismissalName}` })).toHaveTextContent('Unbound');

    openEditor(dismissalName);
    fireEvent.click(screen.getByRole('button', { name: `Reset ${dismissalLabel} binding to default` }));
    expect(loadUnifiedKeybindStore().ui.closeOverlay).toBe('Escape');
    expect(loadUnifiedKeybindStore().gamePanel.inventory).toBe('F3');
  });

  it('unbinds the selected action and disables unbinding an empty binding', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Inventory');
    fireEvent.click(screen.getByRole('button', { name: 'Unbind' }));
    expect(loadUnifiedKeybindStore().gamePanel.inventory).toBe('');
    expect(screen.getByRole('button', { name: 'Rebind Panel: Inventory' })).toHaveTextContent('Unbound');
    expect(screen.getByRole('button', { name: 'Rebind Panel: Inventory' })).toHaveClass('is-unbound');
    openEditor('Panel: Inventory');
    expect(screen.getByRole('button', { name: 'Unbind' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Use Esc' })).toBeNull();
  });

  it('automatically resolves a collision when recording a key', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'F1' });

    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('F1');
    expect(loadUnifiedKeybindStore().gamePanel.combat).toBe('');
    expect(screen.getByRole('button', { name: 'Rebind Panel: Combat' })).toHaveClass('is-unbound');
    expect(screen.getByRole('status')).toHaveTextContent('Combat');
    // Recorded, the field lets go of focus: Space and Enter are game keys again.
    expect(screen.getByRole('button', { name: 'Rebind Panel: Prayer' })).not.toHaveFocus();
  });

  it('does not trigger game, camera or timer input while capturing', () => {
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, DEFAULT_KEYBINDS));
    const timer = renderHook(() => useZukSetTimer({ enabled: true, currentTick: 5 }));
    isKeyHeld('z');
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');
    expect(isCapturingKeybind()).toBe(true);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'z' });

    expect(onTabChange).not.toHaveBeenCalled();
    expect(timer.result.current?.timer.status).toBe('idle');
    expect(isKeyHeld('z')).toBe(false);
    expect(isCapturingKeybind()).toBe(false);
  });

  it('rejects reserved shortcuts without unbinding or executing them, then permits a retry', () => {
    const onReset = vi.fn();
    renderHook(() =>
      useAppHotkeys({ onReset, onToggleQuickSearch: vi.fn(), onToggleShowFps: vi.fn(), triggerHintToast: vi.fn() }),
    );
    render(<KeybindingsContent group="Zuk Set Timer" />);

    edit('Zuk Set Timer: Advance timer', 'r', { ctrlKey: true });

    expect(onReset).not.toHaveBeenCalled();
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('Z');
    expect(screen.getByRole('status')).toHaveTextContent(/reserved/i);
    expect(screen.getByRole('status').parentElement).not.toHaveClass('has-unbound');
    expect(isCapturingKeybind()).toBe(true);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Record shortcut' }), { key: 'j' });
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('J');
  });

  it('shows why a previously saved plugin shortcut is inactive', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { prayer: 'z' } });
    render(<KeybindingsContent group="Zuk Set Timer" />);

    expect(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toHaveAccessibleDescription(
      /In use: Panel: Prayer/,
    );
  });

  it('resets a category immediately and reports external bindings unbound once', () => {
    saveSetting('osrs-unified-keybinds', { gamePanel: { prayer: 'z' }, plugins: { zukSetTimerAdvance: 'j' } });
    render(<KeybindingsContent group="Zuk Set Timer" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset Zuk Set Timer bindings to defaults' }));

    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('Z');
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('');
    expect(screen.getByRole('status').textContent?.match(/Prayer/g)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeVisible();
  });

  it('releases capture when unmounted', () => {
    const view = render(<KeybindingsContent />);
    openEditor('Panel: Prayer');
    view.unmount();
    expect(isCapturingKeybind()).toBe(false);
  });

  it('cancels capture on window focus loss', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');
    act(() => window.dispatchEvent(new Event('blur')));
    expect(isCapturingKeybind()).toBe(false);
  });

  it('stops capturing on an outside click', () => {
    render(<KeybindingsContent />);
    openEditor('Panel: Prayer');
    fireEvent.pointerDown(document.body);
    expect(isCapturingKeybind()).toBe(false);
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('F5');
  });

  it('renders feature bindings directly without global navigation', () => {
    render(<KeybindingsContent group="Zuk Set Timer" />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Rebind Panel: Prayer' })).toBeNull();
  });

  it('identifies hidden feature owners when a global key displaces them', () => {
    render(<KeybindingsContent />);
    edit('Panel: Prayer', 'z');
    expect(screen.getByRole('status')).toHaveTextContent('Zuk Set Timer');
    expect(screen.getByRole('status')).toHaveTextContent('Advance timer');
    expect(screen.getByRole('status')).toHaveTextContent('Reset timer');
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('');
    expect(loadUnifiedKeybindStore().plugins.zukSetTimerReset).toBe('');
  });

  it('keeps label and feedback ids unique across simultaneous feature editors', () => {
    const view = render(
      <>
        <KeybindingsContent />
        <KeybindingsContent group="Zuk Set Timer" />
        <KeybindingsContent group="Zuk Set Timer" />
      </>,
    );
    const ids = [...view.container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const element of view.container.querySelectorAll('[aria-describedby]')) {
      for (const id of element.getAttribute('aria-describedby')?.split(' ') ?? []) {
        expect(document.getElementById(id)).not.toBeNull();
      }
    }
  });

  it('switches categories by pointer only', () => {
    render(<KeybindingsContent />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'General' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Camera' })).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(screen.getByRole('tab', { name: 'Camera' }));
    expect(screen.getByRole('tab', { name: 'Camera' })).toHaveAttribute('aria-selected', 'true');
  });

  it.each([
    { name: 'Panel: Prayer', domain: 'gamePanel', action: 'prayer', press: {}, expected: 'Tab' },
    { name: dismissalName, domain: 'ui', action: 'closeOverlay', press: {}, expected: 'Tab' },
    { name: 'Camera: Rotate Left', domain: 'camera', action: 'orbitRotateLeft', press: {}, expected: 'Tab' },
    {
      name: 'Zuk Set Timer: Advance timer',
      domain: 'plugins',
      action: 'zukSetTimerAdvance',
      press: { shiftKey: true },
      expected: 'Shift+Tab',
    },
  ] as const)('records $expected for $domain without moving focus', (target) => {
    const appHotkeys = renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      }),
    );
    render(<KeybindingsContent group={target.domain === 'plugins' ? 'Zuk Set Timer' : undefined} />);
    openEditor(target.name);
    const field = screen.getByRole('button', { name: 'Record shortcut' });
    const later = vi.fn();
    window.addEventListener('keydown', later);
    try {
      // `false`: the browser's focus move was canceled.
      expect(fireEvent.keyDown(field, { key: 'Tab', ...target.press })).toBe(false);
      // Spent by the capture: no window-level listener (game keys, the app's Tab swallower) saw it.
      expect(later).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', later);
      appHotkeys.unmount();
    }
    expect(isCapturingKeybind()).toBe(false);
    expect(getKeybindingValue(loadUnifiedKeybindStore(), target)).toBe(target.expected);
    expect(screen.getByRole('button', { name: `Rebind ${target.name}` })).toHaveTextContent(
      target.expected === 'Tab' ? 'Tab' : 'Shift + Tab',
    );
  });

  it('fires a recorded Tab panel binding with the app Tab swallower active', () => {
    renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      }),
    );
    render(<KeybindingsContent />);
    edit('Panel: Prayer', 'Tab');
    const onTabChange = vi.fn();
    renderHook(() => useGamePanelShortcuts(onTabChange, loadUnifiedKeybindStore().gamePanel));
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(onTabChange).toHaveBeenCalledWith('prayer');
  });

  it('disables editing while replay owns the panel', () => {
    render(<KeybindingsContent readOnly />);
    expect(screen.getByRole('button', { name: 'Rebind Panel: Prayer' })).toBeDisabled();
  });
});
