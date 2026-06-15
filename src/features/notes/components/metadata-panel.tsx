"use client";

import { formatDistanceToNow } from "date-fns";
import {
  ArrowUpRight,
  Copy,
  ChevronRight,
  Eye,
  FileText,
  GitBranch,
  Hash,
  History,
  Info,
  Link2,
  ListTree,
  Plus,
  Users,
  X,
} from "lucide-react";
import { memo, type ComponentType, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { NoteVersionReason } from "@/domain/notes/models";
import {
  getNoteVersionDeltaValues,
  getVersionContextPreview,
  summarizeNoteVersionReason,
} from "@/domain/notes/versioning";
import { usePreferencesStore } from "@/features/settings/store";
import { useNoteLinkActions } from "@/features/editor/hooks/use-note-link-actions";
import { useNoteBacklinks } from "@/features/notes/hooks/use-note-backlinks";
import { useNoteVersions } from "@/features/notes/hooks/use-note-versions";
import {
  buildOutgoingNoteLinks,
  extractNoteTags,
  getNoteSearchableContent,
  getNoteTitle,
  type ResolvedNoteLink,
} from "@/domain/notes/note-links";
import { isMdxNote } from "@/features/editor/lib/editor-mode";
import { useNotesStore } from "@/features/notes/store";
import { cn } from "@/shared/lib/utils";
import { NoteSendDropdown } from "@/features/notes/components/note-send-menu";
import { GuestGate } from "@/shared/ui/guest-gate";
import { useIsGuestWorkspace } from "@/core/workspace-backend";
import {
  findRestoredSourceIndex,
  getHistoryBranchRoles,
  HistoryGraphRail,
  type HistoryBranchRole,
} from "@/features/notes/components/note-history-graph";
import { StaleShareHint } from "@/features/notes/components/stale-share-hint";
import {
  copyTextToClipboard,
  resolveClientShareUrl,
} from "@/features/notes/lib/note-share-export";
import { useNoteSharing } from "@/features/sharing/hooks/use-note-sharing";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { showUserToast } from "@/shared/lib/user-toast";
import { AnimatedNumber } from "@/shared/ui/animated-number";
import type { NoteFile, NoteVersion } from "@/types/notes";
import { CollaboratorsSection } from "@/features/collaboration/components/collaborators-section";
import { useAuth } from "@/core/auth/use-auth";

type Props = {
  file: NoteFile | null;
  files?: NoteFile[];
  className?: string;
  isMobile?: boolean;
  editorMode?: "raw" | "block";
  onToggleEditorMode?: () => void;
  onRequestClose?: () => void;
  onFileSelect?: (id: string) => void;
  onViewVersion?: (version: NoteVersion) => void;
  onShare?: (noteId: string) => void;
};

type SectionKey = "outline" | "tags" | "links" | "history" | "details" | "collaborators";

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function uniqueTags(file: NoteFile): string[] {
  return [
    ...new Set(
      [...(file.tags ?? []), ...extractNoteTags(getNoteSearchableContent(file))]
        .map(normalizeTag)
        .filter(Boolean),
    ),
  ].toSorted((a, b) => a.localeCompare(b));
}

function formatSize(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  if (bytes < 1024) return `${bytes} Bytes`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTime(date: Date) {
  return `${formatDistanceToNow(date, { addSuffix: false })} ago`;
}

function InspectorSection({
  id,
  title,
  icon: Icon,
  count,
  open,
  onToggle,
  children,
  className,
}: {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("border-b border-border", className)}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/68">
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{title}</span>
          {count !== undefined && (
            <span className="font-normal text-muted-foreground/44 tabular-nums">
              ({count})
            </span>
          )}
        </div>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform",
            open && "rotate-90",
          )}
          strokeWidth={1.5}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] leading-5 text-muted-foreground/62">{children}</p>
  );
}

function InspectorNoteControls({
  file,
  canToggleEditorMode,
  effectiveEditorMode,
  onToggleEditorMode,
  onShare,
  isMobile = false,
}: {
  file: NoteFile;
  canToggleEditorMode: boolean;
  effectiveEditorMode: "raw" | "block";
  onToggleEditorMode?: () => void;
  onShare: () => void;
  isMobile?: boolean;
}) {
  const { shareQuery, refresh } = useNoteSharing(file.id);
  const share = shareQuery.data;
  const shareActionLabel = share ? "Manage link" : "Create link";
  const isRefreshingShare = refresh.isPending;

  const handleRefreshShareLink = async () => {
    if (!share) return;
    try {
      await refresh.mutateAsync(file.id);
      showUserToast("Link refreshed", "success");
      triggerNativeFeedback("success");
    } catch {
      showUserToast("Couldn't refresh link", "error");
      triggerNativeFeedback("dismiss");
    }
  };

  const handleCopyShareLink = async () => {
    if (!share) return;
    const url = resolveClientShareUrl(share.path, share.url);
    const copied = await copyTextToClipboard(url);
    if (copied) {
      showUserToast("Link copied", "success");
      triggerNativeFeedback("success");
      return;
    }
    showUserToast("Couldn't copy link", "error");
    triggerNativeFeedback("dismiss");
  };

  const staleShareHint = share?.isStale ? (
    <StaleShareHint
      isRefreshing={isRefreshingShare}
      onRefresh={() => void handleRefreshShareLink()}
    />
  ) : null;

  const formatControl = canToggleEditorMode ? (
    <div
      className={cn(
        "inline-flex items-center gap-1.5",
        isMobile ? "min-h-11 text-[15px]" : "text-[13px]",
      )}
      role="group"
      aria-label="Editor mode"
    >
      <button
        type="button"
        onClick={effectiveEditorMode === "raw" ? onToggleEditorMode : undefined}
        aria-pressed={effectiveEditorMode === "block"}
        className={cn(
          "pressable rounded-md transition-colors",
          isMobile ? "min-h-11 px-3" : "",
          effectiveEditorMode === "block"
            ? "font-medium text-foreground/80"
            : "text-muted-foreground/70 hover:text-foreground",
        )}
      >
        Block
      </button>
      <span aria-hidden className="text-muted-foreground/30">
        ·
      </span>
      <button
        type="button"
        onClick={
          effectiveEditorMode === "block" ? onToggleEditorMode : undefined
        }
        aria-pressed={effectiveEditorMode === "raw"}
        className={cn(
          "pressable rounded-md transition-colors",
          isMobile ? "min-h-11 px-3" : "",
          effectiveEditorMode === "raw"
            ? "font-medium text-foreground/80"
            : "text-muted-foreground/70 hover:text-foreground",
        )}
      >
        Raw
      </button>
    </div>
  ) : (
    <span
      className={cn(
        "font-medium text-foreground/80",
        isMobile ? "text-[15px]" : "text-[13px]",
      )}
    >
      Source
    </span>
  );

  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 py-1">
          <span className="text-[13px] text-muted-foreground">Format</span>
          {formatControl}
        </div>

        <div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
          {share ? (
            <>
              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="pressable flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5"
              >
                <Copy className="h-5 w-5 shrink-0 text-foreground/72" />
                Copy link
              </button>
              <div className="mx-4 h-px bg-foreground/8" />
            </>
          ) : null}
          <GuestGate feature="share" align="start">
            <button
              type="button"
              onClick={onShare}
              className="pressable flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors active:bg-foreground/5"
            >
              <Link2 className="h-5 w-5 shrink-0 text-foreground/72" />
              {shareActionLabel}
            </button>
          </GuestGate>
          <div className="mx-4 h-px bg-foreground/8" />
          <GuestGate feature="share" align="start">
            <NoteSendDropdown note={file} isMobile mobileTriggerVariant="row" />
          </GuestGate>
        </div>
        {staleShareHint}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-[13px] text-muted-foreground">Format</dt>
        <dd>{formatControl}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-[13px] text-muted-foreground">Share link</dt>
        <dd className="flex flex-col items-end gap-1">
          {staleShareHint}
          <div className="flex items-center gap-3">
            {share ? (
              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                Copy link
              </button>
            ) : null}
            <GuestGate feature="share">
              <button
                type="button"
                onClick={onShare}
                className="text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
              >
                {shareActionLabel}
              </button>
            </GuestGate>
          </div>
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-[13px] text-muted-foreground">Send note</dt>
        <dd>
          <GuestGate feature="share">
            <NoteSendDropdown note={file} />
          </GuestGate>
        </dd>
      </div>
    </>
  );
}

type VersionListItem = {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
  reason: string;
  reasonKind: NoteVersionReason | "current";
  current?: boolean;
};

type VersionRowData = VersionListItem & {
  previousContent?: string;
};

function VersionDeltaValue({
  value,
  colorized = false,
  animate = true,
}: {
  value: number;
  colorized?: boolean;
  animate?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5",
        colorized && value > 0 && "text-emerald-400",
        colorized && value < 0 && "text-destructive",
        (!colorized || value === 0) && "text-muted-foreground/70",
      )}
    >
      <span aria-hidden>{value < 0 ? "−" : "+"}</span>
      <AnimatedNumber
        value={Math.abs(value)}
        animate={animate}
        className="tabular-nums"
      />
    </span>
  );
}

function VersionDelta({
  currentContent,
  previousContent,
  colorized = false,
  animate = true,
}: {
  currentContent: string;
  previousContent?: string;
  colorized?: boolean;
  animate?: boolean;
}) {
  const values = getNoteVersionDeltaValues(currentContent, previousContent);
  if (!values) {
    return null;
  }

  return (
    <span className="inline-flex shrink-0 items-baseline gap-1 font-mono text-[10px] tabular-nums">
      <VersionDeltaValue
        value={values.wordDelta}
        colorized={colorized}
        animate={animate}
      />
      <VersionDeltaValue
        value={values.charDelta}
        colorized={colorized}
        animate={animate}
      />
    </span>
  );
}

function getVersionEventLabel(version: VersionListItem) {
  if (
    version.reasonKind === "autosave" ||
    version.reasonKind === "checkpoint" ||
    version.reasonKind === "restore"
  ) {
    return null;
  }
  return version.reason;
}

const VersionRow = memo(function VersionRow({
  version,
  previousContent,
  branchRole,
  isFirst,
  isLast,
  hasFork,
  isRestoredSource,
  isRestoredTrunkLink,
  animateNumbers = true,
  onView,
}: {
  version: VersionListItem;
  previousContent?: string;
  branchRole: HistoryBranchRole;
  isFirst: boolean;
  isLast: boolean;
  hasFork: boolean;
  isRestoredSource?: boolean;
  isRestoredTrunkLink?: boolean;
  animateNumbers?: boolean;
  onView?: () => void;
}) {
  const eventLabel = getVersionEventLabel(version);
  const isFork = branchRole === "fork";
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const delta =
    previousContent !== undefined ? (
      <VersionDelta
        currentContent={version.content}
        previousContent={previousContent}
        colorized={isFork}
        animate={animateNumbers}
      />
    ) : null;

  const contextPreview = useMemo(
    () => getVersionContextPreview(version.content),
    [version.content],
  );

  return (
    <li className="group relative py-2 pl-9 pr-11">
      <HistoryGraphRail
        branchRole={branchRole}
        isFirst={isFirst}
        isLast={isLast}
        isCurrent={version.current}
        hasFork={hasFork}
        isRestoredTrunkLink={isRestoredTrunkLink}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {version.current
              ? "Now"
              : mounted
                ? `${formatDistanceToNow(version.createdAt, { addSuffix: false })} ago`
                : ""}
          </span>
          {isFork ? (
            <>
              <span
                aria-hidden
                className="text-[10px] text-muted-foreground/30"
              >
                ·
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-400/90">
                <GitBranch className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                Restored
              </span>
            </>
          ) : isRestoredSource ? (
            <>
              <span
                aria-hidden
                className="text-[10px] text-muted-foreground/30"
              >
                ·
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/55">
                Source
              </span>
            </>
          ) : null}
          {eventLabel ? (
            <>
              <span
                aria-hidden
                className="text-[10px] text-muted-foreground/30"
              >
                ·
              </span>
              <span className="truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
                {eventLabel}
              </span>
            </>
          ) : null}
          {delta ? (
            <>
              <span
                aria-hidden
                className="text-[10px] text-muted-foreground/30"
              >
                ·
              </span>
              {delta}
            </>
          ) : null}
        </div>
        {contextPreview ? (
          <p
            className="truncate pr-6 text-[11px] leading-4 text-muted-foreground/50"
            title={contextPreview}
          >
            {contextPreview}
          </p>
        ) : null}
      </div>
      {!version.current && onView ? (
        <button
          type="button"
          onClick={onView}
          className="hover-reveal absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-2.5 w-2.5" strokeWidth={1.6} />
          View
        </button>
      ) : null}
    </li>
  );
});

function LinkRow({
  link,
  direction,
  filesById,
  onFileSelect,
}: {
  link: ResolvedNoteLink;
  direction: "incoming" | "outgoing";
  filesById: Map<string, NoteFile>;
  onFileSelect?: (id: string) => void;
}) {
  const files = useMemo(() => [...filesById.values()], [filesById]);
  const { createAndOpenNote } = useNoteLinkActions(files);
  const source = filesById.get(link.sourceNoteId);
  const target = link.targetNoteId ? filesById.get(link.targetNoteId) : null;
  const isBacklink = direction === "incoming";
  const displayNote = isBacklink ? source : target;
  const title = displayNote
    ? getNoteTitle(displayNote)
    : link.alias || link.targetLabel;
  const isResolved = link.status === "resolved" && link.targetNoteId;
  const navigateTargetId = isBacklink ? link.sourceNoteId : link.targetNoteId;
  const rowLabel = isBacklink
    ? `Open backlink source ${title}`
    : `Open linked note ${title}`;

  if (isResolved && navigateTargetId && onFileSelect) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onFileSelect(navigateTargetId)}
          aria-label={rowLabel}
          className="group flex min-h-9 w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none active:scale-[0.99]"
        >
          <FileText
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
            {title}
          </span>
          <ArrowUpRight
            className="hover-reveal h-3.5 w-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
        </button>
      </li>
    );
  }

  if (link.status === "unresolved") {
    return (
      <li>
        <button
          type="button"
          onClick={() => createAndOpenNote(title)}
          aria-label={`Create note "${title}"`}
          className="group flex min-h-9 w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none active:scale-[0.99]"
        >
          <Plus
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/62"
            strokeWidth={1.5}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
            {title}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-primary/70">
            Create
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="flex min-h-9 items-center gap-2 px-2 py-1.5">
      <FileText
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/62"
        strokeWidth={1.5}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
        {link.alias || link.targetLabel}
      </span>
      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/52">
        {link.status}
      </span>
    </li>
  );
}

export function MetadataPanel({
  file,
  files = [],
  className,
  isMobile = false,
  editorMode = "block",
  onToggleEditorMode,
  onRequestClose,
  onFileSelect,
  onViewVersion,
  onShare,
}: Props) {
  const selectedTag = useNotesStore((state) => state.ui.selectedInspectorTag);
  const setSelectedTag = useNotesStore(
    (state) => state.setSelectedInspectorTag,
  );
  const isGuest = useIsGuestWorkspace();
  const auth = useAuth();
  const backlinksQuery = useNoteBacklinks(file?.id);
  const versionsQuery = useNoteVersions(file?.id);
  const animateNumbers = usePreferencesStore(
    (state) => state.editor.animateNumbers,
  );
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(
    {
      outline: true,
      tags: true,
      links: true,
      history: true,
      details: true,
      collaborators: false,
    },
  );
  const isMdx = isMdxNote(file);
  const effectiveEditorMode = isMdx ? "raw" : editorMode;
  const canToggleEditorMode = !isMdx && Boolean(onToggleEditorMode);
  const { shareQuery } = useNoteSharing(file?.id);
  const inspectorControlCount = isMobile && shareQuery.data ? 4 : 3;

  const details = useMemo(() => {
    if (!file) return [];
    const wordCount = file.content.split(/\s+/).filter(Boolean).length;
    const charCount = file.content.length;
    const fileSize = new Blob([file.content]).size;
    const readTime = Math.max(1, Math.ceil(wordCount / 200));

    return [
      { label: "Created", value: formatTime(file.createdAt) },
      { label: "Modified", value: formatTime(file.modifiedAt) },
      { label: "File Size", value: formatSize(fileSize) },
      { label: "Characters", value: charCount.toLocaleString() },
      { label: "Words", value: wordCount.toLocaleString() },
      { label: "Read Time", value: `${readTime}m` },
    ];
  }, [file]);

  const headingItems = useMemo(() => {
    if (!file) return [];
    return file.content
      .split("\n")
      .filter((line) => /^#{1,3}\s/.test(line))
      .map((heading) => ({
        level: heading.match(/^(#+)/)?.[1].length || 1,
        text: heading.replace(/^#+\s+/, ""),
      }));
  }, [file]);

  const outgoingLinks = useMemo(
    () => buildOutgoingNoteLinks(file, files),
    [file, files],
  );
  const backlinks = backlinksQuery.data ?? [];
  const filesById = useMemo(
    () => new Map(files.map((item) => [item.id, item])),
    [files],
  );
  const tags = useMemo(() => (file ? uniqueTags(file) : []), [file]);
  const taggedNotes = useMemo(() => {
    if (!file || !selectedTag) return [];
    return files.filter(
      (item) => item.id !== file.id && uniqueTags(item).includes(selectedTag),
    );
  }, [file, files, selectedTag]);
  const historyItems = useMemo<VersionRowData[]>(() => {
    if (!file) return [];

    const checkpoints = (versionsQuery.data ?? []).map((version) => ({
      id: version.id,
      name: version.name,
      content: version.content,
      createdAt: version.createdAt,
      reason: summarizeNoteVersionReason(version.reason),
      reasonKind: version.reason,
      current: false,
    }));

    const items = [
      {
        id: `current-${file.id}`,
        name: file.name,
        content: file.content,
        createdAt: file.modifiedAt,
        reason: "",
        reasonKind: "current" as const,
        current: true,
      },
      ...checkpoints,
    ];

    return items.map((item, index) => ({
      ...item,
      previousContent: index === 0 ? undefined : items[index - 1]?.content,
    }));
  }, [file, versionsQuery.data]);

  const historyBranchRoles = useMemo(
    () => getHistoryBranchRoles(historyItems),
    [historyItems],
  );
  const hasRestoreBranch = historyBranchRoles.includes("fork");
  const restoredSourceIndex = useMemo(() => {
    if (!hasRestoreBranch) return null;
    const forkIndex = historyBranchRoles.indexOf("fork");
    return findRestoredSourceIndex(historyItems, forkIndex);
  }, [hasRestoreBranch, historyBranchRoles, historyItems]);

  const toggleSection = (section: SectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  useEffect(() => {
    if (!selectedTag) return;
    if (!tags.includes(selectedTag)) {
      setSelectedTag(null);
    }
  }, [selectedTag, tags]);

  const handleShare = () => {
    if (!file) return;
    onShare?.(file.id);
  };

  const asideClass = cn(
    "flex min-h-0 flex-col bg-background",
    isMobile
      ? "h-full w-full rounded-[inherit] border-0 bg-transparent"
      : "h-full w-72 border-l border-border xl:w-80",
    className,
  );

  if (!file) {
    return <aside aria-label="Note inspector" className={asideClass} />;
  }

  return (
    <aside aria-label="Note inspector" className={asideClass}>
      {isMobile && (
        <div className="shrink-0 border-b border-border bg-background px-4 pb-3 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="mx-auto h-1.5 w-12 bg-border" />
            {onRequestClose && (
              <button
                onClick={onRequestClose}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label="Close details"
                data-sheet-no-drag
                className="pressable flex h-10 w-10 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                title="Close details"
              >
                <X className="h-4 w-4" strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorSection
          id="note-inspector-outline"
          title="Outline"
          icon={ListTree}
          count={headingItems.length}
          open={openSections.outline}
          onToggle={() => toggleSection("outline")}
        >
          {headingItems.length > 0 ? (
            <ul className="-mx-2 space-y-px">
              {headingItems.map((heading, index) => {
                const indent = (heading.level - 1) * 12;
                return (
                  <li key={`${heading.text}-${index}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const all = Array.from(
                          document.querySelectorAll<HTMLElement>(
                            '[data-content-type="heading"]',
                          ),
                        );
                        const levelStr =
                          heading.level === 1 ? null : String(heading.level);
                        const candidates = all.filter(
                          (el) =>
                            (el.getAttribute("data-level") ?? null) ===
                              levelStr &&
                            el.textContent?.trim() === heading.text,
                        );
                        const target =
                          candidates[0] ??
                          all.find(
                            (el) => el.textContent?.trim() === heading.text,
                          );
                        target?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                      className={cn(
                        "group flex w-full cursor-pointer items-center gap-0 rounded text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        heading.level === 1
                          ? "text-foreground/72"
                          : heading.level === 2
                            ? "text-foreground/58"
                            : "text-foreground/46",
                      )}
                      style={{ paddingLeft: `${indent + 8}px` }}
                      title={heading.text}
                    >
                      {heading.level > 1 && (
                        <span
                          className={cn(
                            "mr-2 shrink-0 self-stretch",
                            "border-l",
                            heading.level === 2
                              ? "border-muted-foreground/20"
                              : "border-muted-foreground/12",
                          )}
                        />
                      )}
                      <span
                        className={cn(
                          "truncate py-1 pr-2",
                          heading.level === 1
                            ? "text-[12.5px] font-medium"
                            : heading.level === 2
                              ? "text-[12px]"
                              : "text-[11.5px]",
                        )}
                      >
                        {heading.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyLine>No headings</EmptyLine>
          )}
        </InspectorSection>

        <InspectorSection
          id="note-inspector-tags"
          title="Tags"
          icon={Hash}
          count={tags.length}
          open={openSections.tags}
          onToggle={() => toggleSection("tags")}
        >
          {tags.length > 0 ? (
            <div className="space-y-3">
              <ul
                aria-label="Tags on this note"
                className="flex flex-wrap gap-1.5"
              >
                {tags.map((tag) => {
                  const isSelected = tag === selectedTag;
                  return (
                    <li key={tag}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? "Hide" : "Show"} notes tagged ${tag}`}
                        onClick={() => setSelectedTag(isSelected ? null : tag)}
                        className={cn(
                          "inline-flex min-h-7 cursor-pointer items-center border px-2 text-[12px] font-medium transition-colors focus-visible:border-ring focus-visible:outline-none",
                          isSelected
                            ? "border-ring bg-secondary text-foreground"
                            : "border-border bg-secondary/50 text-foreground/78 hover:border-ring/70 hover:text-foreground",
                        )}
                      >
                        #{tag}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selectedTag ? (
                <div className="-mx-2">
                  <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/62">
                    Tagged #{selectedTag}
                  </p>
                  {taggedNotes.length > 0 ? (
                    <ul
                      aria-label={`Notes tagged ${selectedTag}`}
                      className="space-y-0.5"
                    >
                      {taggedNotes.map((taggedFile) => (
                        <li key={taggedFile.id}>
                          <button
                            type="button"
                            onClick={() => onFileSelect?.(taggedFile.id)}
                            disabled={!onFileSelect}
                            className="group flex min-h-9 w-full cursor-pointer items-center gap-2 border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted focus-visible:border-ring focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60 active:scale-[0.99]"
                          >
                            <FileText
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/82">
                              {getNoteTitle(taggedFile)}
                            </span>
                            <ArrowUpRight
                              className="hover-reveal h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyLine>
                      No other notes are tagged #{selectedTag}.
                    </EmptyLine>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyLine>
              No tags yet. Type # in the editor or use /tag.
            </EmptyLine>
          )}
        </InspectorSection>

        {(backlinks.length > 0 || outgoingLinks.length > 0) && (
          <InspectorSection
            id="note-inspector-links"
            title="Links"
            icon={Link2}
            count={backlinks.length + outgoingLinks.length}
            open={openSections.links}
            onToggle={() => toggleSection("links")}
          >
            <div className="space-y-4">
              {backlinks.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/50">
                    Backlinks · {backlinks.length}
                  </p>
                  <ul
                    aria-label="Notes linking to this note"
                    className="-mx-2 space-y-0.5"
                  >
                    {backlinks.map((link, index) => (
                      <LinkRow
                        key={`${link.sourceNoteId}-${link.targetNoteId ?? "unresolved"}-${index}`}
                        direction="incoming"
                        link={link}
                        filesById={filesById}
                        onFileSelect={onFileSelect}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {outgoingLinks.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/50">
                    Outgoing · {outgoingLinks.length}
                  </p>
                  <ul
                    aria-label="Notes this note links to"
                    className="-mx-2 space-y-0.5"
                  >
                    {outgoingLinks.map((link, index) => (
                      <LinkRow
                        key={`${link.targetNoteId ?? link.targetLabel}-${index}`}
                        direction="outgoing"
                        link={link}
                        filesById={filesById}
                        onFileSelect={onFileSelect}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </InspectorSection>
        )}

        {/* Collaborators — only for authenticated note owners (not guests). */}
        {!isGuest && file && auth.user && (
          <InspectorSection
            id="note-inspector-collaborators"
            title="Collaborators"
            icon={Users}
            open={openSections.collaborators}
            onToggle={() => toggleSection("collaborators")}
          >
            <CollaboratorsSection
              noteId={file.id}
              ownerName={auth.user.name}
              isOwner={true}
            />
          </InspectorSection>
        )}

        {/* Version history doesn't carry across sessions for guests — hide it. */}
        {!isGuest && (
        <InspectorSection
          id="note-inspector-history"
          title="History"
          icon={History}
          count={historyItems.length}
          open={openSections.history}
          onToggle={() => toggleSection("history")}
        >
          {historyItems.length > 0 ? (
            <ol className="relative -mx-1">
              {historyItems.map((version, index) => {
                const forkIndex = hasRestoreBranch
                  ? historyBranchRoles.indexOf("fork")
                  : -1;
                const isRestoredTrunkLink =
                  restoredSourceIndex !== null &&
                  forkIndex !== -1 &&
                  index > forkIndex &&
                  index <= restoredSourceIndex;

                return (
                  <VersionRow
                    key={version.id}
                    version={version}
                    previousContent={version.previousContent}
                    branchRole={historyBranchRoles[index] ?? "trunk"}
                    isFirst={index === 0}
                    isLast={index === historyItems.length - 1}
                    hasFork={hasRestoreBranch}
                    isRestoredSource={index === restoredSourceIndex}
                    isRestoredTrunkLink={isRestoredTrunkLink}
                    animateNumbers={animateNumbers}
                    onView={
                      !version.current && onViewVersion
                        ? () => {
                            const fullVersion = (versionsQuery.data ?? []).find(
                              (v) => v.id === version.id,
                            );
                            if (fullVersion) {
                              onViewVersion(fullVersion);
                            }
                          }
                        : undefined
                    }
                  />
                );
              })}
            </ol>
          ) : (
            <EmptyLine>
              No history yet. The first checkpoint appears after the next save.
            </EmptyLine>
          )}
        </InspectorSection>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background">
        <InspectorSection
          id="note-inspector-details"
          title="Details"
          icon={Info}
          count={details.length + inspectorControlCount}
          open={openSections.details}
          onToggle={() => toggleSection("details")}
          className="border-b-0"
        >
          <dl className="space-y-2.5">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="text-[13px] text-muted-foreground">
                  {detail.label}
                </dt>
                <dd className="text-[13px] font-medium text-foreground/80 tabular-nums">
                  {detail.value}
                </dd>
              </div>
            ))}
            <div
              aria-hidden
              className="my-1 border-t border-border/70"
              role="separator"
            />
            <InspectorNoteControls
              file={file}
              canToggleEditorMode={canToggleEditorMode}
              effectiveEditorMode={effectiveEditorMode}
              onToggleEditorMode={onToggleEditorMode}
              onShare={handleShare}
              isMobile={isMobile}
            />
          </dl>
        </InspectorSection>
      </div>
    </aside>
  );
}
