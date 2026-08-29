import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import type { LocalAiModel, LocalAiProgress, LocalAiStatus } from "@/contracts/ai";
import {
  ollamaOwnershipLabel,
  ollamaPendingButtonLabel,
  ollamaPendingDescription,
  ollamaPendingLabel,
  ollamaProgressPercent,
  ollamaProgressText,
  ollamaProgressTiming,
  ollamaStatusLabel,
  type OllamaRuntimeAction,
} from "@/features/ai/ollama-model";
import {
  OLLAMA_MODEL_CATALOG,
  ollamaUseCaseLabel,
  type OllamaCatalogModel,
  type OllamaSuggestedModelId,
} from "@/features/ai/ollama-model-catalog";
import { formatByteSize } from "@/shared/lib/format-bytes";
import { formatDuration } from "@/shared/lib/format-duration";
import { cn } from "@/shared/lib/utils";
import { CheckIcon, ChevronDownIcon } from "@/shared/icons/static";
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
  elapsedMs: number;
  sourceUrl: string | null;
  busy: boolean;
  pending: OllamaRuntimeAction | null;
  error: string | null;
  onInstall: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenInstaller: () => void;
  onRefresh: () => void;
  onCancel: () => void;
  onOpenSource: () => void;
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

const progressPanelVariants: Variants = {
  hidden: { opacity: 0, height: 0 },
  shown: {
    opacity: 1,
    height: "auto",
    transition: {
      height: { duration: 0.24, ease: [0.32, 0.72, 0, 1] },
      opacity: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
      delayChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: {
      height: { duration: 0.17, ease: [0.32, 0.72, 0, 1] },
      opacity: { duration: 0.1, ease: "easeOut" },
    },
  },
};

const progressContentVariants: Variants = {
  hidden: { opacity: 0, transform: "translateY(-4px)" },
  shown: {
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: { opacity: 0, transition: { duration: 0.08 } },
};

export function OllamaRuntimeCard({
  status,
  progress,
  elapsedMs,
  sourceUrl,
  busy,
  pending,
  error,
  onInstall,
  onStart,
  onStop,
  onOpenInstaller,
  onRefresh,
  onCancel,
  onOpenSource,
}: RuntimeCardProps) {
  const percent = ollamaProgressPercent(progress);
  const timing = ollamaProgressTiming(progress, elapsedMs);
  const reduceMotion = useReducedMotion();
  const pendingAction = pending ?? (status?.state === "starting" ? "start" : null);
  const pendingSeconds = usePendingSeconds(pendingAction);
  return (
    <div className={settingsGroup}>
      <div className={settingsGroupTitle}>Local runtime</div>
      <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <motion.span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full border",
              pendingAction
                ? "border-amber-500/40 bg-amber-500"
                : status?.state === "running"
                  ? "border-emerald-500/40 bg-emerald-500"
                  : status?.state === "failed"
                    ? "border-destructive/40 bg-destructive"
                    : "border-border bg-muted-foreground/45",
            )}
            animate={pendingAction ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
            transition={
              pendingAction
                ? { duration: 1.3, ease: "easeInOut", repeat: Infinity }
                : { duration: 0.15 }
            }
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1" aria-live="polite">
            <span className="block text-[13px] font-medium">
              {pendingAction
                ? ollamaPendingLabel(pendingAction)
                : status
                  ? ollamaStatusLabel(status)
                  : "Checking Ollama…"}
            </span>
            <span className={cn(settingsRowDescription, "block truncate")}>
              {pendingAction
                ? `${ollamaPendingDescription(pendingAction)}${
                    pendingSeconds > 0 ? ` · ${formatDuration(pendingSeconds)}` : ""
                  }`
                : status
                  ? ollamaOwnershipLabel(status)
                  : "No process or network work runs until this page opens."}
            </span>
          </span>
          <RuntimeAction
            status={status}
            busy={busy}
            pending={pendingAction}
            onInstall={onInstall}
            onStart={onStart}
            onStop={onStop}
            onOpenInstaller={onOpenInstaller}
            onRefresh={onRefresh}
          />
        </div>
        <AnimatePresence initial={false}>
          {!progress && pendingAction ? (
            <motion.div
              key="pending"
              className="overflow-hidden"
              variants={reduceMotion ? undefined : progressPanelVariants}
              initial={reduceMotion ? { opacity: 0 } : "hidden"}
              animate={reduceMotion ? { opacity: 1 } : "shown"}
              exit={reduceMotion ? { opacity: 0 } : "exit"}
            >
              <div className="border-t border-border px-3.5 py-3">
                <IndeterminateBar label={ollamaPendingLabel(pendingAction)} />
              </div>
            </motion.div>
          ) : null}
          {progress ? (
            <motion.div
              key="progress"
              className="overflow-hidden"
              variants={reduceMotion ? undefined : progressPanelVariants}
              initial={reduceMotion ? { opacity: 0 } : "hidden"}
              animate={reduceMotion ? { opacity: 1 } : "shown"}
              exit={reduceMotion ? { opacity: 0 } : "exit"}
            >
              <motion.div
                className="border-t border-border px-3.5 py-2.5"
                variants={reduceMotion ? undefined : progressContentVariants}
              >
                <div
                  className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
                  aria-live="polite"
                >
                  <span>
                    {ollamaProgressText(progress)}
                    {timing ? ` · ${timing}` : ""}
                  </span>
                  {busy ? (
                    <button
                      type="button"
                      className="-my-0.5 -mr-1 shrink-0 rounded-md px-1.5 py-0.5 font-[560] text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
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
                      className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-linear motion-reduce:transition-none"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                ) : null}
                {sourceUrl ? (
                  <button
                    type="button"
                    className="mt-1.5 text-[11px] font-medium text-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
                    onClick={onOpenSource}
                  >
                    View source
                  </button>
                ) : null}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
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
  pending,
  onInstall,
  onStart,
  onStop,
  onOpenInstaller,
  onRefresh,
}: Pick<
  RuntimeCardProps,
  | "status"
  | "busy"
  | "pending"
  | "onInstall"
  | "onStart"
  | "onStop"
  | "onOpenInstaller"
  | "onRefresh"
>) {
  if (pending) {
    return (
      <button type="button" className={settingsButton} disabled>
        <PendingSpinner />
        {ollamaPendingButtonLabel(pending)}
      </button>
    );
  }
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
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {status.managed ? (
          <button
            type="button"
            className={cn(settingsButton, settingsButtonDanger)}
            disabled={busy}
            onClick={onStop}
          >
            Stop
          </button>
        ) : null}
        <button type="button" className={settingsButton} disabled={busy} onClick={onRefresh}>
          Refresh
        </button>
      </span>
    );
  }
  return null;
}

function PendingSpinner() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-full border-[1.5px] border-current border-t-transparent opacity-70"
      animate={{ transform: "rotate(360deg)" }}
      transition={{ duration: reduceMotion ? 1.6 : 0.75, ease: "linear", repeat: Infinity }}
    />
  );
}

function IndeterminateBar({ label }: { label: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuetext="In progress"
      className="h-1 overflow-hidden rounded-full bg-muted"
    >
      <motion.div
        className="h-full w-1/3 rounded-full bg-foreground/75"
        animate={
          reduceMotion
            ? { opacity: [0.4, 1, 0.4], transform: "translateX(100%)" }
            : { transform: ["translateX(-100%)", "translateX(300%)"] }
        }
        transition={{
          duration: reduceMotion ? 1.6 : 1.15,
          ease: reduceMotion ? "easeInOut" : [0.65, 0, 0.35, 1],
          repeat: Infinity,
        }}
      />
    </div>
  );
}

function usePendingSeconds(pending: OllamaRuntimeAction | null): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!pending) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [pending]);
  return seconds;
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
        <SuggestedModelsMenu
          disabled={busy}
          installed={new Set(models.map((model) => model.name))}
          onPick={onModelNameChange}
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

function SuggestedModelsMenu({
  disabled,
  installed,
  onPick,
}: {
  disabled: boolean;
  installed: ReadonlySet<string>;
  onPick: (model: OllamaSuggestedModelId) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(index: number): void {
    const option = OLLAMA_MODEL_CATALOG[index];
    if (option) {
      onPick(option.id);
    }
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent): void {
    if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
      return;
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        setActiveIndex(0);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % OLLAMA_MODEL_CATALOG.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + OLLAMA_MODEL_CATALOG.length) % OLLAMA_MODEL_CATALOG.length,
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Suggested models"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        className={cn(settingsButton, "gap-1")}
        onClick={() => {
          if (open) {
            setOpen(false);
            return;
          }
          setActiveIndex(0);
          setOpen(true);
        }}
      >
        Suggestions
        <ChevronDownIcon
          size={13}
          aria-hidden="true"
          className={cn("transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested models"
          tabIndex={-1}
          className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-[320px] w-[300px] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none"
        >
          {OLLAMA_MODEL_CATALOG.map((option, index) => (
            <SuggestedModelOption
              key={option.id}
              option={option}
              active={index === activeIndex}
              installedName={installed.has(option.id) ? option.id : null}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SuggestedModelOption({
  option,
  active,
  installedName,
  onPointerEnter,
  onClick,
}: {
  option: OllamaCatalogModel;
  active: boolean;
  installedName: string | null;
  onPointerEnter: () => void;
  onClick: () => void;
}) {
  return (
    <li
      role="option"
      aria-selected={installedName !== null}
      data-active={active}
      className={cn(
        "flex cursor-pointer select-none flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
        "data-[active=true]:bg-accent",
      )}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {installedName !== null && <CheckIcon size={13} />}
        </span>
        {option.label}
        <span className="text-[10px] font-normal text-muted-foreground">
          {ollamaUseCaseLabel(option.useCase)} · {option.approxSize}
        </span>
      </span>
      <span className="pl-5 text-[11px] leading-[1.35] text-muted-foreground">
        {option.description}
      </span>
    </li>
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
