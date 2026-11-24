import type { Tutorial } from '../types';
import { onboardingAdvancedTutorial } from './onboarding-advanced';
import { onboardingMainTutorial } from './onboarding-main';
import { pluginsTutorial } from './plugins';
import { yamaBasicsTutorial } from './yama-basics';
import { yamaFireballsTutorial } from './yama-fireballs';
import { yamaPerfectDodgeTutorial } from './yama-perfect-dodge';
import { yamaRotationTutorial } from './yama-rotation';
import { yamaVoidFlaresTutorial } from './yama-voidflares';
import { yamaWavesTutorial } from './yama-waves';

/** Registry order is the fallback for helpers and persistence when courses are not consulted. */
export const TUTORIAL_REGISTRY: readonly Tutorial[] = Object.freeze([
  onboardingMainTutorial,
  onboardingAdvancedTutorial,
  pluginsTutorial,
  yamaBasicsTutorial,
  yamaWavesTutorial,
  yamaFireballsTutorial,
  yamaPerfectDodgeTutorial,
  yamaVoidFlaresTutorial,
  yamaRotationTutorial,
]);

const REGISTRY_BY_ID: ReadonlyMap<string, Tutorial> = new Map(
  TUTORIAL_REGISTRY.map((tutorial) => [tutorial.id, tutorial]),
);

export function getTutorialById(id: string): Tutorial | undefined {
  return REGISTRY_BY_ID.get(id);
}
