import { cn } from "../../shared/lib/utils";
import { FileTextIcon, FolderIcon } from "../../shared/icons";

function DemoFrame({ status, children }: { status: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[22rem]">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
          Preview
        </span>
        <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="overflow-hidden rounded-md bg-background/50 p-3">{children}</div>
    </div>
  );
}

function DemoSidebarRow({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm px-2 text-[10px] text-foreground/88",
        compact ? "h-6" : "h-8",
      )}
    >
      <FileTextIcon size={12} className="shrink-0 text-muted-foreground/70" />
      <span className="truncate">Weekly review.md</span>
    </div>
  );
}

export function CompactSidebarDemo({ enabled }: { enabled: boolean }) {
  return (
    <DemoFrame status={enabled ? "Compact" : "Comfortable"}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-sm border border-border/60 bg-sidebar/40 p-1.5">
          <div className="mb-1 px-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Off
          </div>
          <DemoSidebarRow compact={false} />
          <DemoSidebarRow compact={false} />
        </div>
        <div
          className={cn(
            "rounded-sm border bg-sidebar/40 p-1.5",
            enabled ? "border-foreground/30" : "border-border/60",
          )}
        >
          <div className="mb-1 px-1 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            On
          </div>
          <DemoSidebarRow compact />
          <DemoSidebarRow compact />
        </div>
      </div>
    </DemoFrame>
  );
}

type DemoTreeRowProps = {
  label: string;
  depth: number;
  kind: "folder" | "file";
  showGuides: boolean;
};

function DemoTreeGuides({ depth, showGuides }: { depth: number; showGuides: boolean }) {
  if (!showGuides || depth <= 0) return null;

  const guideLevels = Array.from({ length: depth }, (_, index) => index);
  const currentGuideLeft = 11 + (depth - 1) * 12;

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0">
      {guideLevels.map((level) => (
        <span
          key={level}
          className="absolute top-0 bottom-0 w-px bg-border/55"
          style={{ left: `${11 + level * 12}px` }}
        />
      ))}
      <span
        className="absolute h-px w-2 bg-border/55"
        style={{ left: `${currentGuideLeft}px`, top: "50%" }}
      />
    </span>
  );
}

function DemoTreeRow({ label, depth, kind, showGuides }: DemoTreeRowProps) {
  const Icon = kind === "folder" ? FolderIcon : FileTextIcon;

  return (
    <div
      className="relative flex h-7 items-center gap-1.5 rounded-sm text-[10px] text-foreground/88"
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <DemoTreeGuides depth={depth} showGuides={showGuides} />
      <Icon size={12} className="shrink-0 text-muted-foreground/70" />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function TreeGuidesDemo({ enabled }: { enabled: boolean }) {
  return (
    <DemoFrame status={enabled ? "Guides on" : "Guides off"}>
      <div className="rounded-sm border border-border/60 bg-sidebar/40 p-1.5">
        <DemoTreeRow label="Projects" depth={0} kind="folder" showGuides={enabled} />
        <DemoTreeRow label="Research" depth={1} kind="folder" showGuides={enabled} />
        <DemoTreeRow label="Meeting notes.md" depth={2} kind="file" showGuides={enabled} />
        <DemoTreeRow label="Ideas.md" depth={1} kind="file" showGuides={enabled} />
      </div>
    </DemoFrame>
  );
}
