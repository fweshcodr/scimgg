// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MechanicsToggleContext, MechanicsToggleInfo } from '../../core/encounters/types';
import { buildYamaControls } from '../../encounters/yamaP3/controls';
import { buildZukControls } from '../../encounters/zuk/controls';
import { loadUnifiedKeybindStore } from '../../hooks/keybindStore';
import type { MechanicsConfig } from '../../types/simulation';
import { deleteSetting } from '../../util/storage';
import {
  MechanicsSettings,
  orderDependentsUnderParents,
  partitionPracticeToggles,
  useVisibleInPractice,
} from '../MechanicsSettings';

const FIREBALL_ORIENTATION: MechanicsToggleInfo = {
  key: 'fireballStart',
  label: 'Fireball Orientation',
  dependsOn: 'fireballs',
  choices: [
    { value: 'random', label: 'Random' },
    { value: 'horizontal', label: 'Horiz' },
    { value: 'vertical', label: 'Vert' },
  ],
};

const TOGGLES: MechanicsToggleInfo[] = [{ key: 'fireballs', label: 'Fireballs' }, FIREBALL_ORIENTATION];

function setup(config: Partial<MechanicsConfig>, defaultConfig?: Partial<MechanicsConfig>) {
  const onConfigChange = vi.fn();
  const props: React.ComponentProps<typeof MechanicsSettings> = {
    config: { infiniteHealth: false, ...config } as MechanicsConfig,
    onConfigChange,
    mechanicsToggles: TOGGLES,
    defaultConfig: defaultConfig as MechanicsConfig | undefined,
    debugActions: [],
  };
  const view = render(<MechanicsSettings {...props} />);
  const group = view.container.querySelector<HTMLElement>('[role="radiogroup"]');
  if (!group) throw new Error('choice control did not render');
  const options = Array.from(group.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  return { onConfigChange, view, group, options };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  deleteSetting('osrs-unified-keybinds');
});

/** Fire at the region, never at `.info-hint`: a mouse opens the hint from the label it is set on. */
function dwellOn(region: Element | null | undefined): void {
  if (!(region instanceof HTMLElement)) throw new Error('hint region did not render');
  fireEvent.pointerEnter(region, { pointerType: 'mouse' });
  act(() => {
    // Runs whatever the dwell is, so tuning it never silently turns this into a no-op.
    vi.advanceTimersToNextTimer();
  });
}

describe('MechanicsSettings choice control', () => {
  it('puts the Zuk opening choice in Fight Setup while keeping Set Timer in Practice aids', () => {
    const controls = buildZukControls();
    const config = { infiniteHealth: false, ...controls.defaultMechanicsConfig };
    const onConfigChange = vi.fn();
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={config}
        onConfigChange={onConfigChange}
        mechanicsToggles={controls.mechanicsToggles ?? []}
        debugActions={[]}
      />,
    );

    const group = view.getByRole('radiogroup', { name: 'Starting Shield Direction' });
    expect(group.closest('[data-practice-group]')).toHaveAttribute('data-practice-group', 'fightSetup');
    expect(view.getByRole('radio', { name: 'Random' })).toHaveAttribute('aria-checked', 'true');
    expect(view.getByRole('radio', { name: 'Random' }).querySelector('svg')).toBeNull();
    expect(view.getByRole('checkbox', { name: 'Set Timer' }).closest('[data-practice-group]')).toHaveAttribute(
      'data-practice-group',
      'assists',
    );
    fireEvent.click(view.getByRole('radio', { name: 'Left' }));
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith({ ...config, zukShieldStart: 'left' });
  });

  // Practice-spawned fireballs read these choices too, so they stay editable with Fireballs off.
  it.each([
    true,
    false,
  ])('groups Yama setup choices separately and keeps them editable with Fireballs=%s', (fireballs) => {
    const controls = buildYamaControls();
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={{ infiniteHealth: false, ...controls.defaultMechanicsConfig, fireballs }}
        onConfigChange={vi.fn()}
        mechanicsToggles={controls.mechanicsToggles ?? []}
        debugActions={[]}
      />,
    );

    for (const name of ['Practice As', 'Fireball Orientation']) {
      const group = view.getByRole('radiogroup', { name });
      expect(group.closest('[data-practice-group]')).toHaveAttribute('data-practice-group', 'fightSetup');
      expect(group.closest('.setting-row')).not.toHaveClass('setting-row--dependent');
      for (const option of group.querySelectorAll('button')) expect(option.disabled).toBe(false);
    }
    expect(view.getByRole('checkbox', { name: 'Fireballs' }).closest('[data-practice-group]')).toHaveAttribute(
      'data-practice-group',
      'mechanics',
    );
  });

  it('selects a choice by pointer only, with no roving tab stop or arrow keys', () => {
    const { view, options, onConfigChange } = setup({ fireballs: true, fireballStart: 'random' });
    const radio = view.getByRole('radio', { name: 'Random' });
    fireEvent.keyDown(radio, { key: 'ArrowRight' });
    expect(onConfigChange).not.toHaveBeenCalled();
    expect(options.every((option) => !option.hasAttribute('tabindex'))).toBe(true);
    fireEvent.click(view.getByRole('radio', { name: 'Horiz' }));
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ fireballStart: 'horizontal' }));
  });

  it('keeps a mechanic and its dependent picker in one layout group during Practice reflow', () => {
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={{ infiniteHealth: false, fireballs: true }}
        onConfigChange={vi.fn()}
        mechanicsToggles={TOGGLES}
        debugActions={[]}
      />,
    );

    const parent = view.getByRole('checkbox', { name: 'Fireballs' }).closest('.mechanics-toggle-family');
    const picker = view.getByRole('radiogroup', { name: 'Fireball Orientation' }).closest('.mechanics-toggle-family');

    expect(parent).not.toBeNull();
    expect(picker).toBe(parent);
  });
  it('toggles the shield safe region from the Zuk mechanics controls', () => {
    const controls = buildZukControls();
    const config = { infiniteHealth: false, ...controls.defaultMechanicsConfig };
    const onConfigChange = vi.fn();
    const view = render(
      <MechanicsSettings
        config={config}
        onConfigChange={onConfigChange}
        mechanicsToggles={controls.mechanicsToggles ?? []}
        debugActions={[]}
      />,
    );
    const checkbox = view.getByRole('checkbox', { name: 'Shield Safe Tiles' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(checkbox);

    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith({ ...config, zukShieldSafeTiles: true });
  });

  it('edits timer bindings in preflight without toggling the mechanic or navigating away', () => {
    const onConfigChange = vi.fn();
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, zukSetTimer: true }}
        onConfigChange={onConfigChange}
        mechanicsToggles={[{ key: 'zukSetTimer', label: 'Set Timer', group: 'aid', setup: true }]}
        debugActions={[]}
        showKeybindings
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' }));
    fireEvent.keyDown(view.getByRole('button', { name: 'Record shortcut' }), { key: 'F5' });

    expect(loadUnifiedKeybindStore().plugins.zukSetTimerAdvance).toBe('F5');
    expect(loadUnifiedKeybindStore().gamePanel.prayer).toBe('');
    expect(view.getByRole('status')).toHaveTextContent(/Panel.*Prayer/);
    // Editing a binding never flips the toggle the editor hangs off.
    expect(view.getByRole('checkbox', { name: 'Set Timer' })).toHaveAttribute('aria-checked', 'true');
    expect(onConfigChange).not.toHaveBeenCalled();
  });

  it('renders the timer bindings only while the toggle is on, not when it is off or unset', () => {
    const toggles: MechanicsToggleInfo[] = [{ key: 'zukSetTimer', label: 'Set Timer', group: 'aid', setup: true }];
    const renderAt = (config: MechanicsConfig) => (
      <MechanicsSettings
        config={config}
        onConfigChange={vi.fn()}
        mechanicsToggles={toggles}
        debugActions={[]}
        showKeybindings
      />
    );
    const view = render(renderAt({ infiniteHealth: false }));
    const rebind = () => view.queryByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' });

    // Unset and explicit-off both fold the block away: shortcuts for a clock that is not
    // running are noise, and an editor that never rendered leaves no wrapper behind either.
    expect(rebind()).toBeNull();
    view.rerender(renderAt({ infiniteHealth: false, zukSetTimer: false }));
    expect(rebind()).toBeNull();
    expect(document.querySelector('.mechanics-feature-keybindings')).toBeNull();

    view.rerender(renderAt({ infiniteHealth: false, zukSetTimer: true }));
    expect(rebind()).not.toBeNull();
    expect(document.querySelector('.mechanics-feature-keybindings')).not.toBeNull();
    // Embedded chrome: no help paragraph (the row above already names the group) and the
    // compact idle hint, while the accessible key fields stay.
    expect(view.container.querySelector('.keybindings-help')).toBeNull();
    expect(view.getByRole('status')).toHaveTextContent('Click a key to rebind.');
  });

  it('does not expose timer bindings for other encounter controls', () => {
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false }}
        onConfigChange={vi.fn()}
        mechanicsToggles={TOGGLES}
        debugActions={[]}
        showKeybindings
      />,
    );
    expect(view.queryByRole('button', { name: 'Rebind Zuk Set Timer: Advance timer' })).toBeNull();
  });

  it('renders a choice entry as a radiogroup, and boolean entries still as checkboxes', () => {
    const { view, group, options } = setup({ fireballs: true, fireballStart: 'random' });
    expect(group.getAttribute('aria-label')).toBe('Fireball Orientation');
    expect(options.map((option) => option.textContent)).toEqual(['Random', 'Horiz', 'Vert']);
    expect(view.container.querySelectorAll('[role="checkbox"]')).toHaveLength(1);
  });

  it('marks exactly the stored value active', () => {
    const { options } = setup({ fireballStart: 'vertical' });
    const checked = options.filter((option) => option.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toBe('Vert');
  });

  it('writes the chosen value under the entry key without disturbing other entries', () => {
    const { onConfigChange, options } = setup({ fireballs: true, fireballStart: 'random' });
    fireEvent.click(options[1]);
    expect(onConfigChange).toHaveBeenCalledWith({
      infiniteHealth: false,
      fireballs: true,
      fireballStart: 'horizontal',
    });
  });

  // A value absent from `choices` must not leave every segment unselected: the encounter
  // falls back to the first choice, so the control has to show the same thing it will get.
  it('falls back to the first choice when the stored value is missing or unrecognized', () => {
    for (const stored of [undefined, 'nonsense']) {
      const { options } = setup({ fireballStart: stored });
      const checked = options.filter((option) => option.getAttribute('aria-checked') === 'true');
      expect(checked).toHaveLength(1);
      expect(checked[0].textContent).toBe('Random');
      cleanup();
    }
  });

  it('flags the row as modified and resets to the default value', () => {
    const { onConfigChange, view } = setup({ fireballStart: 'vertical' }, { fireballStart: 'random' });
    expect(view.container.querySelector('.setting-row--modified')).not.toBeNull();

    const reset = view.container.querySelector<HTMLButtonElement>('.setting-row--modified .setting-row__reset');
    if (!reset) throw new Error('reset button did not render');
    fireEvent.click(reset);
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ fireballStart: 'random' }));
  });

  it('does not flag the row as modified while it matches the default', () => {
    const { view } = setup({ fireballStart: 'random' }, { fireballStart: 'random' });
    expect(view.container.querySelector('.setting-row--modified')).toBeNull();
  });

  it('groups assists below the boss mechanics and pickers last, whatever order was authored', () => {
    // Authored the way the shared composition actually delivers it: a global aid spliced in at
    // the top, the boss's own mechanics, then a trailing aid.
    const authored: MechanicsToggleInfo[] = [
      { key: 'autoPrepot', label: 'Auto-Prepot', group: 'aid' },
      { key: 'yamaMelee', label: 'Yama Melee' },
      { key: 'fireballs', label: 'Fireballs' },
      FIREBALL_ORIENTATION,
      { key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' },
    ];
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, fireballs: true } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={authored}
        debugActions={[]}
      />,
    );
    const rows = Array.from(view.container.querySelectorAll('.setting-row'));
    expect(rows.map((row) => row.textContent?.replace(/RandomHorizVert$/, ''))).toEqual([
      'Yama Melee',
      'Fireballs',
      'Auto-Prepot',
      'Infinite Health',
      'Fireball Orientation',
    ]);
    expect(view.container.querySelectorAll('.mechanics-group-rule')).toHaveLength(2);
  });

  it('draws no seam when every entry is an aid, as the lobby has', () => {
    // mechanicRows is empty here, so an unguarded seam index of 0 would draw a rule above the
    // first row with nothing before it.
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[
          { key: 'autoPrepot', label: 'Auto-Prepot', group: 'aid' },
          { key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' },
        ]}
        debugActions={[]}
      />,
    );
    expect(view.container.querySelectorAll('.mechanics-group-rule')).toHaveLength(0);
    expect(view.container.querySelectorAll('.setting-row')).toHaveLength(2);
  });

  it('draws no seam when a list has only boss mechanics', () => {
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[{ key: 'yamaMelee', label: 'Yama Melee' }]}
        debugActions={[]}
      />,
    );
    expect(view.container.querySelectorAll('.mechanics-group-rule')).toHaveLength(0);
  });

  it('switches a checkbox on from a non-boolean stored value in one click', () => {
    // Negating the raw entry would make a stale string read as unchecked but flip to `false`, so
    // the first click would appear to do nothing.
    const onConfigChange = vi.fn();
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, fireballs: 'nonsense' } as unknown as MechanicsConfig}
        onConfigChange={onConfigChange}
        mechanicsToggles={[{ key: 'fireballs', label: 'Fireballs' }]}
        debugActions={[]}
      />,
    );
    const box = view.container.querySelector<HTMLButtonElement>('[role="checkbox"]');
    if (!box) throw new Error('checkbox did not render');
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ fireballs: true }));
  });

  it('disables the picker while the mechanic it depends on is off', () => {
    // The encounter reads `fireballs` and `fireballStart` independently, so this is the only
    // thing stopping a player tuning an orientation that governs a mechanic they switched off.
    const { options, view } = setup({ fireballs: false, fireballStart: 'vertical' });
    expect(options.every((option) => option.disabled)).toBe(true);
    expect(view.container.querySelector('.mechanics-choice.is-disabled')).not.toBeNull();
    expect(view.container.querySelector('[role="radiogroup"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps the picker live while its dependency is on, and still shows the stored value when off', () => {
    const on = setup({ fireballs: true, fireballStart: 'vertical' });
    expect(on.options.some((option) => option.disabled)).toBe(false);
    cleanup();

    // Disabled means inapplicable, not unset — the value must still read back.
    const off = setup({ fireballs: false, fireballStart: 'vertical' });
    const checked = off.options.filter((option) => option.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toBe('Vert');
  });

  it('keeps a dependent picker live in setup when its parent mechanic is not in the list', () => {
    // The pre-fight rail shows the fireball pickers without the Fireballs switch itself, so a
    // persisted fireballs: false must not strand them disabled with no way to reach the parent.
    // Preselecting writes only the choice key: the absent mechanic is never switched on or reset.
    const onConfigChange = vi.fn();
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, fireballs: false, fireballStart: 'random' } as MechanicsConfig}
        onConfigChange={onConfigChange}
        mechanicsToggles={[FIREBALL_ORIENTATION]}
        debugActions={[]}
      />,
    );
    const options = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(options.some((option) => option.disabled)).toBe(false);
    expect(view.container.querySelector('.mechanics-choice.is-disabled')).toBeNull();

    fireEvent.click(options[1]);
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith({
      infiniteHealth: false,
      fireballs: false,
      fireballStart: 'horizontal',
    });
  });

  function renderWithInfo(config: Partial<MechanicsConfig>) {
    return render(
      <MechanicsSettings
        config={{ infiniteHealth: false, ...config } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[{ ...FIREBALL_ORIENTATION, info: 'Axis every burst opens on.' }]}
        debugActions={[]}
      />,
    );
  }

  it('opens an entry\u2019s explanation from the label the mark is set on, not from the mark', () => {
    const view = renderWithInfo({ fireballs: true });
    const region = view.container.querySelector<HTMLElement>('.mechanics-choice-label.info-hint-region');
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!mark) throw new Error('info mark did not render');
    expect(region?.contains(mark)).toBe(true);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    dwellOn(region);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Axis every burst opens on.');
    // Not a caption: the explanation must stay out of the row's own rendered text, and the mark
    // itself contributes none of its own — it is drawn, and named by aria-label alone.
    expect(region?.textContent).toBe('Fireball Orientation');
    expect(mark.getAttribute('aria-label')).toBe('About Fireball Orientation');

    if (!region) throw new Error('hint region did not render');
    fireEvent.pointerLeave(region);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    cleanup();

    const { view: plain } = setup({ fireballs: true, fireballStart: 'random' });
    expect(plain.container.querySelector('.info-hint')).toBeNull();
    expect(plain.container.querySelector('.info-hint-region')).toBeNull();
  });

  it('answers a pointer that rests on the label without waiting out a grid-crossing dwell', () => {
    const view = renderWithInfo({ fireballs: true });
    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');

    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  });

  it('stays shut for a pointer that only clips the label on its way somewhere else', () => {
    const view = renderWithInfo({ fireballs: true });
    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');

    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(40);
    });
    // Asserted BEFORE the leave: an open-then-shut would still pass an end-state-only check.
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('leaves a tap on the label alone, and opens from a tap on the mark until the next press outside', () => {
    const view = renderWithInfo({ fireballs: true });
    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!region || !mark) throw new Error('hint did not render');

    // The label is the row's; touch asks through the mark.
    fireEvent.pointerEnter(region, { pointerType: 'touch' });
    fireEvent.pointerDown(region, { pointerType: 'touch' });
    fireEvent.pointerLeave(region, { pointerType: 'touch' });
    act(() => {
      vi.runAllTimers();
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    fireEvent.pointerDown(mark, { pointerType: 'touch' });
    fireEvent.click(mark);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    // A tap's own leave lands after it, and must not shut what it opened.
    fireEvent.pointerLeave(region, { pointerType: 'touch' });
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    fireEvent.pointerDown(window, { pointerType: 'touch' });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('keeps a Practice checkbox row a single tap target, with the hint on its mark alone', () => {
    // Mobile Practice spreads each checkbox's tap area across its whole row (MobileToolWindow.css),
    // which puts the row's hint region under every tap on it.
    const controls = buildZukControls();
    const config = { infiniteHealth: false, ...controls.defaultMechanicsConfig } as MechanicsConfig;
    const onConfigChange = vi.fn();
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={config}
        onConfigChange={onConfigChange}
        mechanicsToggles={controls.mechanicsToggles ?? []}
        debugActions={[]}
      />,
    );
    const checkbox = view.getByRole('checkbox', { name: 'Set Timer' });
    const mark = view.getByRole('button', { name: 'About Set Timer' });
    const region = checkbox.closest<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');
    expect(region.contains(mark)).toBe(true);

    fireEvent.pointerEnter(region, { pointerType: 'touch' });
    fireEvent.pointerDown(checkbox, { pointerType: 'touch' });
    fireEvent.pointerUp(checkbox, { pointerType: 'touch' });
    fireEvent.pointerLeave(region, { pointerType: 'touch' });
    fireEvent.click(checkbox);
    act(() => {
      vi.runAllTimers();
    });
    expect(onConfigChange).toHaveBeenCalledExactlyOnceWith({ ...config, zukSetTimer: !config.zukSetTimer });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    fireEvent.pointerDown(mark, { pointerType: 'touch' });
    fireEvent.pointerUp(mark, { pointerType: 'touch' });
    fireEvent.click(mark);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Manually track when the next set spawns.');
    expect(onConfigChange).toHaveBeenCalledTimes(1);
  });

  it('drops a dwell still pending when the row unmounts', () => {
    const view = renderWithInfo({ fireballs: true });
    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');

    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // A dwell that outlived its component would set state on an unmounted tree and portal a card
    // with no anchor left to point at.
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('treats a pointer of unknown type as one that hovers', () => {
    const view = renderWithInfo({ fireballs: true });
    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');

    // Written the intuitive way round — open on `pointerType === 'mouse'` — an unrecognized type
    // falls to the TAP path, where every press toggles the card and no dwell ever runs.
    fireEvent.pointerEnter(region);
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    fireEvent.pointerLeave(region);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('still opens on a focus that arrives after a press the browser did not focus', () => {
    const view = renderWithInfo({ fireballs: true });
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!mark) throw new Error('info mark did not render');

    // Safari does not focus a button on press, so the guard that stops a click latching the card
    // is armed and then never spent. Cleared only on blur it would stay armed, and swallow the
    // user's next Tab into the mark.
    fireEvent.pointerDown(mark);
    act(() => {
      vi.advanceTimersToNextTimer();
    });

    fireEvent.focus(mark);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
  });

  it('opens the explanation from the keyboard as well as the pointer', () => {
    const view = renderWithInfo({ fireballs: true });
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!mark) throw new Error('info mark did not render');

    fireEvent.focus(mark);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(mark.getAttribute('aria-describedby')).toBe(document.querySelector('[role="tooltip"]')?.id);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('leaves nothing open once the pointer that clicked it has left', () => {
    const view = renderWithInfo({ fireballs: true });
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!mark) throw new Error('info mark did not render');

    // The full press sequence a browser sends, focus included: a click must not latch the hint.
    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');
    dwellOn(region);
    fireEvent.pointerDown(mark);
    fireEvent.focus(mark);
    fireEvent.click(mark);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    fireEvent.pointerLeave(region);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('holds the explanation open for a keyboard focus the pointer then leaves', () => {
    const view = renderWithInfo({ fireballs: true });
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!mark) throw new Error('info mark did not render');

    const region = view.container.querySelector<HTMLElement>('.info-hint-region');
    if (!region) throw new Error('hint region did not render');
    fireEvent.focus(mark);
    dwellOn(region);
    fireEvent.pointerLeave(region);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    fireEvent.blur(mark);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('gives a checkbox toggle its own mark, and leaves one without an explanation bare', () => {
    const view = render(
      <MechanicsSettings
        config={{ autoPrepot: true, infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[
          { key: 'autoPrepot', label: 'Auto-Prepot', group: 'aid', info: 'Also casts spell buffs.' },
          { key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' },
        ]}
        debugActions={[]}
      />,
    );

    const rows = Array.from(view.container.querySelectorAll('.setting-row'));
    const annotated = rows.find((r) => r.textContent?.includes('Auto-Prepot'));
    const bare = rows.find((r) => r.textContent?.includes('Infinite Health'));

    // The mark is a sibling of the checkbox, never inside it: both are buttons, and nesting them
    // would be invalid markup and would route the mark's focus into the toggle.
    const mark = annotated?.querySelector('.info-hint');
    expect(mark).not.toBeNull();
    expect(annotated?.querySelector('.mechanics-toggle-info > .osrs-checkbox')).not.toBeNull();
    expect(mark?.closest('.osrs-checkbox')).toBeNull();

    expect(bare?.querySelector('.info-hint')).toBeNull();
    expect(bare?.querySelector('.mechanics-toggle-info')).toBeNull();

    // The region wraps the checkbox as well as the mark, so hovering the toggle's own label — the
    // obvious thing to point at — is what discloses the hint.
    const region = annotated?.querySelector('.mechanics-toggle-info.info-hint-region');
    expect(region?.querySelector('.osrs-checkbox')).not.toBeNull();
    dwellOn(region);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Also casts spell buffs.');
  });

  it('colors an explanation authored as segments, and still reads as its plain text', () => {
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, glyphs: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[
          {
            key: 'glyphs',
            label: 'Glyphs',
            group: 'aid',
            info: [{ text: 'Shadow is ' }, { text: 'purple', color: '#a53fff' }, { text: '.' }],
          },
        ]}
        debugActions={[]}
      />,
    );

    dwellOn(view.container.querySelector('.mechanics-toggle-info.info-hint-region'));
    const card = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(card?.textContent).toBe('Shadow is purple.');
    const coloured = Array.from(card?.querySelectorAll<HTMLElement>('span') ?? []).filter((span) => span.style.color);
    expect(coloured.map((span) => [span.textContent, span.style.color])).toEqual([['purple', '#a53fff']]);
    // The mark is described by the card itself, so a reader gets the same plain sentence.
    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    expect(mark?.getAttribute('aria-describedby')).toBe(card?.id);
  });

  it('keeps the explanation reachable while the picker is disabled', () => {
    // A picker is only disabled while the parent mechanic is IN the list, which is the
    // in-fight panel's shape; the setup rail omits the parent and leaves the picker live.
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, fireballs: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[
          { key: 'fireballs', label: 'Fireballs' },
          { ...FIREBALL_ORIENTATION, info: 'Axis every burst opens on.' },
        ]}
        debugActions={[]}
      />,
    );
    expect(view.container.querySelector('.mechanics-choice.is-disabled')).not.toBeNull();

    const mark = view.container.querySelector<HTMLButtonElement>('.info-hint');
    if (!mark) throw new Error('info mark did not render');
    expect(mark.disabled).toBe(false);
    dwellOn(view.container.querySelector('.info-hint-region'));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Axis every burst opens on.');
  });

  it('draws a choice that carries an icon, keeping its label as the accessible name', () => {
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, fireballs: true, fireballStart: 'vertical' } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[
          {
            ...FIREBALL_ORIENTATION,
            choices: [
              { value: 'horizontal', label: 'Horizontal', icon: 'fireball-line-horizontal' },
              { value: 'vertical', label: 'Vertical', icon: 'fireball-line-vertical' },
            ],
          },
        ]}
        debugActions={[]}
      />,
    );
    const options = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.textContent)).toEqual(['Horizontal', 'Vertical']);
    expect(options.map((o) => o.getAttribute('aria-label'))).toEqual(['Horizontal', 'Vertical']);
    // The visible label explains the glyph; no browser title tooltip on top of it.
    expect(options.every((o) => !o.hasAttribute('title'))).toBe(true);
    expect(options.every((o) => o.querySelector('svg') !== null)).toBe(true);
    expect(options.filter((o) => o.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('leaves a choice without an icon on its text label', () => {
    const { options } = setup({ fireballs: true, fireballStart: 'random' });
    expect(options.map((o) => o.textContent)).toEqual(['Random', 'Horiz', 'Vert']);
    expect(options.every((o) => o.querySelector('svg') === null)).toBe(true);
  });

  it('renders choice controls below the checkbox column whatever order the encounter authored', () => {
    // Authored between two checkboxes; a segmented control is two rows tall, so inline it
    // splits the toggle column. Both surfaces get different lists, so the rule lives here.
    const authored: MechanicsToggleInfo[] = [
      { key: 'fireballs', label: 'Fireballs' },
      FIREBALL_ORIENTATION,
      { key: 'voidFlares', label: 'Void Flares' },
    ];
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={authored}
        debugActions={[]}
      />,
    );
    const rows = Array.from(view.container.querySelectorAll('.setting-row'));
    expect(rows).toHaveLength(3);
    expect(rows.findIndex((row) => row.querySelector('[role="radiogroup"]'))).toBe(rows.length - 1);
    expect(rows.slice(0, 2).map((row) => row.textContent)).toEqual(['Fireballs', 'Void Flares']);
  });
});

describe('MechanicsSettings practice variant', () => {
  afterEach(() => vi.restoreAllMocks());
  const authored: MechanicsToggleInfo[] = [
    { key: 'autoPrepot', label: 'Auto-Prepot', group: 'aid' },
    { key: 'yamaMelee', label: 'Yama Melee' },
    { key: 'fireballs', label: 'Fireballs' },
    { key: 'voidFlares', label: 'Void Flares' },
    FIREBALL_ORIENTATION,
    { key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' },
  ];

  function titlesOf(container: HTMLElement): (string | null | undefined)[] {
    return Array.from(container.querySelectorAll('.practice-options__heading')).map((heading) => heading.textContent);
  }

  it('folds Options in place, keeping its controls mounted', () => {
    const props = {
      variant: 'practice' as const,
      optionsExpanded: true,
      onOptionsExpandedChange: vi.fn(),
      config: { infiniteHealth: false, fireballs: true },
      onConfigChange: vi.fn(),
      mechanicsToggles: authored,
      debugActions: [],
    };
    const view = render(<MechanicsSettings {...props} />);
    const originalControl = view.getByRole('checkbox', { name: 'Fireballs' });
    const heading = view.getByRole('button', { name: 'Options Mechanics & aids' });
    fireEvent.click(heading);
    expect(props.onOptionsExpandedChange).toHaveBeenCalledExactlyOnceWith(false);
    view.rerender(<MechanicsSettings {...props} optionsExpanded={false} />);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(view.container.querySelector('.practice-options > div')).toHaveAttribute('hidden');
    fireEvent.click(heading);
    expect(props.onOptionsExpandedChange).toHaveBeenLastCalledWith(true);
    view.rerender(<MechanicsSettings {...props} />);
    expect(view.getByRole('checkbox', { name: 'Fireballs' })).toBe(originalControl);
  });

  it('leaves the actions out where they have a palette of their own', () => {
    const props = {
      variant: 'practice' as const,
      optionsExpanded: true,
      onOptionsExpandedChange: vi.fn(),
      config: { infiniteHealth: false, fireballs: true },
      onConfigChange: vi.fn(),
      mechanicsToggles: authored,
      debugActions: buildZukControls().debugActions,
      onExecuteEncounterCommand: vi.fn(),
    };
    const withActions = render(<MechanicsSettings {...props} />);
    expect(titlesOf(withActions.container)).toEqual(['Mechanics', 'Practice aids', 'Actions']);
    withActions.unmount();
    const palette = render(<MechanicsSettings {...props} includeActions={false} />);
    expect(titlesOf(palette.container)).toEqual(['Mechanics', 'Practice aids']);
  });

  it('puts plain toggles before dependent families, and aids under their own heading', () => {
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={{ infiniteHealth: false, fireballs: true } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={authored}
        debugActions={[]}
      />,
    );
    expect(titlesOf(view.container)).toEqual(['Mechanics', 'Practice aids']);
    const [mechanics, assists] = Array.from(view.container.querySelectorAll('[data-practice-group]'));
    expect(
      Array.from(mechanics.querySelectorAll('.setting-row')).map((row) =>
        row.textContent?.replace(/RandomHorizVert$/, ''),
      ),
    ).toEqual(['Yama Melee', 'Void Flares', 'Fireballs', 'Fireball Orientation']);
    // Only the picker filed under Fireballs is marked as a dependent; the indent hangs off this.
    expect(
      Array.from(mechanics.querySelectorAll('.setting-row')).map((row) =>
        row.classList.contains('setting-row--dependent'),
      ),
    ).toEqual([false, false, false, true]);
    expect(Array.from(assists.querySelectorAll('.setting-row')).map((row) => row.textContent)).toEqual([
      'Auto-Prepot',
      'Infinite Health',
    ]);
    expect(view.container.querySelectorAll('.mechanics-group-rule')).toHaveLength(0);
  });

  it('keeps a dependent beside its parent even when only the parent names a group', () => {
    // The pair must never split across the seam: a picker filed by its own (unset) group would
    // land under Mechanics while the aid it depends on sat under Practice aids.
    expect(
      partitionPracticeToggles([
        { key: 'aid', label: 'Aid', group: 'aid' },
        { key: 'mechanic', label: 'Mechanic' },
        { key: 'aidMode', label: 'Aid Mode', dependsOn: 'aid', choices: [{ value: 'a', label: 'A' }] },
      ]),
    ).toEqual({
      setup: [],
      mechanics: [{ key: 'mechanic', label: 'Mechanic' }],
      assists: [
        { key: 'aid', label: 'Aid', group: 'aid' },
        { key: 'aidMode', label: 'Aid Mode', dependsOn: 'aid', choices: [{ value: 'a', label: 'A' }] },
      ],
    });
  });

  it('leaves a dependent in authored order when its parent is not in the list', () => {
    expect(orderDependentsUnderParents([FIREBALL_ORIENTATION, { key: 'waves', label: 'Waves' }])).toEqual([
      FIREBALL_ORIENTATION,
      { key: 'waves', label: 'Waves' },
    ]);
  });

  it('folds mechanics and aids together while leaving Fight Setup visible and editable', () => {
    const props = {
      variant: 'practice' as const,
      optionsExpanded: true,
      onOptionsExpandedChange: vi.fn(),
      config: { infiniteHealth: false, fireballs: true, startingWave: 'one' },
      onConfigChange: vi.fn(),
      mechanicsToggles: [
        ...authored,
        {
          key: 'startingWave',
          label: 'Starting Wave',
          setup: true,
          choices: [
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
          ],
        },
      ],
      debugActions: [],
    };
    const view = render(<MechanicsSettings {...props} />);
    const toggle = view.getByRole('button', { name: 'Options Mechanics & aids' });
    const body = view.container.querySelector<HTMLElement>('.practice-options > div');
    if (!body) throw new Error('Options body did not render');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(body.hidden).toBe(false);

    fireEvent.click(toggle);
    view.rerender(<MechanicsSettings {...props} optionsExpanded={false} />);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(body.hidden).toBe(true);
    expect(view.queryByRole('checkbox', { name: 'Auto-Prepot' })).toBeNull();
    expect(view.queryByRole('checkbox', { name: 'Fireballs' })).toBeNull();
    expect(view.getByRole('radiogroup', { name: 'Starting Wave' })).toBeVisible();
    fireEvent.click(view.getByRole('radio', { name: 'Two' }));
    expect(props.onConfigChange).toHaveBeenCalledExactlyOnceWith({ ...props.config, startingWave: 'two' });

    fireEvent.click(toggle);
    view.rerender(<MechanicsSettings {...props} />);
    expect(body.hidden).toBe(false);
    expect(view.getByRole('checkbox', { name: 'Auto-Prepot' })).toBeDefined();
    expect(view.getByRole('checkbox', { name: 'Fireballs' })).toBeDefined();
  });

  it('takes Options expansion from the caller and only reports the toggle', () => {
    const onOptionsExpandedChange = vi.fn();
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded={false}
        onOptionsExpandedChange={onOptionsExpandedChange}
        config={{ infiniteHealth: false, fireballs: true } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={authored}
        debugActions={[]}
      />,
    );
    const toggle = view.getByRole('button', { name: 'Options Mechanics & aids' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('tabindex', '-1');
    fireEvent.mouseDown(toggle);
    expect(document.activeElement).not.toBe(toggle);
    expect(view.queryByRole('checkbox', { name: 'Fireballs' })).toBeNull();

    fireEvent.click(toggle);
    expect(onOptionsExpandedChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(view.queryByRole('checkbox', { name: 'Auto-Prepot' })).toBeNull();
  });

  it('renders no heading for a group with nothing in it', () => {
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={{ infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[{ key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' }]}
        debugActions={[]}
      />,
    );
    expect(titlesOf(view.container)).toEqual(['Practice aids']);
  });

  it('lists practice actions ahead of inspection ones under Actions', () => {
    const onExecuteEncounterCommand = vi.fn();
    const view = render(
      <MechanicsSettings
        variant="practice"
        optionsExpanded
        onOptionsExpandedChange={vi.fn()}
        config={{ infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[]}
        debugActions={[
          {
            command: { encounter: 'zuk', type: 'demonstrate-set' },
            label: 'Visual only: set attack',
            purpose: 'inspection',
          },
          { command: { encounter: 'zuk', type: 'spawn-jad' }, label: 'Show Jad' },
        ]}
        onExecuteEncounterCommand={onExecuteEncounterCommand}
      />,
    );
    expect(titlesOf(view.container)).toEqual(['Actions']);
    const buttons = Array.from(view.container.querySelectorAll<HTMLButtonElement>('.mechanics-actions button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Show Jad', 'Visual only: set attack']);
    fireEvent.click(buttons[0]);
    expect(onExecuteEncounterCommand).toHaveBeenCalledExactlyOnceWith({ encounter: 'zuk', type: 'spawn-jad' });
  });

  it('leaves the pre-fight configurer ordering untouched', () => {
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false, fireballs: true } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={authored}
        debugActions={[]}
      />,
    );
    expect(view.container.querySelector('.mechanics-group')).toBeNull();
    const rows = Array.from(view.container.querySelectorAll('.setting-row'));
    expect(rows.map((row) => row.textContent?.replace(/RandomHorizVert$/, ''))).toEqual([
      'Yama Melee',
      'Fireballs',
      'Void Flares',
      'Auto-Prepot',
      'Infinite Health',
      'Fireball Orientation',
    ]);
  });
});

describe('MechanicsSettings debug actions', () => {
  it('renders two actions that share a command type but differ in payload as two distinct buttons', () => {
    // Zuk offers `demonstrate-jad` twice, once per style. Keyed by type alone, React logs a
    // duplicate-key error and may drop or double one of the buttons.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onExecuteEncounterCommand = vi.fn();
    const view = render(
      <MechanicsSettings
        config={{ infiniteHealth: false } as MechanicsConfig}
        onConfigChange={vi.fn()}
        mechanicsToggles={[]}
        debugActions={[
          { command: { encounter: 'zuk', type: 'demonstrate-jad', style: 'magic' }, label: 'Visual only: Jad magic' },
          { command: { encounter: 'zuk', type: 'demonstrate-jad', style: 'range' }, label: 'Visual only: Jad ranged' },
        ]}
        onExecuteEncounterCommand={onExecuteEncounterCommand}
      />,
    );

    const buttons = Array.from(view.container.querySelectorAll<HTMLButtonElement>('.mechanics-actions button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Visual only: Jad magic', 'Visual only: Jad ranged']);
    fireEvent.click(buttons[1]);
    expect(onExecuteEncounterCommand).toHaveBeenCalledWith({
      encounter: 'zuk',
      type: 'demonstrate-jad',
      style: 'range',
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('useVisibleInPractice', () => {
  const ALWAYS: MechanicsToggleInfo = { key: 'always', label: 'Always' };
  const LATE: MechanicsToggleInfo = { key: 'late', label: 'Late', visibleInPractice: ({ stage }) => stage === 2 };
  const ITEMS = [ALWAYS, LATE];

  it('keeps the array across fresh but equivalent contexts, and renews it when visibility changes', () => {
    const { result, rerender } = renderHook(
      ({ context }: { context: MechanicsToggleContext }) => useVisibleInPractice(ITEMS, context),
      { initialProps: { context: { config: {}, stage: 1 } } },
    );
    const first = result.current;
    expect(first).toEqual([ALWAYS]);
    // A new context object every render, as a per-tick host builds one: same items, same array.
    rerender({ context: { config: {}, stage: 1 } });
    expect(result.current).toBe(first);
    rerender({ context: { config: {}, stage: 2 } });
    expect(result.current).toEqual([ALWAYS, LATE]);
    expect(result.current).not.toBe(first);
    const second = result.current;
    rerender({ context: { config: {}, stage: 2 } });
    expect(result.current).toBe(second);
    rerender({ context: { config: {}, stage: 1 } });
    expect(result.current).toEqual([ALWAYS]);
    expect(result.current).not.toBe(second);
  });
});
