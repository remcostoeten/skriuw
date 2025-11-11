import { useParams, useNavigate } from "react-router-dom";
import { NoteEditor as NoteEditorComponent } from "@/features/editor/components/NoteEditor";
import { AppLayout } from "@/layout/app-layout";

export default function NoteEditor() {
  const { id } = useParams();
  return (
    <AppLayout sidebarActiveNoteId={id}>
      <NoteEditorComponent noteId={id} />
    </AppLayout>
  );
}
