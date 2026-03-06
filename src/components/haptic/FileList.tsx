import { cn } from '@/lib/utils';
import { NoteFile, NoteFolder } from '@/types/notes';
import { ChevronRight, Folder } from 'lucide-react';

interface FileListProps {
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  onFileSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  getFilesInFolder: (parentId: string | null) => NoteFile[];
  getFoldersInFolder: (parentId: string | null) => NoteFolder[];
}

export function FileList({
  activeFileId,
  onFileSelect,
  onToggleFolder,
  getFilesInFolder,
  getFoldersInFolder,
}: FileListProps) {
  const renderFolder = (folder: NoteFolder, depth: number = 0) => {
    const childFolders = getFoldersInFolder(folder.id);
    const childFiles = getFilesInFolder(folder.id);
    const childCount = childFolders.length + childFiles.length;

    return (
      <div key={folder.id}>
        <button
          onClick={() => onToggleFolder(folder.id)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm text-foreground/70 hover:bg-haptic-hover transition-colors"
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 transition-transform text-haptic-dim',
              folder.isOpen && 'rotate-90'
            )}
          />
          <Folder className="w-4 h-4 text-haptic-dim" strokeWidth={1.5} />
          <span className="flex-1 text-left truncate">{folder.name}</span>
          <span className="text-xs text-haptic-dim">{childCount}</span>
        </button>
        {folder.isOpen && (
          <div>
            {childFolders.map(f => renderFolder(f, depth + 1))}
            {childFiles.map(f => renderFile(f, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderFile = (file: NoteFile, depth: number = 0) => (
    <button
      key={file.id}
      onClick={() => onFileSelect(file.id)}
      className={cn(
        'w-full text-left px-3 py-1.5 text-sm transition-colors truncate',
        activeFileId === file.id
          ? 'bg-haptic-active text-foreground'
          : 'text-foreground/70 hover:bg-haptic-hover'
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      {file.name}
    </button>
  );

  const rootFolders = getFoldersInFolder(null);
  const rootFiles = getFilesInFolder(null);

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {rootFolders.map(f => renderFolder(f))}
      {rootFiles.map(f => renderFile(f))}
    </div>
  );
}
