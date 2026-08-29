import { useEffect, useId, useMemo, useState } from "react";
import { SearchIcon, CheckIcon } from "@/shared/icons/static";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import type { RendererStore } from "@/store/types";
import { setAiModelSelection } from "@/store/actions/settings";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { loadOllamaSnapshot } from "./ollama-bridge";
import { loadRemoteAiSnapshot } from "./remote-ai-bridge";
import {
  aiModelGroups,
  anyAiModelAvailable,
  type AiModelInventory,
  type AiModelOption,
  type AiProviderGroup,
} from "./model-options";
import {
  parseAiModelSelection,
  sameAiModel,
  selectRawAiModelSetting,
} from "./model-selection";
import { registerModelSwitcher } from "./model-switcher-controller";

type HostProps = {
  store: RendererStore;
  openAiSettings: () => void;
};

/**
 * Mounts the model switcher on demand. The dialog mounts fresh per request so
 * provider state is re-read each time it opens, and nothing loads — or
 * subscribes to anything — while the switcher is closed.
 */
export function ModelSwitcherHost({ store, openAiSettings }: HostProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => registerModelSwitcher(() => setOpen(true)), []);
  if (!open) {
    return null;
  }
  return (
    <ModelSwitcherDialog
      store={store}
      onClose={() => setOpen(false)}
      openAiSettings={() => {
        setOpen(false);
        openAiSettings();
      }}
    />
  );
}

type DialogProps = {
  store: RendererStore;
  onClose: () => void;
  openAiSettings: () => void;
};

function ModelSwitcherDialog({ store, onClose, openAiSettings }: DialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Switch AI model"
      showHeader={false}
      className="mx-auto mb-auto mt-[16vh] max-h-[56vh] w-[calc(100vw-1.5rem)] max-w-md overflow-hidden"
    >
      <ModelSwitcherBody store={store} openAiSettings={openAiSettings} />
    </Dialog>
  );
}

type SwitcherRow = {
  group: AiProviderGroup;
  option: AiModelOption;
};

function switcherRows(
  groups: readonly AiProviderGroup[],
  query: string,
): SwitcherRow[] {
  const rows = groups.flatMap((group) =>
    group.options.map((option) => ({ group, option })),
  );
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return rows;
  }
  return rows.filter(({ group, option }) =>
    `${group.label} ${option.label} ${option.modelId}`.toLowerCase().includes(needle),
  );
}

type BodyProps = {
  store: RendererStore;
  openAiSettings: () => void;
};

function ModelSwitcherBody({ store, openAiSettings }: BodyProps) {
  const [query, setQuery] = useState("");
  const [inventory, setInventory] = useState<AiModelInventory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listboxId = useId();
  const closeDialog = useDialogClose();
  const rawSelection = useRendererSelector(store, selectRawAiModelSetting);
  const selection = useMemo(() => parseAiModelSelection(rawSelection), [rawSelection]);

  // Reading remote provider state can prompt the OS keyring, so it happens
  // exactly once per explicit open of this dialog and is never polled.
  useEffect(() => {
    let active = true;
    void Promise.all([loadOllamaSnapshot(), loadRemoteAiSnapshot()])
      .then(([ollama, remote]) => {
        if (!active) return;
        setInventory({
          ollamaStatus: ollama.status,
          ollamaModels: ollama.models,
          remoteProviders: remote.providers,
          remoteModels: remote.models,
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadError(
          typeof reason === "object" && reason !== null && "message" in reason
            ? String(reason.message)
            : String(reason),
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(
    () => (inventory === null ? [] : aiModelGroups(inventory)),
    [inventory],
  );
  const rows = useMemo(() => switcherRows(groups, query), [groups, query]);

  const { activeIndex, listRef, onKeyDown, setActiveIndex } = useListboxNavigation({
    count: rows.length,
    onSelect: (index) => {
      const row = rows[index];
      if (row) {
        pick(row.option);
      }
    },
  });
  const activeRow = rows[activeIndex];

  function jumpToSettings(): void {
    closeDialog();
    openAiSettings();
  }

  function pick(option: AiModelOption): void {
    if (!option.available) {
      jumpToSettings();
      return;
    }
    closeDialog();
    setAiModelSelection(store, {
      providerId: option.providerId,
      modelId: option.modelId,
    });
  }

  const loaded = inventory !== null;
  const nothingAvailable = loaded && !anyAiModelAvailable(groups);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center gap-2.5 border-b border-border px-3.5 py-3 text-muted-foreground">
        <SearchIcon size={16} />
        <input
          autoFocus
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Choose a default model..."
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeRow ? `${listboxId}-item-${activeIndex}` : undefined
          }
        />
        <kbd className="flex-none rounded border border-border bg-muted px-[5px] py-px font-mono text-[10px] text-muted-foreground">
          Esc
        </kbd>
      </div>

      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="AI models"
        className="min-h-0 flex-auto overflow-y-auto p-1.5"
      >
        {!loaded ? (
          <div
            role="status"
            className="px-4 py-10 text-center text-[13px] text-muted-foreground"
          >
            {loadError ?? "Checking providers…"}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No models for “{query}”
          </div>
        ) : (
          rows.map((row, index) => {
            const isActive = index === activeIndex;
            const isSelected = sameAiModel(selection, {
              providerId: row.option.providerId,
              modelId: row.option.modelId,
            });
            const showHeader = index === 0 || rows[index - 1]?.group !== row.group;
            return (
              <div key={`${row.option.providerId}:${row.option.modelId}`}>
                {showHeader && (
                  <div className="px-2.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/60">
                    {row.group.label}
                  </div>
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  id={`${listboxId}-item-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isActive}
                  aria-disabled={!row.option.available}
                  className={`flex w-full cursor-pointer items-baseline gap-2.5 rounded-md border-none bg-transparent px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  } ${row.option.available ? "" : "opacity-60"}`}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => pick(row.option)}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 truncate text-[13px]">
                      {row.option.label}
                      {isSelected && <CheckIcon size={12} />}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {row.option.available
                        ? (row.option.detail ?? row.option.modelId)
                        : `${row.option.disabledReason ?? "Unavailable"} · fix in AI settings`}
                    </span>
                  </span>
                  {row.option.available && row.option.detail !== null && (
                    <span className="ml-auto flex-none text-[10px] text-muted-foreground/70">
                      {row.option.modelId}
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
        {nothingAvailable && (
          <div className="border-t border-border/60 px-3 py-3 text-[12px] text-muted-foreground">
            Nothing is ready to run yet — install Ollama or add a provider key.{" "}
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[12px] text-foreground underline underline-offset-2"
              onClick={jumpToSettings}
            >
              Open AI settings
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-none items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ navigate</span>
        <span>↵ set default</span>
        <span className="ml-auto">esc close</span>
      </div>
    </div>
  );
}
