import { NoteFile } from "@/types/notes";
import { formatDistanceToNow } from "date-fns";
import { Info, Layers, X } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/shared/lib/utils";

interface MetadataPanelProps {
  file: NoteFile | null;
  className?: string;
  isMobile?: boolean;
  onRequestClose?: () => void;
}

export function MetadataPanel({
  file,
  className,
  isMobile = false,
  onRequestClose,
}: MetadataPanelProps) {
  const [activeTab, setActiveTab] = useState<"info" | "outline-solid">("info");
  const infoTabId = useId();
  const outlineTabId = useId();
  const infoPanelId = useId();
  const outlinePanelId = useId();

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

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveTab((current) => (current === "info" ? "outline-solid" : "info"));
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveTab("info");
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveTab("outline-solid");
    }
  };

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
          "shrink-0 border-b border-border",
          isMobile ? "bg-background px-4 pb-3 pt-3" : "h-11 px-2",
        )}
      >
        {isMobile ? (
          <>
            <div
              className="cursor-grab touch-none active:cursor-grabbing"
            >
              <div className="mx-auto mb-3 h-1.5 w-12 bg-border" />
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
                    aria-label="Close details"
                    data-sheet-no-drag
                    className="pressable flex h-10 w-10 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
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
          role="tablist"
          aria-label="Metadata sections"
          onKeyDown={handleTabKeyDown}
          data-sheet-no-drag
          className={cn(
            "flex items-center gap-1",
            isMobile ? "mt-3 border border-border bg-background p-1.5" : "h-full justify-end gap-0.5",
          )}
        >
          <button
            onClick={() => setActiveTab("info")}
            id={infoTabId}
            role="tab"
            aria-selected={activeTab === "info"}
            aria-controls={infoPanelId}
            tabIndex={activeTab === "info" ? 0 : -1}
            aria-label="Show file information"
            data-sheet-no-drag
            className={cn(
              "flex items-center justify-center gap-2 border border-transparent transition-colors",
              "pressable",
              isMobile ? "h-11 flex-1 px-4 text-sm font-medium" : "h-7 w-7",
              activeTab === "info"
                ? "border-border bg-muted text-foreground"
                : "text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
            )}
          >
            <Info className="h-[15px] w-[15px]" strokeWidth={1.5} />
            {isMobile && <span>Info</span>}
          </button>
          <button
            onClick={() => setActiveTab("outline-solid")}
            id={outlineTabId}
            role="tab"
            aria-selected={activeTab === "outline-solid"}
            aria-controls={outlinePanelId}
            tabIndex={activeTab === "outline-solid" ? 0 : -1}
            aria-label="Show document outline"
            data-sheet-no-drag
            className={cn(
              "flex items-center justify-center gap-2 border border-transparent transition-colors",
              "pressable",
              isMobile ? "h-11 flex-1 px-4 text-sm font-medium" : "h-7 w-7",
              activeTab === "outline-solid"
                ? "border-border bg-muted text-foreground"
                : "text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
            )}
          >
            <Layers className="h-[15px] w-[15px]" strokeWidth={1.5} />
            {isMobile && <span>Outline</span>}
          </button>
        </div>
      </div>

      {activeTab === "info" && (
        <div
          id={infoPanelId}
          role="tabpanel"
          aria-labelledby={infoTabId}
          className={cn(
            "overflow-y-auto",
            isMobile ? "space-y-3 px-4 py-4" : "space-y-2.5 px-4 py-4",
          )}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={cn(
                "flex items-baseline justify-between gap-4",
                isMobile && "border border-border bg-background px-4 py-3",
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
        <div
          id={outlinePanelId}
          role="tabpanel"
          aria-labelledby={outlineTabId}
          className="overflow-y-auto px-4 py-4"
        >
          <p className="mb-3 text-[13px] text-muted-foreground">Document outline</p>
          <ul className="space-y-1">
            {file.content
              .split("\n")
              .filter((l) => /^#{1,3}\s/.test(l))
              .map((heading, i) => {
                const level = heading.match(/^(#+)/)?.[1].length || 1;
                const text = heading.replace(/^#+\s+/, "");
                return (
                  <li
                    key={i}
                    className={cn(
                      "truncate text-[13px] text-foreground/50",
                      isMobile && "min-h-11 border border-border bg-background px-4 py-3",
                    )}
                    style={{
                      paddingLeft: isMobile
                        ? `${16 + (level - 1) * 12}px`
                        : `${(level - 1) * 12}px`,
                    }}
                  >
                    {text}
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
