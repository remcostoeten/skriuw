"use client";

import { useEffect, useMemo, useCallback, useId, useRef, useState } from "react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { cn } from "@/shared/lib/utils";
import type { NoteFile, RichTextDocument } from "@/types/notes";
import { extractNoteTags, getNoteTitle, getWorkspaceTags } from "@/features/notes/lib/note-links";
import {
  cloneRichDocument,
  flattenInlineChips,
  markdownToRichDocument,
  upgradeRichDocumentChips,
} from "@/shared/lib/rich-document";
import { editorSchema } from "./inline-specs/schema";
import { NoteLinkProvider } from "./inline-specs/note-link-context";

// biome-ignore lint/suspicious/noExplicitAny: editor type with custom schema requires deep inference
type EditorInstance = any;

interface RichTextEditorProps {
  content: string;
  richContent?: RichTextDocument;
  files?: NoteFile[];
  activeFileId?: string;
  onChange: (next: { markdown: string; richContent: RichTextDocument }) => void;
}

async function blocksToMarkdown(editor: EditorInstance): Promise<string> {
  try {
    const flattened = flattenInlineChips(editor.document);
    // biome-ignore lint/suspicious/noExplicitAny: blocksToMarkdownLossy accepts schema-shaped blocks
    const markdown = await editor.blocksToMarkdownLossy(flattened as any);
    return markdown;
  } catch {
    return "";
  }
}

function KeyboardAccessibleSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const menuId = useId();
  const [activeIndex, setActiveIndex] = useState(selectedIndex ?? 0);

  useEffect(() => {
    setActiveIndex(selectedIndex ?? 0);
  }, [selectedIndex, items.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const suggestionMenu = document.getElementById(menuId);
      if (!suggestionMenu || items.length === 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest(".blocknote-wrapper")) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((prev) => (prev + 1) % items.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(items.length - 1);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(0);
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[activeIndex];
        if (!item) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onItemClick?.(item);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [activeIndex, items, menuId, onItemClick]);

  useEffect(() => {
    const activeItem = document.getElementById(`${menuId}-item-${activeIndex}`);
    activeItem?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, menuId]);

  if (loadingState === "loading-initial" || loadingState === "loading") {
    return null;
  }

  return (
    <div
      id={menuId}
      role="listbox"
      aria-label="Editor suggestions"
      aria-activedescendant={`${menuId}-item-${activeIndex}`}
      className="bn-suggestion-menu z-[100] max-h-[min(24rem,50vh)] overflow-y-auto rounded-md border border-border bg-card p-1 shadow-xl"
    >
      {items.map((item, index) => (
        <button
          key={`${item.title}-${index}`}
          id={`${menuId}-item-${index}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => onItemClick?.(item)}
          className={cn(
            "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors",
            index === activeIndex
              ? "bg-accent text-accent-foreground"
              : "text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
          )}
        >
          {item.icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{item.icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{item.title}</span>
            {item.subtext ? (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtext}</span>
            ) : null}
          </span>
          {item.badge ? (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function insertTagChip(editor: EditorInstance, name: string) {
  const trimmed = name.trim().replace(/^#/, "");
  if (!trimmed) return;
  // biome-ignore lint/suspicious/noExplicitAny: custom inline content type
  editor.insertInlineContent([{ type: "tag", props: { name: trimmed } } as any, " "]);
}

function insertNoteLinkChip(editor: EditorInstance, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  // biome-ignore lint/suspicious/noExplicitAny: custom inline content type
  editor.insertInlineContent([{ type: "noteLink", props: { title: trimmed } } as any, " "]);
}

function getTagMenuItems(
  editor: EditorInstance,
  tags: string[],
  query: string,
): DefaultReactSuggestionItem[] {
  const normalizedQuery = query.trim().replace(/^#/, "").toLowerCase();
  const existingItems: DefaultReactSuggestionItem[] = tags.map((tag) => ({
    title: tag,
    subtext: "Tag",
    group: "Tags",
    onItemClick: () => {
      insertTagChip(editor, tag);
    },
  }));

  const shouldOfferCreate =
    normalizedQuery.length > 0 && !tags.some((tag) => tag.toLowerCase() === normalizedQuery);

  return [
    ...(shouldOfferCreate
      ? [
          {
            title: normalizedQuery,
            subtext: "Create tag",
            group: "Tags",
            onItemClick: () => {
              insertTagChip(editor, normalizedQuery);
            },
          },
        ]
      : []),
    ...filterSuggestionItems(existingItems, normalizedQuery),
  ];
}

function getNoteMentionMenuItems(
  editor: EditorInstance,
  files: NoteFile[],
  activeFileId: string | undefined,
): DefaultReactSuggestionItem[] {
  return files
    .filter((file) => file.id !== activeFileId)
    .map((file) => {
      const title = getNoteTitle(file);
      const tags = extractNoteTags(file.content);
      return {
        title,
        subtext: tags.length ? `#${tags.slice(0, 2).join(" #")}` : "Note",
        group: "Notes",
        onItemClick: () => {
          insertNoteLinkChip(editor, title);
        },
      };
    });
}

function getCustomSlashMenuItems(
  editor: EditorInstance,
  files: NoteFile[],
  activeFileId: string | undefined,
): DefaultReactSuggestionItem[] {
  const noteItems = getNoteMentionMenuItems(editor, files, activeFileId)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      title: `Link ${item.title}`,
      aliases: ["mention", "backlink", "link note", item.title],
      group: "Connect",
    }));

  return [
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: "Tag",
      aliases: ["tag", "label", "hash"],
      group: "Connect",
      subtext: "Insert a tag marker",
      onItemClick: () => {
        editor.insertInlineContent("#", { updateSelection: true });
      },
    },
    {
      title: "Link note",
      aliases: ["mention", "backlink", "wiki"],
      group: "Connect",
      subtext: "Insert a note link",
      onItemClick: () => {
        editor.insertInlineContent("[[", { updateSelection: true });
      },
    },
    ...noteItems,
  ];
}

export function RichTextEditor({
  content,
  richContent,
  files = [],
  activeFileId,
  onChange,
}: RichTextEditorProps) {
  const lastContentRef = useRef(content);
  const lastRichContentRef = useRef<string>(JSON.stringify(richContent ?? []));
  const pendingMarkdownRef = useRef(content);
  const isInternalChangeRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serializeRunIdRef = useRef(0);

  const initialBlocks = useMemo(
    () => {
      const base =
        richContent && richContent.length > 0 ? richContent : markdownToRichDocument(content);
      return upgradeRichDocumentChips(base);
    },
    [],
  );

  const editor = useCreateBlockNote({
    schema: editorSchema,
    initialContent: initialBlocks,
  });
  const workspaceTags = useMemo(() => getWorkspaceTags(files), [files]);

  const handleEditorChange = useCallback(async () => {
    if (!editor) return;

    const runId = ++serializeRunIdRef.current;
    const markdown = await blocksToMarkdown(editor);
    if (runId !== serializeRunIdRef.current) {
      return;
    }

    // biome-ignore lint/suspicious/noExplicitAny: schema-flexible blocks
    const nextRichContent = cloneRichDocument(editor.document as any);
    const nextRichContentKey = JSON.stringify(nextRichContent);
    pendingMarkdownRef.current = markdown;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (
        pendingMarkdownRef.current === lastContentRef.current &&
        nextRichContentKey === lastRichContentRef.current
      ) {
        return;
      }

      isInternalChangeRef.current = true;
      lastContentRef.current = pendingMarkdownRef.current;
      lastRichContentRef.current = nextRichContentKey;
      onChange({ markdown: pendingMarkdownRef.current, richContent: nextRichContent });

      window.setTimeout(() => {
        isInternalChangeRef.current = false;
      }, 80);
    }, 180);
  }, [editor, onChange]);

  useEffect(() => {
    if (!editor || isInternalChangeRef.current) return;
    const baseRichContent =
      richContent && richContent.length > 0 ? richContent : markdownToRichDocument(content);
    const nextRichContent = upgradeRichDocumentChips(baseRichContent);
    const nextRichContentKey = JSON.stringify(nextRichContent);
    if (content !== lastContentRef.current || nextRichContentKey !== lastRichContentRef.current) {
      // biome-ignore lint/suspicious/noExplicitAny: schema-shaped blocks
      editor.replaceBlocks(editor.document, nextRichContent as any);
      lastContentRef.current = content;
      lastRichContentRef.current = nextRichContentKey;
      pendingMarkdownRef.current = content;
    }
  }, [content, editor, richContent]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="blocknote-wrapper h-full min-h-full px-6 py-3">
      <NoteLinkProvider files={files} activeFileId={activeFileId}>
        <BlockNoteView
          editor={editor}
          onChange={handleEditorChange}
          theme="dark"
          className="h-full"
          slashMenu={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            suggestionMenuComponent={KeyboardAccessibleSlashMenu}
            getItems={async (query) =>
              filterSuggestionItems(getCustomSlashMenuItems(editor, files, activeFileId), query)
            }
          />
          <SuggestionMenuController
            triggerCharacter="@"
            suggestionMenuComponent={KeyboardAccessibleSlashMenu}
            getItems={async (query) =>
              filterSuggestionItems(getNoteMentionMenuItems(editor, files, activeFileId), query)
            }
          />
          <SuggestionMenuController
            triggerCharacter="#"
            suggestionMenuComponent={KeyboardAccessibleSlashMenu}
            getItems={async (query) => getTagMenuItems(editor, workspaceTags, query)}
          />
        </BlockNoteView>
      </NoteLinkProvider>
      <style jsx global>{`
        .blocknote-wrapper {
          --bn-colors-editor-background: hsl(var(--card));
          --bn-colors-editor-text: hsl(220 10% 82%);
          --bn-colors-menu-background: hsl(220 16% 6%);
          --bn-colors-menu-text: hsl(220 10% 82%);
          --bn-colors-tooltip-background: hsl(220 16% 6%);
          --bn-colors-tooltip-text: hsl(220 10% 82%);
          --bn-colors-hovered-background: hsl(220 12% 14%);
          --bn-colors-selected-background: hsl(220 12% 16%);
          --bn-colors-disabled-background: hsl(220 10% 15%);
          --bn-colors-disabled-text: hsl(220 8% 40%);
          --bn-colors-border: hsl(220 10% 15%);
          --bn-colors-side-menu: hsl(220 8% 40%);
          --bn-font-family: "Inter", system-ui, -apple-system, sans-serif;
          height: 100%;
          min-height: 100%;
          background: hsl(var(--card));
        }
        .blocknote-wrapper .bn-container,
        .blocknote-wrapper .bn-container [data-theming-css-variables-demo],
        .blocknote-wrapper .bn-scroller,
        .blocknote-wrapper .bn-editor-container {
          background: transparent !important;
        }
        .blocknote-wrapper .bn-editor {
          box-sizing: border-box;
          padding-left: 0;
          padding-right: 0;
          padding-top: 0;
          padding-bottom: 0;
          width: 100%;
          max-width: 42rem;
          margin: 0 auto;
          min-height: 100%;
          background: hsl(var(--card)) !important;
        }
        .blocknote-wrapper .bn-block-content {
          font-size: 0.9375rem;
          line-height: 1.7;
        }
        .blocknote-wrapper [data-content-type="heading"] {
          margin-top: 0.5rem;
          margin-bottom: 0.35rem;
        }
        .blocknote-wrapper .bn-block-group:first-child [data-content-type="heading"],
        .blocknote-wrapper .bn-block-group:first-child .bn-block-content[data-content-type="heading"] {
          margin-top: 0;
        }
        .blocknote-wrapper .bn-inline-content code {
          background: hsl(220 12% 14%);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
        }
        .blocknote-wrapper [data-note-link],
        .blocknote-wrapper [data-note-tag] {
          user-select: none;
          white-space: nowrap;
        }
        .blocknote-wrapper .bn-toolbar {
          min-height: 2rem;
          background: hsl(220 18% 8%) !important;
          border: 1px solid hsl(220 10% 18%) !important;
          box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.35),
            0 0 0 1px rgba(255, 255, 255, 0.03) inset;
          padding: 1px;
          gap: 1px;
          border-radius: 0.5rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root,
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
          min-height: 1.75rem;
          height: 1.75rem;
          background: transparent !important;
          color: hsl(220 10% 82%) !important;
          border-radius: 0.4rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root {
          padding-left: 0.45rem;
          padding-right: 0.45rem;
          font-size: 0.6875rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-section {
          margin-inline: 0.2rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root {
          width: 1.75rem;
          min-width: 1.75rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root:hover,
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root:hover,
        .blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root:hover {
          background: hsl(220 12% 15%) !important;
          color: hsl(220 14% 94%) !important;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Button-root[data-active="true"],
        .blocknote-wrapper .bn-toolbar .mantine-ActionIcon-root[data-active="true"],
        .blocknote-wrapper .bn-toolbar .mantine-UnstyledButton-root[data-active="true"] {
          background: hsl(220 14% 18%) !important;
          color: hsl(220 14% 96%) !important;
        }
        .blocknote-wrapper .bn-toolbar svg {
          width: 0.82rem;
          height: 0.82rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item {
          min-height: 1.75rem;
          height: 1.75rem;
          font-size: 0.75rem;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Menu-dropdown,
        .blocknote-wrapper .bn-toolbar .mantine-Popover-dropdown,
        .blocknote-wrapper .bn-toolbar .mantine-Tooltip-tooltip {
          background: hsl(220 18% 8%) !important;
          border: 1px solid hsl(220 10% 18%) !important;
          color: hsl(220 10% 82%) !important;
          box-shadow:
            0 16px 36px rgba(0, 0, 0, 0.42),
            0 0 0 1px rgba(255, 255, 255, 0.03) inset !important;
          backdrop-filter: none !important;
        }
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item:hover,
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-hovered],
        .blocknote-wrapper .bn-toolbar .mantine-Menu-item[data-selected] {
          background: hsl(220 12% 15%) !important;
          color: hsl(220 14% 94%) !important;
        }
        .blocknote-wrapper pre,
        .blocknote-wrapper pre code,
        .blocknote-wrapper [data-content-type="codeBlock"],
        .blocknote-wrapper [data-content-type="codeBlock"] * {
          white-space: pre-wrap !important;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .blocknote-wrapper pre {
          max-width: 100%;
          overflow-x: hidden;
        }
        /* Override any mantine styles */
        .blocknote-wrapper .mantine-Paper-root,
        .blocknote-wrapper [class*="mantine-"] {
          --mantine-color-body: hsl(var(--background));
        }
      `}</style>
    </div>
  );
}
