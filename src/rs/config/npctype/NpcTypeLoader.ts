import type { Archive } from '../../cache/Archive';
import type { CacheIndex } from '../../cache/CacheIndex';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, IndexTypeLoader, type TypeLoader } from '../TypeLoader';
import { NpcType } from './NpcType';

export type NpcTypeLoader = TypeLoader<NpcType>;

export class ArchiveNpcTypeLoader extends ArchiveTypeLoader<NpcType> implements NpcTypeLoader {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(NpcType, cacheInfo, archive);
  }
}

export class IndexNpcTypeLoader extends IndexTypeLoader<NpcType> implements NpcTypeLoader {
  constructor(cacheInfo: CacheInfo, index: CacheIndex) {
    super(NpcType, cacheInfo, index, 7);
  }
}
