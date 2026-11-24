// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOUCH_LONG_PRESS_DEFAULT_MS } from '../../../input/touchPrefs';
import { JAGEX_BOSSING_HOTKEYS } from '../../../layout/osmHotkeys';
import { defaultOsmFrame } from '../../../test/helpers/osmFrame';
import { ContextMenuOverlay, ContextMenuProvider, useContextMenu } from '../../ContextMenu';
import { TooltipProvider } from '../../Tooltip';
import { HotkeyCustomizationProvider } from '../../TouchControls';
import { MobileHotkeys } from '../MobileHotkeys';

vi.mock('../../DraggablePanel', () => ({ DraggablePanel: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('../../PixelSpriteLayer', () => ({ PixelSpriteLayer: () => null }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function props(): ComponentProps<typeof MobileHotkeys> {
  return {
    frame: defaultOsmFrame({ width: 844, height: 390 }, { top: 0, right: 0, bottom: 0, left: 0 }),
    slots: JAGEX_BOSSING_HOTKEYS,
    facts: {
      openTab: null,
      quickPrayersActive: false,
      runEnabled: false,
      hasSpecialAttack: false,
      specialAttackShownActive: false,
    },
    bind: () => ({ onPress: vi.fn() }),
    collapsed: false,
    onToggleCollapsed: vi.fn(),
  };
}
function MenuAction() {
  const { content } = useContextMenu();
  return (
    <button type="button" onKeyDown={() => content?.entries.find((entry) => entry.action === 'Customize')?.onClick?.()}>
      Select menu action
    </button>
  );
}

describe('MobileHotkeys', () => {
  it('hides empty slots while leaving unavailable supported actions on the bar', () => {
    render(
      <TooltipProvider>
        <ContextMenuProvider>
          <MobileHotkeys {...props()} slots={[0, 0, 23, 8, 0]} />
        </ContextMenuProvider>
      </TooltipProvider>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Special attack' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Prayer Tab' })).toBeTruthy();
  });

  it('opens Customize on a long press without folding the bar', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query.includes('coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    vi.useFakeTimers();
    const p = props();
    const open = vi.fn();
    render(
      <HotkeyCustomizationProvider onOpenSettings={open}>
        <TooltipProvider>
          <ContextMenuProvider>
            <MobileHotkeys {...p} />
            <ContextMenuOverlay />
            <MenuAction />
          </ContextMenuProvider>
        </TooltipProvider>
      </HotkeyCustomizationProvider>,
    );
    const button = screen.getByRole('button', { name: 'Hide hotkeys' });
    fireEvent(
      button,
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 1, isPrimary: true }),
    );
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
    expect(screen.getByRole('menu')).toHaveTextContent('Customize');
    expect(p.onToggleCollapsed).not.toHaveBeenCalled();
    // The menu provider owns touch dispatch; exercise the published action independently
    // of the finger-release selection tests in ContextMenuOverlay's suite.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Select menu action' }), { key: 'Enter' });
    expect(open).toHaveBeenCalledOnce();
  });
});
