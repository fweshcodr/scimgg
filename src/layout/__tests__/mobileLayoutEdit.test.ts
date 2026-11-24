// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isMobileLayoutEditing, setMobileLayoutEditing, useMobileLayoutEditing } from '../mobileLayoutEdit';

describe('Mobile layout edit mode', () => {
  afterEach(() => {
    setMobileLayoutEditing(false);
  });

  it('starts off: ordinary Mobile play keeps every overlay locked', () => {
    expect(isMobileLayoutEditing()).toBe(false);
  });

  it('is entered and left from anywhere, and every reader follows', () => {
    const { result } = renderHook(() => useMobileLayoutEditing());

    act(() => setMobileLayoutEditing(true));
    expect(result.current).toBe(true);

    act(() => setMobileLayoutEditing(false));
    expect(result.current).toBe(false);
  });
});
