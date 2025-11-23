import { Routes, Route } from "react-router-dom";
import Index from "@/pages/Index";
import NoteEditor from "@/pages/NoteEditor";
import NotFound from "@/pages/NotFound";
import _UIPlayground from "@/pages/_ui-playground";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/note/:id" element={<NoteEditor />} />
      <Route path="/_ui-playground" element={<_UIPlayground />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}