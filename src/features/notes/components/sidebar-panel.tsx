"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { NoteFile, NoteFolder } from "@/types/notes";
import { cn } from "@/shared/lib/utils";
import { useSidebarStore, SidebarSection as SidebarSectionType } from "@/modules/sidebar";
import { FileText, Folder, PanelTopClose, Search, X } from "lucide-react";
import {
  FavoritesSection,
  RecentsSection,
  ProjectsSection,
  CustomSection,
  FileTreeSection,
  SidebarConfigManager,
  JournalSection,
  WorkspaceSwitcher,
} from "./sidebar";

interface SidebarPanelProps {
  files: NoteFile[];
  folders: NoteFolder[];
  filesById: Map<string, NoteFile>;
  foldersById: Map<string, NoteFolder>;
  activeFileId: string;
  onFileSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRenameFile: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveFile: (fileId: string, newParentId: string | null) => void;
  onMoveFolder: (folderId: string, newParentId: string | null) => void;
  getFilesInFolder: (parentId: string | null) => NoteFile[];
  getFoldersInFolder: (parentId: string | null) => NoteFolder[];
  countDescendants: (folderId: string) => number;
  className?: string;
  onRequestClose?: () => void;
  showCloseButton?: boolean;
}

// Custom SVG icons matching Haptic's design
function NewNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 10.25C10.4142 10.25 10.75 9.91421 10.75 9.5L10.75 8.25L12 8.25C12.4142 8.25 12.75 7.91421 12.75 7.5C12.75 7.08579 12.4142 6.75 12 6.75L10.75 6.75L10.75 5.5C10.75 5.08579 10.4142 4.75 10 4.75C9.58579 4.75 9.25 5.08579 9.25 5.5L9.25 6.75L8 6.75C7.58579 6.75 7.25 7.08579 7.25 7.5C7.25 7.91421 7.58579 8.25 8 8.25L9.25 8.25L9.25 9.5C9.25 9.91421 9.58579 10.25 10 10.25Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.43 19.9999C11.0553 20.0005 11.5687 20.0011 12.0425 19.801C12.4079 19.6468 12.7072 19.3912 13.0276 19.0754L16.803 15.2303C16.8581 15.1743 16.9119 15.1195 16.9644 15.0656C17.0081 15.0208 17.0518 14.9756 17.0943 14.9306C17.4037 14.6043 17.6539 14.2997 17.805 13.9281C18.001 13.4457 18.0005 12.923 17.9999 12.2854L17.9999 8.09515C17.9999 6.40174 17.9999 5.05339 17.8605 3.99652C17.7166 2.90602 17.4121 2.01239 16.719 1.30596C16.0257 0.59936 15.1485 0.288792 14.0779 0.142102C13.0408 -0.00002 11.7177 -0.00001 10.0564 0L9.94344 0C8.28219 -0.00001 6.95908 -0.00002 5.92191 0.142103C4.85139 0.288793 3.97413 0.599361 3.28085 1.30596C2.58774 2.01239 2.28324 2.90602 2.13939 3.99652C1.99997 5.05342 1.99999 6.40178 2 8.09523L2 11.9046C1.99999 13.5981 1.99998 14.9464 2.13939 16.0033C2.28324 17.0938 2.58774 17.9875 3.28085 18.6939C3.97413 19.4005 4.8514 19.7111 5.92191 19.8578C6.95912 19.9999 8.28226 19.9999 9.94358 19.9999L10.43 19.9999ZM11.0734 18.4633C11.0633 18.2993 11.0634 18.1178 11.0635 17.9433L11.0635 17.3374C11.0634 16.5111 11.0634 15.8153 11.1365 15.2613C11.214 14.6739 11.3857 14.1333 11.8134 13.6974C12.2412 13.2614 12.7721 13.0861 13.349 13.0071C13.8928 12.9326 14.5757 12.9326 15.3862 12.9326L15.9811 12.9326C16.1516 12.9325 16.3292 12.9325 16.4899 12.9427C16.4991 12.7707 16.5015 12.529 16.5015 12.1644L16.5015 8.15241C16.5015 6.389 16.5 5.14306 16.3755 4.19937C16.2539 3.27751 16.0275 2.75905 15.6587 2.38321C15.2901 2.00753 14.7819 1.77699 13.878 1.65313C12.9524 1.52629 11.7302 1.52466 9.99993 1.52467C8.26966 1.52467 7.04749 1.52629 6.12187 1.65313C5.21796 1.77699 4.70976 2.00753 4.34116 2.38321C3.9724 2.75906 3.74598 3.27751 3.62438 4.19937C3.49989 5.14306 3.49831 6.389 3.49831 8.15241L3.49831 11.8474C3.49831 13.6108 3.49989 14.8568 3.62438 15.8005C3.74598 16.7223 3.9724 17.2408 4.34116 17.6166C4.70976 17.9923 5.21796 18.2229 6.12187 18.3467C7.04749 18.4736 8.26966 18.4752 9.99993 18.4752L10.3109 18.4752C10.668 18.4752 10.9049 18.4727 11.0734 18.4633Z"
      />
    </svg>
  );
}

function NewFolderNoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 8.75C10.4142 8.75 10.75 9.08579 10.75 9.5V10.75H12C12.4142 10.75 12.75 11.0858 12.75 11.5C12.75 11.9142 12.4142 12.25 12 12.25H10.75V13.5C10.75 13.9142 10.4142 14.25 10 14.25C9.58579 14.25 9.25 13.9142 9.25 13.5V12.25H8C7.58579 12.25 7.25 11.9142 7.25 11.5C7.25 11.0858 7.58579 10.75 8 10.75H9.25V9.5C9.25 9.08579 9.58579 8.75 10 8.75Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.54356 1H5.37683C4.56054 0.999976 3.87093 0.999955 3.32143 1.07383C2.73783 1.1523 2.19785 1.32663 1.76224 1.76224C1.32663 2.19785 1.1523 2.73783 1.07383 3.32143C0.999955 3.87093 0.999976 4.56048 1 5.37677V12.7983C0.999985 14.0429 0.999971 15.0553 1.10729 15.8535C1.21922 16.686 1.46048 17.4006 2.02993 17.9701C2.59937 18.5395 3.31398 18.7808 4.14647 18.8927C4.94475 19 5.95705 19 7.20173 19H12.7983C14.043 19 15.0553 19 15.8535 18.8927C16.686 18.7808 17.4006 18.5395 17.9701 17.9701C18.5395 17.4006 18.7808 16.686 18.8927 15.8535C19 15.0553 19 14.043 19 12.7983V10.4005C19 9.15583 19 8.14353 18.8927 7.34525C18.7808 6.51276 18.5395 5.79815 17.9701 5.22871C17.4006 4.65926 16.686 4.418 15.8535 4.30607C15.0553 4.19875 14.043 4.19877 12.7983 4.19878L11.5177 4.19878C11.2437 4.19878 11.0942 4.19791 10.9851 4.18711C10.9515 4.18379 10.9306 4.18021 10.9187 4.17768C10.9106 4.1686 10.8972 4.15227 10.8776 4.1247C10.8141 4.03534 10.7392 3.90601 10.6032 3.66806L10.3364 3.20108C10.0947 2.77812 9.88601 2.41293 9.68211 2.12595C9.46334 1.81806 9.21648 1.54999 8.87457 1.35157C8.53266 1.15315 8.17743 1.07182 7.80157 1.03463C7.45127 0.999976 7.03064 0.999987 6.54356 1ZM3.52785 2.60914C3.96198 2.55078 4.54667 2.54913 5.43032 2.54913H6.50758C7.04035 2.54913 7.38395 2.55 7.64905 2.57623C7.89714 2.60078 8.01344 2.64291 8.09703 2.69142C8.18061 2.73993 8.2749 2.82 8.4193 3.02323C8.57359 3.24038 8.74483 3.53828 9.00915 4.00085L9.27319 4.46291C9.38879 4.66527 9.50151 4.86259 9.61476 5.02197C9.74274 5.20209 9.90431 5.38312 10.1398 5.51981C10.3754 5.6565 10.6127 5.70696 10.8326 5.72871C11.0272 5.74797 11.2553 5.74794 11.4884 5.74791L12.7418 5.74791C14.0563 5.74791 14.9641 5.74956 15.6471 5.84138C16.3078 5.93021 16.641 6.09045 16.8747 6.3241C17.1083 6.55776 17.2686 6.89098 17.3574 7.55167C17.4492 8.23468 17.4509 9.14252 17.4509 10.457V12.7418C17.4509 14.0563 17.4492 14.9641 17.3574 15.6471C17.2686 16.3078 17.1083 16.641 16.8747 16.8747C16.641 17.1083 16.3078 17.2686 15.6471 17.3574C14.9641 17.4492 14.0563 17.4509 12.7418 17.4509H7.25824C5.94374 17.4509 5.03591 17.4492 4.35289 17.3574C3.6922 17.2686 3.35898 17.1083 3.12533 16.8747C2.89167 16.641 2.73143 16.3078 2.64261 15.6471C2.55079 14.9641 2.54913 14.0563 2.54913 12.7418V5.43032C2.54913 4.54667 2.55078 3.96198 2.60914 3.52785C2.66489 3.11259 2.76393 2.91933 2.87828 2.79828C2.99251 2.67739 3.19102 2.5699 3.52785 2.60914Z"
      />
    </svg>
  );
}

export function SidebarPanel({
  files,
  folders,
  filesById,
  foldersById,
  activeFileId,
  onFileSelect,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  getFilesInFolder,
  getFoldersInFolder,
  countDescendants,
  className,
  onRequestClose,
  showCloseButton = false,
}: SidebarPanelProps) {
  const sidebarStore = useSidebarStore();
  const sections = sidebarStore.getSections();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasSearchSection = sections.some((section) => section.type === "search");
  const visibleSections = useMemo(
    () => sections.filter((section) => section.type !== "search"),
    [sections],
  );

  const searchResults = useMemo(() => {
    if (!deferredSearchQuery.trim()) {
      return { files: [], folders: [] };
    }

    const lowerQuery = deferredSearchQuery.toLowerCase();

    return {
      files: files.filter(
        (file) =>
          file.name.toLowerCase().includes(lowerQuery) ||
          file.content.toLowerCase().includes(lowerQuery),
      ),
      folders: folders.filter((folder) => folder.name.toLowerCase().includes(lowerQuery)),
    };
  }, [deferredSearchQuery, files, folders]);

  const handleFileSelect = useCallback(
    (id: string) => {
      sidebarStore.addToRecents(id, "file");
      onFileSelect(id);
      onRequestClose?.();
    },
    [sidebarStore, onFileSelect, onRequestClose],
  );

  const openConfigPanel = useCallback(() => {
    setIsConfigOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
  }, []);

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleSearchFileSelect = useCallback(
    (id: string) => {
      handleFileSelect(id);
      closeSearch();
    },
    [closeSearch, handleFileSelect],
  );

  const handleSearchFolderSelect = useCallback(
    (id: string) => {
      onToggleFolder(id);
      closeSearch();
    },
    [closeSearch, onToggleFolder],
  );

  useEffect(() => {
    if (!hasSearchSection && isSearchOpen) {
      closeSearch();
    }
  }, [closeSearch, hasSearchSection, isSearchOpen]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const hasSearchResults = searchResults.files.length > 0 || searchResults.folders.length > 0;
  const fileTreeSection = visibleSections.find((section) => section.type === "file-tree");
  const navigationSections = visibleSections.filter((section) => section.type !== "file-tree");

  const renderSection = (section: SidebarSectionType) => {
    switch (section.type) {
      case "search":
        return null;

      case "favorites":
        return (
          <FavoritesSection
            key={section.id}
            favorites={sidebarStore.config.favorites}
            filesById={filesById}
            foldersById={foldersById}
            activeFileId={activeFileId}
            isCollapsed={section.isCollapsed}
            onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
            onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
            onManageSections={openConfigPanel}
            onFileSelect={handleFileSelect}
            onRemoveFromFavorites={sidebarStore.removeFromFavorites}
          />
        );

      case "recents":
        return (
          <RecentsSection
            key={section.id}
            recents={sidebarStore.getRecents()}
            filesById={filesById}
            foldersById={foldersById}
            activeFileId={activeFileId}
            isCollapsed={section.isCollapsed}
            onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
            onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
            onManageSections={openConfigPanel}
            onFileSelect={handleFileSelect}
            onClearRecents={sidebarStore.clearRecents}
          />
        );

      case "projects":
        return (
          <ProjectsSection
            key={section.id}
            projects={sidebarStore.getProjects()}
            files={files}
            folders={folders}
            activeFileId={activeFileId}
            isCollapsed={section.isCollapsed}
            onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
            onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
            onManageSections={openConfigPanel}
            onFileSelect={handleFileSelect}
            onCreateProject={sidebarStore.createProject}
            onUpdateProject={sidebarStore.updateProject}
            onDeleteProject={sidebarStore.deleteProject}
            onRemoveFromProject={sidebarStore.removeFromProject}
          />
        );

      case "journal":
        return (
          <JournalSection
            key={section.id}
            isCollapsed={section.isCollapsed}
            onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
            onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
          />
        );

      case "file-tree":
        return (
          <FileTreeSection
            key={section.id}
            files={files}
            folders={folders}
            activeFileId={activeFileId}
            isCollapsed={section.isCollapsed}
            onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
            onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
            onFileSelect={handleFileSelect}
            onToggleFolder={onToggleFolder}
            onRenameFile={onRenameFile}
            onRenameFolder={onRenameFolder}
            onDeleteFile={onDeleteFile}
            onDeleteFolder={onDeleteFolder}
            onMoveFile={onMoveFile}
            onMoveFolder={onMoveFolder}
            getFilesInFolder={getFilesInFolder}
            getFoldersInFolder={getFoldersInFolder}
            countDescendants={countDescendants}
          />
        );

      default:
        return (
          <CustomSection
            key={section.id}
            section={section}
            filesById={filesById}
            foldersById={foldersById}
            activeFileId={activeFileId}
            isCollapsed={section.isCollapsed}
            onToggleCollapse={() => sidebarStore.toggleSectionCollapse(section.id)}
            onToggleVisibility={() => sidebarStore.toggleSectionVisibility(section.id)}
            onRename={(name) => sidebarStore.renameSection(section.id, name)}
            onDelete={() => sidebarStore.removeSection(section.id)}
            onFileSelect={handleFileSelect}
            onRemoveFromSection={sidebarStore.removeFromCustomSection}
          />
        );
    }
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      {/* Workspace Switcher */}
      <div className="border-b border-sidebar-border/40 px-2.5 py-2">
        <WorkspaceSwitcher />
      </div>

      <div className="sticky top-0 z-10 border-b border-sidebar-border/50 bg-sidebar/95 backdrop-blur-xl">
        <div className="relative min-h-11 overflow-hidden px-3 py-2.5">
          <div
            className={cn(
              "flex w-full items-center gap-2 transition-transform duration-200 md:py-0",
              isSearchOpen && "-translate-y-12",
            )}
          >
            <div className="flex items-center gap-1.5">
              <button
                onClick={onCreateFile}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 md:h-7 md:w-7 md:rounded-md"
                title="New Note"
              >
                <NewNoteIcon />
              </button>
              <button
                onClick={onCreateFolder}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 md:h-7 md:w-7 md:rounded-md"
                title="New Folder"
              >
                <NewFolderNoteIcon />
              </button>
              <button
                onClick={openConfigPanel}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 md:h-7 md:w-7 md:rounded-md"
                title="Manage sections"
              >
                <PanelTopClose className="h-4 w-4" strokeWidth={1.5} />
              </button>
              {hasSearchSection && (
                <button
                  onClick={openSearch}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95 md:h-7 md:w-7 md:rounded-md"
                  title="Search notes"
                >
                  <Search className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
              <SidebarConfigManager
                open={isConfigOpen}
                onOpenChange={setIsConfigOpen}
                hideTrigger
                sections={sidebarStore.config.sections}
                showSectionHeaders={sidebarStore.config.showSectionHeaders}
                compactMode={sidebarStore.config.compactMode}
                onReorderSections={sidebarStore.reorderSections}
                onToggleSectionVisibility={sidebarStore.toggleSectionVisibility}
                onAddCustomSection={sidebarStore.addCustomSection}
                onRemoveSection={sidebarStore.removeSection}
                onRenameSection={sidebarStore.renameSection}
                onToggleShowSectionHeaders={sidebarStore.toggleShowSectionHeaders}
                onToggleCompactMode={sidebarStore.toggleCompactMode}
                onResetToDefaults={sidebarStore.resetToDefaults}
              />
            </div>

            {showCloseButton && (
              <button
                onClick={onRequestClose}
                className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground md:hidden"
                title="Close sidebar"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </div>

          {hasSearchSection && (
            <div
              className={cn(
                "absolute inset-x-0 top-0 px-3 py-2.5 transition-transform duration-200",
                isSearchOpen ? "translate-y-0" : "translate-y-12",
              )}
            >
              <div className="flex items-center gap-2 rounded-xl border border-white/7 bg-white/[0.045] px-3 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      closeSearch();
                    }
                  }}
                  placeholder="Search"
                  className="h-9 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  onClick={closeSearch}
                  className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  title="Close search"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 md:pb-0",
          sidebarStore.config.compactMode && "text-sm",
        )}
      >
        {searchQuery.trim() ? (
          <div className="px-3 py-3">
            {hasSearchResults ? (
              <div className="overflow-hidden rounded-xl border border-white/6 bg-white/[0.025]">
                {searchResults.folders.length > 0 && (
                  <div className="border-b border-white/6 p-2 last:border-b-0">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                      Folders
                    </p>
                    {searchResults.folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleSearchFolderSelect(folder.id)}
                        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground/80 transition-colors hover:bg-accent"
                      >
                        <Folder
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <span className="truncate text-[13px]">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.files.length > 0 && (
                  <div className="p-2">
                    <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                      Files
                    </p>
                    {searchResults.files.slice(0, 10).map((file) => (
                      <button
                        key={file.id}
                        onClick={() => handleSearchFileSelect(file.id)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                          file.id === activeFileId
                            ? "bg-accent text-foreground"
                            : "text-foreground/80 hover:bg-accent",
                        )}
                      >
                        <FileText
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={1.5}
                        />
                        <span className="truncate text-[13px]">{file.name}</span>
                      </button>
                    ))}
                    {searchResults.files.length > 10 && (
                      <p className="px-2 py-1 text-[10px] text-muted-foreground">
                        +{searchResults.files.length - 10} more results
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-2 py-3">
                <p className="text-xs text-muted-foreground/70">No results found</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {fileTreeSection ? renderSection(fileTreeSection) : null}
            {navigationSections.length > 0 ? (
              <div className="px-3 pb-2 pt-3">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                  Navigation
                </p>
              </div>
            ) : null}
            {navigationSections.map(renderSection)}
          </>
        )}
      </div>
    </div>
  );
}
