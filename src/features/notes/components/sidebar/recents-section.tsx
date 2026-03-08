'use client';

import { FileText, Folder, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { NoteFile, NoteFolder } from '@/types/notes';
import { RecentItem } from '@/modules/sidebar';
import { SidebarSection } from './sidebar-section';
import { formatDistanceToNow } from 'date-fns';

type Props = {
  recents: RecentItem[];
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onFileSelect: (id: string) => void;
  onClearRecents: () => void;
};

export function RecentsSection({
  recents,
  files,
  folders,
  activeFileId,
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
  onFileSelect,
  onClearRecents,
}: Props) {
  // Resolve recents to actual files/folders
  const resolvedRecents = recents
    .map(recent => {
      if (recent.itemType === 'file') {
        const file = files.find(f => f.id === recent.itemId);
        return file ? { ...recent, item: file, name: file.name } : null;
      } else {
        const folder = folders.find(f => f.id === recent.itemId);
        return folder ? { ...recent, item: folder, name: folder.name } : null;
      }
    })
    .filter(Boolean) as Array<RecentItem & { item: NoteFile | NoteFolder; name: string }>;

  const clearButton = resolvedRecents.length > 0 ? (
    <button
      onClick={onClearRecents}
      className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title="Clear recents"
    >
      <X className="w-3 h-3" strokeWidth={1.5} />
    </button>
  ) : null;

  return (
    <SidebarSection
      id="recents"
      title="Recents"
      isCollapsed={isCollapsed}
      itemCount={resolvedRecents.length}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
      actions={clearButton}
    >
      {resolvedRecents.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground/60 text-center">
            No recent files. Files you open will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {resolvedRecents.map((recent) => (
            <button
              key={recent.id}
              onClick={() => recent.itemType === 'file' && onFileSelect(recent.itemId)}
              className={cn(
                "group w-full flex items-center gap-2 px-4 py-1.5 text-left transition-colors",
                recent.itemType === 'file' && recent.itemId === activeFileId
                  ? "bg-accent text-foreground"
                  : "text-foreground/70 hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {recent.itemType === 'file' ? (
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              ) : (
                <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              )}
              <span className="flex-1 text-[13px] truncate">{recent.name}</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                {formatDistanceToNow(new Date(recent.accessedAt), { addSuffix: false })}
              </span>
            </button>
          ))}
        </div>
      )}
    </SidebarSection>
  );
}
