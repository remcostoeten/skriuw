import { Suspense } from "react";
import { NotesLayoutFallback } from "@/views/notes-layout-fallback";
import { NotesLayout } from "@/features/notes/components/notes-layout";

export default function HomePage() {
  return (
    <Suspense fallback={<NotesLayoutFallback />}>
      <NotesLayout />
    </Suspense>
  );
}
