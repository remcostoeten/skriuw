import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { listFolders } from "@/domain/folders/api";
import { listNotes } from "@/domain/notes/api";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";

export default async function AppHomePage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: notesKeys.files(),
      queryFn: () => listNotes(),
    }),
    queryClient.prefetchQuery({
      queryKey: notesKeys.folders(),
      queryFn: () => listFolders(),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<WorkspaceLoadingShell variant="notes" />}>
        <NotesLayout />
      </Suspense>
    </HydrationBoundary>
  );
}
