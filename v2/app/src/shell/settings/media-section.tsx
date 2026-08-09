import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteMediaBlob,
  listMediaBlobs,
  revealWorkspaceImages,
  storeNoteImage,
  sweepUnusedMediaBlobs,
} from "../../bridge/commands";
import type { MediaBlobPayload } from "../../bridge/commands";
import { FolderOpenIcon, Trash2Icon, UploadIcon } from "../../shared/icons";
import { resolveImageBlobUrl } from "../../shared/lib/image-blob-url";
import { resolveMediaPlaybackUrl } from "../../shared/lib/media-playback-url";
import { isBrowserRuntime } from "../../bridge/runtime";
import { cn } from "../../shared/lib/utils";
import { Button } from "../../shared/ui/button";
import { InlineConfirm } from "../../shared/ui/inline-confirm";
import { MediaLightbox } from "../../shared/ui/media-lightbox";
import {
  countUnusedMedia,
  describeMediaUsage,
  imageFormatLabel,
  isUnusedMedia,
  isVideoMime,
  projectMediaLibrary,
} from "../../settings/media-library-model";
import type { MediaLibraryEntry } from "../../settings/media-library-model";
import type { MediaUsage } from "../../settings/media-library-model";
import { formatSizeBytes } from "../../settings/maintenance-model";
import type { RendererState } from "../../store/types";
import { useRendererSelector } from "../../store/use-renderer-selector";
import {
  SettingsHeading,
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsRow,
  settingsRowDescription,
  settingsRowDetail,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

const ACCEPTED_TYPES =
  "image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm";
const PAGE_SIZE = 60;

type MediaStatus =
  | { kind: "idle" }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };

type MediaSectionProps = SectionProps & {
  onOpenReference: (usage: MediaUsage) => void;
};

function selectImages(state: RendererState) {
  return state.images;
}

function selectNodes(state: RendererState) {
  return state.sourceNodes;
}

function selectDocuments(state: RendererState) {
  return state.documents;
}

type MediaFilter = "all" | "inline" | "cover" | "journal" | "unused";

const MEDIA_FILTERS: readonly { id: MediaFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "inline", label: "Inline" },
  { id: "cover", label: "Covers" },
  { id: "journal", label: "Journal" },
  { id: "unused", label: "Unused" },
];

export function MediaSection({ store, onOpenReference }: MediaSectionProps) {
  const images = useRendererSelector(store, selectImages);
  const nodes = useRendererSelector(store, selectNodes);
  const documents = useRendererSelector(store, selectDocuments);
  const [blobs, setBlobs] = useState<MediaBlobPayload[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [status, setStatus] = useState<MediaStatus>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [sweepArmed, setSweepArmed] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<MediaLibraryEntry | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filterBeforeSweepRef = useRef<MediaFilter>("all");
  const mountedRef = useRef(true);

  function refresh(): void {
    listMediaBlobs()
      .then((listed) => {
        if (mountedRef.current) {
          setBlobs(listed);
          setListFailed(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setListFailed(true);
        }
      });
  }

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const entries = useMemo(
    () => projectMediaLibrary(blobs ?? [], images, nodes, documents),
    [blobs, documents, images, nodes],
  );
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (filter === "all") return true;
        if (filter === "unused") return isUnusedMedia(entry);
        if (filter === "journal") {
          return entry.usages.some((usage) => usage.surface === "journal");
        }
        return entry.usages.some((usage) => usage.placement === filter);
      }),
    [entries, filter],
  );
  const unusedCount = countUnusedMedia(entries);

  function finish(next: MediaStatus): void {
    if (mountedRef.current) {
      setStatus(next);
      setBusy(false);
    }
    refresh();
  }

  function addFiles(files: readonly File[]): void {
    if (files.length === 0) {
      return;
    }
    setBusy(true);
    Promise.all(
      files.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await storeNoteImage(bytes);
      }),
    )
      .then(() => {
        const noun = files.length === 1 ? "image" : "images";
        finish({
          kind: "info",
          message: `Added ${files.length} ${noun} to the library.`,
        });
      })
      .catch((error) => {
        finish({
          kind: "error",
          message: `Adding images failed: ${String(error)}`,
        });
      });
  }

  function deleteEntry(entry: MediaLibraryEntry): void {
    setBusy(true);
    deleteMediaBlob(entry.contentHash, entry.mimeType)
      .then(() => {
        finish({ kind: "info", message: "Image deleted." });
      })
      .catch((error) => {
        finish({ kind: "error", message: `Delete failed: ${String(error)}` });
      });
  }

  function changeFilter(next: MediaFilter): void {
    setFilter(next);
    setVisibleLimit(PAGE_SIZE);
  }

  function armSweep(): void {
    filterBeforeSweepRef.current = filter;
    setSweepArmed(true);
    changeFilter("unused");
  }

  function disarmSweep(): void {
    setSweepArmed(false);
    changeFilter(filterBeforeSweepRef.current);
  }

  function removeAllUnused(): void {
    setBusy(true);
    const liveContentHashes = [
      ...new Set([...images.values()].map((image) => image.contentHash)),
    ];
    sweepUnusedMediaBlobs(liveContentHashes)
      .then((removed) => {
        const noun = removed === 1 ? "image" : "images";
        finish({
          kind: "info",
          message:
            removed === 0
              ? "Nothing removed. Images added in the last minute are kept as a safety margin."
              : `Removed ${removed} unused ${noun}.`,
        });
      })
      .catch((error) => {
        finish({ kind: "error", message: `Cleanup failed: ${String(error)}` });
      });
  }

  return (
    <section aria-label="Media" className={settingsSection}>
      <SettingsHeading
        title="Media"
        detail="Every image stored in this workspace, with the notes that use it. Unused images stay until you delete them."
      />
      <div className={settingsGroup}>
        <div className={settingsRow}>
          <span className={settingsRowLabel}>
            Library
            <span className={settingsRowDescription}>
              {entries.length === 1 ? "1 file" : `${entries.length} files`}
              {unusedCount > 0 ? ` · ${unusedCount} unused` : ""}. Stored once
              per unique file in the blobs folder next to the database.
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles([...(event.currentTarget.files ?? [])]);
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              className={settingsButton}
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon size={15} />
              Add media…
            </button>
            {!isBrowserRuntime() && (
              <button
                type="button"
                className={settingsButton}
                onClick={() => {
                  revealWorkspaceImages().catch((error) => {
                    console.error("reveal images rejected", error);
                  });
                }}
              >
                <FolderOpenIcon size={15} />
                Show in file manager
              </button>
            )}
          </span>
        </div>
        {unusedCount > 0 && (
          <div className={settingsRow}>
            <span className={settingsRowLabel}>
              Remove all unused
              <span className={settingsRowDescription}>
                Deletes every image that no note references. This cannot be
                undone.
              </span>
            </span>
            <InlineConfirm
              confirmLabel={`Delete ${unusedCount} unused`}
              armed={sweepArmed}
              onArmedChange={(armed) => {
                if (armed) {
                  armSweep();
                } else {
                  disarmSweep();
                }
              }}
              onConfirm={() => {
                disarmSweep();
                removeAllUnused();
              }}
              renderIdle={(arm) => (
                <Button variant="danger" disabled={busy} onClick={arm}>
                  Remove all unused
                </Button>
              )}
            />
          </div>
        )}
      </div>
      {status.kind !== "idle" && (
        <p
          className={cn(
            "mb-4 rounded-lg border border-border px-2.5 py-2 text-xs",
            status.kind === "error"
              ? "border-destructive/50 text-destructive"
              : "text-muted-foreground",
          )}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.message}
        </p>
      )}
      <div
        className="mb-3 flex items-center gap-1 border-b border-border pb-2"
        aria-label="Filter media"
      >
        {MEDIA_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            className={cn(
              "rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              filter === option.id && "bg-muted text-foreground",
            )}
            onClick={() => changeFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {visibleEntries.length} of {entries.length}
        </span>
      </div>
      <MediaGrid
        entries={visibleEntries.slice(0, visibleLimit)}
        loading={blobs === null && !listFailed}
        failed={listFailed}
        busy={busy}
        emptyMessage={
          entries.length === 0
            ? "No images stored yet. Paste or drop an image into a note, or use “Add images…”."
            : "No media matches this filter."
        }
        onRetry={refresh}
        onOpenReference={onOpenReference}
        onPreview={setPreviewEntry}
        onDelete={deleteEntry}
      />
      {visibleEntries.length > visibleLimit && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className={settingsButton}
            onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, visibleEntries.length - visibleLimit)}{" "}
            more of {visibleEntries.length - visibleLimit} remaining
          </button>
        </div>
      )}
      {previewEntry !== null && (
        <MediaPreviewDialog
          entry={previewEntry}
          onClose={() => setPreviewEntry(null)}
          onOpenReference={onOpenReference}
        />
      )}
    </section>
  );
}

type MediaGridProps = {
  entries: MediaLibraryEntry[];
  loading: boolean;
  failed: boolean;
  busy: boolean;
  emptyMessage: string;
  onRetry: () => void;
  onOpenReference: (usage: MediaUsage) => void;
  onPreview: (entry: MediaLibraryEntry) => void;
  onDelete: (entry: MediaLibraryEntry) => void;
};

function MediaGrid({
  entries,
  loading,
  failed,
  busy,
  emptyMessage,
  onRetry,
  onOpenReference,
  onPreview,
  onDelete,
}: MediaGridProps) {
  if (failed) {
    return (
      <div className={cn(settingsRow, "text-destructive")} role="alert">
        <span className={settingsRowLabel}>
          The media library could not be listed.
        </span>
        <button type="button" className={settingsButton} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <p className={settingsRowDetail} role="status">
        Loading media…
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className={settingsRowDetail} role="status">
        {emptyMessage}
      </p>
    );
  }
  return (
    <ul
      className="grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-0"
      aria-label="Stored media"
    >
      {entries.map((entry) => (
        <MediaCard
          key={entry.contentHash}
          entry={entry}
          busy={busy}
          onOpenReference={onOpenReference}
          onPreview={onPreview}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

type MediaCardProps = {
  entry: MediaLibraryEntry;
  busy: boolean;
  onOpenReference: (usage: MediaUsage) => void;
  onPreview: (entry: MediaLibraryEntry) => void;
  onDelete: (entry: MediaLibraryEntry) => void;
};

function MediaCard({
  entry,
  busy,
  onOpenReference,
  onPreview,
  onDelete,
}: MediaCardProps) {
  const unused = isUnusedMedia(entry);
  const dimensions =
    entry.width !== null && entry.height !== null
      ? `${entry.width}×${entry.height}`
      : "Dimensions unavailable";
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border">
      <MediaPreview entry={entry} onOpen={() => onPreview(entry)} />
      <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {imageFormatLabel(entry.mimeType)} · {formatSizeBytes(entry.byteSize)}{" "}
          · {dimensions}
          {entry.missingBlob ? " · file missing" : ""}
        </span>
        <span
          className="truncate font-mono text-[10px] text-muted-foreground/70"
          title={entry.contentHash}
        >
          {entry.contentHash.slice(0, 12)} ·{" "}
          {entry.createdAt === null
            ? "Not attached"
            : new Date(entry.createdAt).toLocaleDateString()}
        </span>
        <span className={settingsRowDescription}>
          {describeMediaUsage(entry)}
        </span>
        {entry.usages.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {entry.usages.map((usage) => (
              <button
                key={`${usage.noteId}-${usage.surface}-${usage.placement}`}
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent hover:text-accent-foreground"
                title={`Open “${usage.title}”`}
                onClick={() => onOpenReference(usage)}
              >
                {usage.title}
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {usage.surface === "journal"
                    ? `Journal ${usage.placement}`
                    : usage.placement}
                </span>
                {usage.count > 1 && (
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    ×{usage.count}
                  </span>
                )}
              </button>
            ))}
          </span>
        )}
        {unused && !entry.missingBlob && (
          <span className="mt-auto pt-1">
            <InlineConfirm
              size="sm"
              confirmLabel="Delete image"
              onConfirm={() => onDelete(entry)}
              renderIdle={(arm) => (
                <button
                  type="button"
                  className={cn(settingsButton, settingsButtonDanger)}
                  disabled={busy}
                  onClick={arm}
                >
                  <Trash2Icon size={13} />
                  Delete
                </button>
              )}
            />
          </span>
        )}
      </div>
    </li>
  );
}

const previewClass =
  "block h-28 w-full border-b border-border bg-muted object-cover";

function MediaPreview({
  entry,
  onOpen,
}: {
  entry: MediaLibraryEntry;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [useBlobFallback, setUseBlobFallback] = useState(false);
  const placeholderRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    setUseBlobFallback(false);
  }, [entry.contentHash, entry.mimeType]);
  useEffect(() => {
    const target = placeholderRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((observation) => observation.isIntersecting)) {
          setNearViewport(true);
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (entry.missingBlob || !nearViewport) {
      return;
    }
    let cancelled = false;
    const resolve =
      isVideoMime(entry.mimeType) && !useBlobFallback
        ? resolveMediaPlaybackUrl
        : resolveImageBlobUrl;
    resolve(entry.contentHash, entry.mimeType)
      .then((resolved) => {
        if (!cancelled) {
          setUrl(resolved);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    entry.contentHash,
    entry.mimeType,
    entry.missingBlob,
    nearViewport,
    useBlobFallback,
  ]);
  if (!url) {
    return (
      <span ref={placeholderRef} className={previewClass} aria-hidden="true" />
    );
  }
  return (
    <button
      type="button"
      className="block w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={
        isVideoMime(entry.mimeType) ? "Preview video" : "Preview image"
      }
      onClick={onOpen}
    >
      {isVideoMime(entry.mimeType) ? (
        <video
          className={previewClass}
          src={url}
          // A metadata-only request exposes dimensions but does not guarantee a
          // decoded frame. WebKitGTK consequently leaves gallery cards blank.
          // This is intersection-gated, so only nearby cards fetch a frame.
          preload="auto"
          muted
          playsInline
          onLoadedData={(event) => {
            // WebKitGTK does not paint a poster frame for a paused video until
            // a frame is decoded; `loadeddata` guarantees that frame exists.
            event.currentTarget.currentTime = 0.001;
          }}
          onError={() => setUseBlobFallback(true)}
        />
      ) : (
        <img className={previewClass} src={url} alt="" loading="lazy" />
      )}
    </button>
  );
}

function MediaPreviewDialog({
  entry,
  onClose,
  onOpenReference,
}: {
  entry: MediaLibraryEntry;
  onClose: () => void;
  onOpenReference: (usage: MediaUsage) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [useBlobFallback, setUseBlobFallback] = useState(false);
  useEffect(() => {
    let active = true;
    const resolve =
      isVideoMime(entry.mimeType) && !useBlobFallback
        ? resolveMediaPlaybackUrl
        : resolveImageBlobUrl;
    void resolve(entry.contentHash, entry.mimeType).then(
      (resolved) => {
        if (active) setUrl(resolved);
      },
    );
    return () => {
      active = false;
    };
  }, [entry.contentHash, entry.mimeType, useBlobFallback]);
  if (url === null) return null;
  return (
    <MediaLightbox
      open
      src={url}
      mimeType={entry.mimeType}
      byteSize={entry.byteSize}
      contentHash={entry.contentHash}
      dimensions={
        entry.width !== null && entry.height !== null
          ? `${entry.width} × ${entry.height}`
          : null
      }
      addedAt={entry.createdAt}
      usages={entry.usages.map((usage) => ({
        id: `${usage.noteId}-${usage.surface}-${usage.placement}`,
        title: usage.title,
        detail: `${usage.surface === "journal" ? "Journal " : ""}${usage.placement}${usage.count > 1 ? ` ×${usage.count}` : ""}`,
        onOpen: () => {
          onClose();
          onOpenReference(usage);
        },
      }))}
      onVideoError={() => setUseBlobFallback(true)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}
