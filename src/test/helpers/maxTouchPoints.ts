/**
 * Stubs `navigator.maxTouchPoints`, which says whether the device has a touchscreen (jsdom does not
 * define it at all). Returns the restore, for an `afterEach`.
 */
export function stubMaxTouchPoints(value: number): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
  Object.defineProperty(navigator, 'maxTouchPoints', { value, configurable: true });
  return () => {
    if (original) Object.defineProperty(navigator, 'maxTouchPoints', original);
    else delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
  };
}
