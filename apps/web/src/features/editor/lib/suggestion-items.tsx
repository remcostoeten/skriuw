import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
  SuggestionMenu as SuggestionMenuExtension,
} from "@blocknote/core/extensions";
import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  Code,
  FolderTree,
  Link2,
  ListChecks,
  PenTool,
  ScrollText,
  SpellCheck,
  Tag,
  Tags,
  Wand2,
} from "lucide-react";
import { DEFAULT_FILE_TREE_SOURCE } from "@/shared/lib/file-tree";
import {
  extractNoteTags,
  getNoteSearchableContent,
  getNoteTitle,
} from "@/domain/notes/note-links";
import type { AiAction } from "@/features/ai/service";
import type { Person } from "@/domain/people/models";
import type { NoteFile } from "@/types/notes";
import type { EditorInstance } from "./editor-instance";

export function insertTagChip(editor: EditorInstance, name: string) {
  const trimmed = name.trim().replace(/^#/, "");
  if (!trimmed) return;
  // biome-ignore lint/suspicious/noExplicitAny: custom inline content type
  editor.insertInlineContent([
    { type: "tag", props: { name: trimmed } } as any,
    " ",
  ]);
}

export function insertNoteLinkChip(editor: EditorInstance, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return;
  // biome-ignore lint/suspicious/noExplicitAny: custom inline content type
  editor.insertInlineContent([
    { type: "noteLink", props: { title: trimmed } } as any,
    " ",
  ]);
}

export function insertPersonChip(editor: EditorInstance, person: Person) {
  const name = person.name.trim();
  if (!person.id || !name) return;
  editor.insertInlineContent([
    // biome-ignore lint/suspicious/noExplicitAny: custom inline content type
    { type: "person", props: { id: person.id, name } } as any,
    " ",
  ]);
}

export function openNoteMentionMenu(editor: EditorInstance) {
  const suggestionMenu = editor.getExtension?.(SuggestionMenuExtension);
  if (!suggestionMenu) {
    editor.insertInlineContent("@", { updateSelection: true });
    return;
  }

  suggestionMenu.openSuggestionMenu("@", {
    deleteTriggerCharacter: true,
    ignoreQueryLength: true,
  });
}

export function getTagMenuItems(
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
    normalizedQuery.length > 0 &&
    !tags.some((tag) => tag.toLowerCase() === normalizedQuery);

  // Existing matches first, "create" last — same ordering as the "@" note
  // menu, so a stray Enter never creates something new by accident.
  return [
    ...filterSuggestionItems(existingItems, normalizedQuery),
    ...(shouldOfferCreate
      ? [
          {
            title: normalizedQuery,
            subtext: "Create tag",
            group: "Create",
            onItemClick: () => {
              insertTagChip(editor, normalizedQuery);
            },
          },
        ]
      : []),
  ];
}

export function getPersonMentionMenuItems(
  editor: EditorInstance,
  people: Person[],
  query: string,
  onCreatePerson?: (name: string) => Promise<Person | null>,
): DefaultReactSuggestionItem[] {
  const normalizedQuery = query.trim().replace(/^\$/, "");
  const existingItems: DefaultReactSuggestionItem[] = people.map((person) => ({
    title: person.name,
    subtext: "Person",
    group: "People",
    onItemClick: () => {
      insertPersonChip(editor, person);
    },
  }));

  const shouldOfferCreate =
    Boolean(onCreatePerson) &&
    normalizedQuery.length > 0 &&
    !people.some(
      (person) => person.name.toLowerCase() === normalizedQuery.toLowerCase(),
    );

  // Existing matches first, "create" last — same ordering as the "@" note
  // menu, so a stray Enter never creates something new by accident.
  return [
    ...filterSuggestionItems(existingItems, normalizedQuery),
    ...(shouldOfferCreate
      ? [
          {
            title: normalizedQuery,
            subtext: "Add person",
            group: "Create",
            onItemClick: () => {
              void onCreatePerson?.(normalizedQuery).then((person) => {
                if (person) insertPersonChip(editor, person);
              });
            },
          },
        ]
      : []),
  ];
}

export function getNoteMentionMenuItems(
  editor: EditorInstance,
  files: NoteFile[],
  activeFileId: string | undefined,
  query: string,
  onCreate: (title: string) => void,
): DefaultReactSuggestionItem[] {
  const existingItems: DefaultReactSuggestionItem[] = files
    .filter((file) => file.id !== activeFileId)
    .map((file) => {
      const title = getNoteTitle(file);
      const tags = extractNoteTags(getNoteSearchableContent(file));
      return {
        title,
        subtext: tags.length ? `#${tags.slice(0, 2).join(" #")}` : "Note",
        group: "Notes",
        onItemClick: () => {
          insertNoteLinkChip(editor, title);
        },
      };
    });

  const filtered = filterSuggestionItems(existingItems, query);
  const trimmedQuery = query.trim();
  const hasExactMatch =
    trimmedQuery.length > 0 &&
    existingItems.some(
      (item) => item.title.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  if (trimmedQuery.length > 0 && !hasExactMatch) {
    return [
      ...filtered,
      {
        title: trimmedQuery,
        subtext: "Create new note and link",
        group: "Create",
        onItemClick: () => {
          onCreate(trimmedQuery);
          insertNoteLinkChip(editor, trimmedQuery);
        },
      },
    ];
  }

  return filtered;
}

export function getCustomSlashMenuItems(
  editor: EditorInstance,
  onAiSpellCheck?: () => void,
  onAiContinueWriting?: () => void,
  onAiAction?: (action: AiAction) => void,
  onOpenCustomPrompt?: () => void,
): DefaultReactSuggestionItem[] {
  const aiItems: DefaultReactSuggestionItem[] =
    onAiSpellCheck && onAiContinueWriting
      ? [
          {
            title: "Spell Check",
            aliases: ["ai", "spell", "fix", "grammar"],
            group: "AI",
            icon: <SpellCheck size={16} />,
            subtext: "Fix spelling and grammar with AI",
            onItemClick: onAiSpellCheck,
          },
          {
            title: "Continue Writing",
            aliases: ["ai", "continue", "expand", "write"],
            group: "AI",
            icon: <PenTool size={16} />,
            subtext: "Expand content with AI",
            onItemClick: onAiContinueWriting,
          },
        ]
      : [];

  if (onAiAction) {
    aiItems.push(
      {
        title: "Summarize",
        aliases: ["ai", "summary", "tldr", "summarize"],
        group: "AI",
        icon: <ScrollText size={16} />,
        subtext: "Append an AI summary of this note",
        onItemClick: () => onAiAction("summarize"),
      },
      {
        title: "Extract tasks",
        aliases: ["ai", "tasks", "todo", "action", "items"],
        group: "AI",
        icon: <ListChecks size={16} />,
        subtext: "Pull action items out of this note",
        onItemClick: () => onAiAction("extractTasks"),
      },
      {
        title: "Suggest tags",
        aliases: ["ai", "tags", "label", "topics"],
        group: "AI",
        icon: <Tags size={16} />,
        subtext: "Get AI tag suggestions for this note",
        onItemClick: () => onAiAction("suggestTags"),
      },
    );
  }

  if (onOpenCustomPrompt) {
    aiItems.push({
      title: "Ask AI…",
      aliases: ["ai", "prompt", "ask", "custom", "instruction"],
      group: "AI",
      icon: <Wand2 size={16} />,
      subtext: "Give the AI a free-form instruction",
      onItemClick: onOpenCustomPrompt,
    });
  }

  return [
    ...getDefaultReactSlashMenuItems(editor),
    {
      title: "Code block",
      aliases: ["code", "fence", "syntax"],
      group: "Structure",
      icon: <Code size={16} />,
      subtext: "Insert a code block with syntax highlighting",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "procode",
          props: { language: "typescript", title: "" },
          // biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
        } as any);
      },
    },
    {
      title: "File tree",
      aliases: ["tree", "folder", "files", "map", "directory"],
      group: "Structure",
      icon: <FolderTree size={16} />,
      subtext: "Insert a readable file map",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "fileTree",
          props: { source: DEFAULT_FILE_TREE_SOURCE },
          // biome-ignore lint/suspicious/noExplicitAny: schema-flexible block
        } as any);
      },
    },
    {
      title: "Tag",
      aliases: ["tag", "label", "hash"],
      icon: <Tag size={16} />,
      group: "Connect",
      subtext: "Insert a tag marker",
      onItemClick: () => {
        editor.insertInlineContent("#", { updateSelection: true });
      },
    },
    {
      title: "Link note",
      aliases: ["mention", "backlink", "wiki"],
      icon: <Link2 size={16} />,
      group: "Connect",
      subtext: "Mention another note",
      onItemClick: () => {
        openNoteMentionMenu(editor);
      },
    },
    ...aiItems,
  ];
}
