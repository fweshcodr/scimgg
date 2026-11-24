// @vitest-environment happy-dom

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GamePanelTabStore } from '../../core/gamePanelTabStore';
import { GamePanelTabProvider, useGamePanelTab } from '../GamePanelTabContext';

describe('GamePanelTabStore', () => {
  it('notifies subscribers on a change and no-ops on an unchanged tab', () => {
    const store = new GamePanelTabStore('inventory');
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications++;
    });

    store.set('prayer');
    expect(store.getSnapshot()).toBe('prayer');
    expect(notifications).toBe(1);

    store.set('prayer');
    expect(notifications).toBe(1);

    unsubscribe();
    store.set('combat');
    expect(notifications).toBe(1);
    expect(store.getSnapshot()).toBe('combat');
  });
});

describe('useGamePanelTab', () => {
  it('returns undefined outside a provider so callers fall back to their prop', () => {
    function Probe() {
      return <span data-testid="tab">{String(useGamePanelTab())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('tab').textContent).toBe('undefined');
  });

  it('re-renders only the subscriber when the tab changes, never its siblings', () => {
    const store = new GamePanelTabStore('inventory');
    const renders = { subscriber: 0, sibling: 0 };

    function Subscriber() {
      renders.subscriber++;
      return <span data-testid="tab">{useGamePanelTab()}</span>;
    }
    function Sibling() {
      renders.sibling++;
      return <span data-testid="sibling">sibling</span>;
    }

    render(
      <GamePanelTabProvider store={store}>
        <Subscriber />
        <Sibling />
      </GamePanelTabProvider>,
    );

    expect(screen.getByTestId('tab').textContent).toBe('inventory');
    const siblingRendersBefore = renders.sibling;
    const subscriberRendersBefore = renders.subscriber;

    act(() => {
      store.set('prayer');
    });

    expect(screen.getByTestId('tab').textContent).toBe('prayer');
    expect(renders.subscriber).toBeGreaterThan(subscriberRendersBefore);
    expect(renders.sibling).toBe(siblingRendersBefore);
  });
});
