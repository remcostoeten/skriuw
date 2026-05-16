"use client";

import { cn } from "@/shared/lib/utils";
import {
  getEditorFontFamily,
  getEditorFontLabel,
  getEditorFontOptions,
  type EditorFontId,
} from "@/shared/lib/editor-fonts";

type EditorFontPickerProps = {
  value: EditorFontId;
  onChange: (fontId: EditorFontId) => void;
};

export function EditorFontPicker({ value, onChange }: EditorFontPickerProps) {
  return (
    <div className="grid w-full max-w-[28rem] grid-cols-2 gap-2 sm:grid-cols-4">
      {getEditorFontOptions().map((font) => {
        const active = value === font.id;
        return (
          <button
            key={font.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(font.id)}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors",
              "border-border/70 bg-background text-foreground/80 hover:bg-accent hover:text-accent-foreground",
              active && "border-border bg-accent text-accent-foreground shadow-sm",
            )}
            style={{ fontFamily: getEditorFontFamily(font.id) }}
          >
            {getEditorFontLabel(font.id)}
          </button>
        );
      })}
    </div>
  );
}
