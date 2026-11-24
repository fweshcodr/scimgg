import { INFERNO_RENDER_CONFIG } from '../../encounters/inferno/renderConfig';
import { InfernoSceneCompositor } from './InfernoSceneCompositor';
import type { SceneBuilderOptions } from './sceneBuilderFactory';
import type { SceneBuilder } from './types';

/** The Inferno's scene, waves 1-69. */
export function createZukSceneBuilder(options?: Partial<SceneBuilderOptions>): SceneBuilder {
  const compositor = new InfernoSceneCompositor();
  compositor.setEncounterRenderConfig(options?.encounterRenderConfig ?? INFERNO_RENDER_CONFIG);
  compositor.setEventAudioPlayer(options?.eventAudioPlayer ?? null);
  compositor.setFrameSoundTracker(options?.frameSoundTracker ?? null);
  compositor.setGroundItemLoaderSource(options?.cacheManager ?? null);
  return compositor;
}
