import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "prosemirror-view";
import type { AiTranscriptionModel } from "@/contracts/ai";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { noop } from "@/shared/lib/noop";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import { updateSettings } from "@/store/actions/settings";
import { insertBelowTransaction, replaceRangeTransaction } from "./editor-action-apply";
import { registerVoiceDictationListener } from "./voice-dictation-controller";
import { aiTranscriptionCatalogue, transcribeAudio } from "./transcription-bridge";
import { startAiCompletion, type AiCompletionHandle } from "./completion-bridge";
import { createAiCompletionConsumer } from "./completion-consumer";
import { promptLibraryEntries, selectWorkspacePrompts } from "./prompt-library";
import { parseAiModelSelection, selectRawAiModelSetting } from "./model-selection";
import { useVoiceRecorder, type VoiceRecording } from "./use-voice-recorder";
import {
  MAX_RECORDING_SECONDS,
  VOICE_DICTATION_MODES,
  buildVoiceFormatRequest,
  changeVoiceModeSelection,
  changeVoiceModelSelection,
  formatRecordingClock,
  parseVoiceMode,
  resolveVoiceModel,
  selectRawVoiceModeSetting,
  selectRawVoiceModelSetting,
  voiceDictationOrigin,
  type VoiceDictationMode,
} from "./voice-dictation";

const captionClass = "text-[11px] text-theme-secondary";
const previewBoxClass =
  "max-h-[220px] min-h-[64px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] leading-[1.55] text-foreground";

type Props = {
  store: RendererStore;
  signal: AbortSignal;
  getView: () => EditorView | null;
  getNoteId: () => string | null;
};

/**
 * Owns the dictation surface. It mounts only inside the AI opt-in gate, and
 * nothing here touches the microphone, a provider, or the network until the
 * writer explicitly opens it — never on startup, typing, save, or navigation.
 */
export function VoiceDictationHost({ store, signal, getView, getNoteId }: Props) {
  const [noteId, setNoteId] = useState<string | null>(null);

  useEffect(
    () =>
      registerVoiceDictationListener({
        isFocused: () => getView()?.hasFocus() === true,
        open: () => {
          const target = getNoteId();
          if (target !== null && getView() !== null) {
            setNoteId(target);
          }
        },
      }),
    [getNoteId, getView],
  );

  if (noteId === null) {
    return null;
  }
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && setNoteId(null)}
      title="Dictate into note"
      className="mx-auto mb-auto mt-[10vh] max-h-[80vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-hidden"
    >
      <VoiceDictationBody
        store={store}
        signal={signal}
        getView={getView}
        getNoteId={getNoteId}
        noteId={noteId}
      />
    </Dialog>
  );
}

type Run =
  | { phase: "recording" }
  | { phase: "transcribing" }
  | { phase: "formatting"; transcript: string; preview: string }
  | { phase: "review"; transcript: string; preview: string; formatted: boolean }
  | { phase: "failed"; transcript: string | null; message: string };

type BodyProps = Props & { noteId: string };

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

function VoiceDictationBody({ store, signal, getView, getNoteId, noteId }: BodyProps) {
  const closeDialog = useDialogClose();
  const [run, setRun] = useState<Run>({ phase: "recording" });
  const [catalogue, setCatalogue] = useState<readonly AiTranscriptionModel[] | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runRef = useRef(run);
  runRef.current = run;
  const handleRef = useRef<AiCompletionHandle | null>(null);
  const consumerRef = useRef<{ dispose: () => void } | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const lastRecordingRef = useRef<VoiceRecording | null>(null);
  const previewRef = useRef("");

  const storedPrompts = useRendererSelector(store, selectWorkspacePrompts);
  const rawCompletionModel = useRendererSelector(store, selectRawAiModelSetting);
  const completionModel = useMemo(
    () => parseAiModelSelection(rawCompletionModel),
    [rawCompletionModel],
  );
  const rawVoiceModel = useRendererSelector(store, selectRawVoiceModelSetting);
  const rawVoiceMode = useRendererSelector(store, selectRawVoiceModeSetting);
  const mode = useMemo(() => parseVoiceMode(rawVoiceMode), [rawVoiceMode]);
  const voiceModel = useMemo(() => {
    if (catalogue === null) {
      return null;
    }
    return resolveVoiceModel(
      parseAiModelSelection(rawVoiceModel),
      catalogue,
    );
  }, [catalogue, rawVoiceModel]);

  const recorder = useVoiceRecorder((recording) => {
    void transcribe(recording);
  });
  const { start } = recorder;

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    aiTranscriptionCatalogue()
      .then(setCatalogue)
      .catch((reason: unknown) => setCatalogueError(errorMessage(reason)));
  }, []);

  useEffect(
    () => () => {
      consumerRef.current?.dispose();
      handleRef.current?.dispose();
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  function promptFor(target: VoiceDictationMode) {
    if (target.promptId === null) {
      return null;
    }
    const entries = promptLibraryEntries(storedPrompts);
    return entries.find((entry) => entry.builtInId === target.promptId) ?? null;
  }

  async function transcribe(recording: VoiceRecording): Promise<void> {
    lastRecordingRef.current = recording;
    if (voiceModel === null) {
      setRun({
        phase: "failed",
        transcript: null,
        message: catalogueError ?? "No transcription model is available.",
      });
      return;
    }
    setRun({ phase: "transcribing" });
    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    try {
      const result = await transcribeAudio(recording.audio, {
        requestId,
        providerId: voiceModel.providerId,
        modelId: voiceModel.modelId,
        mimeType: recording.mimeType,
        language: null,
      });
      if (activeRequestIdRef.current !== requestId) {
        return;
      }
      const transcript = result.transcript.trim();
      if (transcript.length === 0) {
        setRun({
          phase: "failed",
          transcript: null,
          message: "Nothing was transcribed. Try recording again closer to the microphone.",
        });
        return;
      }
      if (mode.promptId === null) {
        setRun({ phase: "review", transcript, preview: transcript, formatted: false });
      } else {
        formatTranscript(mode, transcript);
      }
    } catch (reason) {
      if (activeRequestIdRef.current !== requestId) {
        return;
      }
      setRun({ phase: "failed", transcript: null, message: errorMessage(reason) });
    }
  }

  function formatTranscript(target: VoiceDictationMode, transcript: string): void {
    const prompt = promptFor(target);
    if (target.promptId === null) {
      setRun({ phase: "review", transcript, preview: transcript, formatted: false });
      return;
    }
    if (completionModel === null || prompt === null) {
      setRun({
        phase: "review",
        transcript,
        preview: transcript,
        formatted: false,
      });
      setApplyError("Choose an AI model in settings to use formatting modes.");
      return;
    }
    consumerRef.current?.dispose();
    handleRef.current?.dispose();
    handleRef.current = null;
    setApplyError(null);
    const request = buildVoiceFormatRequest({
      mode: target,
      selection: completionModel,
      prompt,
      transcript,
      requestId: crypto.randomUUID(),
    });
    activeRequestIdRef.current = request.requestId;
    previewRef.current = "";
    setRun({ phase: "formatting", transcript, preview: "" });

    const consumer = createAiCompletionConsumer(request.requestId, {
      onDelta: (text) => {
        previewRef.current += text;
        setRun((current) =>
          current.phase === "formatting"
            ? { ...current, preview: current.preview + text }
            : current,
        );
      },
      onTerminal: (event) => {
        handleRef.current = null;
        if (activeRequestIdRef.current !== request.requestId) {
          return;
        }
        const preview = previewRef.current.trim();
        if (event.type === "done" && preview.length > 0) {
          setRun({
            phase: "review",
            transcript,
            preview,
            formatted: true,
          });
          return;
        }
        // Whatever went wrong, the dictated words are never lost: the raw
        // transcript stands in and the failure is stated beside it.
        const message =
          event.type === "provider_error"
            ? event.error.message
            : event.type === "timeout"
              ? "The model did not respond in time."
              : event.type === "cancelled"
                ? "Formatting was cancelled."
                : "The model returned nothing.";
        setApplyError(`Formatting failed: ${message} Showing the raw transcript.`);
        setRun({ phase: "review", transcript, preview: transcript, formatted: false });
      },
    });
    consumerRef.current = consumer;

    void startAiCompletion(request, voiceDictationOrigin(target), (event) => {
      consumer.accept(event);
    }, signal)
      .then((handle) => {
        if (activeRequestIdRef.current !== request.requestId) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
      })
      .catch((reason: unknown) => {
        if (activeRequestIdRef.current !== request.requestId) {
          return;
        }
        consumer.dispose();
        setApplyError(`Formatting failed: ${errorMessage(reason)} Showing the raw transcript.`);
        setRun({ phase: "review", transcript, preview: transcript, formatted: false });
      });
  }

  function stopAndTranscribe(): void {
    const finished = recorder.stop();
    if (finished !== null) {
      void finished.then((recording) => transcribe(recording));
    }
  }

  function chooseMode(next: VoiceDictationMode): void {
    updateSettings(store, changeVoiceModeSelection(store.getState().settings, next));
    const current = runRef.current;
    if (current.phase === "review" || current.phase === "formatting") {
      formatTranscript(next, current.transcript);
    }
  }

  function chooseModel(model: AiTranscriptionModel): void {
    updateSettings(
      store,
      changeVoiceModelSelection(store.getState().settings, {
        providerId: model.providerId,
        modelId: model.modelId,
      }),
    );
  }

  function withLiveEditor(apply: (view: EditorView) => void): void {
    const view = getView();
    if (view === null) {
      setApplyError("The editor is not available.");
      return;
    }
    if (getNoteId() !== noteId) {
      setApplyError("A different note is open now. Copy the text instead.");
      return;
    }
    apply(view);
    closeDialog();
    view.focus();
  }

  function insertAtCursor(text: string): void {
    withLiveEditor((view) => {
      const { from, to } = view.state.selection;
      view.dispatch(replaceRangeTransaction(view.state, from, to, text));
    });
  }

  function insertBelow(text: string): void {
    withLiveEditor((view) => {
      view.dispatch(insertBelowTransaction(view.state, view.state.selection.to, text));
    });
  }

  function copyResult(text: string): void {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current !== null) {
          window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(noop);
  }

  const statusLine =
    run.phase === "recording"
      ? recorder.state.recording
        ? `Recording — ${formatRecordingClock(recorder.state.seconds)} of ${formatRecordingClock(MAX_RECORDING_SECONDS)}`
        : recorder.state.error ?? "Starting the microphone…"
      : run.phase === "transcribing"
        ? `Transcribing with ${voiceModel?.label ?? "the selected model"}…`
        : run.phase === "formatting"
          ? `Formatting as “${mode.label}”…`
          : run.phase === "review"
            ? run.formatted
              ? `Formatted as “${mode.label}”. Nothing is written until you insert it.`
              : "Transcript ready. Nothing is written until you insert it."
            : null;

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
      <p role="status" aria-live="polite" className={cn(captionClass, "min-h-4")}>
        {statusLine}
      </p>

      {run.phase === "recording" && (
        <LevelMeter level={recorder.state.level} active={recorder.state.recording} />
      )}

      {(run.phase === "recording" || run.phase === "review") && (
        <fieldset>
          <legend className={cn(captionClass, "mb-1")}>
            {run.phase === "recording" ? "After transcribing" : "Formatting"}
          </legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dictation mode">
            {VOICE_DICTATION_MODES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="radio"
                aria-checked={candidate.id === mode.id}
                title={candidate.description}
                className={cn(
                  "cursor-pointer rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                  candidate.id === mode.id
                    ? "border-ring bg-sidebar-accent text-sidebar-accent-foreground"
                    : "border-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
                onClick={() => chooseMode(candidate)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <p className={cn(captionClass, "mt-1")}>{mode.description}</p>
        </fieldset>
      )}

      {run.phase === "recording" && (
        <>
          {catalogue !== null && catalogue.length > 0 && voiceModel !== null && (
            <label className="block">
              <span className={cn(captionClass, "mb-1 block")}>Transcription model</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-ring"
                value={`${voiceModel.providerId}/${voiceModel.modelId}`}
                onChange={(event) => {
                  const chosen = catalogue.find(
                    (model) => `${model.providerId}/${model.modelId}` === event.target.value,
                  );
                  if (chosen !== undefined) {
                    chooseModel(chosen);
                  }
                }}
              >
                {catalogue.map((model) => (
                  <option
                    key={`${model.providerId}/${model.modelId}`}
                    value={`${model.providerId}/${model.modelId}`}
                  >
                    {model.label} · {model.providerId}
                  </option>
                ))}
              </select>
              <span className={cn(captionClass, "mt-1 block")}>
                The recording is sent to {voiceModel.providerId} for transcription and then
                discarded from this device.
              </span>
            </label>
          )}
        </>
      )}

      {(run.phase === "formatting" || run.phase === "review") && (
        <div aria-label="Transcript" className={previewBoxClass}>
          {run.preview.length === 0 ? (
            <span className="text-theme-dim">Waiting for the first words…</span>
          ) : (
            run.preview
          )}
        </div>
      )}

      {recorder.state.error !== null && run.phase === "recording" && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {recorder.state.error}
        </p>
      )}
      {catalogueError !== null && run.phase === "recording" && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {catalogueError}
        </p>
      )}
      {run.phase === "failed" && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {run.message}
        </p>
      )}
      {applyError !== null && (
        <p role="alert" className="text-[11.5px] text-destructive">
          {applyError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {run.phase === "recording" && (
          <Button
            variant="primary"
            onClick={stopAndTranscribe}
            disabled={!recorder.state.recording}
          >
            Stop and transcribe
          </Button>
        )}
        {run.phase === "failed" && lastRecordingRef.current !== null && (
          <Button
            variant="primary"
            onClick={() => {
              const recording = lastRecordingRef.current;
              if (recording !== null) {
                void transcribe(recording);
              }
            }}
          >
            Try again
          </Button>
        )}
        {run.phase === "review" && (
          <>
            <Button variant="primary" onClick={() => insertAtCursor(run.preview)}>
              Insert at cursor
            </Button>
            <Button onClick={() => insertBelow(run.preview)}>Insert below</Button>
            <Button onClick={() => copyResult(run.preview)}>
              {copied ? "Copied" : "Copy"}
            </Button>
            {run.formatted && (
              <Button
                onClick={() =>
                  setRun({
                    phase: "review",
                    transcript: run.transcript,
                    preview: run.transcript,
                    formatted: false,
                  })
                }
              >
                Use raw transcript
              </Button>
            )}
          </>
        )}
        <Button
          onClick={() => {
            recorder.discard();
            closeDialog();
          }}
        >
          {run.phase === "review" ? "Discard" : "Cancel"}
        </Button>
      </div>
      <p className={captionClass}>
        The recording never touches your notes or disk; only the text you insert does.
      </p>
    </div>
  );
}

const LEVEL_BAR_COUNT = 24;

type LevelMeterProps = {
  level: number;
  active: boolean;
};

function LevelMeter({ level, active }: LevelMeterProps) {
  const lit = Math.round(level * LEVEL_BAR_COUNT);
  return (
    <div
      aria-hidden="true"
      className="flex h-10 items-end gap-[3px] rounded-lg border border-border bg-background px-3 py-2"
    >
      {Array.from({ length: LEVEL_BAR_COUNT }, (_, index) => {
        const shape = 0.35 + 0.65 * Math.sin((index / (LEVEL_BAR_COUNT - 1)) * Math.PI);
        return (
          <span
            key={index}
            className={cn(
              "w-full rounded-sm transition-[height,background-color] duration-100",
              active && index < lit ? "bg-foreground" : "bg-border",
            )}
            style={{ height: `${Math.round(shape * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
