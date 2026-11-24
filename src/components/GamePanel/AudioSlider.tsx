import { AUDIO_SLIDER } from '../../resourcePack';
import { PixelComposedLayer, tileFill } from '../PixelComposedLayer';

const SLIDER_WIDTH = 184;
const NOTCH_GAP = (SLIDER_WIDTH - 144) / 4;

interface AudioSliderProps {
  readonly id: string;
  readonly percent: number;
  readonly onChange: (percent: number) => void;
}

export function AudioSlider({ id, percent, onChange }: AudioSliderProps) {
  // Cache 116:99-109 supplies the native pieces; put extra width between notches, never scale their artwork.
  const segments = [
    [AUDIO_SLIDER.leftCap, 0],
    [AUDIO_SLIDER.firstNotch, 16],
    [AUDIO_SLIDER.halfLeft, 32 + NOTCH_GAP],
    [AUDIO_SLIDER.halfRight, 48 + NOTCH_GAP],
    [AUDIO_SLIDER.notch, 64 + NOTCH_GAP * 2],
    [AUDIO_SLIDER.halfLeft, 80 + NOTCH_GAP * 3],
    [AUDIO_SLIDER.halfRight, 96 + NOTCH_GAP * 3],
    [AUDIO_SLIDER.notch, 112 + NOTCH_GAP * 4],
    [AUDIO_SLIDER.rightCap, SLIDER_WIDTH - 16],
  ] as const;
  const thumb = AUDIO_SLIDER.thumb;
  const track = AUDIO_SLIDER.track;
  const sources = [track, ...segments.map(([source]) => source), thumb];

  return (
    <div className="audio-slider-control">
      <PixelComposedLayer
        cacheKey={`audio-slider:${sources.join(':')}:${SLIDER_WIDTH}:${percent}`}
        width={SLIDER_WIDTH}
        height={24}
        sources={sources}
        draw={(ctx, images) => {
          const rail = images.get(track);
          if (rail) tileFill(ctx, rail, 16, 4, SLIDER_WIDTH - 32, 16);
          segments.forEach(([source, x]) => {
            const image = images.get(source);
            if (image) ctx.drawImage(image, x, 4);
          });
          const handle = images.get(thumb);
          if (handle) ctx.drawImage(handle, 16 + Math.round(((SLIDER_WIDTH - 48) * percent) / 100), 4);
        }}
      />
      <input
        id={id}
        type="range"
        className="audio-slider"
        min="0"
        max="100"
        step="5"
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
