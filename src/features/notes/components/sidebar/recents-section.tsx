"use client";

import { memo, useMemo } from "react";
import { FileText, Folder, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import { RecentItem } from "@/modules/sidebar";
import { SidebarSection } from "./sidebar-section";
import { formatDistanceToNow } from "date-fns";

type Props = {
  recents: RecentItem[];
  filesById: Map<string, NoteFile>;
  foldersById: Map<string, NoteFolder>;
  activeFileId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleVisibility: () => void;
  onManageSections: () => void;
  onFileSelect: (id: string) => void;
  onClearRecents: () => void;
};

export const RecentsSection = memo(function RecentsSection({
  recents,
  filesById,
  foldersById,
  activeFileId,
  isCollapsed,
  onToggleCollapse,
  onToggleVisibility,
  onFileSelect,
  onClearRecents,
}: Props) {
  const resolvedRecents = useMemo(
    () =>
      recents
        .map((recent) => {
          if (recent.itemType === "file") {
            const file = filesById.get(recent.itemId);
            return file ? { ...recent, item: file, name: file.name } : null;
          }

          const folder = foldersById.get(recent.itemId);
          return folder ? { ...recent, item: folder, name: folder.name } : null;
        })
        .filter(Boolean) as Array<RecentItem & { item: NoteFile | NoteFolder; name: string }>,
    [recents, filesById, foldersById],
  );

  const clearButton =
    resolvedRecents.length > 0 ? (
      <button
        onClick={onClearRecents}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
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
        <div className="px-2 py-1">
          <p className="text-[11px] text-muted-foreground/50">No recent files yet</p>
        </div>
      ) : (
        <div className="space-y-px px-1">
          {resolvedRecents.map((recent) => (
            <button
              key={recent.id}
              onClick={() => recent.itemType === "file" && onFileSelect(recent.itemId)}
              className={cn(
                "group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
                recent.itemType === "file" && recent.itemId === activeFileId
                  ? "bg-white/[0.07] text-foreground"
                  : "text-foreground/60 hover:bg-white/[0.045] hover:text-foreground",
              )}
            >
              {recent.itemType === "file" ? (
                <FileText
                  className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
                  strokeWidth={1.5}
                />
              ) : (
                <Folder className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" strokeWidth={1.5} />
              )}
              <span className="flex-1 truncate">{recent.name}</span>
              <span className="ml-3 shrink-0 text-right text-[10px] text-muted-foreground/40 tabular-nums">
                {formatDistanceToNow(new Date(recent.accessedAt), { addSuffix: false })}
              </span>
            </button>
          ))}
        </div>
      )}
    </SidebarSection>
  );
});
