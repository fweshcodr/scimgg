import type React from 'react';
import { useEffect, useRef, useState } from 'react';

type TileIndicatorColorInputProps = {
  readonly color: string;
  readonly onCommit: (color: string) => void;
  readonly onMouseDown: React.MouseEventHandler<HTMLInputElement>;
};

export const TileIndicatorColorInput: React.FC<TileIndicatorColorInputProps> = ({ color, onCommit, onMouseDown }) => {
  const [draft, setDraft] = useState(color);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(color);
  }, [color]);

  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;

    const commit = () => {
      const nextColor = input.value;
      if (nextColor.toLowerCase() !== color.toLowerCase()) onCommit(nextColor);
    };

    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, [color, onCommit]);

  return (
    <label className="ti-swatch" style={{ backgroundColor: draft }}>
      <input
        ref={inputRef}
        type="color"
        value={draft}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onMouseDown={onMouseDown}
      />
    </label>
  );
};
