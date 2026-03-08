'use client';

import { FileList } from '../file-list';
import { NoteFile, NoteFolder } from '@/types/notes';
import { SidebarSection } from './sidebar-section';

type Props = {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isCollapsed: boolean;
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
  onAddToFavorites?: (itemId: string, itemType: 'file' | 'folder') => void;
  onAddToProject?: (projectId: string, itemId: string, itemType: 'file' | 'folder') => void;
};

export function FileTreeSection({
  files,
  folders,
  activeFileId,
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
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
  const totalItems = files.length;

  return (
    <SidebarSection
      id="file-tree"
      title="All Notes"
      isCollapsed={isCollapsed}
      itemCount={totalItems}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
    >
      <div className="max-h-[400px] overflow-y-auto">
        <FileList
          files={files}
          folders={folders}
          activeFileId={activeFileId}
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
    </SidebarSection>
  );
}
