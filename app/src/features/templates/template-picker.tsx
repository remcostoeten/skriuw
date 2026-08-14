import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createNoteFromTemplate } from "@/store/actions/workspace";
import { SearchIcon } from "@/shared/icons/static";
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
      onClose={() => setRequest(null)}
      onPick={(template) => {
        setRequest(null);
        createNoteFromTemplate(store, template, request.parentId);
      }}
    />
  );
}

type DialogProps = {
  onClose: () => void;
  onPick: (template: NoteTemplate) => void;
};

function propertyHint(template: NoteTemplate): string | null {
  const propertyTemplate = templatePropertyTemplate(template);
  if (propertyTemplate === null) {
    return null;
  }
  const count = propertyTemplate.properties.length;
  return `${count} ${count === 1 ? "field" : "fields"}`;
}

function TemplatePickerDialog({ onClose, onPick }: DialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const handleClose = () => onCloseRef.current();
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target === dialog) {
        dialog.close();
      }
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("pointerdown", handlePointerDown);
    dialog.showModal();
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const templates = useMemo(() => filterNoteTemplates(NOTE_TEMPLATES, query), [query]);
  const boundedIndex = Math.min(activeIndex, Math.max(templates.length - 1, 0));
  const activeTemplate = templates[boundedIndex];

  useEffect(() => {
    const activeElement = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${boundedIndex}"]`,
    );
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [boundedIndex]);

  function pick(template: NoteTemplate): void {
    dialogRef.current?.close();
    onPick(template);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Tab") {
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(templates.length > 0 ? Math.min(boundedIndex + 1, templates.length - 1) : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(boundedIndex - 1, 0));
    } else if (event.key === "Home" && templates.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && templates.length > 0) {
      event.preventDefault();
      setActiveIndex(templates.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeTemplate) {
        pick(activeTemplate);
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      className="inset-0 mx-auto mb-auto mt-[16vh] flex h-fit max-h-[56vh] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl shadow-black/40 backdrop:bg-black/55 backdrop:backdrop-blur-[1px]"
      aria-label="New note from template"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          dialogRef.current?.close();
        }
      }}
    >
      <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3 text-muted-foreground">
        <SearchIcon size={16} />
        <input
          autoFocus
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Choose a template..."
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeTemplate ? `${listboxId}-item-${boundedIndex}` : undefined
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
        className="min-h-0 overflow-y-auto p-1.5"
      >
        {templates.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            No templates for “{query}”
          </div>
        ) : (
          templates.map((template, index) => {
            const isActive = index === boundedIndex;
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

      <div className="flex items-center gap-4 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ navigate</span>
        <span>↵ create</span>
        <span className="ml-auto">esc close</span>
      </div>
    </dialog>
  );
}
