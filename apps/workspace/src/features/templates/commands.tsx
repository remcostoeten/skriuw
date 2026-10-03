import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { onRoute, type AppCommand } from "@/commands/registry";
import { targetNoteId } from "@/features/notes/target-note";
import { NewNoteIcon } from "@/shared/icons/static";
import { showToast } from "@/shared/ui/toast";
import { savePersonalTemplate } from "./personal";
import { requestTemplatePicker } from "./picker";

const onNotesRoute = onRoute("notes");

export function templateCommands(store: RendererStore): AppCommand[] {
  return [
    {
      id: "save-note-as-template",
      label: "Save note as template",
      group: "Actions",
      keywords: ["personal", "template", "reuse"],
      enabled: (state, ui) => onNotesRoute(state, ui) && targetNoteId(state) !== null,
      run: () => {
        const id = targetNoteId(store.getState());
        if (!id) return;
        void savePersonalTemplate(store, id)
          .then(() =>
            showToast({
              message:
                "Template saved. Edit this note to update it. Use {{date}} for today’s date.",
            }),
          )
          .catch((error: unknown) => showToast({ message: String(error) }));
      },
    },
    {
      id: "new-note-from-template",
      label: "New note from template…",
      group: "Actions",
      keywords: ["create", "template", "daily", "meeting", "scaffold"],
      icon: <NewNoteIcon size={15} />,
      shortcut: "createNoteFromTemplate",
      enabled: onNotesRoute,
      run: () => requestTemplatePicker(null),
    },
  ];
}
