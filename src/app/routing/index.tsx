import { Routes, Route } from "react-router-dom";

import _UIPlayground from "@/pages/_ui-playground";
import Index from "@/pages/Index";
import NoteEditor from "@/pages/NoteEditor";
import NotFound from "@/pages/NotFound";
import { RouteEventTracker } from "./RouteEventTracker";

export function AppRoutes() {
  return (
    <>
      <RouteEventTracker />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/note/:id" element={<NoteEditor />} />
        <Route path="/_ui-playground" element={<_UIPlayground />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
