import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/shared/styling/class-names";
import { MOOD_LEVELS, MOOD_OPTIONS, type MoodLevel } from "../model";
import { journalPress, journalTransition } from "../ledger-group";

const MOOD_KEY_STEPS: Record<string, number | undefined> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

export function MoodSelector({
  mood,
  label,
  onSelect,
}: {
  mood: MoodLevel | null;
  label: string;
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
    <>
      <div
        className="grid grid-cols-5 gap-1 pb-2.5"
        role="radiogroup"
        aria-label={label}
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
              aria-label={option.label}
              className={cn(
                "group relative flex h-[54px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-lg border-0 bg-transparent text-xs focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:h-14",
                "after:absolute after:inset-x-3.5 after:bottom-1 after:h-0.5 after:origin-center after:scale-x-[.4] after:rounded-sm after:bg-accent-ink after:opacity-0 after:transition-[opacity,transform] after:duration-200 after:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:after:scale-x-100 motion-reduce:after:transition-opacity",
                "aria-checked:after:scale-x-100 aria-checked:after:opacity-100",
                active
                  ? "bg-theme-hover text-foreground"
                  : "text-theme-secondary hover:bg-theme-hover/55 hover:text-foreground",
                journalTransition,
                journalPress,
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "font-mono text-[13px] transition-colors duration-150",
                  active ? "text-accent-ink" : "text-theme-dim",
                )}
              >
                {option.icon}
              </span>
              <span aria-hidden="true">{option.label}</span>
            </button>
          );
        })}
      </div>
      <p className="border-t border-theme-divider/85 pt-2 text-[11.5px] text-theme-dim">
        Arrow keys choose a mood. Choose it again to clear it.
      </p>
    </>
  );
}
