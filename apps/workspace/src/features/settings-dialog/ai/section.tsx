import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { openExternalUrl } from "@/platform/runtime/external-links";
import type { LocalAiModel, LocalAiProgress, LocalAiStatus } from "@/contracts/ai";
import {
  OLLAMA_INSTALL_SOURCE_URL,
  availableOllamaSelection,
  deleteOllamaModel,
  installOllamaRuntime,
  listOllamaModels,
  loadOllamaSnapshot,
  ollamaModelSourceUrl,
  ollamaRuntimeStatus,
  pullOllamaModel,
  readSelectedOllamaModel,
  startOllamaRuntime,
  stopOllamaRuntime,
  writeSelectedOllamaModel,
  type OllamaRuntimeAction,
} from "@/features/ai/local-models";
import {
  SettingToggle,
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsSection,
} from "@/shared/ui/settings-controls";
import { OllamaModelsPanel, OllamaRuntimeCard } from "./ollama";
import { RemoteProvidersPanel } from "./remote-providers";
import { useRemoteAiProviders } from "./use-remote-providers";
import {
  aiModelGroups,
  parseAiModelSelection,
  selectRawAiModelSetting,
  setAiModelSelection,
} from "@/features/ai/models";
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
  deletePrompt,
  savePrompt,
} from "@/features/ai/prompts";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { DefaultModelPicker } from "./model-picker";
import { PromptLibraryPanel } from "./prompt-library";
import { AiUsagePanel } from "./usage";
import { JOURNAL_AUTO_TITLE_SETTING, selectJournalAutoTitles } from "@/features/journal/auto-title";
import { updateSettings } from "@/store/settings";

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
  const [pendingAction, setPendingAction] = useState<OllamaRuntimeAction | null>(null);
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
  const defaultModel = useMemo(() => parseAiModelSelection(rawDefaultModel), [rawDefaultModel]);
  const journalAutoTitles = useRendererSelector(store, selectJournalAutoTitles);
  const modelGroups = useMemo(
    () =>
      aiModelGroups({
        ollamaStatus: status,
        ollamaModels: models,
        remoteProviders: remote.providers,
        remoteModels: remote.models,
      }),
    [status, models, remote.providers, remote.models],
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
          setSelectedModel((current) => availableOllamaSelection(current, snapshot.models));
          setError(null);
        })
        .catch((reason) => {
          if (active && !signal.aborted) setError(errorMessage(reason));
        });
    }
    refresh();
    function abort() {
      operationRef.current?.abort();
    }
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
    setPendingAction("install");
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
      setPendingAction(null);
      if (controller.signal.aborted) setProgress(null);
    }
  }

  async function runStart(): Promise<void> {
    setBusy(true);
    setPendingAction("start");
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
      setPendingAction(null);
    }
  }

  async function runStop(): Promise<void> {
    setBusy(true);
    setPendingAction("stop");
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
      setPendingAction(null);
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
      <SettingsGroup
        id="model"
        title="Default model"
        hint={settingsCopy.ai.noProcessOrNetworkWorkRuns}
        keywords="model switcher playground prompt test"
      >
        <DefaultModelPicker
          groups={modelGroups}
          selection={defaultModel}
          onSelect={(selection) => setAiModelSelection(store, selection)}
        />
        <SettingsRow
          label={settingsCopy.ai.tryAPrompt}
          detail={settingsCopy.ai.testTheSelectedModelWithoutChanging}
        >
          <button type="button" className={settingsButton} onClick={onOpenPlayground}>
            Open playground
          </button>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup
        id="automation"
        title="Automation"
        hint={settingsCopy.ai.workTheDefaultModelDoesOn}
        keywords="journal title titles automatic auto generate name entries background"
      >
        <SettingToggle
          label={settingsCopy.ai.titleJournalEntriesAutomatically}
          detail={settingsCopy.ai.namesPastEntriesThatHaveNo}
          checked={journalAutoTitles}
          onChange={(checked) =>
            updateSettings(store, {
              ...store.getState().settings,
              [JOURNAL_AUTO_TITLE_SETTING]: checked,
            })
          }
        />
      </SettingsGroup>
      <SettingsGroup
        id="local"
        title="Local AI"
        hint={settingsCopy.ai.runPrivateModelsOnThisDevice}
        keywords="ollama local runtime models pull install"
      >
        <OllamaRuntimeCard
          status={status}
          progress={progress}
          elapsedMs={elapsedMs}
          sourceUrl={sourceUrl}
          busy={busy}
          pending={pendingAction}
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
      </SettingsGroup>
      {remote.providers.length === 0 ? null : (
        <SettingsGroup
          id="remote"
          title="Online providers"
          hint={settingsCopy.ai.bringYourOwnApiKeyFor}
          keywords="anthropic claude openai gpt chatgpt openrouter gemini groq deepseek kimi glm qwen remote api key provider"
        >
          <RemoteProvidersPanel
            providers={remote.providers}
            models={remote.models}
            vault={remote.vault}
            drafts={remote.drafts}
            onDraftChange={remote.changeDraft}
            onAcceptDisclosure={remote.acceptDisclosure}
            onSaveKey={remote.saveKey}
            onVerifyKey={remote.verifyKey}
            onRemoveKey={remote.removeKey}
            onRevoke={remote.revoke}
            onRefreshModels={remote.refreshModels}
          />
          {remote.error ? (
            <p role="alert" className="text-xs text-destructive">
              {remote.error}
            </p>
          ) : null}
        </SettingsGroup>
      )}
      <SettingsGroup
        id="prompts"
        title="Writing prompts"
        hint={settingsCopy.ai.customizeTheInstructionsBehindEachWriting}
        keywords="prompt library built-in custom system prompt rewrite improve grammar shorten lengthen tone simplify translate summarize title outline continue"
      >
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
      </SettingsGroup>
      <SettingsGroup
        id="usage"
        title={settingsCopy.ai.historyAndUsage}
        hint={settingsCopy.ai.reviewLocalRunHistoryTokenCounts}
        keywords="usage history runs tokens token count cost spend estimate retention prune clear"
      >
        <AiUsagePanel signal={signal} />
      </SettingsGroup>
    </section>
  );
}

function errorMessage(reason: unknown): string {
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return String(reason.message);
  }
  return String(reason);
}
