import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AiCompletionRequest } from "@/contracts/ai";
import { appRouteHash } from "@/app-route";
import { ChevronLeftIcon, StarIcon } from "@/shared/icons/static";
import { Button } from "@/shared/ui/button";
import { WindowControls } from "@/shell/window-controls";
import { cn } from "@/shared/lib/utils";
import { noop } from "@/shared/lib/noop";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import {
  PLAYGROUND_ORIGIN,
  startAiCompletion,
  type AiCompletionHandle,
} from "./completion-bridge";
import { takePlaygroundPrefill } from "./playground-prefill";
import { createAiCompletionConsumer } from "./completion-consumer";
import { loadOllamaSnapshot } from "./ollama-bridge";
import { loadRemoteAiSnapshot } from "./remote-ai-bridge";
import type { AiModelInventory } from "./model-options";
import { promptLibraryEntries, selectWorkspacePrompts } from "./prompt-library";
import {
  parseAiModelSelection,
  selectRawAiModelSetting,
  type AiModelSelection,
} from "./model-selection";
import {
  MAX_OUTPUT_BYTES,
  buildPlaygroundRequest,
  clampMaxOutputBytes,
  clampTemperatureMillis,
  defaultPlaygroundSelection,
  playgroundModelGroups,
  playgroundStatusLine,
  promptByteError,
  startFailureRun,
  terminalRun,
  type PlaygroundRun,
  type PlaygroundTiming,
} from "./playground-model";

type Props = {
  store: RendererStore;
  signal: AbortSignal;
};

const promptFieldClass =
  "min-h-[72px] w-full resize-y rounded-lg border border-border bg-background px-[9px] py-[6px] font-mono text-[12.5px] leading-[1.5] text-foreground outline-none transition-colors duration-[130ms] ease-out placeholder:text-theme-dim focus:border-ring focus:bg-theme-hover";
const paramFieldClass =
  "min-h-[28px] w-[110px] rounded-lg border border-border bg-muted px-2 py-[3px] text-xs text-foreground outline-none focus-visible:border-foreground/70";
const paramLabelClass = "flex items-center gap-1.5 text-[11px] text-theme-secondary";

const MODEL_SEPARATOR = "\u001f";

function encodeSelection(selection: AiModelSelection): string {
  return `${selection.providerId}${MODEL_SEPARATOR}${selection.modelId}`;
}

function decodeSelection(value: string): AiModelSelection | null {
  const index = value.indexOf(MODEL_SEPARATOR);
  if (index <= 0) {
    return null;
  }
  return { providerId: value.slice(0, index), modelId: value.slice(index + 1) };
}

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

export function PromptPlaygroundView({ store, signal }: Props) {
  const [prefill] = useState(takePlaygroundPrefill);
  const [systemPrompt, setSystemPrompt] = useState(prefill?.systemPrompt ?? "");
  const [promptKey, setPromptKey] = useState("");
  const [userPrompt, setUserPrompt] = useState(prefill?.userPrompt ?? "");
  const [temperatureRaw, setTemperatureRaw] = useState("");
  const [maxBytesRaw, setMaxBytesRaw] = useState("");
  const [inventory, setInventory] = useState<AiModelInventory | null>(null);
  const [selected, setSelected] = useState<AiModelSelection | null>(prefill?.selection ?? null);
  const [output, setOutput] = useState("");
  const [run, setRun] = useState<PlaygroundRun>({ phase: "idle" });
  const [timing, setTiming] = useState<PlaygroundTiming | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRef = useRef<AiCompletionHandle | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const consumerRef = useRef<{ dispose: () => void } | null>(null);
  const lastRequestRef = useRef<AiCompletionRequest | null>(null);
  const timingRef = useRef<PlaygroundTiming | null>(null);
  const bufferRef = useRef("");
  const flushFrameRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const storedPrompts = useRendererSelector(store, selectWorkspacePrompts);
  const promptEntries = useMemo(() => promptLibraryEntries(storedPrompts), [storedPrompts]);
  const rawDefault = useRendererSelector(store, selectRawAiModelSetting);
  const storedDefault = useMemo(() => parseAiModelSelection(rawDefault), [rawDefault]);

  // Reading remote provider state can prompt the OS keyring, so the inventory
  // loads exactly once per open of this surface and is never polled.
  useEffect(() => {
    let active = true;
    void Promise.all([loadOllamaSnapshot(), loadRemoteAiSnapshot()])
      .then(([ollama, remote]) => {
        if (!active) return;
        setInventory({
          ollamaStatus: ollama.status,
          ollamaModels: ollama.models,
          remoteProviders: remote.providers,
          remoteCatalog: remote.catalog,
        });
      })
      .catch(() => {
        if (!active) return;
        setInventory({
          ollamaStatus: null,
          ollamaModels: [],
          remoteProviders: [],
          remoteCatalog: null,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      consumerRef.current?.dispose();
      handleRef.current?.dispose();
      if (flushFrameRef.current !== null) {
        cancelAnimationFrame(flushFrameRef.current);
      }
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    [],
  );

  const groups = useMemo(() => playgroundModelGroups(inventory), [inventory]);
  const selection = useMemo(
    () => selected ?? defaultPlaygroundSelection(groups, storedDefault),
    [groups, selected, storedDefault],
  );
  const byteError = useMemo(
    () => promptByteError(systemPrompt, userPrompt),
    [systemPrompt, userPrompt],
  );

  const streaming = run.phase === "streaming";
  const statusLine = playgroundStatusLine(
    run,
    timing ?? { startedAt: 0, firstDeltaAt: null, finishedAt: null },
  );

  function flushDeltas(): void {
    flushFrameRef.current = null;
    const chunk = bufferRef.current;
    bufferRef.current = "";
    if (chunk.length > 0) {
      setOutput((current) => current + chunk);
    }
  }

  function scheduleFlush(): void {
    if (flushFrameRef.current === null) {
      flushFrameRef.current = requestAnimationFrame(flushDeltas);
    }
  }

  function fire(request: AiCompletionRequest): void {
    consumerRef.current?.dispose();
    handleRef.current?.dispose();
    handleRef.current = null;
    bufferRef.current = "";
    lastRequestRef.current = request;
    activeRequestIdRef.current = request.requestId;
    cancelRequestedRef.current = false;
    const startedTiming: PlaygroundTiming = {
      startedAt: performance.now(),
      firstDeltaAt: null,
      finishedAt: null,
    };
    timingRef.current = startedTiming;
    setTiming(startedTiming);
    setOutput("");
    setCopied(false);
    setRun({ phase: "streaming", requestId: request.requestId });

    const consumer = createAiCompletionConsumer(request.requestId, {
      onDelta: (text) => {
        const current = timingRef.current;
        if (current !== null && current.firstDeltaAt === null) {
          timingRef.current = { ...current, firstDeltaAt: performance.now() };
        }
        bufferRef.current += text;
        scheduleFlush();
      },
      onTerminal: (event) => {
        flushDeltas();
        const current = timingRef.current;
        if (current !== null) {
          const finished = { ...current, finishedAt: performance.now() };
          timingRef.current = finished;
          setTiming(finished);
        }
        handleRef.current = null;
        setRun(terminalRun(event));
      },
    });
    consumerRef.current = consumer;

    void startAiCompletion(
      request,
      PLAYGROUND_ORIGIN,
      (event) => void consumer.accept(event),
      signal,
    )
      .then((handle) => {
        if (activeRequestIdRef.current !== request.requestId) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        if (cancelRequestedRef.current) {
          void handle.cancel().catch(noop);
        }
      })
      .catch((reason: unknown) => {
        if (activeRequestIdRef.current !== request.requestId) {
          return;
        }
        consumer.dispose();
        setRun(startFailureRun(request.requestId, errorMessage(reason)));
      });
  }

  function applyPromptEntry(key: string): void {
    setPromptKey(key);
    const entry = promptEntries.find((candidate) => candidate.key === key);
    if (entry === undefined) {
      return;
    }
    setSystemPrompt(entry.systemPrompt);
    setTemperatureRaw(
      entry.parameters.temperatureMillis === null
        ? ""
        : `${entry.parameters.temperatureMillis / 1000}`,
    );
    setMaxBytesRaw(`${entry.parameters.maxOutputBytes}`);
  }

  function submit(): void {
    if (streaming || byteError !== null) {
      return;
    }
    fire(
      buildPlaygroundRequest({
        selection,
        systemPrompt,
        userPrompt,
        temperatureMillis: clampTemperatureMillis(temperatureRaw),
        maxOutputBytes: clampMaxOutputBytes(maxBytesRaw),
      }),
    );
  }

  function retry(): void {
    const previous = lastRequestRef.current;
    if (streaming || previous === null) {
      return;
    }
    fire({ ...previous, requestId: crypto.randomUUID() });
  }

  function cancelRun(): void {
    cancelRequestedRef.current = true;
    void handleRef.current?.cancel().catch(noop);
  }

  function clearRun(): void {
    consumerRef.current?.dispose();
    handleRef.current?.dispose();
    handleRef.current = null;
    activeRequestIdRef.current = null;
    bufferRef.current = "";
    setOutput("");
    setRun({ phase: "idle" });
    setTiming(null);
    setCopied(false);
  }

  function copyOutput(): void {
    void navigator.clipboard
      ?.writeText(output)
      .then(() => {
        setCopied(true);
        if (copiedTimerRef.current !== null) {
          window.clearTimeout(copiedTimerRef.current);
        }
        copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(noop);
  }

  function handleSurfaceKeys(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape" && streaming) {
      event.preventDefault();
      event.stopPropagation();
      cancelRun();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      submit();
    }
  }

  const modelValue = encodeSelection(selection);

  return (
    <main
      className="col-[2/-1] grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-theme-editor"
      aria-labelledby="prompt-playground-title"
      onKeyDown={handleSurfaceKeys}
    >
      <header className="flex h-[52px] items-center gap-2.5 border-b border-theme-divider pl-3">
        <button
          type="button"
          onClick={() => {
            window.location.hash = appRouteHash("notes");
          }}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius)] border-none bg-transparent pl-1 pr-2 text-[12px] font-[560] text-theme-secondary transition-colors hover:bg-theme-hover hover:text-foreground"
        >
          <ChevronLeftIcon size={15} />
          Back to notes
        </button>
        <span aria-hidden className="h-4 w-px shrink-0 bg-theme-divider" />
        <StarIcon size={14} className="shrink-0 text-theme-secondary" />
        <h1
          id="prompt-playground-title"
          className="min-w-0 truncate text-[13px] font-[650] tracking-[-0.01em] text-foreground"
        >
          Prompt playground
        </h1>
        <div className="ml-auto flex shrink-0 items-center">
          <WindowControls />
        </div>
      </header>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-y-auto">
        <div className="mx-auto w-[min(100%,860px)] px-[clamp(20px,4vw,40px)] pt-5">
          <label className={cn(paramLabelClass, "mb-2")}>
            Prompt
            <select
              aria-label="Prompt"
              className={cn(paramFieldClass, "w-auto max-w-[280px] cursor-pointer")}
              value={promptKey}
              disabled={streaming}
              onChange={(event) => applyPromptEntry(event.target.value)}
            >
              <option value="">Blank</option>
              {promptEntries.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.origin === "customised" ? `${entry.name} (modified)` : entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] font-[560] text-theme-secondary">
              System prompt
            </span>
            <textarea
              className={promptFieldClass}
              rows={3}
              value={systemPrompt}
              aria-label="System prompt"
              placeholder="Optional instructions for the model"
              onChange={(event) => {
                setPromptKey("");
                setSystemPrompt(event.target.value);
              }}
            />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] font-[560] text-theme-secondary">
              User prompt
            </span>
            <textarea
              className={cn(promptFieldClass, "min-h-[96px]")}
              rows={4}
              value={userPrompt}
              aria-label="User prompt"
              placeholder="Ask the model something…"
              onChange={(event) => setUserPrompt(event.target.value)}
            />
          </label>

          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className={paramLabelClass}>
              Model
              <select
                aria-label="Model"
                className={cn(paramFieldClass, "w-auto max-w-[260px] cursor-pointer")}
                value={modelValue}
                disabled={streaming}
                onChange={(event) => {
                  const next = decodeSelection(event.target.value);
                  if (next !== null) {
                    setSelected(next);
                  }
                }}
              >
                {groups.map((group) => (
                  <optgroup key={group.providerId} label={group.label}>
                    {group.options.map((option) => (
                      <option
                        key={`${option.providerId}:${option.modelId}`}
                        value={encodeSelection(option)}
                      >
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className={paramLabelClass}>
              Temperature
              <input
                aria-label="Temperature"
                className={paramFieldClass}
                inputMode="decimal"
                placeholder="default"
                value={temperatureRaw}
                disabled={streaming}
                onChange={(event) => setTemperatureRaw(event.target.value)}
              />
            </label>
            <label className={paramLabelClass}>
              Max output bytes
              <input
                aria-label="Max output bytes"
                className={paramFieldClass}
                inputMode="numeric"
                placeholder={`${MAX_OUTPUT_BYTES}`}
                value={maxBytesRaw}
                disabled={streaming}
                onChange={(event) => setMaxBytesRaw(event.target.value)}
              />
            </label>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={submit} disabled={streaming || byteError !== null}>
              Run
            </Button>
            <Button onClick={cancelRun} disabled={!streaming}>
              Cancel
            </Button>
            <Button onClick={retry} disabled={streaming || lastRequestRef.current === null}>
              Retry
            </Button>
            <Button onClick={copyOutput} disabled={output.length === 0}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={clearRun} disabled={streaming ? false : output.length === 0 && run.phase === "idle"}>
              Clear
            </Button>
            <span className="text-[10.5px] text-theme-secondary">
              ⌘/Ctrl+Enter runs · Esc cancels
            </span>
          </div>

          <p role="status" aria-live="polite" className="mb-1 min-h-4 text-[11.5px] text-theme-secondary">
            {statusLine}
          </p>
          {byteError !== null && (
            <p role="alert" className="mb-1 text-[11.5px] text-destructive">
              {byteError}
            </p>
          )}
          {run.phase === "error" && (
            <p role="alert" className="mb-1 text-[11.5px] text-destructive">
              {run.error.message}
            </p>
          )}
        </div>

        <div className="mx-auto min-h-0 w-[min(100%,860px)] px-[clamp(20px,4vw,40px)] pb-6">
          <div className="h-full min-h-[160px] overflow-y-auto rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] text-foreground">
            {output.length === 0 && (
              <span className="text-theme-dim">
                {streaming ? "Waiting for the first token…" : "Output streams here."}
              </span>
            )}
            <div aria-label="Model output" className="whitespace-pre-wrap">
              {output}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
