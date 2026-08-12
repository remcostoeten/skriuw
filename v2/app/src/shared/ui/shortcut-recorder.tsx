import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut/react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { RotateCcwIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";

export type ShortcutRecorderHandle = {
  /** Focuses the recorder button and opens capture, as if it was clicked. */
  startRecording: () => void;
};

type Props = {
  value: string;
  /** Accepts or rejects a captured combo; returns an error message to show, or null to accept. */
  onRecord: (combo: string) => string | null;
  onReset?: () => void;
  isDefault?: boolean;
  /** Reports capture start/stop so a hosting dialog can suppress Escape-driven close mid-capture. */
  onRecordingChange?: (recording: boolean) => void;
  /** Receives an imperative handle so a search flow can open capture directly. */
  handleRef?: Ref<ShortcutRecorderHandle>;
  "aria-label"?: string;
};

const RECORD_TIMEOUT_MS = 5000;

/**
 * How the recorder interprets a captured combo: Escape or a timeout cancels,
 * plain Enter closes capture keeping the current binding, and anything else —
 * including combos like ctrl+enter — becomes the new binding.
 */
export function recordedComboOutcome(combo: string): "cancel" | "keep" | "commit" {
  if (!combo || combo === "escape") {
    return "cancel";
  }
  if (combo === "enter") {
    return "keep";
  }
  return "commit";
}

/**
 * Click-to-rebind shortcut control. Captures the next key combo through the
 * shortcut engine's recorder, so what it stores is exactly what the matcher
 * will parse. Capture listens on the button itself, so clicking outside ends
 * it without swallowing keystrokes elsewhere.
 */
export function ShortcutRecorder({
  value,
  onRecord,
  onReset,
  isDefault,
  onRecordingChange,
  handleRef,
  ...aria
}: Props) {
  const $ = useShortcut();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const recordingRef = useRef(false);
  const onRecordingChangeRef = useRef(onRecordingChange);
  onRecordingChangeRef.current = onRecordingChange;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (recordingRef.current) {
        onRecordingChangeRef.current?.(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      return;
    }
    function handlePointerDown(event: PointerEvent): void {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      // Resolves the pending capture through its own listener, so the engine
      // detaches it instead of eating the next keystroke on this button.
      buttonRef.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [recording]);

  function stopRecording(): void {
    if (!recordingRef.current) {
      return;
    }
    recordingRef.current = false;
    setRecording(false);
    onRecordingChangeRef.current?.(false);
  }

  function startRecording(): void {
    const button = buttonRef.current;
    if (recordingRef.current || !button) {
      return;
    }
    button.focus();
    recordingRef.current = true;
    setRecording(true);
    onRecordingChangeRef.current?.(true);
    setError(null);
    $.record({ timeoutMs: RECORD_TIMEOUT_MS, target: button })
      .then((combo) => {
        if (!mountedRef.current) {
          return;
        }
        stopRecording();
        if (recordedComboOutcome(combo) === "commit") {
          setError(onRecord(combo));
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          stopRecording();
        }
      });
  }

  useImperativeHandle(handleRef, () => ({ startRecording }));

  return (
    <span ref={rootRef} className="flex items-center gap-1.5">
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "min-w-[84px] cursor-pointer rounded-lg border border-border bg-muted px-2 py-1 text-center text-xs text-foreground",
          recording && "shortcut-recorder-recording border-primary",
        )}
        aria-label={aria["aria-label"] ?? "Change shortcut"}
        onClick={startRecording}
      >
        {recording ? (
          <span className="flex items-center justify-center gap-1.5">
            <span className="shortcut-recorder-dot" aria-hidden="true" />
            <span className="shortcut-recorder-label">Press keys…</span>
          </span>
        ) : (
          <kbd className="font-mono text-[11px]">{formatShortcut(value)}</kbd>
        )}
      </button>
      {onReset && !isDefault && (
        <button
          type="button"
          className="flex cursor-pointer rounded-lg p-1 text-muted-foreground hover:text-foreground"
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
      <span className="text-[11px] text-destructive" role="status" aria-live="polite">
        {error}
      </span>
    </span>
  );
}
