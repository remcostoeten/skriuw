"use client";

import { memo, useMemo } from "react";
import { Folder, FileText, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import { SidebarSection as SidebarSectionType } from "@/modules/sidebar";
import { SidebarSection } from "./sidebar-section";

type Props = {
  section: SidebarSectionType;
  filesById: Map<string, NoteFile>;
  foldersById: Map<string, NoteFolder>;
  activeFileId: string;
  isCollapsed: boolean;
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
      isCustom
      itemCount={totalItems}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
      onRename={onRename}
      onDelete={onDelete}
    >
      {totalItems === 0 ? (
        <div className="px-2 py-1">
          <p className="text-[11px] text-muted-foreground/50">Right-click files to add</p>
        </div>
      ) : (
        <div className="space-y-px px-1">
          {sectionFolders.map((folder) => (
            <div
              key={folder.id}
              className="group flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs text-foreground/60 transition-colors hover:bg-white/[0.045] hover:text-foreground"
            >
              <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
              <span className="flex-1 truncate">{folder.name}</span>
              <button
                onClick={() => onRemoveFromSection(section.id, folder.id, "folder")}
                className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition hover:text-foreground group-hover:opacity-100"
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
                "group flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs transition-colors",
                file.id === activeFileId
                  ? "bg-white/[0.07] text-foreground"
                  : "text-foreground/60 hover:bg-white/[0.045] hover:text-foreground",
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
                className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition hover:text-foreground group-hover:opacity-100"
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
