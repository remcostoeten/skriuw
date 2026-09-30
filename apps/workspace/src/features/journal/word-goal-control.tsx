import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { DateKey } from "@skriuw/renderer-core/journal/dates";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { setJournalWordGoal } from "./actions";
import {
  MAX_WORD_GOAL,
  WORD_GOAL_PRESETS,
  crossedWordGoalMilestone,
  parseWordGoalInput,
  selectWordGoalHistory,
  wordGoalFraction,
  wordGoalOn,
  type WordGoalMilestone,
} from "./word-goal";

type Props = {
  store: RendererStore;
  noteId: string | null;
  dateKey: DateKey;
  today: DateKey;
  wordCount: number;
};

const RING_SIZE = 14;
const RING_RADIUS = 5.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const triggerClass =
  "flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[11px] tabular-nums text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted pointer-coarse:h-11 pointer-coarse:px-2.5";

function ProgressRing({ fraction, met }: { fraction: number | null; met: boolean }) {
  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      aria-hidden="true"
      className={cn("shrink-0 -rotate-90", met ? "text-primary" : "text-foreground/55")}
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={1.5}
        strokeDasharray={fraction === null ? "2 2" : undefined}
      />
      {fraction !== null && fraction > 0 && (
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
        />
      )}
      {met && <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={2} fill="currentColor" />}
    </svg>
  );
}

function milestoneMessage(milestone: WordGoalMilestone, goal: number): string {
  return milestone === "reached"
    ? `Word goal reached: ${goal} words.`
    : `Halfway to your ${goal} word goal.`;
}

function goalLabel(words: number): string {
  return `${words} words`;
}

function useMilestoneAnnouncement(
  noteId: string | null,
  wordCount: number,
  goal: number | null,
): string {
  const [message, setMessage] = useState("");
  const previous = useRef<{ noteId: string | null; words: number; goal: number | null } | null>(
    null,
  );
  useEffect(() => {
    const last = previous.current;
    previous.current = { noteId, words: wordCount, goal };
    if (last === null || last.noteId !== noteId || last.goal !== goal) {
      setMessage("");
      return;
    }
    if (goal === null) {
      return;
    }
    const milestone = crossedWordGoalMilestone(last.words, wordCount, goal);
    if (milestone !== null) {
      setMessage(milestoneMessage(milestone, goal));
    }
  }, [goal, noteId, wordCount]);
  return message;
}

export function WordGoalControl({ store, noteId, dateKey, today, wordCount }: Props) {
  const history = useRendererSelector(store, selectWordGoalHistory);
  const goal = wordGoalOn(history, dateKey);
  const currentGoal = wordGoalOn(history, today);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocus = useRef(false);
  const customRequested = useRef(false);
  const customSettled = useRef(true);
  const announcement = useMilestoneAnnouncement(noteId, wordCount, goal);
  const met = goal !== null && wordCount >= goal;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    if (restoreTriggerFocus.current) {
      restoreTriggerFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [editing]);

  function requestCustom(): void {
    customRequested.current = true;
    setDraft(currentGoal === null ? "" : `${currentGoal}`);
  }

  function finishCustom(commit: boolean): void {
    if (customSettled.current) {
      return;
    }
    customSettled.current = true;
    const words = parseWordGoalInput(draft);
    if (commit && words !== null) {
      setJournalWordGoal(store, words);
    }
    restoreTriggerFocus.current = true;
    setEditing(false);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      finishCustom(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishCustom(false);
    }
  }

  const fraction = goal === null ? null : wordGoalFraction(wordCount, goal);
  const triggerLabel =
    goal === null
      ? "Daily word goal"
      : `${wordCount} of ${goal} words${met ? ", goal met" : ""}. Change the daily word goal`;

  return (
    <>
      {editing ? (
        <label className="flex h-8 items-center gap-1.5 text-[11px] text-muted-foreground pointer-coarse:h-11">
          <span className="sr-only">Daily word goal</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={() => finishCustom(true)}
            aria-describedby="journal-word-goal-hint"
            placeholder="Words"
            className="h-7 w-16 rounded-md border border-border bg-background px-2 text-[11px] tabular-nums text-foreground outline-none focus:border-foreground/40"
          />
          <span aria-hidden="true">words</span>
          <span id="journal-word-goal-hint" className="sr-only">
            {`A whole number from 1 to ${MAX_WORD_GOAL}. Enter saves, Escape cancels.`}
          </span>
        </label>
      ) : (
        <DropdownMenu>
          <Tooltip label={goal === null ? "Daily word goal" : "Word goal"} side="bottom">
            <DropdownMenuTrigger asChild>
              <button
                ref={triggerRef}
                type="button"
                aria-label={triggerLabel}
                className={triggerClass}
              >
                <ProgressRing fraction={fraction} met={met} />
                {goal !== null && (
                  <span aria-hidden="true" className={cn(met && "text-foreground/80")}>
                    {wordCount} / {goal}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            className="min-w-44"
            onCloseAutoFocus={(event) => {
              if (customRequested.current) {
                customRequested.current = false;
                event.preventDefault();
                customSettled.current = false;
                setEditing(true);
              }
            }}
          >
            <DropdownMenuLabel>Daily word goal, from today</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={currentGoal === null}
              onSelect={() => setJournalWordGoal(store, 0)}
            >
              Off
            </DropdownMenuCheckboxItem>
            {WORD_GOAL_PRESETS.map((words) => (
              <DropdownMenuCheckboxItem
                key={words}
                checked={currentGoal === words}
                onSelect={() => setJournalWordGoal(store, words)}
              >
                {goalLabel(words)}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={requestCustom}>
              {currentGoal !== null && !WORD_GOAL_PRESETS.includes(currentGoal)
                ? `Custom: ${goalLabel(currentGoal)}`
                : "Custom…"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
