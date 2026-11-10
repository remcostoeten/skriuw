import { Tooltip } from "@skriuw/shared/ui/tooltip";
import {
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  RotateCcwIcon,
  SplitViewIcon,
  SplitViewStackedIcon,
} from "@/shared/icons/static";
import { formatRelativeTime } from "@/shared/format/relative-time";
import { cn } from "@/shared/styling/class-names";
import { InlineConfirm } from "@/shared/ui/inline-confirm";
import {
  SegmentedControl,
  settingsButton,
  settingsPress,
  settingsSegmentButton,
  settingsSegmentGroup,
  settingsTransition,
} from "@/shared/ui/settings-controls";
import { useMarkdownDiff } from "./diff/view";
import type { DiffLayout } from "./diff/split-model";
import { describeWordDelta, formatSignedWords } from "./timeline/ledger-model";
import { formatVersionClock, formatVersionTimestamp, type VersionListItem } from "./versions/model";

export type PreviewMode = "diff" | "full";

const MODE_OPTIONS: readonly { value: PreviewMode; label: string }[] = [
  { value: "diff", label: "Changes" },
  { value: "full", label: "Revision" },
];

const LAYOUT_OPTIONS: readonly { value: DiffLayout; label: string; Icon: typeof SplitViewIcon }[] =
  [
    { value: "unified", label: "Unified", Icon: SplitViewStackedIcon },
    { value: "split", label: "Side by side", Icon: SplitViewIcon },
  ];

const iconButton = cn(
  "grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-[7px] border-0 bg-transparent text-theme-secondary hover:bg-theme-hover hover:text-foreground disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:active:scale-100",
  settingsTransition,
  settingsPress,
);

type Props = {
  item: VersionListItem;
  position: number;
  total: number;
  dayLabel: string;
  versionMarkdown: string | null;
  currentMarkdown: string | null;
  mode: PreviewMode;
  layout: DiffLayout;
  showLayout: boolean;
  restoring: boolean;
  hasNewer: boolean;
  hasOlder: boolean;
  onMode: (mode: PreviewMode) => void;
  onLayout: (layout: DiffLayout) => void;
  onStep: (step: 1 | -1) => void;
  onCopy: () => void;
  onRestore: () => void;
  onClose: () => void;
};

export function ReadingHeader({
  item,
  position,
  total,
  dayLabel,
  versionMarkdown,
  currentMarkdown,
  mode,
  layout,
  showLayout,
  restoring,
  hasNewer,
  hasOlder,
  onMode,
  onLayout,
  onStep,
  onCopy,
  onRestore,
  onClose,
}: Props) {
  const ready = versionMarkdown !== null;
  const wordDelta = formatSignedWords(item.wordDelta);
  return (
    <header className="history-reading-header flex h-[52px] flex-none items-center gap-3 border-b border-theme-divider px-5">
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <h2
          className="m-0 shrink-0 text-[14px] font-medium tracking-[-0.01em] text-foreground"
          title={formatVersionTimestamp(item.createdAt)}
        >
          {dayLabel}, {formatVersionClock(item.createdAt)}
        </h2>
        <p className="m-0 flex min-w-0 items-baseline gap-2 truncate text-[12px] tabular-nums text-theme-secondary">
          <span>{position === total ? "Latest" : `${position} of ${total}`}</span>
          {dayLabel === "Today" && (
            <>
              <Dot />
              <span className="truncate">{formatRelativeTime(item.createdAt)}</span>
            </>
          )}
          {wordDelta !== "" && (
            <>
              <Dot />
              <span title={describeWordDelta(item.wordDelta)}>{wordDelta} words</span>
            </>
          )}
          {ready && currentMarkdown !== null && (
            <LineStats versionMarkdown={versionMarkdown} currentMarkdown={currentMarkdown} />
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex items-center max-[720px]:hidden">
          <Tooltip label="Newer revision (↑)">
            <button
              type="button"
              aria-label="Newer revision"
              className={iconButton}
              disabled={!hasNewer}
              onClick={() => onStep(-1)}
            >
              <ChevronDownIcon size={14} className="rotate-180" />
            </button>
          </Tooltip>
          <Tooltip label="Older revision (↓)">
            <button
              type="button"
              aria-label="Older revision"
              className={iconButton}
              disabled={!hasOlder}
              onClick={() => onStep(1)}
            >
              <ChevronDownIcon size={14} />
            </button>
          </Tooltip>
        </div>
        {showLayout && mode === "diff" && <LayoutToggle layout={layout} onChange={onLayout} />}
        {currentMarkdown !== null && (
          <SegmentedControl
            label="Preview mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={onMode}
          />
        )}
        <Tooltip label="Copy as Markdown (C)">
          <button
            type="button"
            aria-label="Copy revision as Markdown"
            aria-keyshortcuts="C"
            className={iconButton}
            disabled={!ready}
            onClick={onCopy}
          >
            <CopyIcon size={14} />
          </button>
        </Tooltip>
        <InlineConfirm
          confirmLabel="Restore"
          message="Replace the note with this revision?"
          onConfirm={onRestore}
          renderIdle={(arm) => (
            <button
              type="button"
              className={settingsButton}
              disabled={!ready || restoring}
              onClick={arm}
            >
              <RotateCcwIcon size={13} />
              {restoring ? "Restoring…" : "Restore"}
            </button>
          )}
        />
        <Tooltip label="Close (Esc)">
          <button
            type="button"
            aria-label="Close revision"
            className={iconButton}
            onClick={onClose}
          >
            <CloseIcon size={13} />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-theme-dim">
      ·
    </span>
  );
}

type LineStatsProps = {
  versionMarkdown: string;
  currentMarkdown: string;
};

function LineStats({ versionMarkdown, currentMarkdown }: LineStatsProps) {
  const diff = useMarkdownDiff(versionMarkdown, currentMarkdown);
  if (diff.stats.added === 0 && diff.stats.removed === 0) {
    return (
      <>
        <Dot />
        <span>Same as now</span>
      </>
    );
  }
  return (
    <>
      <Dot />
      <span
        className="font-mono text-[11px]"
        title={`${diff.stats.added} lines added and ${diff.stats.removed} removed since this revision`}
      >
        <span className="diff-stat-added">+{diff.stats.added}</span>{" "}
        <span className="diff-stat-removed">−{diff.stats.removed}</span>
        <span className="font-sans text-theme-dim"> lines to now</span>
      </span>
    </>
  );
}

type LayoutToggleProps = {
  layout: DiffLayout;
  onChange: (layout: DiffLayout) => void;
};

function LayoutToggle({ layout, onChange }: LayoutToggleProps) {
  return (
    <div role="radiogroup" aria-label="Diff layout" className={settingsSegmentGroup}>
      {LAYOUT_OPTIONS.map((option) => {
        const active = layout === option.value;
        return (
          <Tooltip key={option.value} label={option.label}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              onClick={() => onChange(option.value)}
              className={cn(settingsSegmentButton, "grid place-items-center px-1.5")}
            >
              <option.Icon size={13} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
