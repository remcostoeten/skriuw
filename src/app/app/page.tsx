import { Suspense } from "react";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";

export default function AppHomePage() {
  return (
    <Suspense fallback={<WorkspaceLoadingShell variant="notes" />}>
      <NotesLayout />
    </Suspense>
  );
}
