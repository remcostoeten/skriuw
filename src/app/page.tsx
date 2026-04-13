import { Suspense } from "react";
import { NotesLayout } from "@/features/notes/components/notes-layout";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <NotesLayout />
    </Suspense>
  );
}
