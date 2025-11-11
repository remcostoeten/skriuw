import { NoteEditor } from "@/features/editor/components/NoteEditor";
import { AppLayout } from "@/layout/app-layout";

const README_NOTE_ID = "readme";

export default function Index() {
  return (
    <AppLayout sidebarActiveNoteId={README_NOTE_ID}>
      <NoteEditor
        noteId={README_NOTE_ID}
        showHeader={false}
        className="overflow-y-auto"
      />
    </AppLayout>
  );
}
