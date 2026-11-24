// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EncounterRegistry } from '../../core/encounters/encounterFactory';
import { EncounterPicker } from '../EncounterPicker';

// Use fixture presentation data so this test verifies the picker's RENDERING
// behavior independent of which encounters have actually shipped.
vi.mock('../encounterPickerMeta', () => {
  const presentation: Record<string, { title: string; tagline: string; blurb: string }> = {
    yama_p3: { title: 'Yama', tagline: 'Phase 3', blurb: 'Face Yama in the final phase.' },
    beta_boss: { title: 'Beta Boss', tagline: 'In progress', blurb: 'Test the next encounter.' },
  };
  return {
    VARIANT_REWARD_ICON: {},
    encounterPresentationModuleForKind: (kind: string) =>
      presentation[kind] ? { kind, presentation: presentation[kind] } : undefined,
  };
});

// The tutorial badge + Train action are driven by the tutorial registry. Pin that
// data here so these assertions describe the RENDERING rule rather than which
// bosses happen to ship tutorials today.
vi.mock('../../tutorial/content', () => ({
  hasTutorialsForEncounter: (kind: string) => kind === 'yama_p3' || kind === 'zuk',
}));

function createRegistry() {
  const registry = new EncounterRegistry();
  registry.register('yama_p3', () => ({}) as never, {
    kind: 'yama_p3',
    displayName: 'Yama - Phase 3',
    description: 'The Yama boss encounter',
    mapSquare: { x: 23, y: 157 },
    playerStart: [31, 37],
    variants: [
      {
        id: 'yama-standard',
        encounterKind: 'yama_p3',
        name: 'Standard',
        subtitle: 'Baseline contract',
        available: true,
      },
      {
        id: 'yama-hard',
        encounterKind: 'yama_p3_hard',
        name: 'Hard Mode',
        subtitle: 'Coming later',
        available: false,
      },
    ],
  });
  // Boss without variants (enters directly).
  registry.register('zulrah', () => ({}) as never, {
    kind: 'zulrah',
    displayName: 'Zulrah',
    description: 'Serpentine boss encounter',
    mapSquare: { x: 10, y: 10 },
    playerStart: [10, 10],
  });
  // Boss whose contract variant is NOT registered with a descriptor of its own —
  // the shape real contracts take. Deliberately not the first available boss, so a
  // test selecting its variant cannot pass via the firstAvailableKind fallback.
  registry.register('vardorvis', () => ({}) as never, {
    kind: 'vardorvis',
    displayName: 'Vardorvis',
    description: 'Desert Treasure II boss',
    mapSquare: { x: 12, y: 12 },
    playerStart: [12, 12],
    variants: [
      { id: 'vard-standard', encounterKind: 'vardorvis', name: 'Standard', subtitle: 'Baseline', available: true },
      {
        id: 'vard-awakened',
        encounterKind: 'vardorvis_awakened',
        name: 'Awakened',
        subtitle: 'Harder',
        available: true,
      },
    ],
  });
  registry.register('beta_boss', () => ({}) as never, {
    kind: 'beta_boss',
    displayName: 'Beta Boss',
    description: 'A work-in-progress boss encounter',
    mapSquare: { x: 25, y: 48 },
    playerStart: [30, 26],
    isWorkInProgress: true,
  });
  // Lobby is surfaced as the footer link, not a boss.
  registry.register('lobby', () => ({}) as never, {
    kind: 'lobby',
    displayName: 'Lobby',
    description: 'Hub area',
    mapSquare: { x: 0, y: 0 },
    playerStart: [0, 0],
  });
  return registry;
}

/** The fixture registry plus the Inferno, registered as the real one is. */
function createInfernoRegistry() {
  const registry = createRegistry();
  registry.register('inferno', () => ({}) as never, {
    kind: 'inferno',
    displayName: 'The Inferno',
    description: 'Practice any Inferno wave, through TzKal-Zuk.',
    mapSquare: { x: 0, y: 0 },
    playerStart: [0, 0],
    isWorkInProgress: true,
  });
  return registry;
}

function renderPicker(overrides: Partial<ComponentProps<typeof EncounterPicker>> = {}) {
  const props: ComponentProps<typeof EncounterPicker> = {
    isOpen: true,
    onClose: vi.fn(),
    onEnter: vi.fn(),
    onConfigure: vi.fn(),
    encounterRegistry: createRegistry(),
    ...overrides,
  };
  render(<EncounterPicker {...props} />);
  return props;
}

const rail = () => document.querySelector('.picker-rail-scroll') as HTMLElement;
const detail = () => document.querySelector('.picker-detail') as HTMLElement;
const contractRow = (name: string) =>
  screen.getByText(name, { selector: '.picker-contract-name' }).closest('.picker-contract') as HTMLElement;

describe('EncounterPicker', () => {
  it('does not render when closed', () => {
    renderPicker({ isOpen: false });
    expect(screen.queryByRole('heading', { name: 'Encounters' })).toBeNull();
  });

  it('renders the boss rail and the default-selected boss detail when open', () => {
    renderPicker();
    expect(screen.getByRole('heading', { name: 'Encounters' })).toBeInTheDocument();
    // yama_p3 uses its presentation title "Yama"; zulrah falls back to its displayName.
    expect(within(rail()).getByText('Yama')).toBeInTheDocument();
    expect(within(rail()).getByText('Zulrah')).toBeInTheDocument();
    // Lobby is the footer link, not a rail boss.
    expect(screen.getByRole('button', { name: 'Return to Lobby' })).toBeInTheDocument();
    // First available boss (yama_p3) is selected, so its contracts render.
    expect(contractRow('Standard')).toBeInTheDocument();
    expect(within(detail()).getByText('Hard Mode')).toBeInTheDocument();
  });

  it('filters the rail by search text and re-selects a matching boss', () => {
    renderPicker();
    fireEvent.change(screen.getByPlaceholderText('Search encounters...'), {
      target: { value: 'zulrah' },
    });
    expect(within(rail()).getByText('Zulrah')).toBeInTheDocument();
    expect(within(rail()).queryByText('Yama')).toBeNull();
    // The detail follows the filtered selection (zulrah), so Yama is gone entirely.
    expect(screen.queryByText('Yama')).toBeNull();
  });

  it('offers actions beside each available contract and no actions on unavailable contracts', () => {
    renderPicker();
    const standard = contractRow('Standard');
    expect(standard).toHaveClass('selected');
    expect(within(standard).getByRole('button', { name: 'Enter' })).toBeInTheDocument();
    expect(within(standard).getByRole('button', { name: 'Configure' })).toBeInTheDocument();

    const hard = contractRow('Hard Mode');
    expect(within(hard).getByText('Soon')).toBeInTheDocument();
    expect(within(hard).queryByRole('button')).toBeNull();
  });

  it('calls onEnter + onClose when entering an available contract', () => {
    const props = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    expect(props.onEnter).toHaveBeenCalledWith('yama_p3');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfigure + onClose when configuring an available contract', () => {
    const props = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(props.onConfigure).toHaveBeenCalledWith('yama_p3', 'Standard', 'Baseline contract');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('enters directly from a no-variant boss base row', () => {
    const props = renderPicker();
    fireEvent.click(within(rail()).getByText('Zulrah').closest('.picker-boss') as HTMLElement);
    fireEvent.click(within(detail()).getByRole('button', { name: 'Enter' }));
    expect(props.onEnter).toHaveBeenCalledWith('zulrah');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a work-in-progress boss as Beta while keeping it enterable', () => {
    const props = renderPicker();
    const betaBoss = screen.getByText('Beta Boss').closest('.picker-boss') as HTMLElement;

    expect(within(betaBoss).getByText('Beta')).toBeInTheDocument();
    // A rail row is dense and draws its own border when selected, so the marker sheds its frame.
    expect(betaBoss.querySelector('.picker-boss-heading .status-badge--compact')).not.toBeNull();
    expect(betaBoss.querySelector('.picker-boss-heading .picker-boss-name')).toHaveTextContent('Beta Boss');

    fireEvent.click(betaBoss);
    expect(within(detail()).getByText('Test the next encounter.')).toBeInTheDocument();
    fireEvent.click(within(detail()).getByRole('button', { name: 'Enter' }));

    expect(props.onEnter).toHaveBeenCalledWith('beta_boss');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a base "Standard Fight" row for a no-variant boss and configures it', () => {
    const props = renderPicker();
    fireEvent.click(within(rail()).getByText('Zulrah').closest('.picker-boss') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Configure' }));
    expect(props.onConfigure).toHaveBeenCalledWith('zulrah', 'Standard Fight', 'Serpentine boss encounter');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('configures the keyboard-selected available contract on Enter', () => {
    const props = renderPicker();
    // Cursor starts on index 0 = Standard (available, yama_p3).
    fireEvent.keyDown(screen.getByPlaceholderText('Search encounters...'), { key: 'Enter' });
    expect(props.onConfigure).toHaveBeenCalledWith('yama_p3', 'Standard', 'Baseline contract');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('configures a contract directly without a preliminary selection or a distant action', () => {
    const props = renderPicker({ currentEncounterKind: 'vardorvis' });
    fireEvent.mouseEnter(contractRow('Standard'));
    expect(contractRow('Standard')).toHaveClass('selected');
    expect(props.onConfigure).not.toHaveBeenCalled();
    fireEvent.click(within(contractRow('Awakened')).getByRole('button', { name: 'Configure' }));
    expect(props.onConfigure).toHaveBeenCalledWith('vardorvis_awakened', 'Awakened', 'Harder');
  });

  it('switches encounters from the compact selector and resets the contract', () => {
    const props = renderPicker();
    fireEvent.change(screen.getByRole('combobox', { name: 'Encounter' }), { target: { value: 'vardorvis' } });
    expect(contractRow('Standard')).toHaveClass('selected');
    fireEvent.click(within(contractRow('Standard')).getByRole('button', { name: 'Enter' }));
    expect(props.onEnter).toHaveBeenCalledWith('vardorvis');
  });

  it('does not enter an unavailable contract via keyboard', () => {
    const props = renderPicker();
    const search = screen.getByPlaceholderText('Search encounters...');
    fireEvent.keyDown(search, { key: 'ArrowDown' }); // index 1 = Hard Mode (unavailable)
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(props.onEnter).not.toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', () => {
    const props = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click, not on its press, so a touch click cannot fall through', () => {
    const props = renderPicker();
    const backdrop = document.querySelector('.picker-backdrop') as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open for presses inside the picker, even one released on the backdrop', () => {
    const props = renderPicker();
    const search = screen.getByPlaceholderText('Search encounters...');
    fireEvent.pointerDown(search);
    fireEvent.click(search);
    fireEvent.pointerDown(search);
    fireEvent.click(document.querySelector('.picker-overlay') as HTMLElement);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('returns to the lobby via a text-only navigation button outside the contract actions', () => {
    const props = renderPicker();
    const button = screen.getByRole('button', { name: 'Return to Lobby' });
    expect(button.textContent).toBe('Return to Lobby');
    expect(button.querySelector('svg')).toBeNull();
    expect(button).toHaveAttribute('tabindex', '-1');
    expect(button.closest('.picker-navigation-foot')?.parentElement).toHaveClass('picker');
    expect(button.closest('.picker-detail')).toBeNull();
    fireEvent.click(button);
    expect(props.onEnter).toHaveBeenCalledWith('lobby');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the Start Tutorial action when onTutorialMode is not provided', () => {
    renderPicker();
    expect(screen.queryByRole('button', { name: /start tutorial/i })).toBeNull();
  });

  it('defaults the selection to the encounter the user is currently in', () => {
    renderPicker({ currentEncounterKind: 'beta_boss' });
    expect(within(rail()).getByText('Beta Boss').closest('.picker-boss')).toHaveClass('active');
    expect(within(detail()).getByRole('heading', { name: 'Beta Boss' })).toBeInTheDocument();
  });

  it('falls back to the first available boss when not in an encounter', () => {
    renderPicker({ currentEncounterKind: null });
    expect(within(rail()).getByText('Yama').closest('.picker-boss')).toHaveClass('active');
  });

  it('falls back when the current encounter is not a selectable rail entry', () => {
    renderPicker({ currentEncounterKind: 'lobby' });
    expect(within(rail()).getByText('Yama').closest('.picker-boss')).toHaveClass('active');
  });

  it('selects the parent boss when the current encounter is a contract variant', () => {
    // `vardorvis_awakened` is registered as a kind but carries no descriptor, so it
    // never appears as a rail card. Vardorvis is not the first available boss, so a
    // regression here selects Yama rather than silently passing via the fallback.
    renderPicker({ currentEncounterKind: 'vardorvis_awakened' });
    expect(within(rail()).getByText('Vardorvis').closest('.picker-boss')).toHaveClass('active');
    expect(within(rail()).getByText('Yama').closest('.picker-boss')).not.toHaveClass('active');
  });

  it('opens on the encounter and contract a quick search chose, for Enter to configure', () => {
    const props = renderPicker({
      currentEncounterKind: 'yama_p3',
      initialSelection: { kind: 'vardorvis', variantId: 'vard-awakened' },
    });
    expect(within(rail()).getByText('Vardorvis').closest('.picker-boss')).toHaveClass('active');
    expect(contractRow('Awakened')).toHaveClass('selected');
    fireEvent.keyDown(screen.getByPlaceholderText('Search encounters...'), { key: 'Enter' });
    expect(props.onConfigure).toHaveBeenCalledWith('vardorvis_awakened', 'Awakened', 'Harder');
    expect(props.onEnter).not.toHaveBeenCalled();
  });

  it('opens on a chosen encounter at its first row, and ignores one it cannot show', () => {
    const { unmount } = render(
      <EncounterPicker
        isOpen
        onClose={vi.fn()}
        onEnter={vi.fn()}
        onConfigure={vi.fn()}
        encounterRegistry={createRegistry()}
        initialSelection={{ kind: 'zulrah' }}
      />,
    );
    expect(within(rail()).getByText('Zulrah').closest('.picker-boss')).toHaveClass('active');
    expect(contractRow('Standard Fight')).toHaveClass('selected');
    unmount();
    renderPicker({ currentEncounterKind: 'vardorvis', initialSelection: { kind: 'colosseum' } });
    expect(within(rail()).getByText('Vardorvis').closest('.picker-boss')).toHaveClass('active');
  });

  it('never badges a boss as a tutorial — the picker signals availability by action', () => {
    renderPicker({ onTutorialMode: vi.fn() });
    const yama = within(rail()).getByText('Yama').closest('.picker-boss') as HTMLElement;

    // A chip beside a boss name reads as "this encounter IS a tutorial". The
    // Start Tutorial button carries the signal instead.
    expect(yama.querySelector('.picker-badge, .status-badge')).toBeNull();
    expect(detail().querySelector('.picker-hero-title .picker-badge, .picker-hero-title .status-badge')).toBeNull();
    expect(within(detail()).getByRole('button', { name: /start tutorial/i })).toBeInTheDocument();
  });

  it('reserves no badge space for a boss without tutorials', () => {
    renderPicker();
    const zulrah = within(rail()).getByText('Zulrah').closest('.picker-boss') as HTMLElement;

    expect(zulrah.querySelector('.picker-badge, .status-badge')).toBeNull();

    fireEvent.click(zulrah);
    expect(detail().querySelector('.picker-hero-title .picker-badge, .picker-hero-title .status-badge')).toBeNull();
  });

  it('offers the Start Tutorial action only for the boss that has tutorials', () => {
    renderPicker({ onTutorialMode: vi.fn() });
    expect(within(detail()).getByRole('button', { name: /start tutorial/i })).toBeInTheDocument();

    fireEvent.click(within(rail()).getByText('Zulrah').closest('.picker-boss') as HTMLElement);
    expect(within(detail()).queryByRole('button', { name: /start tutorial/i })).toBeNull();
  });

  describe('the Inferno', () => {
    // TzKal-Zuk is its wave 69: one kind, one rail card, no stage rows.
    it('shows as one encounter', () => {
      const props = renderPicker({ encounterRegistry: createInfernoRegistry() });
      const card = within(rail()).getByText('The Inferno').closest('.picker-boss') as HTMLElement;
      expect(within(rail()).queryByText('TzKal-Zuk')).toBeNull();
      fireEvent.click(card);
      fireEvent.click(within(detail()).getByRole('button', { name: 'Enter' }));
      expect(props.onEnter).toHaveBeenCalledWith('inferno');
    });
  });
});
