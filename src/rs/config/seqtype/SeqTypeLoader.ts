import type { Archive } from '../../cache/Archive';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, type TypeLoader } from '../TypeLoader';
import { SeqType } from './SeqType';

export type SeqTypeLoader = TypeLoader<SeqType>;

export class ArchiveSeqTypeLoader extends ArchiveTypeLoader<SeqType> implements SeqTypeLoader {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(SeqType, cacheInfo, archive);
  }
}
