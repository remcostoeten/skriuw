import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { onRoute, type AppCommand } from "@/commands/registry";
import { toggleAnnotateMode } from "@/features/editor/annotate-mode";
import { toggleEditorMode } from "@/features/editor/editor-mode";
import { updateSetting } from "@/features/settings/update-settings";
import {
  dimsFocusParagraphs,
  usesTypewriterScrolling,
  usesVimMode,
} from "@/features/settings/settings-model";
import {
  AlignCenterIcon,
  FileTextIcon,
  KeyboardIcon,
  PencilIcon,
  PilcrowIcon,
  ReplaceIcon,
  SearchIcon,
} from "@/shared/icons/static";
import { openEditorSearch, openEditorSearchAndReplace } from "./search-controller";

const onNotesRoute = onRoute("notes");

export function editorCommands(store: RendererStore): AppCommand[] {
  return [
    {
      id: "toggle-editor-mode",
      label: "Toggle raw Markdown mode",
      group: "Actions",
      keywords: ["raw", "markdown", "source", "editor"],
      icon: <FileTextIcon size={15} />,
      shortcut: "toggleEditorMode",
      enabled: (state) => state.activeNoteId !== null,
      run: () => {
        const noteId = store.getState().activeNoteId;
        if (!noteId) {
          return;
        }
        toggleEditorMode(store, noteId);
      },
    },
    {
      id: "toggle-vim-mode",
      label: "Toggle Vim mode",
      group: "Actions",
      keywords: ["vim", "modal", "keybindings", "normal", "insert", "motions"],
      icon: <KeyboardIcon size={15} />,
      shortcut: "toggleVimMode",
      run: () => {
        updateSetting(store, "vimMode", !usesVimMode(store.getState().settings));
      },
    },
    {
      id: "toggle-typewriter-scrolling",
      label: "Toggle typewriter scrolling",
      group: "Actions",
      keywords: ["typewriter", "centre", "center", "caret", "scroll", "writing"],
      icon: <AlignCenterIcon size={15} />,
      shortcut: "toggleTypewriterScrolling",
      run: () => {
        updateSetting(
          store,
          "typewriterScrolling",
          !usesTypewriterScrolling(store.getState().settings),
        );
      },
    },
    {
      id: "toggle-focus-dim",
      label: "Toggle dimming other paragraphs in focus mode",
      group: "Actions",
      keywords: ["focus", "dim", "fade", "paragraph", "sentence", "writing"],
      icon: <PilcrowIcon size={15} />,
      run: () => {
        updateSetting(store, "focusDimParagraphs", !dimsFocusParagraphs(store.getState().settings));
      },
    },
    {
      id: "annotate-note",
      label: "Annotate note",
      group: "Actions",
      keywords: ["draw", "annotate", "ink", "pen", "highlight", "sketch"],
      icon: <PencilIcon size={15} />,
      shortcut: "toggleAnnotateMode",
      enabled: (state) => state.activeNoteId !== null,
      run: () => toggleAnnotateMode(store),
    },
    {
      id: "find-in-note",
      label: "Find in note",
      group: "Editor",
      keywords: ["search", "replace", "find"],
      icon: <SearchIcon size={15} />,
      shortcut: "findInNote",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: openEditorSearch,
    },
    {
      id: "find-and-replace-in-note",
      label: "Find and replace in note",
      group: "Editor",
      keywords: ["search", "replace", "substitute", "find"],
      icon: <ReplaceIcon size={15} />,
      shortcut: "findAndReplaceInNote",
      enabled: (state, ui) => onNotesRoute(state, ui) && state.activeNoteId !== null,
      run: openEditorSearchAndReplace,
    },
  ];
}
