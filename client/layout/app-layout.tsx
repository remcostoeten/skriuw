import { ReactNode, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopToolbar } from "@/components/layout/top-toolbar";
import { Footer } from "@/components/layout/footer";
import { LeftToolbar } from "@/components/left-toolbar";
import { ShortcutsSidebar } from "@/shared/shortcuts/components";
import { useShortcut } from "@/shared/shortcuts/use-shortcut";
import { SidebarMenu } from "@/components/sidebar-menu";

type props = {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarActiveNoteId?: string;
};

export function AppLayout({
  children,
  showSidebar = true,
  sidebarActiveNoteId,
}: props) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isShortcutsSidebarOpen, setIsShortcutsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Register keyboard shortcut to toggle shortcuts panel
  useShortcut('toggle-shortcuts', (e) => {
    e.preventDefault();
    setIsShortcutsSidebarOpen((prev) => !prev);
  });

  return (
    <div className="h-screen w-screen flex flex-col bg-Skriuw-dark overflow-hidden">
      <div className="flex flex-1 overflow-hidden relative">
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <div className={`hidden lg:block transition-all duration-200 ${isDesktopSidebarOpen ? "w-auto" : "w-0"
          }`}>
          <LeftToolbar onSettingsClick={() => setIsSettingsOpen(true)} />
        </div>

        {showSidebar && (
          <div className={`
            fixed lg:static inset-y-0 left-0 z-30 lg:z-0
            transform transition-transform duration-200 ease-in-out
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}>
            <Sidebar activeNoteId={sidebarActiveNoteId} />
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
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
          />
          {children}
          <Footer />
        </div>
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
    </div>
  );
}