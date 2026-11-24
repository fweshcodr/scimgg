type CaptureHandler = (event: KeyboardEvent) => boolean;
let activeCapture: CaptureHandler | null = null;

export function isCapturingKeybind(): boolean {
  return activeCapture !== null;
}

export function captureKeybind(handler: CaptureHandler): () => void {
  activeCapture = handler;
  const onKeyDown = (event: KeyboardEvent) => {
    if (activeCapture !== handler || !handler(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    if (activeCapture === handler) activeCapture = null;
    window.removeEventListener('keydown', onKeyDown, true);
  };
}
