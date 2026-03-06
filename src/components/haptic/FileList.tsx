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
  countDescendants: (folderId: string) => number;
}

export function FileList({
  activeFileId,
  onFileSelect,
  onToggleFolder,
  getFilesInFolder,
  getFoldersInFolder,
  countDescendants,
}: FileListProps) {
  const renderFolder = (folder: NoteFolder, depth: number = 0) => {
    const childFolders = getFoldersInFolder(folder.id);
    const childFiles = getFilesInFolder(folder.id);
    const totalCount = countDescendants(folder.id);

    return (
      <div key={folder.id}>
        <button
          onClick={() => onToggleFolder(folder.id)}
          className="w-full flex items-center gap-1.5 h-[30px] text-[13px] text-foreground/70 hover:bg-theme-hover transition-colors group"
          style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
        >
          <ChevronRight
            className={cn(
              'w-3 h-3 shrink-0 transition-transform text-theme-dim',
              folder.isOpen && 'rotate-90'
            )}
            strokeWidth={1.5}
          />
          <Folder className="w-[15px] h-[15px] shrink-0 text-theme-dim" strokeWidth={1.5} />
          <span className="flex-1 text-left truncate">{folder.name}</span>
          <span className="text-xs text-theme-dim tabular-nums">{totalCount}</span>
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
        'w-full text-left h-[30px] text-[13px] transition-colors truncate flex items-center',
        activeFileId === file.id
          ? 'bg-theme-active text-foreground'
          : 'text-foreground/60 hover:bg-theme-hover hover:text-foreground/80'
      )}
      style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
    >
      {file.name}
    </button>
  );

  const rootFolders = getFoldersInFolder(null);
  const rootFiles = getFilesInFolder(null);

  return (
    <div className="flex-1 overflow-y-auto py-0.5">
      {rootFolders.map(f => renderFolder(f))}
      {rootFiles.map(f => renderFile(f))}
    </div>
  );
}
