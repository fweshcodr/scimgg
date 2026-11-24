/**
 * Preferences persist in localStorage, not cookies, which ride every request and can overflow
 * request headers.
 */

import { log } from './Logger';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/** The UI harness namespace prevents same-origin runs from overwriting developer settings. */
let _namespace = '';

export function setStorageNamespace(namespace: string): void {
  _namespace = namespace;
}

/** Namespaced persistence must disable cross-window sync; broadcasts would overwrite a real app tab. */
export function isStorageNamespaced(): boolean {
  return _namespace !== '';
}

function namespaced(key: string): string {
  return _namespace ? `${_namespace}${key}` : key;
}

export function loadSetting<T>(key: string): T | null {
  if (!isBrowser) return null;

  try {
    const stored = localStorage.getItem(namespaced(key));
    if (stored !== null) {
      try {
        return JSON.parse(stored) as T;
      } catch {
        localStorage.removeItem(namespaced(key));
      }
    }
  } catch {
    // localStorage access can throw in sandboxed contexts.
  }

  return null;
}

export function saveSetting<T>(key: string, value: T): boolean {
  if (!isBrowser) return false;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return false;

    try {
      localStorage.setItem(namespaced(key), json);
    } catch (err) {
      log.warn('Storage', `Failed to persist "${key}" to localStorage`, err);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function deleteSetting(key: string): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(namespaced(key));
  } catch {}
}
