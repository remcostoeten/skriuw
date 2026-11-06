import { aiEditorExtension } from "@/features/ai/editor-extension";
import { createDatabaseNodeView } from "@/features/database/embed";
import { provideEditorExtension, type EditorExtension } from "@/features/editor/extensions";
import { mediaEditorExtension } from "@/features/media/image-dialogs";
import { referenceEditorExtension } from "@/features/references/editor";

const databaseEditorExtension: EditorExtension = {
  nodeViews: (store) => ({ nodeViews: { database_view: createDatabaseNodeView(store) } }),
};

export function installEditorExtensions(): void {
  provideEditorExtension(databaseEditorExtension);
  provideEditorExtension(referenceEditorExtension);
  provideEditorExtension(mediaEditorExtension);
  provideEditorExtension(aiEditorExtension);
}
