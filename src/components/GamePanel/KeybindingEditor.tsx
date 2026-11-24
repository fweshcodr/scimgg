import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { isChordBinding, type KeybindingDefinition, keybindingId } from '../../hooks/keybindStore';
import { formatKeyName } from '../../hooks/useGamePanelShortcuts';
import { captureKeybind } from '../../input/keybindCapture';
import { formatHotkey, hotkeyFromEvent, isBindableKey } from '../../util/hotkey';

interface KeybindingEditorProps {
  readonly binding: KeybindingDefinition;
  readonly value: string;
  readonly editing: boolean;
  readonly readOnly: boolean;
  readonly description: string;
  readonly footerRef: RefObject<HTMLDivElement | null>;
  readonly onEdit: () => void;
  readonly onChange: (value: string) => void;
  readonly onCancel: () => void;
}

export function KeybindingEditor({
  binding,
  value,
  editing,
  readOnly,
  description,
  footerRef,
  onEdit,
  onChange,
  onCancel,
}: KeybindingEditorProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const handlers = useRef({ onChange, onCancel });
  handlers.current = { onChange, onCancel };
  const chord = isChordBinding(binding);

  useLayoutEffect(() => {
    if (!editing) return;
    const release = captureKeybind((event) => {
      if (event.target !== buttonRef.current) return false;
      // Unsupported keys leave this field recording. A handled key (returning true) is prevented
      // by captureKeybind, so recording Tab does not move focus.
      if (event.repeat || event.isComposing || !isBindableKey(event.key)) return true;
      const hotkey = hotkeyFromEvent(event);
      if (chord && !hotkey) return true;
      handlers.current.onChange(chord && hotkey ? formatHotkey(hotkey) : event.key);
      return true;
    });
    const cancel = () => handlers.current.onCancel();
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !buttonRef.current?.contains(event.target) &&
        !footerRef.current?.contains(event.target)
      )
        cancel();
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    return () => {
      release();
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
    };
  }, [editing, chord, footerRef]);

  useLayoutEffect(() => {
    if (editing) buttonRef.current?.focus({ preventScroll: true });
  }, [editing]);
  // The button holds focus only while it records the key; afterwards it lets go, so Space and
  // Enter are game keys again rather than a request to record another. A passive cleanup: React
  // puts back focus that is lost while it commits, which would undo a layout-phase blur.
  useEffect(() => {
    if (!editing) return;
    const button = buttonRef.current;
    return () => {
      if (document.activeElement === button) button?.blur();
    };
  }, [editing]);

  const display = value ? (chord ? value.split('+').map(formatKeyName).join(' + ') : formatKeyName(value)) : 'Unbound';

  return (
    <button
      type="button"
      ref={buttonRef}
      className={`keybindings-value${editing ? ' is-recording' : ''}${value ? '' : ' is-unbound'}`}
      data-keybinding-id={keybindingId(binding)}
      disabled={readOnly}
      aria-label={editing ? 'Record shortcut' : `Rebind ${binding.group}: ${binding.label}`}
      aria-describedby={description}
      onClick={onEdit}
    >
      <kbd>{display}</kbd>
    </button>
  );
}
