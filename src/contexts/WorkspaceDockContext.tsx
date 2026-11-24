import { createContext, type ReactNode, useContext } from 'react';
import { createPortal } from 'react-dom';

export interface WorkspaceDockValue {
  /** The window-level layer the desktop top chrome is laid out in, under the drawers. */
  readonly chromeHost: HTMLElement | null;
  readonly cursorHost: HTMLElement | null;
  readonly transportHost: HTMLElement | null;
}

export const WorkspaceDockContext = createContext<WorkspaceDockValue | null>(null);

export function useWorkspaceDock(): WorkspaceDockValue | null {
  return useContext(WorkspaceDockContext);
}

export function WorkspacePortal({
  surface,
  children,
}: {
  readonly surface: 'chrome' | 'cursor' | 'transport';
  readonly children: ReactNode;
}) {
  const workspace = useWorkspaceDock();
  if (!workspace) return children;
  const host = { chrome: workspace.chromeHost, cursor: workspace.cursorHost, transport: workspace.transportHost }[
    surface
  ];
  return host ? createPortal(children, host) : null;
}
