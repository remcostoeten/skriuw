import { useCallback } from "react";
import { useDocumentStore } from "@/store/document-store";

/**
 * Hook for UI state management.
 * Consolidates sidebar, metadata panel, and viewport state
 * into a single source of truth from the document store.
 */
export function useUIState() {
  const ui = useDocumentStore((state) => state.ui);
  const toggleSidebar = useDocumentStore((state) => state.toggleSidebar);
  const toggleMetadata = useDocumentStore((state) => state.toggleMetadata);
  const setActivePanel = useDocumentStore((state) => state.setActivePanel);
  const setSidebarWidth = useDocumentStore((state) => state.setSidebarWidth);
  const setIsMobile = useDocumentStore((state) => state.setIsMobile);
  const setUIState = useDocumentStore((state) => state.setUIState);

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar();
    if (ui.isMobile) {
      setUIState({ showMetadata: false });
    }
  }, [toggleSidebar, ui.isMobile, setUIState]);

  const handleToggleMetadata = useCallback(() => {
    toggleMetadata();
    if (ui.isMobile) {
      setUIState({ showSidebar: false });
    }
  }, [toggleMetadata, ui.isMobile, setUIState]);

  return {
    ...ui,
    toggleSidebar: handleToggleSidebar,
    toggleMetadata: handleToggleMetadata,
    setActivePanel,
    setSidebarWidth,
    setIsMobile,
    setUIState,
  };
}
