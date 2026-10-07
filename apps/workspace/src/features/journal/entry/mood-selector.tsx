import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { sectionLabelClass } from "@/shared/ui/section-header";
import { MOOD_LEVELS, MOOD_OPTIONS, type MoodLevel } from "../model";

const MOOD_KEY_STEPS: Record<string, number | undefined> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

export function MoodSelector({
  mood,
  onSelect,
}: {
  mood: MoodLevel | null;
  onSelect: (mood: MoodLevel) => void;
}) {
  const buttons = useRef(new Map<MoodLevel, HTMLButtonElement>());
  const tabStop = mood ?? MOOD_LEVELS[0]!;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = MOOD_KEY_STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const current = MOOD_LEVELS.indexOf(tabStop);
    const next = MOOD_LEVELS[(current + step + MOOD_LEVELS.length) % MOOD_LEVELS.length]!;
    onSelect(next);
    buttons.current.get(next)?.focus();
  }

  return (
    <div className="mt-6 grid gap-2 max-[899px]:mt-4 sm:grid-cols-[4.5rem_1fr] sm:items-center">
      <span id="journal-mood-label" className={sectionLabelClass}>
        Mood
      </span>
      <div
        className="flex flex-wrap items-center gap-1.5 max-[899px]:grid max-[899px]:grid-cols-5 max-[899px]:gap-1"
        role="radiogroup"
        aria-labelledby="journal-mood-label"
        onKeyDown={handleKeyDown}
      >
        {MOOD_LEVELS.map((level) => {
          const option = MOOD_OPTIONS[level];
          const active = mood === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={level === tabStop ? 0 : -1}
              ref={(node) => {
                if (node === null) {
                  buttons.current.delete(level);
                  return;
                }
                buttons.current.set(level, node);
              }}
              onClick={() => onSelect(level)}
              className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors focus-visible:outline-none pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-[13px] max-[899px]:h-12 max-[899px]:flex-col max-[899px]:justify-center max-[899px]:gap-0.5 max-[899px]:px-0 max-[899px]:text-[11px] ${
                active
                  ? "border-border bg-muted font-medium text-foreground"
                  : "border-transparent text-muted-foreground/54 hover:border-border hover:bg-muted/70 hover:text-muted-foreground"
              }`}
              aria-label={option.label}
            >
              <span aria-hidden="true" className={`text-[13px] ${active ? option.colorClass : ""}`}>
                {option.icon}
              </span>
              <span aria-hidden="true">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
