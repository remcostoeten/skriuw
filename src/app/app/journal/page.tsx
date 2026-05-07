import { Suspense } from "react";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";

export default function JournalPage() {
  return (
    <Suspense fallback={<WorkspaceLoadingShell variant="journal" />}>
      <JournalPageLayout />
    </Suspense>
  );
}
