import { Plus, FileText, FolderPlus } from 'lucide-react';
import { FileList } from './FileList';
import { NoteFile, NoteFolder } from '@/types/notes';

interface SidebarPanelProps {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  getFilesInFolder: (parentId: string | null) => NoteFile[];
  getFoldersInFolder: (parentId: string | null) => NoteFolder[];
}

export function SidebarPanel({
  files,
  folders,
  activeFileId,
  onFileSelect,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  getFilesInFolder,
  getFoldersInFolder,
}: SidebarPanelProps) {
  return (
    <div className="w-56 flex flex-col bg-haptic-sidebar border-r border-haptic-divider">
      {/* Toolbar icons */}
      <div className="h-11 flex items-center gap-0.5 px-3 border-b border-haptic-divider">
        <button
          onClick={onCreateFile}
          className="w-7 h-7 flex items-center justify-center rounded text-haptic-dim hover:text-foreground hover:bg-haptic-hover transition-colors"
          title="New Note"
        >
          <FileText className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={onCreateFolder}
          className="w-7 h-7 flex items-center justify-center rounded text-haptic-dim hover:text-foreground hover:bg-haptic-hover transition-colors"
          title="New Folder"
        >
          <FolderPlus className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded text-haptic-dim hover:text-foreground hover:bg-haptic-hover transition-colors" title="Sort">
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button className="w-7 h-7 flex items-center justify-center rounded text-haptic-dim hover:text-foreground hover:bg-haptic-hover transition-colors" title="Search">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
      </div>

      <FileList
        files={files}
        folders={folders}
        activeFileId={activeFileId}
        onFileSelect={onFileSelect}
        onToggleFolder={onToggleFolder}
        getFilesInFolder={getFilesInFolder}
        getFoldersInFolder={getFoldersInFolder}
      />
    </div>
  );
}
