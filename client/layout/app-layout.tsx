import React, { ReactNode, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopToolbar } from "@/components/layout/top-toolbar";
import { Footer } from "@/components/layout/footer";
import { LeftToolbar } from "@/components/left-toolbar";
import { ShortcutsSidebar } from "@/shared/shortcuts/components";
import { useShortcut } from "@/shared/shortcuts/use-shortcut";
import { SidebarMenu } from "@/components/sidebar-menu";
import { DevTools } from "@/components/devtools";
import { useResponsiveOverride } from "@/hooks/use-responsive-override";
import { OffcanvasContent, OffcanvasSidebar, OffcanvasRoot } from "@/shared/ui/offcanvas-sidebar";
import { NoteSidebarProvider, useNoteSidebar } from "@/components/note-sidebar-provider";
import { NoteSidebar } from "@/components/note-sidebar";
import { Info } from "lucide-react";

type props = {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarActiveNoteId?: string;
  activeNote?: any; // Pass the actual note data
};

function AppLayoutInner({
  children,
  showSidebar = true,
  sidebarActiveNoteId,
  activeNote,
}: props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isShortcutsSidebarOpen, setIsShortcutsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { toggle: toggleNoteSidebar, setActiveNote } = useNoteSidebar();

  // Responsive override hook for development
  const { isMobile, isDesktop, isOverride } = useResponsiveOverride();

  // Register keyboard shortcut to toggle shortcuts panel
  useShortcut('toggle-shortcuts', (e) => {
    e.preventDefault();
    setIsShortcutsSidebarOpen((prev) => !prev);
  });

  // Update active note when it changes
  React.useEffect(() => {
    setActiveNote(activeNote || null);
  }, [activeNote, setActiveNote]);

  // Helper function to get responsive classes based on override state
  const getResponsiveClasses = (mobileClass: string, desktopClass: string) => {
    if (isOverride) {
      return desktopClass; // Force desktop behavior when override is active
    }
    return `${mobileClass} ${desktopClass}`;
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-Skriuw-dark overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop - only show when not overridden and actually on mobile */}
        {isSidebarOpen && isMobile && !isOverride && (
          <div
            className="fixed inset-0 bg-black/50 z-20"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Toolbar - always visible on desktop or when override is active */}
        <div className={`${isMobile && !isOverride ? 'hidden' : 'block'} transition-all duration-200 ${isDesktopSidebarOpen ? "w-auto" : "w-0"}`}>
          <LeftToolbar />
        </div>

        {/* Main Sidebar */}
        {showSidebar && (
          <div className={`
            ${isMobile && !isOverride ? 'fixed' : 'lg:static'}
            inset-y-0 left-0 z-30 lg:z-0
            transform transition-transform duration-200 ease-in-out
            ${isSidebarOpen ? "translate-x-0" : isMobile && !isOverride ? "-translate-x-full" : "translate-x-0"}
          `}>
            <Sidebar activeNoteId={sidebarActiveNoteId} />
          </div>
        )}

        <OffcanvasContent className="flex-1 flex flex-col overflow-hidden">
          <TopToolbar
            noteName={sidebarActiveNoteId || "Untitled"}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
            onToggleDesktopSidebar={() =>
              setIsDesktopSidebarOpen((prev) => !prev)
            }
            onSearch={(query) => {
              // TODO: Implement search
              console.log(query);
            }}
            onToggleShortcuts={() => setIsShortcutsSidebarOpen((prev) => !prev)}
            onToggleNoteSidebar={toggleNoteSidebar}
          />
          {children}
        </OffcanvasContent>

        {/* Footer spans full width */}
        <Footer />
      </div>

      {/* Shortcuts Sidebar */}
      <ShortcutsSidebar
        isOpen={isShortcutsSidebarOpen}
        onClose={() => setIsShortcutsSidebarOpen(false)}
      />

      {/* Settings Modal */}
      <SidebarMenu
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        title="Settings"
      />

      {/* Development Tools - only shown in development */}
      <DevTools />

      {/* Development mode indicator when responsive override is active */}
      {isOverride && (
        <div className="fixed top-4 left-4 z-50 px-2 py-1 bg-yellow-500 text-black text-xs font-mono rounded shadow-lg">
          DEV MODE - Responsive disabled
        </div>
      )}

      {/* Note Sidebar */}
      {activeNote && (
        <OffcanvasSidebar side="right">
          <NoteSidebar note={activeNote} />
        </OffcanvasSidebar>
      )}
    </div>
  );
}

export function AppLayout({
  children,
  showSidebar = true,
  sidebarActiveNoteId,
  activeNote,
}: props) {
  return (
    <NoteSidebarProvider>
      <OffcanvasRoot side="right" width="320px" defaultOpen={false}>
        <AppLayoutInner
          showSidebar={showSidebar}
          sidebarActiveNoteId={sidebarActiveNoteId}
          activeNote={activeNote}
        >
          {children}
        </AppLayoutInner>
      </OffcanvasRoot>
    </NoteSidebarProvider>
  );
}