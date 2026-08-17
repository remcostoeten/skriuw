import { useEffect, useRef, useState } from "react";
import { openExternalUrl } from "@/bridge/external-links";
import type { LocalAiModel, LocalAiProgress, LocalAiStatus } from "@/contracts/ai";
import {
  deleteOllamaModel,
  installOllamaRuntime,
  listOllamaModels,
  loadOllamaSnapshot,
  ollamaRuntimeStatus,
  pullOllamaModel,
  startOllamaRuntime,
} from "@/features/ai/ollama-bridge";
import { SettingsHeading, settingsSection } from "./settings-shared";
import { OllamaModelsPanel, OllamaRuntimeCard } from "./ollama-settings-ui";
import {
  availableOllamaSelection,
  readSelectedOllamaModel,
  writeSelectedOllamaModel,
} from "@/features/ai/ollama-selection";

type Props = {
  signal: AbortSignal;
};

export function AiSection({ signal }: Props) {
  signal.throwIfAborted();
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [models, setModels] = useState<LocalAiModel[]>([]);
  const [modelName, setModelName] = useState("");
  const [selectedModel, setSelectedModel] = useState(readSelectedOllamaModel);
  const [progress, setProgress] = useState<LocalAiProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const operationRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    function refresh(): void {
      void loadOllamaSnapshot()
        .then((snapshot) => {
          if (!active || signal.aborted) return;
          setStatus(snapshot.status);
          setModels(snapshot.models);
          setSelectedModel((current) =>
            availableOllamaSelection(current, snapshot.models),
          );
          setError(null);
        })
        .catch((reason) => {
          if (active && !signal.aborted) setError(errorMessage(reason));
        });
    }
    refresh();
    const abort = () => operationRef.current?.abort();
    signal.addEventListener("abort", abort, { once: true });
    const poll = window.setInterval(() => {
      if (!signal.aborted && operationRef.current === null) {
        refresh();
      }
    }, 3_000);
    return () => {
      active = false;
      window.clearInterval(poll);
      signal.removeEventListener("abort", abort);
    };
  }, [signal]);

  useEffect(() => {
    writeSelectedOllamaModel(selectedModel);
  }, [selectedModel]);

  async function refreshRuntime(): Promise<void> {
    setError(null);
    try {
      const next = await ollamaRuntimeStatus();
      if (signal.aborted) return;
      setStatus(next);
      if (next.state === "running") {
        await refreshModels();
      } else {
        setModels([]);
      }
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    }
  }

  async function refreshModels(): Promise<void> {
    try {
      const next = await listOllamaModels();
      if (signal.aborted) return;
      setModels(next);
      setSelectedModel((current) => availableOllamaSelection(current, next));
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    }
  }

  async function runInstall(): Promise<void> {
    setBusy(true);
    setError(null);
    setProgress(null);
    const controller = new AbortController();
    operationRef.current = controller;
    try {
      const next = await installOllamaRuntime(setProgress, controller.signal);
      if (!signal.aborted) {
        setStatus(next);
        await refreshModels();
      }
    } catch (reason) {
      if (!signal.aborted && !controller.signal.aborted) setError(errorMessage(reason));
    } finally {
      operationRef.current = null;
      setBusy(false);
    }
  }

  async function runStart(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await startOllamaRuntime();
      if (!signal.aborted) {
        setStatus(next);
        await refreshModels();
      }
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function runPull(): Promise<void> {
    const model = modelName.trim();
    if (!model) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    const controller = new AbortController();
    operationRef.current = controller;
    try {
      await pullOllamaModel(model, setProgress, controller.signal);
      if (!signal.aborted) {
        setModelName("");
        selectModel(model);
        await refreshModels();
      }
    } catch (reason) {
      if (!signal.aborted && !controller.signal.aborted) setError(errorMessage(reason));
    } finally {
      operationRef.current = null;
      setBusy(false);
    }
  }

  async function removeModel(model: string): Promise<void> {
    if (deleteArmed !== model) {
      setDeleteArmed(model);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteOllamaModel(model);
      if (!signal.aborted) {
        setDeleteArmed(null);
        await refreshModels();
      }
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function cancelOperation(): void {
    operationRef.current?.abort();
  }

  function selectModel(model: string): void {
    setSelectedModel(model);
  }

  return (
    <section aria-label="AI settings" className={settingsSection}>
      <SettingsHeading
        title="AI"
        detail="Run writing tools locally with models that stay on this device."
      />
      <OllamaRuntimeCard
        status={status}
        progress={progress}
        busy={busy}
        error={error}
        onInstall={() => void runInstall()}
        onStart={() => void runStart()}
        onOpenInstaller={() => {
          void openExternalUrl("https://ollama.com/download/windows").catch((reason) => {
            setError(errorMessage(reason));
          });
        }}
        onRefresh={() => void refreshRuntime()}
        onCancel={cancelOperation}
      />

      {status?.state === "running" ? (
        <OllamaModelsPanel
          models={models}
          modelName={modelName}
          selectedModel={selectedModel}
          deleteArmed={deleteArmed}
          busy={busy}
          onModelNameChange={setModelName}
          onPull={() => void runPull()}
          onSelect={selectModel}
          onDelete={(model) => void removeModel(model)}
          onDeleteBlur={(model) =>
            setDeleteArmed((current) => (current === model ? null : current))
          }
        />
      ) : null}
    </section>
  );
}

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String(reason.message);
  }
  return String(reason);
}
