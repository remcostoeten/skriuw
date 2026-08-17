import type { FormEvent } from "react";
import type { LocalAiModel, LocalAiProgress, LocalAiStatus } from "@/contracts/ai";
import {
  ollamaOwnershipLabel,
  ollamaProgressPercent,
  ollamaProgressText,
  ollamaStatusLabel,
} from "@/features/ai/ollama-model";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { cn } from "@/shared/lib/utils";
import {
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupHint,
  settingsGroupTitle,
  settingsRowDescription,
  settingsTextInput,
} from "./settings-shared";

type RuntimeCardProps = {
  status: LocalAiStatus | null;
  progress: LocalAiProgress | null;
  busy: boolean;
  error: string | null;
  onInstall: () => void;
  onStart: () => void;
  onOpenInstaller: () => void;
  onRefresh: () => void;
  onCancel: () => void;
};

type ModelsPanelProps = {
  models: LocalAiModel[];
  modelName: string;
  selectedModel: string | null;
  deleteArmed: string | null;
  busy: boolean;
  onModelNameChange: (value: string) => void;
  onPull: () => void;
  onSelect: (model: string) => void;
  onDelete: (model: string) => void;
  onDeleteBlur: (model: string) => void;
};

const modelDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function OllamaRuntimeCard({
  status,
  progress,
  busy,
  error,
  onInstall,
  onStart,
  onOpenInstaller,
  onRefresh,
  onCancel,
}: RuntimeCardProps) {
  const percent = ollamaProgressPercent(progress);
  return (
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>Local runtime</div>
      <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full border",
              status?.state === "running"
                ? "border-emerald-500/40 bg-emerald-500"
                : status?.state === "failed"
                  ? "border-destructive/40 bg-destructive"
                  : "border-border bg-muted-foreground/45",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">
              {status ? ollamaStatusLabel(status) : "Checking Ollama…"}
            </span>
            <span className={settingsRowDescription}>
              {status
                ? ollamaOwnershipLabel(status)
                : "No process or network work runs until this page opens."}
            </span>
          </span>
          <RuntimeAction
            status={status}
            busy={busy}
            onInstall={onInstall}
            onStart={onStart}
            onOpenInstaller={onOpenInstaller}
            onRefresh={onRefresh}
          />
        </div>
        {progress ? (
          <div className="border-t border-border px-3.5 py-2.5">
            <div
              className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
              aria-live="polite"
            >
              <span>{ollamaProgressText(progress)}</span>
              {busy ? (
                <button
                  type="button"
                  className="text-foreground underline-offset-2 hover:underline"
                  onClick={onCancel}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            {percent !== null ? (
              <div
                role="progressbar"
                aria-label={
                  progress.operation === "install" ? "Ollama installation" : "Model download"
                }
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-foreground transition-[width] motion-reduce:transition-none"
                  style={{ width: `${percent}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {status?.detail ? <p className="mt-2 text-xs text-destructive">{status.detail}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RuntimeAction({
  status,
  busy,
  onInstall,
  onStart,
  onOpenInstaller,
  onRefresh,
}: Pick<
  RuntimeCardProps,
  "status" | "busy" | "onInstall" | "onStart" | "onOpenInstaller" | "onRefresh"
>) {
  if (status?.state === "not_installed") {
    return <button type="button" className={settingsButton} disabled={busy} onClick={onInstall}>Install</button>;
  }
  if (status?.state === "installed_stopped" || status?.state === "failed") {
    return <button type="button" className={settingsButton} disabled={busy} onClick={onStart}>{status.state === "failed" ? "Restart" : "Start"}</button>;
  }
  if (status?.state === "unsupported") {
    return <button type="button" className={settingsButton} onClick={onOpenInstaller}>Open installer</button>;
  }
  if (status?.state === "running") {
    return <button type="button" className={settingsButton} disabled={busy} onClick={onRefresh}>Refresh</button>;
  }
  return null;
}

export function OllamaModelsPanel({
  models,
  modelName,
  selectedModel,
  deleteArmed,
  busy,
  onModelNameChange,
  onPull,
  onSelect,
  onDelete,
  onDeleteBlur,
}: ModelsPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onPull();
  }

  return (
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>Models</div>
      <p className={settingsGroupHint}>
        Pull a model from Ollama, then choose which local model future AI actions use.
      </p>
      <form className="mb-3 flex gap-2 max-[620px]:flex-col" onSubmit={handleSubmit}>
        <input
          className={cn(settingsTextInput, "min-w-0 flex-1 max-[620px]:w-full")}
          value={modelName}
          disabled={busy}
          aria-label="Model name"
          placeholder="gemma3:4b"
          onChange={(event) => onModelNameChange(event.currentTarget.value)}
        />
        <button type="submit" className={settingsButton} disabled={busy || !modelName.trim()}>
          Pull model
        </button>
      </form>
      {models.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No local models yet. Enter a model name to pull one.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Local AI model"
          className="divide-y divide-border/60 rounded-xl border border-border"
        >
          {models.map((model) => (
            <ModelRow
              key={model.digest}
              model={model}
              selected={model.name === selectedModel}
              deleteArmed={deleteArmed === model.name}
              busy={busy}
              onSelect={onSelect}
              onDelete={onDelete}
              onDeleteBlur={onDeleteBlur}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  deleteArmed,
  busy,
  onSelect,
  onDelete,
  onDeleteBlur,
}: {
  model: LocalAiModel;
  selected: boolean;
  deleteArmed: boolean;
  busy: boolean;
  onSelect: (model: string) => void;
  onDelete: (model: string) => void;
  onDeleteBlur: (model: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onSelect(model.name)}
      >
        <span className="flex items-center gap-2 text-[13px] font-medium">
          <span
            className={cn(
              "h-2 w-2 rounded-full border",
              selected ? "border-foreground bg-foreground" : "border-muted-foreground/50",
            )}
          />
          <span className="truncate">{model.name}</span>
        </span>
        <span className="mt-0.5 block pl-4 text-[11px] text-muted-foreground">
          {[
            model.parameterSize,
            model.quantizationLevel,
            formatByteSize(model.sizeBytes),
            formatModelDate(model.modifiedAt),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      <button
        type="button"
        className={cn(settingsButton, deleteArmed && settingsButtonDanger)}
        disabled={busy}
        onBlur={() => onDeleteBlur(model.name)}
        onClick={() => onDelete(model.name)}
      >
        {deleteArmed ? "Confirm delete" : "Delete"}
      </button>
    </div>
  );
}

function formatModelDate(value: string): string | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? modelDate.format(timestamp) : null;
}
