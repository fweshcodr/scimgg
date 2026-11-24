import { presetGpuStatus } from '../../util/gpuDetection';
import { setStorageNamespace } from '../../util/storage';
import { harnessGpuStatus } from './harnessSurfaces';

/**
 * Prefix for every persisted key the harness touches.
 *
 * Fixed on purpose: it is what keeps a run out of the developer's real settings
 * AND what suppresses cross-window settings broadcasts, so it must not be a knob
 * a URL parameter can weaken to an empty string.
 */
export const HARNESS_STORAGE_NAMESPACE = 'ui-harness:';

/**
 * Everything that must be true *before* the harness mounts the app.
 *
 * Kept as one call so the entry page and the tests install the same
 * environment — a guarantee that only holds in one of them is worthless.
 */
export function installHarnessEnvironment(open: readonly string[] = []): void {
  setStorageNamespace(HARNESS_STORAGE_NAMESPACE);
  // The GPU probe allocates a real WebGL2 context and several components call
  // it independently. Seed the answer so the harness never creates one; the
  // GPU surfaces (`?open=hardware-warning`, `?open=webgl2-gate`) seed theirs.
  presetGpuStatus(harnessGpuStatus(open));
}

/** Undo {@link installHarnessEnvironment}. Tests must not leak these module globals. */
export function uninstallHarnessEnvironment(): void {
  setStorageNamespace('');
  presetGpuStatus(null);
}
