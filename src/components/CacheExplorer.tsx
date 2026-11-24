import { useCallback, useEffect, useRef, useState } from 'react';
import { useRafDrag } from '../hooks/useRafDrag';
import type { AnimationSystem } from '../render/core/animation';
import { SpotAnimPreview3D } from '../render/preview/SpotAnimPreview3D';
import type { NpcType } from '../rs/config/npctype/NpcType';
import type { NpcTypeLoader } from '../rs/config/npctype/NpcTypeLoader';
import type { SeqType } from '../rs/config/seqtype/SeqType';
import { YAMA_SPOTANIM_NAMES } from '../rs/config/spotanimtype/SpotAnimID';
import type { SpotAnimType } from '../rs/config/spotanimtype/SpotAnimType';
import type { SpotAnimTypeLoader } from '../rs/config/spotanimtype/SpotAnimTypeLoader';
import type { ModelLoader } from '../rs/model/ModelLoader';
import { YAMA_NPC_ID } from '../rs/model/NpcModelLoader';
import type { SpotAnimModelLoader } from '../rs/model/SpotAnimModelLoader';
import type { TextureLoader } from '../rs/texture/TextureLoader';
import { ModelPreview } from './ModelPreview';
import { HoverHintButton } from './ui/HoverHintControl';
import './CacheExplorer.css';
import { ALL_SOUND_IDS, SOUND_NAMES } from '../audio/soundNames';
import { log } from '../util/Logger';
import { CloseButton } from './ui/CloseButton';

type CacheDataType = 'spotanim' | 'npc' | 'seq' | 'sound';

interface CacheExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  spotAnimLoader: SpotAnimTypeLoader | null;
  spotAnimModelLoader: SpotAnimModelLoader | null;
  npcTypeLoader: NpcTypeLoader | null;
  modelLoader: ModelLoader | null;
  animationSystem: AnimationSystem | null;
  textureLoader: TextureLoader | null;
}

interface CacheEntry {
  id: number;
  name: string;
  data: SpotAnimType | NpcType | SeqType | { id: number };
  isYama?: boolean;
}

interface SeqRowProps {
  label: string;
  seqId: number;
  animationSystem: AnimationSystem | null;
  onJumpToSeq: (id: number) => void;
  onChangeSeqId: (label: string, newId: number) => void;
}

function SeqRow({ label, seqId, animationSystem, onJumpToSeq, onChangeSeqId }: SeqRowProps) {
  const seq = animationSystem ? animationSystem.loadSeqType(seqId) : undefined;
  const totalLen = seq?.frameLengths?.reduce((sum, len) => sum + len, 0) ?? 0;
  const frameCount = seq?.frameIds?.length ?? 0;
  const skeletal = seq ? (seq.isSkeletalSeq() ? 'sk' : 'fr') : '?';

  return (
    <div className="seq-row">
      <div className="seq-label">{label}</div>
      <div className="seq-id">#{seqId}</div>
      <div className="seq-meta">
        {skeletal} | {frameCount}f | {totalLen}t
      </div>
      <div className="seq-actions">
        <HoverHintButton
          type="button"
          className="seq-btn"
          onClick={(e) => {
            e.stopPropagation();
            onChangeSeqId(label, seqId - 1);
          }}
          aria-label="Previous seq ID"
        >
          ▼
        </HoverHintButton>
        <button type="button" className="seq-btn" onClick={() => onJumpToSeq(seqId)} title="Open in Seqs tab">
          View
        </button>
        <HoverHintButton
          type="button"
          className="seq-btn"
          onClick={(e) => {
            e.stopPropagation();
            onChangeSeqId(label, seqId + 1);
          }}
          aria-label="Next seq ID"
        >
          ▲
        </HoverHintButton>
      </div>
    </div>
  );
}

interface NpcAnimationBrowserProps {
  npc: NpcType;
  animationSystem: AnimationSystem | null;
  onJumpToSeq: (id: number) => void;
}

function NpcAnimationBrowser({ npc, animationSystem, onJumpToSeq }: NpcAnimationBrowserProps) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [extraSeqId, setExtraSeqId] = useState('');

  const knownAnims: { label: string; id: number }[] = [
    { label: 'Idle', id: npc.idleSeqId },
    { label: 'Walk', id: npc.walkSeqId },
    { label: 'Walk Back', id: npc.walkBackSeqId },
    { label: 'Walk Left', id: npc.walkLeftSeqId },
    { label: 'Walk Right', id: npc.walkRightSeqId },
    { label: 'Turn Left', id: npc.turnLeftSeqId },
    { label: 'Turn Right', id: npc.turnRightSeqId },
    { label: 'Run', id: npc.runSeqId },
    { label: 'Run Back', id: npc.runBackSeqId },
    { label: 'Run Left', id: npc.runLeftSeqId },
    { label: 'Run Right', id: npc.runRightSeqId },
    { label: 'Crawl', id: npc.crawlSeqId },
    { label: 'Crawl Back', id: npc.crawlBackSeqId },
    { label: 'Crawl Left', id: npc.crawlLeftSeqId },
    { label: 'Crawl Right', id: npc.crawlRightSeqId },
  ];

  const activeAnims = knownAnims
    .filter((a) => a.id !== -1 || overrides[a.label] !== undefined)
    .map((a) => ({ label: a.label, id: overrides[a.label] ?? a.id }));

  const extraEntries = Object.entries(overrides)
    .filter(([label]) => !knownAnims.some((a) => a.label === label))
    .map(([label, id]) => ({ label, id }));

  const handleChangeSeqId = (label: string, newId: number) => {
    if (newId >= 0) {
      setOverrides((prev) => ({ ...prev, [label]: newId }));
    }
  };

  const handleAddExtra = () => {
    const id = parseInt(extraSeqId, 10);
    if (Number.isNaN(id) || id < 0) return;
    const label = `Seq ${id}`;
    setOverrides((prev) => ({ ...prev, [label]: id }));
    setExtraSeqId('');
  };

  return (
    <div className="npc-animation-browser">
      <div className="anim-browser-header">
        Animations <span className="anim-browser-hint">▲▼ to browse nearby</span>
      </div>
      <div className="anim-browser-content">
        {activeAnims.map((entry) => (
          <SeqRow
            key={entry.label}
            label={entry.label}
            seqId={entry.id}
            animationSystem={animationSystem}
            onJumpToSeq={onJumpToSeq}
            onChangeSeqId={handleChangeSeqId}
          />
        ))}
        {extraEntries.map((entry) => (
          <SeqRow
            key={entry.label}
            label={entry.label}
            seqId={entry.id}
            animationSystem={animationSystem}
            onJumpToSeq={onJumpToSeq}
            onChangeSeqId={handleChangeSeqId}
          />
        ))}
        <div className="anim-add-row">
          <div className="seq-label">Add seq</div>
          <input
            type="number"
            className="seq-input"
            value={extraSeqId}
            onChange={(e) => setExtraSeqId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddExtra()}
            placeholder="seq ID..."
          />
          <HoverHintButton type="button" className="seq-btn" onClick={handleAddExtra} aria-label="Add extra model">
            +
          </HoverHintButton>
        </div>
      </div>
    </div>
  );
}

export function CacheExplorer({
  isOpen,
  onClose,
  spotAnimLoader,
  spotAnimModelLoader,
  npcTypeLoader,
  modelLoader,
  animationSystem,
  textureLoader,
}: CacheExplorerProps) {
  const [dataType, setDataType] = useState<CacheDataType>('spotanim');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchById, setSearchById] = useState('');
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [searchResults, setSearchResults] = useState<CacheEntry[] | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CacheEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedRange, setLoadedRange] = useState<{ start: number; end: number } | null>(null);
  const [pendingSeqJump, setPendingSeqJump] = useState<number | null>(null);
  const [previewRatio, setPreviewRatio] = useState(0.6);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);

  const { startDrag: startResizeDrag, isDraggingRef: isResizingRef } = useRafDrag({
    cursor: 'row-resize',
    onMove: (_clientX, clientY) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const ratio = Math.min(Math.max(0.2, (clientY - rect.top) / rect.height), 0.8);
      if (previewSectionRef.current) {
        previewSectionRef.current.style.height = `${ratio * 100}%`;
      }
    },
    onEnd: (_clientX, clientY) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const ratio = Math.min(Math.max(0.2, (clientY - rect.top) / rect.height), 0.8);
      setPreviewRatio(ratio);
    },
  });

  const buildSpotAnimEntry = useCallback((id: number, spotAnim: SpotAnimType): CacheEntry => {
    let name = 'unnamed';
    let isYama = false;

    if (YAMA_SPOTANIM_NAMES[id]) {
      name = YAMA_SPOTANIM_NAMES[id];
      isYama = true;
    } else {
      name = `Model: ${spotAnim.modelId}, Seq: ${spotAnim.sequenceId}`;
    }

    return { id, name, data: spotAnim, isYama };
  }, []);

  const buildNpcEntry = useCallback((id: number, npc: NpcType): CacheEntry => {
    const name = npc.name || 'unnamed';
    return { id, name, data: npc };
  }, []);

  const buildSeqEntry = useCallback((id: number, seq: SeqType): CacheEntry => {
    const frameCount = seq.frameIds?.length ?? 0;
    const totalLen = seq.frameLengths?.reduce((sum, len) => sum + len, 0) ?? 0;
    const isSkeletal = seq.isSkeletalSeq();
    const name = `skeletal=${isSkeletal ? 'yes' : 'no'} frames=${frameCount} len=${totalLen}`;
    return { id, name, data: seq };
  }, []);

  const buildSoundEntry = useCallback((id: number): CacheEntry => {
    const name = SOUND_NAMES[id] || `Sound ${id}`;
    return { id, name, data: { id } };
  }, []);

  const loadEntries = useCallback(
    async (start: number, count: number, type: CacheDataType) => {
      setIsLoading(true);
      const newEntries: CacheEntry[] = [];

      if (type === 'sound') {
        const soundEntries = ALL_SOUND_IDS.map((id) => buildSoundEntry(id));
        setEntries(soundEntries);
        setLoadedRange({ start: 0, end: soundEntries.length });
        setIsLoading(false);
        return;
      }

      if (type === 'seq') {
        if (!animationSystem) {
          setIsLoading(false);
          return;
        }

        const end = start + count;
        for (let id = start; id < end; id++) {
          try {
            const data = animationSystem.loadSeqType(id);
            if (data) {
              newEntries.push(buildSeqEntry(id, data));
            }
          } catch {
            // Ignore invalid entries
          }
        }

        setEntries(newEntries);
        setLoadedRange({ start, end });
        setIsLoading(false);
        return;
      }

      const loader = type === 'spotanim' ? spotAnimLoader : npcTypeLoader;
      if (!loader) {
        setIsLoading(false);
        return;
      }

      const maxId = loader.getCount();
      const end = Math.min(start + count, maxId);

      for (let id = start; id < end; id++) {
        try {
          const data = loader.load(id);
          if (data) {
            if (type === 'npc') {
              newEntries.push(buildNpcEntry(id, data as NpcType));
            } else {
              newEntries.push(buildSpotAnimEntry(id, data as SpotAnimType));
            }
          }
        } catch {
          // Ignore invalid entries
        }
      }

      setEntries(newEntries);
      setLoadedRange({ start, end });
      setIsLoading(false);
    },
    [spotAnimLoader, npcTypeLoader, animationSystem, buildSeqEntry, buildNpcEntry, buildSpotAnimEntry, buildSoundEntry],
  );

  const loadById = useCallback(() => {
    const id = parseInt(searchById, 10);
    if (Number.isNaN(id)) return;

    if (dataType === 'sound') {
      if (ALL_SOUND_IDS.includes(id)) {
        const entry = buildSoundEntry(id);
        setEntries([entry]);
        setSelectedEntry(entry);
        setLoadedRange({ start: 0, end: 1 });
      }
      return;
    }

    if (dataType === 'seq') {
      if (!animationSystem) return;
      try {
        const data = animationSystem.loadSeqType(id);
        if (data) {
          const entry = buildSeqEntry(id, data);
          setEntries([entry]);
          setSelectedEntry(entry);
          setLoadedRange({ start: id, end: id + 1 });
        }
      } catch (e) {
        log.error('UI', `Failed to load seq ${id}:`, e);
      }
      return;
    }

    const loader = dataType === 'spotanim' ? spotAnimLoader : npcTypeLoader;
    if (!loader) return;

    try {
      const data = loader.load(id);
      if (data) {
        const entry =
          dataType === 'npc' ? buildNpcEntry(id, data as NpcType) : buildSpotAnimEntry(id, data as SpotAnimType);
        setEntries([entry]);
        setSelectedEntry(entry);
        setLoadedRange({ start: id, end: id + 1 });
      }
    } catch (e) {
      log.error('UI', `Failed to load ${dataType} ${id}:`, e);
    }
  }, [
    searchById,
    dataType,
    spotAnimLoader,
    npcTypeLoader,
    animationSystem,
    buildNpcEntry,
    buildSpotAnimEntry,
    buildSeqEntry,
    buildSoundEntry,
  ]);

  const jumpToYama = useCallback(() => {
    if (dataType === 'seq') {
      if (!npcTypeLoader) return;
      try {
        const npc = npcTypeLoader.load(YAMA_NPC_ID);
        if (!npc || npc.idleSeqId < 0) return;
        loadEntries(Math.max(0, npc.idleSeqId - 10), 50, 'seq');
      } catch (e) {
        log.error('UI', 'Failed to load Yama NPC for seqs:', e);
      }
      return;
    }

    setDataType('spotanim');
    loadEntries(3239, 40, 'spotanim');
  }, [dataType, loadEntries, npcTypeLoader]);

  useEffect(() => {
    if (isOpen) {
      if (!loadedRange) {
        loadEntries(0, 100, dataType);
      }
    }
  }, [isOpen, dataType, loadEntries, loadedRange]);

  useEffect(() => {
    if (!dataType) return;
    setEntries([]);
    setLoadedRange(null);
    setSelectedEntry(null);
    setSearchResults(null);
  }, [dataType]);

  useEffect(() => {
    if (dataType !== 'seq' || pendingSeqJump === null) return;
    loadEntries(Math.max(0, pendingSeqJump - 10), 50, 'seq');
    setPendingSeqJump(null);
  }, [dataType, pendingSeqJump, loadEntries]);

  const jumpToSeq = useCallback(
    (seqId: number) => {
      if (dataType === 'seq') {
        loadEntries(Math.max(0, seqId - 10), 50, 'seq');
        return;
      }

      setSearchQuery('');
      setSearchResults(null);
      setPendingSeqJump(seqId);
      setDataType('seq');
    },
    [dataType, loadEntries],
  );

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const timer = window.setTimeout(() => {
      const results: CacheEntry[] = [];

      if (dataType === 'npc') {
        if (!npcTypeLoader) {
          setSearchResults([]);
          return;
        }
        const maxId = npcTypeLoader.getCount();
        for (let id = 0; id < maxId; id++) {
          if (results.length >= 200) break;
          try {
            const data = npcTypeLoader.load(id);
            if (data && (data.name?.toLowerCase().includes(query) || id.toString().includes(query))) {
              results.push(buildNpcEntry(id, data));
            }
          } catch {
            // Ignore invalid entries
          }
        }
        setSearchResults(results);
        return;
      }

      if (dataType === 'spotanim') {
        if (!spotAnimLoader) {
          setSearchResults([]);
          return;
        }
        const maxId = spotAnimLoader.getCount();
        for (let id = 0; id < maxId; id++) {
          if (results.length >= 200) break;
          try {
            const data = spotAnimLoader.load(id);
            if (!data) continue;
            const yamaName = YAMA_SPOTANIM_NAMES[id]?.toLowerCase();
            const entry = buildSpotAnimEntry(id, data);
            if (
              entry.name.toLowerCase().includes(query) ||
              yamaName?.includes(query) === true ||
              id.toString().includes(query)
            ) {
              results.push(entry);
            }
          } catch {
            // Ignore invalid entries
          }
        }
        setSearchResults(results);
        return;
      }

      if (dataType === 'sound') {
        for (const soundId of ALL_SOUND_IDS) {
          const name = SOUND_NAMES[soundId] || `Sound ${soundId}`;
          if (name.toLowerCase().includes(query) || soundId.toString().includes(query)) {
            results.push(buildSoundEntry(soundId));
          }
        }
        setSearchResults(results);
        return;
      }

      const id = parseInt(query, 10);
      if (dataType === 'seq') {
        if (!animationSystem || Number.isNaN(id)) {
          setSearchResults([]);
          return;
        }
        const start = Math.max(0, id - 50);
        const end = id + 51;
        for (let seqId = start; seqId < end; seqId++) {
          if (results.length >= 200) break;
          try {
            const data = animationSystem.loadSeqType(seqId);
            if (data) {
              results.push(buildSeqEntry(seqId, data));
            }
          } catch {
            // Ignore invalid entries
          }
        }
        setSearchResults(results);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    searchQuery,
    dataType,
    npcTypeLoader,
    spotAnimLoader,
    animationSystem,
    buildNpcEntry,
    buildSpotAnimEntry,
    buildSeqEntry,
    buildSoundEntry,
  ]);

  const renderSpotAnimDetails = (spotAnim: SpotAnimType) => (
    <div className="details-grid">
      <div className="detail-row">
        <div className="detail-key">ID</div>
        <div className="detail-val">{spotAnim.id}</div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Name</div>
        <div className="detail-val">{YAMA_SPOTANIM_NAMES[spotAnim.id] || '-'}</div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Model ID</div>
        <div className="detail-val">{spotAnim.modelId}</div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Sequence ID</div>
        <div className="detail-val">{spotAnim.sequenceId}</div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Scale (W/H)</div>
        <div className="detail-val">
          {spotAnim.widthScale} / {spotAnim.heightScale}
        </div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Orientation</div>
        <div className="detail-val">{spotAnim.orientation}</div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Ambient/Contrast</div>
        <div className="detail-val">
          {spotAnim.ambient} / {spotAnim.contrast}
        </div>
      </div>
      {spotAnim.recolorFrom && (
        <div className="detail-row">
          <div className="detail-key">Recolor From</div>
          <div className="detail-val">{spotAnim.recolorFrom.join(', ')}</div>
        </div>
      )}
      {spotAnim.recolorTo && (
        <div className="detail-row">
          <div className="detail-key">Recolor To</div>
          <div className="detail-val">{spotAnim.recolorTo.join(', ')}</div>
        </div>
      )}
    </div>
  );

  const renderNpcDetails = (npc: NpcType) => (
    <>
      <div className="details-grid">
        <div className="detail-row">
          <div className="detail-key">Name</div>
          <div className="detail-val">{npc.name}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">ID</div>
          <div className="detail-val">{npc.id}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Size</div>
          <div className="detail-val">{npc.size}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Combat Level</div>
          <div className="detail-val">{npc.combatLevel}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Model IDs</div>
          <div className="detail-val">{npc.modelIds?.join(', ') || 'none'}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Idle Seq</div>
          <div className="detail-val">{npc.idleSeqId}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Walk Seq</div>
          <div className="detail-val">{npc.walkSeqId}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Scale (W/H)</div>
          <div className="detail-val">
            {npc.widthScale} / {npc.heightScale}
          </div>
        </div>
      </div>
      <NpcAnimationBrowser npc={npc} animationSystem={animationSystem} onJumpToSeq={jumpToSeq} />
    </>
  );

  const renderSeqDetails = (seq: SeqType) => {
    const frameCount = seq.frameIds?.length ?? 0;
    const totalLen = seq.frameLengths?.reduce((sum, len) => sum + len, 0) ?? 0;
    const frameLengths = seq.frameLengths?.slice(0, 10).join(', ') || '-';
    const isSkeletal = seq.isSkeletalSeq();

    return (
      <div className="details-grid">
        <div className="detail-row">
          <div className="detail-key">ID</div>
          <div className="detail-val">{seq.id}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Skeletal</div>
          <div className="detail-val">{isSkeletal ? 'yes' : 'no'}</div>
        </div>
        {isSkeletal && (
          <>
            <div className="detail-row">
              <div className="detail-key">Skeletal ID</div>
              <div className="detail-val">{seq.skeletalId}</div>
            </div>
            <div className="detail-row">
              <div className="detail-key">Skeletal Start</div>
              <div className="detail-val">{seq.skeletalStart}</div>
            </div>
            <div className="detail-row">
              <div className="detail-key">Skeletal End</div>
              <div className="detail-val">{seq.skeletalEnd}</div>
            </div>
          </>
        )}
        <div className="detail-row">
          <div className="detail-key">Frame Count</div>
          <div className="detail-val">{frameCount}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Total Duration</div>
          <div className="detail-val">{totalLen}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Frame Lengths</div>
          <div className="detail-val">{frameLengths}</div>
        </div>
        <div className="detail-row">
          <div className="detail-key">Frame Step</div>
          <div className="detail-val">{seq.frameStep}</div>
        </div>
      </div>
    );
  };

  const renderSoundDetails = (soundId: number) => (
    <div className="details-grid">
      <div className="detail-row">
        <div className="detail-key">ID</div>
        <div className="detail-val">{soundId}</div>
      </div>
      <div className="detail-row">
        <div className="detail-key">Name</div>
        <div className="detail-val">{SOUND_NAMES[soundId] || 'Unknown'}</div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  const isSound = dataType === 'sound';
  const isSeq = dataType === 'seq';
  const loader = dataType === 'spotanim' ? spotAnimLoader : dataType === 'npc' ? npcTypeLoader : null;
  const totalCount = loader?.getCount() || 0;
  const displayedEntries = searchResults ?? entries;

  return (
    <div className="cache-explorer-overlay">
      <button type="button" className="cache-explorer-backdrop" onClick={onClose} aria-label="Close modal" />
      <div className="cache-explorer-modal" role="dialog" aria-modal="true">
        <div className="cache-explorer-header">
          <div className="cache-explorer-title">
            <h2>Cache Explorer</h2>
            <div className="cache-explorer-tabs">
              <button
                type="button"
                className={`cache-explorer-tab ${dataType === 'spotanim' ? 'active' : ''}`}
                onClick={() => setDataType('spotanim')}
              >
                SpotAnims
              </button>
              <button
                type="button"
                className={`cache-explorer-tab ${dataType === 'npc' ? 'active' : ''}`}
                onClick={() => setDataType('npc')}
              >
                NPCs
              </button>
              <button
                type="button"
                className={`cache-explorer-tab ${dataType === 'seq' ? 'active' : ''}`}
                onClick={() => setDataType('seq')}
              >
                Seqs
              </button>
              <button
                type="button"
                className={`cache-explorer-tab ${dataType === 'sound' ? 'active' : ''}`}
                onClick={() => setDataType('sound')}
              >
                Sounds
              </button>
            </div>
          </div>
          <div className="preview-actions">
            {!isSound && (
              <button type="button" className="action-btn yama-button" onClick={jumpToYama}>
                {isSeq ? 'Jump to Yama Seqs' : 'Jump to Yama Assets'}
              </button>
            )}
            <CloseButton className="close-btn" onClick={onClose} aria-label="Close" />
          </div>
        </div>

        <div className="cache-explorer-body">
          <div className="cache-explorer-sidebar">
            <div className="sidebar-search">
              <input
                type="text"
                className="search-input"
                placeholder="Search all..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="sidebar-filters">
              <input
                type="number"
                className="search-input sidebar-id-input"
                placeholder="ID..."
                value={searchById}
                onChange={(e) => setSearchById(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadById()}
              />
              <button type="button" className="page-btn" onClick={loadById}>
                Go
              </button>
            </div>

            <div className="sidebar-list-container">
              {isLoading ? (
                <div className="sidebar-loading">Loading...</div>
              ) : (
                <ul className="sidebar-list">
                  {displayedEntries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className={`sidebar-item ${selectedEntry?.id === entry.id ? 'selected' : ''}`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <span className="item-name" title={entry.name}>
                          {entry.name} {entry.isYama && <span className="yama-badge">YAMA</span>}
                        </span>
                        <span className="item-id">#{entry.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="sidebar-pagination">
              <button
                type="button"
                className="page-btn"
                onClick={() => loadEntries(Math.max(0, (loadedRange?.start || 0) - 100), 100, dataType)}
                disabled={isLoading || (loadedRange?.start || 0) === 0}
              >
                Prev
              </button>
              <span className="page-info">
                {loadedRange ? `${loadedRange.start} - ${loadedRange.end}` : `Total: ${totalCount}`}
              </span>
              <button
                type="button"
                className="page-btn"
                onClick={() => loadEntries(loadedRange?.end || 0, 100, dataType)}
                disabled={isLoading || isSound || (!isSeq && (loadedRange?.end || 0) >= totalCount)}
              >
                Next
              </button>
            </div>
          </div>

          <div ref={mainRef} className="cache-explorer-main">
            {!selectedEntry ? (
              <div className="cache-explorer-empty">
                <div>Select an item to view details</div>
              </div>
            ) : dataType === 'sound' ? (
              <div className="sound-detail-view">
                <div className="sound-detail-header">
                  <h3>{selectedEntry.name}</h3>
                  <span className="preview-subtitle">#{selectedEntry.id}</span>
                </div>
                <div className="details-section" style={{ flex: 1 }}>
                  <div className="details-header">Properties</div>
                  <div className="details-content">{renderSoundDetails(selectedEntry.id)}</div>
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={previewSectionRef}
                  className="preview-section"
                  style={{ flex: 'none', height: `${previewRatio * 100}%` }}
                >
                  <div className="preview-header">
                    <div className="preview-title">
                      <h3>{selectedEntry.name}</h3>
                      <span className="preview-subtitle">#{selectedEntry.id}</span>
                    </div>
                  </div>
                  <div className="preview-container">
                    {dataType === 'spotanim' && (selectedEntry.data as SpotAnimType).modelId >= 0 ? (
                      <SpotAnimPreview3D
                        spotAnimId={selectedEntry.id}
                        spotAnimModelLoader={spotAnimModelLoader}
                        textureLoader={textureLoader}
                        animationSystem={animationSystem}
                        className="cache-model-preview"
                      />
                    ) : dataType === 'npc' &&
                      (selectedEntry.data as NpcType).modelIds &&
                      (selectedEntry.data as NpcType).modelIds!.length > 0 ? (
                      <ModelPreview
                        modelId={(selectedEntry.data as NpcType).modelIds![0]}
                        modelLoader={modelLoader}
                        className="cache-model-preview"
                      />
                    ) : (
                      <div className="preview-no-model">No 3D preview available</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="resize-handle"
                  aria-label="Resize preview panel"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!isResizingRef.current) {
                      startResizeDrag(e);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    setPreviewRatio((current) => {
                      const delta = event.key === 'ArrowUp' ? -0.05 : 0.05;
                      return Math.min(Math.max(0.2, current + delta), 0.8);
                    });
                  }}
                />
                <div className="details-section" style={{ flex: 1 }}>
                  <div className="details-header">Properties</div>
                  <div className="details-content">
                    {dataType === 'spotanim'
                      ? renderSpotAnimDetails(selectedEntry.data as SpotAnimType)
                      : dataType === 'npc'
                        ? renderNpcDetails(selectedEntry.data as NpcType)
                        : renderSeqDetails(selectedEntry.data as SeqType)}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
