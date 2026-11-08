import { cn } from "@/shared/styling/class-names";
import { FileTextIcon, FolderIcon } from "@/shared/icons/static";
import type { PaletteDensity, PaletteSize } from "@/commands/palette-options";

const previewFrame =
  "w-full max-w-[148px] rounded-md border border-sidebar-border bg-sidebar p-1.5 text-sidebar-foreground";

const TREE_ROWS = [
  { label: "Projects", depth: 0, folder: true },
  { label: "Research", depth: 1, folder: true },
  { label: "Meeting notes", depth: 2, folder: false },
  { label: "Ideas", depth: 1, folder: false },
] as const;

type TreeProps = {
  compact: boolean;
  guides: boolean;
};

export function SidebarTreePreview({ compact, guides }: TreeProps) {
  return (
    <div className={previewFrame} aria-hidden="true">
      {TREE_ROWS.map((row) => {
        const Icon = row.folder ? FolderIcon : FileTextIcon;
        return (
          <div
            key={row.label}
            className={cn(
              "relative flex items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-sm text-[10.5px] text-foreground/85 transition-[height] duration-150 motion-reduce:transition-none",
              compact ? "h-5" : "h-[26px]",
            )}
            style={{ paddingLeft: `${6 + row.depth * 12}px` }}
          >
            {Array.from({ length: row.depth }, (_, level) => (
              <span
                key={level}
                className={cn(
                  "absolute inset-y-0 w-px bg-theme-divider transition-opacity duration-150",
                  guides ? "opacity-100" : "opacity-0",
                )}
                style={{ left: `${11 + level * 12}px` }}
              />
            ))}
            <Icon size={11} className="flex-none text-theme-secondary" />
            <span className="truncate">{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const PALETTE_WIDTH: Record<PaletteSize, string> = {
  default: "w-[120px]",
  roomy: "w-[134px]",
  large: "w-[148px] p-[7px]",
};

const PALETTE_GAP: Record<PaletteDensity, string> = {
  compact: "gap-0.5",
  normal: "gap-1",
  spacious: "gap-1.5",
};

const PALETTE_ROW_HEIGHT: Record<PaletteDensity, string> = {
  compact: "h-[5px]",
  normal: "h-[7px]",
  spacious: "h-2",
};

type PaletteProps = {
  density: PaletteDensity;
  size: PaletteSize;
};

export function PalettePreview({ density, size }: PaletteProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md border border-theme-divider bg-popover p-[5px] shadow-[0_6px_18px_hsl(var(--scrim)/0.18)] transition-[width,padding] duration-150 motion-reduce:transition-none",
        PALETTE_WIDTH[size],
      )}
    >
      <div className="mb-[5px] h-3.5 rounded-[3px] bg-theme-hover/55" />
      <div className={cn("flex flex-col", PALETTE_GAP[density])}>
        <i className={cn("block rounded-sm bg-theme-active", PALETTE_ROW_HEIGHT[density])} />
        <i className={cn("block w-[70%] rounded-sm bg-theme-hover", PALETTE_ROW_HEIGHT[density])} />
        <i className={cn("block w-[55%] rounded-sm bg-theme-hover", PALETTE_ROW_HEIGHT[density])} />
      </div>
    </div>
  );
}
