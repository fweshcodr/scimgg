// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { WorkspaceDockContext, WorkspacePortal } from '../WorkspaceDockContext';

function StatefulTool() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Count {count}
    </button>
  );
}

describe('WorkspacePortal', () => {
  it('renders locally without a workspace provider', () => {
    const { container } = render(
      <WorkspacePortal surface="chrome">
        <StatefulTool />
      </WorkspacePortal>,
    );
    expect(container).toContainElement(screen.getByRole('button', { name: 'Count 0' }));
  });

  it('waits for its host rather than mounting a temporary tool tree', () => {
    render(
      <WorkspaceDockContext value={{ chromeHost: null, cursorHost: null, transportHost: null }}>
        <WorkspacePortal surface="chrome">
          <StatefulTool />
        </WorkspacePortal>
      </WorkspaceDockContext>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('retains the same tree and its local state across workspace changes', () => {
    const host = document.createElement('div');
    const tree = (cursorHost: HTMLElement | null) => (
      <WorkspaceDockContext value={{ chromeHost: host, cursorHost, transportHost: null }}>
        <WorkspacePortal surface="chrome">
          <StatefulTool />
        </WorkspacePortal>
      </WorkspaceDockContext>
    );
    const { rerender } = render(tree(null));
    const button = host.querySelector('button');
    if (!button) throw new TypeError('Missing mounted tool');
    fireEvent.click(button);

    rerender(tree(document.createElement('div')));

    expect(host.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('Count 1');
  });
});
