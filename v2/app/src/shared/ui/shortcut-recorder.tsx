import { useEffect, useRef, useState } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut/react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { RotateCcwIcon } from "../icons";

type Props = {
  value: string;
  /** Accepts or rejects a captured combo; returns an error message to show, or null to accept. */
  onRecord: (combo: string) => string | null;
  onReset?: () => void;
  isDefault?: boolean;
  "aria-label"?: string;
};

const RECORD_TIMEOUT_MS = 5000;

/**
 * Click-to-rebind shortcut control. Captures the next key combo through the
 * shortcut engine's recorder, so what it stores is exactly what the matcher
 * will parse. Escape or the timeout cancels without changing the binding.
 */
export function ShortcutRecorder({ value, onRecord, onReset, isDefault, ...aria }: Props) {
  const $ = useShortcut();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function startRecording(): void {
    if (recording) {
      return;
    }
    setRecording(true);
    setError(null);
    $.record({ timeoutMs: RECORD_TIMEOUT_MS })
      .then((combo) => {
        if (!mountedRef.current) {
          return;
        }
        setRecording(false);
        if (!combo || combo === "escape") {
          return;
        }
        setError(onRecord(combo));
      })
      .catch(() => {
        if (mountedRef.current) {
          setRecording(false);
        }
      });
  }

  return (
    <span className="shortcut-recorder">
      <button
        type="button"
        className={`shortcut-recorder-button${recording ? " is-recording" : ""}`}
        aria-label={aria["aria-label"] ?? "Change shortcut"}
        onClick={startRecording}
      >
        {recording ? "Press keys…" : <kbd>{formatShortcut(value)}</kbd>}
      </button>
      {onReset && !isDefault && (
        <button
          type="button"
          className="shortcut-recorder-reset"
          aria-label="Reset to default"
          title="Reset to default"
          onClick={() => {
            setError(null);
            onReset();
          }}
        >
          <RotateCcwIcon size={13} />
        </button>
      )}
      <span className="shortcut-recorder-error" role="status" aria-live="polite">
        {error}
      </span>
    </span>
  );
}
