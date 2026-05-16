import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { listJournalEntries, listJournalTags } from "@/domain/journal/api";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";

export default async function JournalPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: journalKeys.entries(),
      queryFn: () => listJournalEntries(),
    }),
    queryClient.prefetchQuery({
      queryKey: journalKeys.tags(),
      queryFn: () => listJournalTags(),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<WorkspaceLoadingShell variant="journal" />}>
        <JournalPageLayout />
      </Suspense>
    </HydrationBoundary>
  );
}
