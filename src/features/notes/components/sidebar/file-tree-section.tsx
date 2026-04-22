"use client";

import { memo } from "react";
import { FileList } from "../file-list";
import { NoteFile, NoteFolder } from "@/types/notes";

type Props = {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isCollapsed: boolean;
  compactMode?: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onFileSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onRenameFile: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFile: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveFile: (fileId: string, newParentId: string | null) => void;
  onMoveFolder: (folderId: string, newParentId: string | null) => void;
  getFilesInFolder: (parentId: string | null) => NoteFile[];
  getFoldersInFolder: (parentId: string | null) => NoteFolder[];
  countDescendants: (folderId: string) => number;
  // Section-specific handlers for adding to favorites/projects
  onAddToFavorites?: (itemId: string, itemType: "file" | "folder") => void;
  onAddToProject?: (projectId: string, itemId: string, itemType: "file" | "folder") => void;
};

export const FileTreeSection = memo(function FileTreeSection({
  files,
  folders,
  activeFileId,
  isCollapsed: _isCollapsed,
  compactMode = false,
  onToggleCollapse: _onToggleCollapse,
  onToggleVisibility: _onToggleVisibility,
  onFileSelect,
  onToggleFolder,
  onRenameFile,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  getFilesInFolder,
  getFoldersInFolder,
  countDescendants,
}: Props) {
  return (
    <div>
      <FileList
        files={files}
        folders={folders}
        activeFileId={activeFileId}
        compactMode={compactMode}
        onFileSelect={onFileSelect}
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
    </div>
  );
});
