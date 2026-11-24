import type { Archive } from '../../cache/Archive';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, type TypeLoader } from '../TypeLoader';
import { SpotAnimType } from './SpotAnimType';

export type SpotAnimTypeLoader = TypeLoader<SpotAnimType>;

export class ArchiveSpotAnimTypeLoader extends ArchiveTypeLoader<SpotAnimType> implements SpotAnimTypeLoader {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(SpotAnimType, cacheInfo, archive);
  }
}
