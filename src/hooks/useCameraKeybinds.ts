import {
  CAMERA_ACTION_LABELS,
  type CameraAction,
  type CameraKeybindMap,
  DEFAULT_CAMERA_KEYBINDS,
  FREEFORM_ACTIONS,
  ORBIT_ACTIONS,
} from './keybindStore';
import { useUnifiedKeybinds } from './useUnifiedKeybinds';

export type { CameraAction, CameraKeybindMap };
export { CAMERA_ACTION_LABELS, DEFAULT_CAMERA_KEYBINDS, FREEFORM_ACTIONS, ORBIT_ACTIONS };

export const useCameraKeybinds = () => {
  return { cameraKeybinds: useUnifiedKeybinds().camera };
};
