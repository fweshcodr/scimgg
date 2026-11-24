import { useSyncExternalStore } from 'react';
import { getPageActivity, subscribePageActivity } from './pageActivity';

const getServerSnapshot = () => 'focused' as const;

export function useBackgroundSuspended(pauseWhenUnfocused: boolean): boolean {
  const activity = useSyncExternalStore(subscribePageActivity, getPageActivity, getServerSnapshot);
  return activity === 'hidden' || (pauseWhenUnfocused && activity === 'unfocused');
}
