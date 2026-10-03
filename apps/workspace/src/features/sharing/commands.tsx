import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { AppCommand } from "@/commands/registry";
import { targetNoteId } from "@/features/notes/target-note";
import { LinkIcon } from "@/shared/icons/static";
import { requestNoteShare } from "./share-dialog-controller";

export function sharingCommands(store: RendererStore): AppCommand[] {
  return [
    {
      id: "share-note-link",
      label: "Share note as a public link…",
      group: "Actions",
      keywords: ["share", "publish", "link", "public", "url", "web"],
      icon: <LinkIcon size={15} />,
      enabled: (state) => targetNoteId(state) !== null,
      run: () => {
        const noteId = targetNoteId(store.getState());
        if (noteId) {
          requestNoteShare(noteId);
        }
      },
    },
  ];
}
