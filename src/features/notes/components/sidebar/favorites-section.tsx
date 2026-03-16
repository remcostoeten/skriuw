"use client";

import { memo, useMemo } from "react";
import { Star, FileText, Folder, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import { FavoriteItem } from "@/modules/sidebar";
import { SidebarSection } from "./sidebar-section";

type Props = {
  favorites: FavoriteItem[];
  filesById: Map<string, NoteFile>;
  foldersById: Map<string, NoteFolder>;
  activeFileId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onManageSections: () => void;
  onFileSelect: (id: string) => void;
  onRemoveFromFavorites: (itemId: string) => void;
};

export const FavoritesSection = memo(function FavoritesSection({
  favorites,
  filesById,
  foldersById,
  activeFileId,
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
  onFileSelect,
  onRemoveFromFavorites,
}: Props) {
  const resolvedFavorites = useMemo(
    () =>
      favorites
        .map((fav) => {
          if (fav.itemType === "file") {
            const file = filesById.get(fav.itemId);
            return file ? { ...fav, item: file, name: file.name } : null;
          }

          const folder = foldersById.get(fav.itemId);
          return folder ? { ...fav, item: folder, name: folder.name } : null;
        })
        .filter(Boolean) as Array<FavoriteItem & { item: NoteFile | NoteFolder; name: string }>,
    [favorites, filesById, foldersById],
  );

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
        <div className="px-2 py-1">
          <p className="text-[11px] text-muted-foreground/50">No favorites yet</p>
        </div>
      ) : (
        <div className="space-y-px px-1">
          {resolvedFavorites.map((fav) => (
            <button
              key={fav.id}
              onClick={() => fav.itemType === "file" && onFileSelect(fav.itemId)}
              className={cn(
                "group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                fav.itemType === "file" && fav.itemId === activeFileId
                  ? "bg-white/[0.07] text-foreground"
                  : "text-foreground/60 hover:bg-white/[0.045] hover:text-foreground",
              )}
            >
              {fav.itemType === "file" ? (
                <FileText
                  className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
                  strokeWidth={1.5}
                />
              ) : (
                <Folder className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
              )}
              <span className="flex-1 truncate">{fav.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromFavorites(fav.itemId);
                }}
                className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 transition-all hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </button>
          ))}
        </div>
      )}
    </SidebarSection>
  );
});
