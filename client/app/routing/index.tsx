import { Routes, Route } from "react-router-dom";
import Index from "@/pages/Index";
import NoteEditor from "@/pages/note-editor";
import NotFound from "@/pages/not-found";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/note/:id" element={<NoteEditor />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}