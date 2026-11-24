const DIZANAS_QUIVER_IDS: ReadonlySet<number> = new Set([28947, 28949, 28951, 28953, 28955, 28957, 28902, 28906]);

export function isDizanasQuiver(itemId: number | undefined): boolean {
  return itemId !== undefined && DIZANAS_QUIVER_IDS.has(itemId);
}
