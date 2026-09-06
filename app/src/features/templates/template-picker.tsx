import { flushPendingWork } from "@/shell/pending-work";
import {
  personalTemplates,
  removePersonalTemplate,
} from "./personal-templates";
import { showToast } from "@/shared/ui/toast";
import { useEffect, useId, useMemo, useState } from "react";
import { createNoteFromTemplate } from "@/store/actions/workspace";
import { SearchIcon } from "@/shared/icons/static";
import { Dialog, useDialogClose } from "@/shared/ui/dialog";
import { useListboxNavigation } from "@/shared/ui/use-listbox-navigation";
import type { RendererStore } from "@/store/types";
import {
  NOTE_TEMPLATES,
  filterNoteTemplates,
  templatePropertyTemplate,
  type NoteTemplate,
} from "./note-templates";
import {
  registerTemplatePicker,
  type TemplatePickerRequest,
} from "./template-picker-controller";

type HostProps = {
  store: RendererStore;
};

async function createPickedTemplate(
  store: RendererStore,
  template: NoteTemplate,
  parentId: string | null,
): Promise<void> {
  if (template.sourceNoteId) {
    await flushPendingWork();
    const current = personalTemplates(store.getState()).find(
      (entry) => entry.sourceNoteId === template.sourceNoteId,
    );
    if (!current)
      throw new Error("The template source is no longer available.");
    template = current;
  }
  await createNoteFromTemplate(
    store,
    template,
    parentId ?? template.defaultParentId ?? null,
  );
}

/**
 * Mounts the template picker on demand. The dialog mounts fresh per request so
 * query and selection always start clean, and nothing renders — or subscribes
 * to anything — while the picker is closed.
 */
export function TemplatePickerHost({ store }: HostProps) {
  const [request, setRequest] = useState<TemplatePickerRequest | null>(null);
  useEffect(() => registerTemplatePicker(setRequest), []);
  if (request === null) {
    return null;
  }
  return (
    <TemplatePickerDialog
      store={store}
      onClose={() => setRequest(null)}
      onPick={(template) => {
        setRequest(null);
        void createPickedTemplate(store, template, request.parentId).catch(
          (error: unknown) => showToast({ message: String(error) }),
        );
      }}
    />
  );
}

type DialogProps = {
  store: RendererStore;
  onClose: () => void;
  onPick: (template: NoteTemplate) => void;
};

function propertyHint(template: NoteTemplate): string | null {
  const propertyTemplate = templatePropertyTemplate(template);
  if (propertyTemplate === null) {
    return null;
  }
  const count = propertyTemplate.properties.length;
  return count === 0 ? null : `${count} ${count === 1 ? "field" : "fields"}`;
}

function TemplatePickerDialog({ store, onClose, onPick }: DialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="New note from template"
      showHeader={false}
      className="mx-auto mb-auto mt-[16vh] max-h-[56vh] w-[calc(100vw-1.5rem)] max-w-md overflow-hidden"
    >
      <TemplatePickerBody store={store} onPick={onPick} />
    </Dialog>
  );
}

type BodyProps = {
  store: RendererStore;
  onPick: (template: NoteTemplate) => void;
};

function TemplatePickerBody({ store, onPick }: BodyProps) {
  const [personal, setPersonal] = useState(() =>
    personalTemplates(store.getState()),
  );
  const [query, setQuery] = useState("");
  const listboxId = useId();
  const closeDialog = useDialogClose();

  const templates = useMemo(
    () => filterNoteTemplates([...personal, ...NOTE_TEMPLATES], query),
    [personal, query],
  );

  const { activeIndex, listRef, onKeyDown, setActiveIndex } =
    useListboxNavigation({
      count: templates.length,
      onSelect: (index) => {
        const template = templates[index];
        if (template) {
          pick(template);
        }
      },
    });
  const activeTemplate = templates[activeIndex];

  function pick(template: NoteTemplate): void {
    closeDialog();
    onPick(template);
  }

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
          placeholder="Choose a template..."
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeTemplate ? `${listboxId}-item-${activeIndex}` : undefined
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
        aria-label="Note templates"
        className="min-h-0 flex-auto overflow-y-auto p-1.5"
      >
        {templates.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No templates for “{query}”
          </div>
        ) : (
          templates.map((template, index) => {
            const isActive = index === activeIndex;
            const hint = propertyHint(template);
            return (
              <button
                key={template.id}
                type="button"
                tabIndex={-1}
                id={`${listboxId}-item-${index}`}
                data-index={index}
                role="option"
                aria-selected={isActive}
                className={`flex w-full cursor-pointer items-baseline gap-2.5 rounded-md border-none bg-transparent px-2.5 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => pick(template)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px]">{template.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {template.description}
                  </span>
                </span>
                {hint && (
                  <span className="ml-auto flex-none text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {hint}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex flex-none items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        {activeTemplate?.sourceNoteId && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              void removePersonalTemplate(store, activeTemplate.sourceNoteId!)
                .then(() => {
                  setPersonal(personalTemplates(store.getState()));
                  setActiveIndex(0);
                })
                .catch((error: unknown) =>
                  showToast({ message: String(error) }),
                );
            }}
          >
            Remove template
          </button>
        )}
        <span>↑↓ navigate</span>
        <span>↵ create</span>
        <span className="ml-auto">esc close</span>
      </div>
    </div>
  );
}
