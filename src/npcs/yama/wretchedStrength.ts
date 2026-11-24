function missingHealthPercent(currentHp: number, maxHp: number): number {
  const safeMaxHp = Math.max(1, Math.trunc(maxHp));
  const safeHp = Math.min(safeMaxHp, Math.max(0, Math.trunc(currentHp)));
  return Math.floor(((safeMaxHp - safeHp) * 100) / safeMaxHp);
}

export function wretchedMinimumHit(maxHit: number, currentHp: number, maxHp: number): number {
  return Math.floor((Math.max(0, Math.trunc(maxHit)) * missingHealthPercent(currentHp, maxHp)) / 100);
}

export function wretchedDamageBonusPercent(currentHp: number, maxHp: number): number {
  return missingHealthPercent(currentHp, maxHp);
}
