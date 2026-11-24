import { useCallback, useEffect, useRef } from 'react';
import { PreloadCache } from '../util/PreloadCache';
import { toElementLocalPoint } from '../util/viewportBounds';

export const CLICK_SPRITE_SIZE = 22;
export const CLICK_ANIM_DURATION_MS = 600;

export type ClickType = 'yellow' | 'red';

export const CLICK_SPRITE_URLS: Record<ClickType, string> = {
  yellow: '/yellow_click.webp',
  red: '/red_click.webp',
};

// Data URLs don't appear in the Network tab and the fragment suffix (#N) forces
// animated webp to restart from frame 0.
const clickSpriteCache = new PreloadCache<ClickType, string>();
let clickSeq = 0;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function preloadSprite(type: ClickType): void {
  void clickSpriteCache.load(type, async () => {
    const response = await fetch(CLICK_SPRITE_URLS[type]);
    const blob = await response.blob();
    return blobToDataUrl(blob);
  });
}

function applyClickImgStyles(img: HTMLImageElement, position: 'absolute' | 'fixed', zIndex: string): void {
  img.style.position = position;
  img.style.width = `${CLICK_SPRITE_SIZE}px`;
  img.style.height = `${CLICK_SPRITE_SIZE}px`;
  img.style.imageRendering = 'pixelated';
  img.style.pointerEvents = 'none';
  img.style.zIndex = zIndex;
}

let globalImg: HTMLImageElement | null = null;
let globalTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerGlobalClickAnimation(clientX: number, clientY: number, type: ClickType = 'yellow') {
  preloadSprite(type);

  const dataUrl = clickSpriteCache.get(type);
  if (!dataUrl) return;

  if (globalTimeout) {
    clearTimeout(globalTimeout);
    globalTimeout = null;
  }

  const half = CLICK_SPRITE_SIZE / 2;

  if (!globalImg) {
    globalImg = document.createElement('img');
    applyClickImgStyles(globalImg, 'fixed', '200000');
    document.body.appendChild(globalImg);
  }

  globalImg.style.left = `${clientX - half}px`;
  globalImg.style.top = `${clientY - half}px`;
  globalImg.style.display = 'block';
  globalImg.src = `${dataUrl}#${clickSeq++}`;

  globalTimeout = setTimeout(() => {
    if (globalImg) {
      globalImg.style.display = 'none';
    }
    globalTimeout = null;
  }, CLICK_ANIM_DURATION_MS);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (globalTimeout) clearTimeout(globalTimeout);
    if (globalImg) {
      globalImg.remove();
      globalImg = null;
    }
    globalTimeout = null;
  });
}

export function useClickAnimation(containerRef: React.RefObject<HTMLDivElement | null>) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    preloadSprite('yellow');
    preloadSprite('red');
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (imgRef.current) {
        imgRef.current.remove();
        imgRef.current = null;
      }
    };
  }, []);

  const trigger = useCallback(
    (clientX: number, clientY: number, type: ClickType = 'yellow') => {
      const container = containerRef.current;
      if (!container) return;

      const dataUrl = clickSpriteCache.get(type);
      if (!dataUrl) return;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const half = CLICK_SPRITE_SIZE / 2;

      let img = imgRef.current;
      if (!img) {
        img = document.createElement('img');
        applyClickImgStyles(img, 'absolute', '8');
        container.appendChild(img);
        imgRef.current = img;
      }

      // Undo any scale the container is painted at (replay playback can uniformly
      // downscale the game viewport frame), so the sprite lands under the click
      // rather than drifting further off the further it is from the container origin.
      const local = toElementLocalPoint(container, clientX, clientY);
      img.style.left = `${local.x - half}px`;
      img.style.top = `${local.y - half}px`;
      img.style.display = 'block';
      img.src = `${dataUrl}#${clickSeq++}`;

      timeoutRef.current = setTimeout(() => {
        if (imgRef.current) {
          imgRef.current.style.display = 'none';
        }
        timeoutRef.current = null;
      }, CLICK_ANIM_DURATION_MS);
    },
    [containerRef],
  );

  return trigger;
}
