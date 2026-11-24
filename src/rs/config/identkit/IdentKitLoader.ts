import type { Archive } from '../../cache/Archive';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ArchiveTypeLoader, type TypeLoader } from '../TypeLoader';
import { IdentKit } from './IdentKit';

export type IdentKitLoader = TypeLoader<IdentKit>;

export class ArchiveIdentKitLoader extends ArchiveTypeLoader<IdentKit> implements IdentKitLoader {
  constructor(cacheInfo: CacheInfo, archive: Archive) {
    super(IdentKit, cacheInfo, archive);
  }
}
