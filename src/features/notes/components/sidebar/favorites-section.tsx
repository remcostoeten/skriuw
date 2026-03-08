'use client';

import { Star, FileText, Folder, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { NoteFile, NoteFolder } from '@/types/notes';
import { FavoriteItem } from '@/modules/sidebar';
import { SidebarSection } from './sidebar-section';

type Props = {
  favorites: FavoriteItem[];
  files: NoteFile[];
  folders: NoteFolder[];
  activeFileId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onFileSelect: (id: string) => void;
  onRemoveFromFavorites: (itemId: string) => void;
};

export function FavoritesSection({
  favorites,
  files,
  folders,
  activeFileId,
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
  onFileSelect,
  onRemoveFromFavorites,
}: Props) {
  // Resolve favorites to actual files/folders
  const resolvedFavorites = favorites
    .map(fav => {
      if (fav.itemType === 'file') {
        const file = files.find(f => f.id === fav.itemId);
        return file ? { ...fav, item: file, name: file.name } : null;
      } else {
        const folder = folders.find(f => f.id === fav.itemId);
        return folder ? { ...fav, item: folder, name: folder.name } : null;
      }
    })
    .filter(Boolean) as Array<FavoriteItem & { item: NoteFile | NoteFolder; name: string }>;

  return (
    <SidebarSection
      id="favorites"
      title="Favorites"
      isCollapsed={isCollapsed}
      itemCount={resolvedFavorites.length}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
    >
      {resolvedFavorites.length === 0 ? (
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground/60 text-center">
            No favorites yet. Right-click a file to add it.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {resolvedFavorites.map((fav) => (
            <button
              key={fav.id}
              onClick={() => fav.itemType === 'file' && onFileSelect(fav.itemId)}
              className={cn(
                "group flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left transition-colors",
                fav.itemType === 'file' && fav.itemId === activeFileId
                  ? "bg-accent text-foreground"
                  : "text-foreground/70 hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {fav.itemType === 'file' ? (
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              ) : (
                <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              )}
              <span className="flex-1 text-[13px] truncate">{fav.name}</span>
              <Star className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" strokeWidth={0} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromFavorites(fav.itemId);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-accent hover:text-foreground md:h-4 md:w-4 md:rounded-none md:opacity-0 md:group-hover:opacity-100"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </button>
          ))}
        </div>
      )}
    </SidebarSection>
  );
}
