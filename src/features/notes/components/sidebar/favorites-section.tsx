"use client";

import { memo, useMemo } from "react";
import { FileText, Folder, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import type { FavoriteItem } from "./types";
import { SidebarSection } from "./sidebar-section";

type Props = {
  favorites: FavoriteItem[];
  filesById: Map<string, NoteFile>;
  foldersById: Map<string, NoteFolder>;
  activeFileId: string;
  isCollapsed: boolean;
  showHeader?: boolean;
  compactMode?: boolean;
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
  showHeader = true,
  compactMode = false,
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
      showHeader={showHeader}
      compactMode={compactMode}
      itemCount={resolvedFavorites.length}
      onToggleCollapse={onToggleCollapse}
      onToggleVisibility={onToggleVisibility}
    >
      {resolvedFavorites.length === 0 ? (
        <div className={cn("px-2", compactMode ? "py-0.5" : "py-1")}>
          <p className="text-[11px] text-muted-foreground/50">No favorites yet</p>
        </div>
      ) : (
        <div className={cn("space-y-px px-1", compactMode && "space-y-[1px]")}>
          {resolvedFavorites.map((fav) => (
            <button
              key={fav.id}
              onClick={() => fav.itemType === "file" && onFileSelect(fav.itemId)}
              className={cn(
                "group flex w-full items-center gap-2 border border-transparent px-2 text-left text-xs transition-colors",
                compactMode ? "h-6" : "h-7",
                fav.itemType === "file" && fav.itemId === activeFileId
                  ? "border-border bg-muted text-foreground"
                  : "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground",
              )}
            >
              {fav.itemType === "file" ? (
                <FileText
                  className={cn("shrink-0 text-muted-foreground/70", compactMode ? "h-3 w-3" : "h-3.5 w-3.5")}
                  strokeWidth={1.5}
                />
              ) : (
                <Folder
                  className={cn("shrink-0 text-muted-foreground/70", compactMode ? "h-3 w-3" : "h-3.5 w-3.5")}
                  strokeWidth={1.5}
                />
              )}
              <span className="flex-1 truncate">{fav.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromFavorites(fav.itemId);
                }}
                className={cn(
                  "flex items-center justify-center border border-transparent text-muted-foreground/50 transition-all hover:border-border hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100",
                  compactMode ? "h-3.5 w-3.5" : "h-4 w-4",
                )}
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
