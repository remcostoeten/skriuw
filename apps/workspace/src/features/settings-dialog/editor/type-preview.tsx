import type { CSSProperties } from "react";
import { cn } from "@/shared/styling/class-names";
import type { VimCursorStyle } from "@/features/settings/settings-model";

const FONT_FAMILIES: Record<string, string> = {
  inter: "var(--font-sans)",
  serif: 'Georgia, "Times New Roman", serif',
  mono: "var(--font-mono)",
};

const LINE_HEIGHTS: Record<string, number> = {
  cozy: 1.45,
  comfortable: 1.65,
  relaxed: 1.95,
};

const CURSOR_CLASSES: Record<VimCursorStyle, string> = {
  block: "bg-foreground text-background",
  underline: "shadow-[inset_0_-2px_0_hsl(var(--foreground))]",
  bar: "shadow-[inset_1.5px_0_0_hsl(var(--foreground))]",
};

type Props = {
  font: string;
  lineHeight: string;
  vimMode: boolean;
  vimCursorStyle: VimCursorStyle;
  vimCursorBlink: boolean;
};

export function EditorTypePreview({
  font,
  lineHeight,
  vimMode,
  vimCursorStyle,
  vimCursorBlink,
}: Props) {
  const style: CSSProperties = {
    fontFamily: FONT_FAMILIES[font] ?? FONT_FAMILIES.inter,
    lineHeight: LINE_HEIGHTS[lineHeight] ?? LINE_HEIGHTS.comfortable,
  };
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[148px] rounded-md border border-sidebar-border bg-background px-[11px] py-2.5 text-[11px] text-foreground/80 transition-[line-height] duration-150"
      style={style}
    >
      <b className="mb-1 block text-[13px] leading-[1.3] font-semibold text-foreground">
        Weekly review
      </b>
      <p className="m-0">
        Three things moved this week. The reading list finally has an ord
        {vimMode ? (
          <span
            className={cn(
              "inline-block rounded-[1px]",
              CURSOR_CLASSES[vimCursorStyle],
              vimCursorBlink &&
                "animate-[settings-caret-blink_1.1s_steps(1)_infinite] motion-reduce:animate-none",
            )}
          >
            e
          </span>
        ) : (
          "e"
        )}
        r.
      </p>
    </div>
  );
}
