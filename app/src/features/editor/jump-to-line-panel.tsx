import type { KeyboardEvent, RefObject } from "react";
import { CloseIcon } from "@/shared/icons/static";
import { Tooltip } from "@/shared/ui/tooltip";

type Props = {
  fieldId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onClose: () => void;
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
  onClose,
  lineCount,
  placeholder,
}: Props) {
  return (
    <div className="flex items-center gap-1">
      <label htmlFor={fieldId} className="pl-1 text-muted-foreground">
        Line
      </label>
      <div className="flex min-w-0 items-center rounded-md border border-border bg-background pl-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-ring">
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
          className="w-10 bg-transparent py-1 text-[13px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 pr-2 text-xs tabular-nums text-muted-foreground">
          of {lineCount}
        </span>
      </div>
      <Tooltip label="Close" shortcut="Esc" side="bottom">
        <button
          type="button"
          aria-label="Close (Esc)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/8 hover:text-foreground"
        >
          <CloseIcon size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
