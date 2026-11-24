import { type MutableRefObject, useEffect, useState } from 'react';
import type { AudioEngine, EventAudioPlayer } from '../audio';
import { FRAME_SOUND_IDS } from '../audio/frameSoundManifest';
import type { CacheDownloadState, CacheManager } from '../cache/CacheManager';
import { logLoadFailure } from '../cache/networkRetry';
import type { AnimationSystem } from '../render/core/animation';
import type { EnumTypeLoader } from '../rs/config/enumtype/EnumTypeLoader';
import type { OverlayTypeLoader, UnderlayTypeLoader } from '../rs/config/flotype/FloTypeLoader';
import type { LocModelLoader } from '../rs/config/loctype/LocModelLoader';
import type { NpcTypeLoader } from '../rs/config/npctype/NpcTypeLoader';
import type { SpotAnimTypeLoader } from '../rs/config/spotanimtype/SpotAnimTypeLoader';
import type { StructTypeLoader } from '../rs/config/structtype/StructTypeLoader';
import type { MapLoader } from '../rs/map/MapLoader';
import type { ModelLoader } from '../rs/model/ModelLoader';
import type { NpcModelLoader } from '../rs/model/NpcModelLoader';
import type { PlayerModelLoader } from '../rs/model/PlayerModelLoader';
import type { SpotAnimModelLoader } from '../rs/model/SpotAnimModelLoader';
import type { TextureLoader } from '../rs/texture/TextureLoader';
import { preloadAllAssets, preloadDeferredAssets } from '../services/AssetPreloader';
import { log } from '../util/Logger';
import { profiler } from '../util/Profiler';
import type { EncounterManagerBindings } from './useEncounterManager';

interface UseCacheBootstrapArgs {
  audioEngine: AudioEngine;
  bindingsRef: MutableRefObject<EncounterManagerBindings | null>;
  cacheManagerRef: MutableRefObject<CacheManager>;
  eventAudioPlayerRef: MutableRefObject<EventAudioPlayer>;
  /**
   * Dev UI harness: report "loaded, with nothing in the cache" without touching
   * the network. The app already renders that state — it is what every component
   * sees before the download finishes — so the harness gets the real UI in ~1s.
   */
  devHarness?: boolean;
}

interface CacheBootstrapState {
  cacheDownloadState: ReturnType<CacheManager['getDownloadState']>;
  isFullyLoaded: boolean;
}

interface CacheBootstrapLoaders {
  animationSystem: AnimationSystem | null;
  enumTypeLoader: EnumTypeLoader | null;
  locModelLoader: LocModelLoader | null;
  mapLoader: MapLoader | null;
  minimapNpcDotUrl: string | null;
  modelLoader: ModelLoader | null;
  npcModelLoader: NpcModelLoader | null;
  npcTypeLoader: NpcTypeLoader | null;
  objTypeLoader: import('../rs/config/objtype/ObjTypeLoader').ObjTypeLoader | null;
  overlayLoader: OverlayTypeLoader | null;
  playerModelLoader: PlayerModelLoader | null;
  spotAnimLoader: SpotAnimTypeLoader | null;
  spotAnimModelLoader: SpotAnimModelLoader | null;
  structTypeLoader: StructTypeLoader | null;
  textureLoader: TextureLoader | null;
  underlayLoader: UnderlayTypeLoader | null;
}

interface CacheBootstrapActions {
  handleCacheRetry: () => Promise<void>;
}

interface UseCacheBootstrapReturn {
  bootstrapState: CacheBootstrapState;
  loaders: CacheBootstrapLoaders;
  actions: CacheBootstrapActions;
}

export function useCacheBootstrap({
  audioEngine,
  bindingsRef,
  cacheManagerRef,
  eventAudioPlayerRef,
  devHarness,
}: UseCacheBootstrapArgs): UseCacheBootstrapReturn {
  // Repeat the `import.meta.env.DEV` guard here rather than trusting the caller
  // to pre-guard it, so the bundler can fold this module's harness branch.
  const harnessMode = import.meta.env.DEV && devHarness === true;
  // Harness mode reports a finished download so the loading screen dismisses;
  // nothing was actually fetched.
  const [cacheDownloadState, setCacheDownloadState] = useState<CacheDownloadState>(() =>
    harnessMode ? { status: 'success' } : cacheManagerRef.current.getDownloadState(),
  );
  const [mapLoader, setMapLoader] = useState<MapLoader | null>(null);
  const [underlayLoader, setUnderlayLoader] = useState<UnderlayTypeLoader | null>(null);
  const [overlayLoader, setOverlayLoader] = useState<OverlayTypeLoader | null>(null);
  const [textureLoader, setTextureLoader] = useState<TextureLoader | null>(null);
  const [minimapNpcDotUrl, setMinimapNpcDotUrl] = useState<string | null>(null);
  const [locModelLoader, setLocModelLoader] = useState<LocModelLoader | null>(null);
  const [npcModelLoader, setNpcModelLoader] = useState<NpcModelLoader | null>(null);
  const [modelLoader, setModelLoader] = useState<ModelLoader | null>(null);
  const [playerModelLoader, setPlayerModelLoader] = useState<PlayerModelLoader | null>(null);
  const [animationSystem, setAnimationSystem] = useState<AnimationSystem | null>(null);
  const [spotAnimLoader, setSpotAnimLoader] = useState<SpotAnimTypeLoader | null>(null);
  const [spotAnimModelLoader, setSpotAnimModelLoader] = useState<SpotAnimModelLoader | null>(null);
  const [npcTypeLoader, setNpcTypeLoader] = useState<NpcTypeLoader | null>(null);
  const [objTypeLoader, setObjTypeLoader] = useState<import('../rs/config/objtype/ObjTypeLoader').ObjTypeLoader | null>(
    null,
  );
  const [enumTypeLoader, setEnumTypeLoader] = useState<EnumTypeLoader | null>(null);
  const [structTypeLoader, setStructTypeLoader] = useState<StructTypeLoader | null>(null);
  const [isFullyLoaded, setIsFullyLoaded] = useState(harnessMode);

  const handleCacheRetry = async () => {
    try {
      await cacheManagerRef.current.retry();
    } catch (error) {
      logLoadFailure('useCacheBootstrap', 'Failed to retry cache download:', error);
    }
  };

  useEffect(() => {
    if (harnessMode) return;
    let cancelled = false;

    const unsubscribe = cacheManagerRef.current.subscribe((state) => {
      setCacheDownloadState(cacheManagerRef.current.getDownloadState());
      if (state.state !== 'LOADED') {
        return;
      }

      const cacheManager = cacheManagerRef.current;
      setMapLoader(cacheManager.getMapLoader());
      setUnderlayLoader(cacheManager.getUnderlayLoader());
      setOverlayLoader(cacheManager.getOverlayLoader());
      setTextureLoader(cacheManager.getTextureLoader());
      setMinimapNpcDotUrl(cacheManager.getMinimapNpcDotUrl());
      setLocModelLoader(cacheManager.getLocModelLoader());
      setNpcModelLoader(cacheManager.getNpcModelLoader());
      setModelLoader(cacheManager.getModelLoader());
      setPlayerModelLoader(cacheManager.getPlayerModelLoader());
      setAnimationSystem(cacheManager.getAnimationSystem());
      setSpotAnimLoader(cacheManager.getSpotAnimTypeLoader());
      setSpotAnimModelLoader(cacheManager.getSpotAnimModelLoader());
      setNpcTypeLoader(cacheManager.getNpcTypeLoader());

      const bindings = bindingsRef.current;
      if (!bindings) {
        return;
      }

      const { engineRef, playerEquipmentRef, playerInventoryRef, playerCombatSuppliesRef, setSimulationState } =
        bindings;

      const loadedObjTypeLoader = cacheManager.getObjTypeLoader();
      engineRef.current.setObjTypeLoader(loadedObjTypeLoader);
      setObjTypeLoader(loadedObjTypeLoader);
      setEnumTypeLoader(cacheManager.getEnumTypeLoader());
      setStructTypeLoader(cacheManager.getStructTypeLoader());
      engineRef.current.setInventory(playerInventoryRef.current);
      engineRef.current.setEquipment(playerEquipmentRef.current);
      engineRef.current.setCombatSupplies(playerCombatSuppliesRef.current);
      setSimulationState(engineRef.current.getState());
      engineRef.current.reapplyArenaConfig();

      profiler.start('preloadAllAssets');
      Promise.allSettled([
        preloadAllAssets(playerInventoryRef.current),
        eventAudioPlayerRef.current.preload(),
        audioEngine.preloadSounds([...FRAME_SOUND_IDS]),
      ]).then((results) => {
        if (cancelled) return;

        profiler.end('preloadAllAssets');
        for (const result of results) {
          if (result.status === 'rejected') {
            log.error('useCacheBootstrap', 'Preload task failed:', result.reason);
          }
        }

        setIsFullyLoaded(true);
        profiler.summary();

        // Deliberately not awaited: the startup gate is already open, and the encounter picker
        // art this warms is at least one click away. Blocking on it would trade every session's
        // time-to-interactive for a modal most sessions never open.
        void preloadDeferredAssets();
      });
    });

    cacheManagerRef.current.ensureCache().catch((error) => {
      logLoadFailure('useCacheBootstrap', 'Failed to load cache:', error);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [audioEngine, bindingsRef, cacheManagerRef, eventAudioPlayerRef, harnessMode]);

  return {
    bootstrapState: {
      cacheDownloadState,
      isFullyLoaded,
    },
    loaders: {
      animationSystem,
      enumTypeLoader,
      locModelLoader,
      mapLoader,
      minimapNpcDotUrl,
      modelLoader,
      npcModelLoader,
      npcTypeLoader,
      objTypeLoader,
      overlayLoader,
      playerModelLoader,
      spotAnimLoader,
      spotAnimModelLoader,
      structTypeLoader,
      textureLoader,
      underlayLoader,
    },
    actions: {
      handleCacheRetry,
    },
  };
}
