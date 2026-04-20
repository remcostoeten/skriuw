import { Suspense } from "react";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";

function JournalPageFallback() {
  return null;
}

export default function JournalPage() {
  return (
    <Suspense fallback={<JournalPageFallback />}>
      <JournalPageLayout />
    </Suspense>
  );
}
