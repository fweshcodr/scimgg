import { type MutableRefObject, useEffect, useRef } from 'react';
import { AudioEngine, coreAudioRules, EventAudioPlayer, FrameSoundTracker } from '../audio';
import { cacheSoundBufferLoader, type SoundEffectCache } from '../audio/cacheSoundBuffers';
import { encounterAudioLayers } from '../encounters/presentationModules';
import { tickBus } from '../tutorial/runtime/tickBus';
import { getPageActivity, subscribePageActivity } from './pageActivity';

let audioEngineSingleton: AudioEngine | null = null;

/**
 * The app's one engine, created by the first `useAudioManager` call. Its sounds render from that
 * call's cache, which is fixed for the page's lifetime (App passes its `CacheManager` singleton).
 * Without a cache every sound is unavailable, as tests that need no audio expect.
 */
function sharedAudioEngine(soundEffectCache: SoundEffectCache | undefined): AudioEngine {
  audioEngineSingleton ??= new AudioEngine(
    undefined,
    soundEffectCache ? cacheSoundBufferLoader(soundEffectCache) : undefined,
  );
  return audioEngineSingleton;
}

interface UseAudioManagerParams {
  areaVolume: number;
  masterVolume: number;
  sfxVolume: number;
  muteWhenUnfocused: boolean;
  tickAudioMetronomeEnabled: boolean;
  tickAudioMetronomeTock: boolean;
  tickAudioMetronomeVolume: number;
  /** Where game sounds render from; see `sharedAudioEngine`. */
  soundEffectCache?: SoundEffectCache;
}

export interface UseAudioManagerReturn {
  audioEngine: AudioEngine;
  eventAudioPlayerRef: MutableRefObject<EventAudioPlayer>;
  frameSoundTrackerRef: MutableRefObject<FrameSoundTracker>;
}

export function useAudioManager({
  areaVolume,
  masterVolume,
  sfxVolume,
  muteWhenUnfocused,
  tickAudioMetronomeEnabled,
  tickAudioMetronomeTock,
  tickAudioMetronomeVolume,
  soundEffectCache,
}: UseAudioManagerParams): UseAudioManagerReturn {
  const audioEngine = sharedAudioEngine(soundEffectCache);
  const eventAudioPlayerRef = useRef(
    // Per-encounter layers first, in manifest order, then the engine's own layer last: the
    // player stops at the first non-`pass` rule, so an encounter can override a core sound.
    new EventAudioPlayer(audioEngine, ...encounterAudioLayers(), {
      name: 'core',
      rules: coreAudioRules,
    }),
  );
  const frameSoundTrackerRef = useRef(new FrameSoundTracker(audioEngine));

  useEffect(() => {
    const handleUserGesture = () => {
      void audioEngine.resume();
    };

    window.addEventListener('click', handleUserGesture, { once: true });
    window.addEventListener('keydown', handleUserGesture, { once: true });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, [audioEngine]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    if (!muteWhenUnfocused) {
      audioEngine.setFocusSuspended(false);
      return;
    }

    const updateFocusState = () => {
      // The same notion of "in the background" that pauses the simulator (see pageActivity).
      const suspended = document.hidden || getPageActivity() !== 'focused';
      audioEngine.setFocusSuspended(suspended);
      if (suspended) eventAudioPlayerRef.current.reset();
    };

    updateFocusState();
    const unsubscribe = subscribePageActivity(updateFocusState);

    return () => {
      unsubscribe();
      // Ensure we never leave the engine stuck in suspended state if the
      // component unmounts while unfocused or the feature is toggled off.
      audioEngine.setFocusSuspended(false);
    };
  }, [audioEngine, muteWhenUnfocused]);

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
    if (masterVolume <= 0) eventAudioPlayerRef.current.reset();
  }, [audioEngine, masterVolume]);

  useEffect(() => {
    audioEngine.setSfxVolume(sfxVolume);
  }, [audioEngine, sfxVolume]);

  useEffect(() => {
    audioEngine.setAreaVolume(areaVolume);
  }, [audioEngine, areaVolume]);

  useEffect(() => {
    audioEngine.setMetronomeVolume(tickAudioMetronomeVolume);
  }, [audioEngine, tickAudioMetronomeVolume]);

  useEffect(() => {
    if (!tickAudioMetronomeEnabled) return;
    // Alternate by absolute tick so the tick/tock phase is stable across pauses.
    return tickBus.subscribe((tick) =>
      audioEngine.playMetronomeBeat(tickAudioMetronomeTock && tick % 2 === 1 ? 'tock' : 'tick'),
    );
  }, [audioEngine, tickAudioMetronomeEnabled, tickAudioMetronomeTock]);

  return {
    audioEngine,
    eventAudioPlayerRef,
    frameSoundTrackerRef,
  };
}
