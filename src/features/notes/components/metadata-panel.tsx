import { NoteFile } from "@/types/notes";
import { formatDistanceToNow } from "date-fns";
import { Info, Layers, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";

interface MetadataPanelProps {
  file: NoteFile | null;
  className?: string;
  isMobile?: boolean;
  onDragHandlePointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onRequestClose?: () => void;
}

export function MetadataPanel({
  file,
  className,
  isMobile = false,
  onDragHandlePointerDown,
  onRequestClose,
}: MetadataPanelProps) {
  const [activeTab, setActiveTab] = useState<"info" | "outline-solid">("info");

  if (!file) return null;

  const wordCount = file.content.split(/\s+/).filter(Boolean).length;
  const charCount = file.content.length;
  const fileSize = new Blob([file.content]).size;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    if (bytes < 1024) return `${bytes} Bytes`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatTime = (date: Date) => {
    const distance = formatDistanceToNow(date, { addSuffix: false });
    return distance + " ago";
  };

  const stats = [
    { label: "Created", value: formatTime(file.createdAt) },
    { label: "Modified", value: formatTime(file.modifiedAt) },
    { label: "File Size", value: formatSize(fileSize) },
    { label: "Characters", value: charCount.toLocaleString() },
    { label: "Words", value: wordCount.toLocaleString() },
    { label: "Read Time", value: readTime === 0 ? "0s" : `${readTime}m` },
  ];

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        isMobile
          ? "h-full w-full rounded-[inherit] border-0 bg-transparent"
          : "w-48 border-l border-border",
        className,
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border/70",
          isMobile ? "bg-background/75 px-4 pb-3 pt-3 backdrop-blur-xl" : "px-2 h-[40px]",
        )}
      >
        {isMobile ? (
          <>
            <div
              className="cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={onDragHandlePointerDown}
            >
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border/90" />
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground/70">
                    Inspector
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
                    {file.name}
                  </p>
                </div>
                {onRequestClose && (
                  <button
                    onClick={onRequestClose}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    title="Close details"
                  >
                    <X className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : null}

        <div
          className={cn(
            "flex items-center gap-1",
            isMobile ? "mt-3 rounded-2xl bg-background/80 p-1.5" : "h-full justify-end gap-0.5",
          )}
        >
          <button
            onClick={() => setActiveTab("info")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl transition-colors",
              isMobile ? "h-11 flex-1 px-4 text-sm font-medium" : "h-7 w-7",
              activeTab === "info"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Info className="h-[15px] w-[15px]" strokeWidth={1.5} />
            {isMobile && <span>Info</span>}
          </button>
          <button
            onClick={() => setActiveTab("outline-solid")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl transition-colors",
              isMobile ? "h-11 flex-1 px-4 text-sm font-medium" : "h-7 w-7",
              activeTab === "outline-solid"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Layers className="h-[15px] w-[15px]" strokeWidth={1.5} />
            {isMobile && <span>Outline</span>}
          </button>
        </div>
      </div>

      {activeTab === "info" && (
        <div className={cn("overflow-y-auto", isMobile ? "space-y-3 px-4 py-4" : "space-y-2.5 px-4 py-4")}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={cn(
                "flex items-baseline justify-between gap-4",
                isMobile && "rounded-2xl border border-border/60 bg-background/60 px-4 py-3",
              )}
            >
              <span className="text-[13px] text-muted-foreground">{stat.label}</span>
              <span className="text-[13px] font-medium text-foreground/80 tabular-nums">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "outline-solid" && (
        <div className="overflow-y-auto px-4 py-4">
          <p className="mb-3 text-[13px] text-muted-foreground">Document outline</p>
          <div className="space-y-1">
            {file.content
              .split("\n")
              .filter((l) => /^#{1,3}\s/.test(l))
              .map((heading, i) => {
                const level = heading.match(/^(#+)/)?.[1].length || 1;
                const text = heading.replace(/^#+\s+/, "");
                return (
                  <div
                    key={i}
                    className={cn(
                      "cursor-pointer truncate text-[13px] text-foreground/50 transition-colors hover:text-foreground",
                      isMobile && "min-h-11 rounded-2xl bg-background/45 px-4 py-3",
                    )}
                    style={{
                      paddingLeft: isMobile ? `${16 + (level - 1) * 12}px` : `${(level - 1) * 12}px`,
                    }}
                  >
                    {text}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
