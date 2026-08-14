import type { KeyboardEvent, RefObject } from "react";

type Props = {
  fieldId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  lineCount: number;
  placeholder: string;
};

export function JumpToLinePanel({
  fieldId,
  inputRef,
  value,
  onValueChange,
  onKeyDown,
  onBlur,
  lineCount,
  placeholder,
}: Props) {
  return (
    <div className="sticky top-3 z-40 flex h-0 items-start justify-end">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-popover p-1.5 pl-2.5 text-[13px] text-foreground shadow-[0_12px_28px_-12px_hsl(var(--scrim)/0.32)]">
        <label htmlFor={fieldId} className="text-muted-foreground">
          Line
        </label>
        <div className="flex items-center rounded-md border border-border bg-background px-2 transition-[border-color,box-shadow] duration-150 focus-within:border-ring">
          <input
            id={fieldId}
            ref={inputRef}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            inputMode="numeric"
            placeholder={placeholder}
            aria-label={`Jump to line, 1 to ${lineCount}`}
            spellCheck={false}
            className="w-16 bg-transparent py-1 text-[13px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <span className="pr-1 text-xs tabular-nums text-muted-foreground">of {lineCount}</span>
      </div>
    </div>
  );
}
