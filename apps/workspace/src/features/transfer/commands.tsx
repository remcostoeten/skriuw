import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { shortcutDefinition } from "@/commands/bindings";
import type { AppCommand } from "@/commands/registry";
import { activateNote } from "@/features/notes/navigation";
import { focusedFolderId } from "@/features/notes/focus";
import { DownloadIcon, UploadIcon } from "@/shared/icons/static";
import {
  exportNoteAsMarkdown,
  exportWorkspaceAsMarkdown,
  importMarkdownFileIntoWorkspace,
  importMarkdownIntoWorkspace,
  importProviderExportIntoWorkspace,
} from "./actions";

/**
 * Runs the single-file import, targeting the sidebar's focused folder when
 * there is one. A single imported note switches to the notes view and opens,
 * matching the folder/archive import flows' hands-off default of just
 * reporting the result when more than one note lands.
 */
async function runImportMarkdownFile(
  store: RendererStore,
  navigate: (route: AppRoute) => void,
): Promise<void> {
  const initialDestinationFolderId = focusedFolderId(store.getState());
  const createdNoteIds = await importMarkdownFileIntoWorkspace(store, initialDestinationFolderId);
  const [noteId] = createdNoteIds ?? [];
  if (noteId !== undefined && createdNoteIds?.length === 1) {
    navigate("notes");
    activateNote(store, noteId);
  }
}

export function transferCommands(
  store: RendererStore,
  navigate: (route: AppRoute) => void,
): AppCommand[] {
  return [
    {
      id: "export-note-markdown",
      label: "Export note as Markdown…",
      group: "Actions",
      keywords: ["export", "markdown", "save", "file"],
      icon: <DownloadIcon size={15} />,
      enabled: (state) => state.activeNoteId !== null,
      run: () => {
        const noteId = store.getState().activeNoteId;
        if (noteId) {
          void exportNoteAsMarkdown(store, noteId);
        }
      },
    },
    {
      id: "export-workspace-markdown",
      label: "Export workspace as Markdown…",
      group: "Actions",
      keywords: ["export", "markdown", "backup", "all"],
      icon: <DownloadIcon size={15} />,
      enabled: (state) => state.nodes.size > 0,
      run: () => {
        void exportWorkspaceAsMarkdown(store);
      },
    },
    {
      id: "import-markdown-file",
      label: "Import markdown file…",
      group: "Actions",
      keywords: ["import", "markdown", "file", "single", "note"],
      icon: <UploadIcon size={15} />,
      shortcut: "importMarkdownFile",
      hint: shortcutDefinition("importMarkdownFile").description,
      run: () => {
        void runImportMarkdownFile(store, navigate);
      },
    },
    {
      id: "import-markdown",
      label: "Import notes from folder…",
      group: "Actions",
      keywords: [
        "import",
        "markdown",
        "migrate",
        "folder",
        "obsidian",
        "notion",
        "bear",
        "simplenote",
        "apple notes",
        "joplin",
      ],
      icon: <UploadIcon size={15} />,
      run: () => {
        void importMarkdownIntoWorkspace(store);
      },
    },
    {
      id: "import-provider-export",
      label: "Import provider export or files…",
      group: "Actions",
      keywords: [
        "import",
        "archive",
        "zip",
        "bear2bk",
        "notion",
        "simplenote",
        "csv",
        "json",
        "evernote",
        "enex",
        "keep",
        "standard notes",
      ],
      icon: <UploadIcon size={15} />,
      run: () => {
        void importProviderExportIntoWorkspace(store);
      },
    },
  ];
}
