import { Suspense } from "react";
import { NotesLayout } from "@/features/notes/components/notes-layout";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">Loading...</div>}>
      <NotesLayout />
    </Suspense>
  );
}
