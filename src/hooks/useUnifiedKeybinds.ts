import { useEffect, useState } from 'react';
import { KEYBINDS_UPDATED_EVENT, loadUnifiedKeybindStore } from './keybindStore';

export function useUnifiedKeybinds() {
  const [store, setStore] = useState(loadUnifiedKeybindStore);
  useEffect(() => {
    const reload = () => setStore(loadUnifiedKeybindStore());
    window.addEventListener(KEYBINDS_UPDATED_EVENT, reload);
    return () => window.removeEventListener(KEYBINDS_UPDATED_EVENT, reload);
  }, []);
  return store;
}
