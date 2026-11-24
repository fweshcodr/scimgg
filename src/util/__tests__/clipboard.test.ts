// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../clipboard';

const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
  else Reflect.deleteProperty(document, 'execCommand');
  document.body.replaceChildren();
});

describe('copyToClipboard', () => {
  it('writes through the clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    expect(await copyToClipboard('replay link')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('replay link');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it.each(['missing', 'rejected'] as const)('falls back when the clipboard API is %s', async (kind) => {
    vi.stubGlobal(
      'navigator',
      kind === 'missing' ? {} : { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } },
    );
    const execCommand = vi.fn(() => {
      expect(document.querySelector('textarea')?.value).toBe('replay link');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    expect(await copyToClipboard('replay link')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it.each(['false', 'throw', 'missing'] as const)('returns false and cleans up when fallback %s', async (kind) => {
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value:
        kind === 'missing'
          ? undefined
          : vi.fn(() => {
              if (kind === 'throw') throw new Error('denied');
              return false;
            }),
    });

    expect(await copyToClipboard('replay link')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
