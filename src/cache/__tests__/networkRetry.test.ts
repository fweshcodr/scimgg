import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../../util/Logger';
import { logLoadFailure, NetworkError, UnsupportedBrowserError } from '../networkRetry';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logLoadFailure', () => {
  it('logs a network failure as a warning, not an error', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const failure = new NetworkError('Failed to download cache 2740: Load failed');

    logLoadFailure('useCacheBootstrap', 'Failed to load cache:', failure);

    expect(warn).toHaveBeenCalledWith('useCacheBootstrap', 'Failed to load cache:', failure);
    expect(error).not.toHaveBeenCalled();
  });

  // The browser-support gate already shows the unsupported screen for this.
  it('logs a missing browser capability as a warning', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const failure = new UnsupportedBrowserError('WebAssembly is unavailable in this browser');

    logLoadFailure('App', 'Bootstrap failed:', failure);

    expect(warn).toHaveBeenCalledWith('App', 'Bootstrap failed:', failure);
    expect(error).not.toHaveBeenCalled();
  });

  it('still reports anything else, such as a corrupt archive or a decoder defect', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const failure = new Error(
      'Failed to download cache 2740: downloaded archive does not match the published checksum',
    );

    logLoadFailure('useCacheBootstrap', 'Failed to load cache:', failure);

    expect(error).toHaveBeenCalledWith('useCacheBootstrap', 'Failed to load cache:', failure);
    expect(warn).not.toHaveBeenCalled();
  });
});
