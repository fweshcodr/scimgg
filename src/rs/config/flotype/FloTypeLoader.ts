import type { Archive } from '../../cache/Archive';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, type TypeLoader } from '../TypeLoader';
import { OverlayType, UnderlayType } from './FloType';

export type UnderlayTypeLoader = TypeLoader<UnderlayType>;
export type OverlayTypeLoader = TypeLoader<OverlayType>;

export class ArchiveUnderlayTypeLoader extends ArchiveTypeLoader<UnderlayType> {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(UnderlayType, cacheInfo, archive);
  }
}

export class ArchiveOverlayTypeLoader extends ArchiveTypeLoader<OverlayType> {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(OverlayType, cacheInfo, archive);
  }
}
