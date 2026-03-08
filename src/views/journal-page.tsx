import { Suspense } from "react";
import { JournalPageLayout } from "@/features/journal";

export default function JournalPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">Loading...</div>}>
      <JournalPageLayout />
    </Suspense>
  );
}
