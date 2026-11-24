export function chebyshevDistanceToRect(
  px: number,
  py: number,
  rectX: number,
  rectY: number,
  rectSize: number,
): number {
  const maxX = rectX + rectSize - 1;
  const maxY = rectY + rectSize - 1;

  const dx = px < rectX ? rectX - px : px > maxX ? px - maxX : 0;
  const dy = py < rectY ? rectY - py : py > maxY ? py - maxY : 0;

  return Math.max(dx, dy);
}
