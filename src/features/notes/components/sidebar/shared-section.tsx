"use client";

import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon } from "@/shared/icons/file-text";
import { getSharedNotesAction } from "@/domain/collaboration/actions";
import { SidebarSection } from "./sidebar-section";
import { cn } from "@/shared/lib/utils";

const sharedKeys = {
  all: ["shared-notes"] as const,
};

type Props = {
  activeFileId: string;
  isCollapsed: boolean;
  showHeader?: boolean;
  compactMode?: boolean;
  onToggleCollapse: () => void;
  onFileSelect: (id: string) => void;
};

export const SharedSection = memo(function SharedSection({
  activeFileId,
  isCollapsed,
  showHeader = true,
  compactMode = false,
  onToggleCollapse,
  onFileSelect,
}: Props) {
  const { data: sharedNotes = [] } = useQuery({
    queryKey: sharedKeys.all,
    queryFn: () => getSharedNotesAction(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (sharedNotes.length === 0) return null;

  return (
    <SidebarSection
      id="shared"
      title="Shared with me"
      isCollapsed={isCollapsed}
      showHeader={showHeader}
      compactMode={compactMode}
      itemCount={sharedNotes.length}
      onToggleCollapse={onToggleCollapse}
    >
      <div className={cn("space-y-px px-1", compactMode && "space-y-[1px]")}>
        {sharedNotes.map((note) => (
          <button
            key={note.id}
            type="button"
            onClick={() => onFileSelect(note.id)}
            className={cn(
              "flex w-full items-center gap-2 border border-transparent px-2 text-left text-xs transition-colors",
              compactMode ? "h-6" : "h-7",
              note.id === activeFileId
                ? "border-border bg-muted text-foreground"
                : "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground",
            )}
          >
            <FileTextIcon
              size={compactMode ? 12 : 14}
              className="shrink-0 text-muted-foreground/70"
            />
            <span className="flex-1 truncate">{note.name}</span>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/40">
              {note.permission}
            </span>
          </button>
        ))}
      </div>
    </SidebarSection>
  );
});
