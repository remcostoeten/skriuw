import type { ComponentType } from "react";
import {
  AlignLeftIcon,
  HistoryIcon,
  InfoIcon,
  LinkIcon,
  MessageSquareIcon,
  type IconProps,
} from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import type { InspectorSection } from "./inspector-model";
import { inspectorPress, inspectorTransition } from "./inspector-classes";

const SECTION_ICON: Record<InspectorSection, ComponentType<IconProps>> = {
  outline: AlignLeftIcon,
  comments: MessageSquareIcon,
  revisions: HistoryIcon,
  relationships: LinkIcon,
  details: InfoIcon,
};

const SECTION_LABEL: Record<InspectorSection, string> = {
  outline: "Outline",
  comments: "Comments",
  revisions: "Revisions",
  relationships: "Relationships",
  details: "Details",
};

export function inspectorSectionLabel(section: InspectorSection): string {
  return SECTION_LABEL[section];
}

type Props = {
  sections: readonly InspectorSection[];
  counts: Record<InspectorSection, number | null>;
  current: InspectorSection | null;
  scrolled: boolean;
  onJump: (section: InspectorSection) => void;
};

export function InspectorIndex({ sections, counts, current, scrolled, onJump }: Props) {
  return (
    <nav
      aria-label="Inspector sections"
      className={cn(
        "@container sticky top-0 z-[3] flex h-10 items-center gap-0.5 border-b bg-background px-2 transition-[border-color] duration-150 motion-reduce:transition-none",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      {sections.map((section, position) => {
        const Icon = SECTION_ICON[section];
        const count = counts[section];
        const label = SECTION_LABEL[section];
        return (
          <button
            key={section}
            type="button"
            data-inspector-index={section}
            aria-current={current === section ? "true" : undefined}
            aria-label={count === null ? label : `${label}, ${count}`}
            aria-keyshortcuts={String(position + 1)}
            title={`${label} (${position + 1})`}
            onClick={() => onJump(section)}
            className={cn(
              "flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[7px] bg-transparent px-1 text-[11.5px] tabular-nums hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              inspectorTransition,
              inspectorPress,
              current === section ? "bg-muted text-foreground" : "text-muted-foreground/70",
            )}
          >
            <Icon size={14} className={cn(current === section && "text-accent-ink")} />
            {count !== null && <span className="hidden @[200px]:inline">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
