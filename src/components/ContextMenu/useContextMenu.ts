import { useContext } from 'react';
import { ContextMenuContext, type ContextMenuContextType } from './contextMenuTypes';

export function useContextMenu(): ContextMenuContextType {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return ctx;
}
