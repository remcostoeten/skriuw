import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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
  stopOllamaRuntime,
} from "@/features/ai/ollama-bridge";
import { OLLAMA_INSTALL_SOURCE_URL, ollamaModelSourceUrl } from "@/features/ai/ollama-model";
import {
  SettingsHeading,
  settingsButton,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";
import { OllamaModelsPanel, OllamaRuntimeCard } from "./ollama-settings-ui";
import { RemoteProvidersPanel } from "./remote-ai-settings-ui";
import { useRemoteAiProviders } from "./use-remote-ai-providers";
import {
  availableOllamaSelection,
  readSelectedOllamaModel,
  writeSelectedOllamaModel,
} from "@/features/ai/ollama-selection";
import { aiModelGroups } from "@/features/ai/model-options";
import {
  parseAiModelSelection,
  selectRawAiModelSetting,
} from "@/features/ai/model-selection";
import {
  duplicatePromptDraft,
  newPromptDraft,
  promptDraftError,
  promptDraftFrom,
  promptFromDraft,
  promptLibraryEntries,
  selectWorkspacePrompts,
  type PromptDraft,
  type PromptLibraryEntry,
} from "@/features/ai/prompt-library";
import { deletePrompt, savePrompt } from "@/store/actions/prompts";
import { setAiModelSelection } from "@/store/actions/settings";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import { DefaultModelPicker } from "./ai-model-picker-ui";
import { PromptLibraryPanel } from "./prompt-library-ui";
import { AiUsagePanel } from "./ai-usage-ui";

type Props = {
  store: RendererStore;
  signal: AbortSignal;
  onOpenPlayground: () => void;
};

export function AiSection({ store, signal, onOpenPlayground }: Props) {
  signal.throwIfAborted();
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [models, setModels] = useState<LocalAiModel[]>([]);
  const [modelName, setModelName] = useState("");
  const [selectedModel, setSelectedModel] = useState(readSelectedOllamaModel);
  const [progress, setProgress] = useState<LocalAiProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const operationRef = useRef<AbortController | null>(null);
  const operationStartRef = useRef<number | null>(null);
  const [, tick] = useReducer((count: number) => count + 1, 0);
  const remote = useRemoteAiProviders(signal);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const prompts = useRendererSelector(store, selectWorkspacePrompts);
  const promptEntries = useMemo(() => promptLibraryEntries(prompts), [prompts]);
  const rawDefaultModel = useRendererSelector(store, selectRawAiModelSetting);
  const defaultModel = useMemo(
    () => parseAiModelSelection(rawDefaultModel),
    [rawDefaultModel],
  );
  const modelGroups = useMemo(
    () =>
      aiModelGroups({
        ollamaStatus: status,
        ollamaModels: models,
        remoteProviders: remote.providers,
        remoteCatalog: remote.catalog,
      }),
    [status, models, remote.providers, remote.catalog],
  );

  useEffect(() => {
    if (progress?.type !== "progress") return;
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [progress?.type]);

  const elapsedMs =
    progress?.type === "progress" && operationStartRef.current !== null
      ? Date.now() - operationStartRef.current
      : 0;
  const sourceUrl =
    progress?.type === "progress"
      ? progress.operation === "pull"
        ? pullingModel
          ? ollamaModelSourceUrl(pullingModel)
          : null
        : OLLAMA_INSTALL_SOURCE_URL
      : null;

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
    operationStartRef.current = Date.now();
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
      operationStartRef.current = null;
      setBusy(false);
      if (controller.signal.aborted) setProgress(null);
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

  async function runStop(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await stopOllamaRuntime();
      if (!signal.aborted) {
        setStatus(next);
        setModels([]);
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
    setPullingModel(model);
    operationStartRef.current = Date.now();
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
      operationStartRef.current = null;
      setPullingModel(null);
      setBusy(false);
      if (controller.signal.aborted) setProgress(null);
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

  function editPrompt(entry: PromptLibraryEntry): void {
    setEditingKey(entry.key);
    setDraft(promptDraftFrom(entry, crypto.randomUUID(), Date.now()));
  }

  function duplicatePrompt(entry: PromptLibraryEntry): void {
    setEditingKey("new");
    setDraft(duplicatePromptDraft(entry, crypto.randomUUID(), Date.now()));
  }

  function createPrompt(): void {
    setEditingKey("new");
    setDraft(newPromptDraft(crypto.randomUUID(), Date.now()));
  }

  function closeEditor(): void {
    setEditingKey(null);
    setDraft(null);
  }

  function savePromptDraft(): void {
    if (draft === null || promptDraftError(draft) !== null) {
      return;
    }
    savePrompt(store, promptFromDraft(draft, Date.now()));
    closeEditor();
  }

  function removePrompt(entry: PromptLibraryEntry): void {
    const stored = entry.promptId === null ? undefined : prompts.get(entry.promptId);
    if (stored === undefined) {
      return;
    }
    if (editingKey === entry.key) {
      closeEditor();
    }
    deletePrompt(store, stored);
  }

  return (
    <section aria-label="AI settings" className={settingsSection}>
      <SettingsHeading
        title="AI"
        detail="Run writing tools locally, or bring your own key for a remote provider."
      />
      <DefaultModelPicker
        groups={modelGroups}
        selection={defaultModel}
        onSelect={(selection) => setAiModelSelection(store, selection)}
      />
      <div className={settingsRow}>
        <span className={settingsRowLabel}>
          Prompt playground
          <span className={settingsRowDescription}>
            Fire a raw prompt at any provider and watch the streamed result.
          </span>
        </span>
        <button type="button" className={settingsButton} onClick={onOpenPlayground}>
          Open playground
        </button>
      </div>
      <PromptLibraryPanel
        entries={promptEntries}
        draft={draft}
        editingKey={editingKey}
        onEdit={editPrompt}
        onDraftChange={(change) =>
          setDraft((current) => (current === null ? current : { ...current, ...change }))
        }
        onSave={savePromptDraft}
        onCancel={closeEditor}
        onDuplicate={duplicatePrompt}
        onReset={removePrompt}
        onDelete={removePrompt}
        onCreate={createPrompt}
      />
      <OllamaRuntimeCard
        status={status}
        progress={progress}
        elapsedMs={elapsedMs}
        sourceUrl={sourceUrl}
        busy={busy}
        error={error}
        onInstall={() => void runInstall()}
        onStart={() => void runStart()}
        onStop={() => void runStop()}
        onOpenInstaller={() => {
          void openExternalUrl("https://ollama.com/download/windows").catch((reason) => {
            setError(errorMessage(reason));
          });
        }}
        onRefresh={() => void refreshRuntime()}
        onCancel={cancelOperation}
        onOpenSource={() => {
          if (!sourceUrl) return;
          void openExternalUrl(sourceUrl).catch((reason) => {
            setError(errorMessage(reason));
          });
        }}
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

      {remote.providers.length === 0 ? null : (
        <RemoteProvidersPanel
          providers={remote.providers}
          catalog={remote.catalog}
          vault={remote.vault}
          drafts={remote.drafts}
          onDraftChange={remote.changeDraft}
          onAcceptDisclosure={remote.acceptDisclosure}
          onSaveKey={remote.saveKey}
          onVerifyKey={remote.verifyKey}
          onRemoveKey={remote.removeKey}
          onRevoke={remote.revoke}
          onRefreshCatalog={remote.refreshCatalog}
        />
      )}
      <AiUsagePanel signal={signal} />
      {remote.error ? (
        <p role="alert" className="text-xs text-destructive">
          {remote.error}
        </p>
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
