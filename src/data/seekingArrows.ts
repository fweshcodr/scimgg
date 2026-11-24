type SeekingArrow = {
  readonly baseArrowId: number;
  readonly rangedStrength: number;
};

export const SEEKING_ARROWS: Readonly<Partial<Record<number, SeekingArrow>>> = {
  33553: { baseArrowId: 882, rangedStrength: 7 },
  33559: { baseArrowId: 884, rangedStrength: 10 },
  33565: { baseArrowId: 886, rangedStrength: 16 },
  33571: { baseArrowId: 888, rangedStrength: 22 },
  33577: { baseArrowId: 890, rangedStrength: 31 },
  33583: { baseArrowId: 892, rangedStrength: 49 },
  33589: { baseArrowId: 21326, rangedStrength: 55 },
  33595: { baseArrowId: 11212, rangedStrength: 60 },
  33601: { baseArrowId: 4160, rangedStrength: 28 },
};
