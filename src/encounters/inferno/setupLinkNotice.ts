/**
 * The outcome of the setup link the app was opened with (`setupLink.ts`), for the Inferno setup
 * control to show. One value for the whole app: written once at boot, read wherever the control is
 * drawn (rail, Practice pane, mobile window), cleared when dismissed. Kept apart from the link
 * reader so the control does not pull the gear importer in behind it.
 */
import { useSyncExternalStore } from 'react';

export interface InfernoSetupLinkNotice {
  /** `warning`: the setup was applied but the gear was not, or not all of it. */
  readonly tone: 'success' | 'warning' | 'error';
  readonly message: string;
  /**
   * Puts the Inferno options and gear back exactly as they were before the link applied, and
   * dismisses the notice. Offered only for a link that applied something, and withdrawn once those
   * options or that gear change after it (see `useInfernoSetupLink`).
   */
  readonly undo?: () => void;
}

let currentNotice: InfernoSetupLinkNotice | null = null;
const listeners = new Set<() => void>();

function setNotice(next: InfernoSetupLinkNotice | null): void {
  if (next === currentNotice) return;
  currentNotice = next;
  for (const listener of listeners) listener();
}

export function showInfernoSetupLinkNotice(notice: InfernoSetupLinkNotice): void {
  setNotice(notice);
}

export function dismissInfernoSetupLinkNotice(): void {
  setNotice(null);
}

/** The notice stays, without its undo: what it would restore is no longer what the link left. */
export function withdrawInfernoSetupLinkUndo(): void {
  if (!currentNotice?.undo) return;
  const { undo: _, ...rest } = currentNotice;
  setNotice(rest);
}

export function getInfernoSetupLinkNotice(): InfernoSetupLinkNotice | null {
  return currentNotice;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The outcome of the link the app was opened with, until dismissed; null otherwise. */
export function useInfernoSetupLinkNotice(): InfernoSetupLinkNotice | null {
  return useSyncExternalStore(subscribe, getInfernoSetupLinkNotice, getInfernoSetupLinkNotice);
}
