import type { Archive } from '../../cache/Archive';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, type TypeLoader } from '../TypeLoader';
import { StructType } from './StructType';

export type StructTypeLoader = TypeLoader<StructType>;

export class ArchiveStructTypeLoader extends ArchiveTypeLoader<StructType> implements StructTypeLoader {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(StructType, cacheInfo, archive);
  }
}
