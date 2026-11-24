import { expect } from 'vitest';

/**
 * Asserts two typed arrays have the same type and identical bytes. Use it instead of `toEqual` on
 * mesh-sized arrays: deep equality walks them element by element and takes seconds per mesh.
 */
export function expectSameBytes(
  actual: ArrayBufferView | undefined,
  expected: ArrayBufferView | undefined,
  label = 'buffer',
): void {
  if (!expected) {
    expect(actual, label).toBeUndefined();
    return;
  }
  if (!actual) expect.fail(`missing ${label}`);
  expect(actual.constructor, label).toBe(expected.constructor);
  const same = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength).equals(
    Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
  );
  if (!same) expect.fail(`${label} bytes differ (${actual.byteLength} vs ${expected.byteLength} bytes)`);
}
