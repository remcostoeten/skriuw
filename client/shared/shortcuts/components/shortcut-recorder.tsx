import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { KeyCombo } from '../shortcut-definitions';

type ShortcutRecorderProps = {
  value: KeyCombo[];
  onChange: (keys: KeyCombo[]) => void;
  onCancel?: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
};

/**
 * Component for recording keyboard shortcuts
 * Captures single keys or modifier + key combinations
 */
export function ShortcutRecorder({
  value,
  onChange,
  onCancel,
  isRecording,
  onStartRecording,
  onStopRecording,
}: ShortcutRecorderProps) {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRecording) {
      setPressedKeys(new Set());
      pressedKeysRef.current = new Set();
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys = new Set<string>();

      // Add modifiers
      if (e.ctrlKey) keys.add('Ctrl');
      if (e.metaKey) keys.add('Meta');
      if (e.shiftKey) keys.add('Shift');
      if (e.altKey) keys.add('Alt');

      // Add the actual key (if it's not a modifier itself)
      const key = e.key;
      if (!['Control', 'Meta', 'Shift', 'Alt', 'CapsLock'].includes(key)) {
        keys.add(key);
      }

      pressedKeysRef.current = keys;
      setPressedKeys(keys);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const currentKeys = pressedKeysRef.current;
      if (currentKeys.size > 0) {
        // Convert Set to array and save
        const keysArray = Array.from(currentKeys);
        onChange([keysArray]);
        onStopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [isRecording, onChange, onStopRecording]);

  const formatKeyCombo = (combo: KeyCombo): string => {
    return combo.join(' + ');
  };

  const formatShortcut = (keyCombos: KeyCombo[]): string => {
    if (keyCombos.length === 0) return 'Not set';
    return keyCombos.map(formatKeyCombo).join(' or ');
  };

  const handleClick = () => {
    if (!isRecording) {
      onStartRecording();
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        onClick={handleClick}
        tabIndex={0}
        className={`
          flex-1 px-3 py-2 rounded-md border text-sm
          transition-all duration-200 cursor-pointer
          ${
            isRecording
              ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20'
              : 'border-Skriuw-border bg-Skriuw-dark hover:bg-Skriuw-border/30'
          }
        `}
      >
        {isRecording ? (
          <span className="text-blue-400 animate-pulse">
            {pressedKeys.size > 0
              ? formatKeyCombo(Array.from(pressedKeys))
              : 'Press any key combination...'}
          </span>
        ) : (
          <span className="text-Skriuw-text">
            {formatShortcut(value)}
          </span>
        )}
      </div>

      {isRecording && (
        <button
          onClick={() => {
            onStopRecording();
            onCancel?.();
          }}
          className="p-2 rounded-md hover:bg-Skriuw-border/50 transition-colors"
          aria-label="Cancel recording"
        >
          <X className="w-4 h-4 text-Skriuw-icon" />
        </button>
      )}
    </div>
  );
}

