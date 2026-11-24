import type { OverheadTextOverlay } from '../core/commands';

/**
 * Writes an overhead text's content into its element, only when it changed: the viewports
 * update their overlays every frame, and rewriting unchanged text would replace its nodes and
 * restyle them each time. Keyed on segments and colors, not the text alone, since colored
 * segments can spell the same text as a plain label.
 */
export function setOverheadTextContent(element: HTMLElement, overheadText: OverheadTextOverlay): void {
  const segments = overheadText.segments && overheadText.segments.length > 0 ? overheadText.segments : null;
  const contentKey = segments
    ? `s:${segments.map((segment) => `${segment.color ?? ''}\u0000${segment.text}`).join('\u0001')}`
    : `t:${overheadText.text}`;
  if (element.dataset.content === contentKey) return;
  element.dataset.content = contentKey;

  if (!segments) {
    element.textContent = overheadText.text;
    return;
  }
  element.textContent = '';
  for (const segment of segments) {
    const segmentEl = document.createElement('span');
    segmentEl.textContent = segment.text;
    if (segment.color) segmentEl.style.color = segment.color;
    element.appendChild(segmentEl);
  }
}
