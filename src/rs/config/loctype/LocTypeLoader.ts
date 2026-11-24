import type { Archive } from '../../cache/Archive';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, type TypeLoader } from '../TypeLoader';
import { LocType } from './LocType';

export type LocTypeLoader = TypeLoader<LocType>;

export class ArchiveLocTypeLoader extends ArchiveTypeLoader<LocType> implements LocTypeLoader {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(LocType, cacheInfo, archive);
  }
}
