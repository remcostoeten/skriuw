"use client";

import { memo, useMemo } from "react";
import { Folder, FileText, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import type { SidebarSection as SidebarSectionType } from "./types";
import { SidebarSection } from "./sidebar-section";

type Props = {
  section: SidebarSectionType;
  filesById: Map<string, NoteFile>;
  foldersById: Map<string, NoteFolder>;
  activeFileId: string;
  isCollapsed: boolean;
  showHeader?: boolean;
  compactMode?: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onFileSelect: (id: string) => void;
  onRemoveFromSection: (sectionId: string, itemId: string, itemType: "file" | "folder") => void;
};

export const CustomSection = memo(function CustomSection({
  section,
  filesById,
  foldersById,
  activeFileId,
  isCollapsed,
  showHeader = true,
  compactMode = false,
  onToggleCollapse,
  onToggleVisibility,
  onRename,
  onDelete,
  onFileSelect,
  onRemoveFromSection,
}: Props) {
  const fileIds = section.customConfig?.fileIds ?? [];
  const folderIds = section.customConfig?.folderIds ?? [];
  const sectionFolders = useMemo(
    () => folderIds.map((folderId) => foldersById.get(folderId)).filter(Boolean) as NoteFolder[],
    [folderIds, foldersById],
  );
  const sectionFiles = useMemo(
    () => fileIds.map((fileId) => filesById.get(fileId)).filter(Boolean) as NoteFile[],
    [fileIds, filesById],
  );
  const totalItems = sectionFolders.length + sectionFiles.length;

  return (
    <SidebarSection
      id={section.id}
      title={section.name}
      isCollapsed={isCollapsed}
      showHeader={showHeader}
      compactMode={compactMode}
      isCustom
      itemCount={totalItems}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
      onRename={onRename}
      onDelete={onDelete}
    >
      {totalItems === 0 ? (
        <div className={cn("px-2", compactMode ? "py-0.5" : "py-1")}>
          <p className="text-[11px] text-muted-foreground/50">Right-click files to add</p>
        </div>
      ) : (
        <div className={cn("space-y-px px-1", compactMode && "space-y-[1px]")}>
          {sectionFolders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                "group flex w-full items-center gap-2 border border-transparent px-2 text-xs text-foreground/60 transition-colors hover:border-border hover:bg-muted hover:text-foreground",
                compactMode ? "h-6" : "h-7",
              )}
            >
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
              <span className="flex-1 truncate">{folder.name}</span>
              <button
                onClick={() => onRemoveFromSection(section.id, folder.id, "folder")}
                className="inline-flex h-4 w-4 items-center justify-center border border-transparent text-muted-foreground/50 opacity-0 transition hover:border-border hover:bg-muted hover:text-foreground group-hover:opacity-100"
                title="Remove from section"
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          {sectionFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                "group flex w-full items-center gap-2 border border-transparent px-2 text-xs transition-colors",
                compactMode ? "h-6" : "h-7",
                file.id === activeFileId
                  ? "border-border bg-muted text-foreground"
                  : "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground",
              )}
            >
              <button
                onClick={() => onFileSelect(file.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <FileText
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
                  strokeWidth={1.5}
                />
                <span className="truncate">{file.name}</span>
              </button>
              <button
                onClick={() => onRemoveFromSection(section.id, file.id, "file")}
                className="inline-flex h-4 w-4 items-center justify-center border border-transparent text-muted-foreground/50 opacity-0 transition hover:border-border hover:bg-muted hover:text-foreground group-hover:opacity-100"
                title="Remove from section"
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SidebarSection>
  );
});
