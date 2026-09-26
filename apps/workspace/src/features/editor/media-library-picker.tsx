import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { listMediaBlobs } from "@/bridge/commands";
import type { MediaBlobPayload } from "@/bridge/commands";
import { ImageIcon, SearchIcon, UploadIcon, VideoIcon } from "@/shared/icons/static";
import { resolveImageBlobUrl } from "@/shared/lib/image-blob-url";
import { resolveMediaPlaybackUrl } from "@/shared/lib/media-playback-url";
import { Dialog } from "@/shared/ui/dialog";
import { useMediaQuery } from "@/shared/hooks/use-media-query";
import { useNearViewport } from "@/shared/hooks/use-near-viewport";
import { COARSE_POINTER_QUERY } from "@/shell/panel-layout";
import type { MediaMetadata } from "@skriuw/renderer-core/contracts/workspace";
import { filterLibraryMedia } from "./media-library-search";

const PAGE_SIZE = 48;

export type LibraryMediaKind = "image" | "video";

type Props = {
  open: boolean;
  kind: LibraryMediaKind;
  onOpenChange: (open: boolean) => void;
  onSelect: (blob: MediaBlobPayload) => void;
  onUpload: () => void;
  onUseUrl?: () => void;
  /** Names and alt text people gave assets, so search can match them. */
  metadata?: ReadonlyMap<string, MediaMetadata>;
};

export function MediaLibraryPicker({
  open,
  kind,
  onOpenChange,
  onSelect,
  onUpload,
  onUseUrl,
  metadata,
}: Props) {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [blobs, setBlobs] = useState<MediaBlobPayload[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const label = kind === "image" ? "image" : "video";
  const Icon = kind === "image" ? ImageIcon : VideoIcon;

  useEffect(() => {
    if (!open) return;
    setBlobs(null);
    setFailed(false);
    setQuery("");
    setActiveIndex(0);
    setVisibleLimit(PAGE_SIZE);
    void listMediaBlobs()
      .then(setBlobs)
      .catch(() => {
        setBlobs([]);
        setFailed(true);
      });
  }, [open]);

  const items = useMemo(
    () => filterLibraryMedia(blobs ?? [], kind, query, metadata),
    [blobs, kind, metadata, query],
  );
  const shown = items.slice(0, visibleLimit);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(items.length - 1, 0)));
  }, [items.length]);

  function moveFocus(next: number): void {
    const index = Math.max(0, Math.min(next, shown.length - 1));
    setActiveIndex(index);
    cardRefs.current[index]?.focus();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(shown.length - 1);
    }
  }

  return (
    <Dialog
      open={open}
      title={`Choose ${label}`}
      className="w-[min(760px,calc(100vw-24px))]"
      onOpenChange={onOpenChange}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <p className="text-xs text-muted-foreground">
          Pick a {label} already stored in this workspace.
          {coarse ? "" : " Use arrow keys to move between assets."}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {onUseUrl && (
            <button
              type="button"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:px-3.5"
              onClick={onUseUrl}
            >
              Embed URL instead
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:px-3.5"
            onClick={onUpload}
          >
            <UploadIcon size={13} /> Upload new
          </button>
        </span>
      </div>
      <label className="relative m-3 block">
        <SearchIcon
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <span className="sr-only">Search {label} assets</span>
        <input
          autoFocus={!coarse}
          type="search"
          value={query}
          placeholder={`Search ${label} assets`}
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none [&::-webkit-search-cancel-button]:hidden placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:text-base"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {failed ? (
        <p className="p-6 text-center text-sm text-destructive">
          Media could not be loaded. Close and try again.
        </p>
      ) : blobs === null ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading {label} assets…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <Icon size={22} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No {label} assets match.</p>
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background pointer-coarse:min-h-11 pointer-coarse:px-4"
            onClick={onUpload}
          >
            Upload {label}
          </button>
        </div>
      ) : (
        <ul
          aria-label={`${label} assets`}
          className="grid max-h-[52dvh] list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 overflow-y-auto p-3.5"
        >
          {shown.map((item, index) => (
            <li key={item.contentHash}>
              <button
                ref={(element) => {
                  cardRefs.current[index] = element;
                }}
                type="button"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-label={`Use ${item.mimeType} asset ${item.contentHash.slice(0, 12)}, ${Math.ceil(item.byteSize / 1024)} KB`}
                className="group/media block w-full overflow-hidden rounded-md border border-border bg-muted text-left outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleCardKeyDown(event, index)}
                onClick={() => onSelect(item)}
              >
                <AssetPreview blob={item} kind={kind} />
                <span className="flex items-center justify-between gap-2 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="truncate">
                    {item.mimeType.replace(`${kind}/`, "").toUpperCase()}
                  </span>
                  <span className="shrink-0">{Math.ceil(item.byteSize / 1024)} KB</span>
                </span>
              </button>
            </li>
          ))}
          {items.length > shown.length && (
            <li className="col-span-full flex justify-center">
              <button
                type="button"
                className="rounded-md pointer-coarse:min-h-11 min-h-8 border border-border px-3.5 text-xs font-medium hover:bg-muted"
                onClick={() => setVisibleLimit((limit) => limit + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, items.length - shown.length)} more
              </button>
            </li>
          )}
        </ul>
      )}
    </Dialog>
  );
}

type AssetPreviewProps = { blob: MediaBlobPayload; kind: LibraryMediaKind };

function AssetPreview({ blob, kind }: AssetPreviewProps) {
  const [frameRef, near] = useNearViewport<HTMLSpanElement>("300px");
  return (
    <span ref={frameRef} className="relative block h-24 w-full bg-muted">
      {near && <AssetFrame blob={blob} kind={kind} />}
      {kind === "video" && (
        <VideoIcon
          size={16}
          className="pointer-events-none absolute left-1.5 top-1.5 text-white drop-shadow"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

function AssetFrame({ blob, kind }: AssetPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const resolve =
      kind === "image"
        ? resolveImageBlobUrl(blob.contentHash, blob.mimeType)
        : resolveMediaPlaybackUrl(blob.contentHash, blob.mimeType);
    void resolve
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [blob.byteSize, blob.contentHash, blob.mimeType, kind]);
  if (!url) return null;
  if (kind === "video") {
    return (
      <video src={url} muted playsInline preload="none" className="h-24 w-full object-cover" />
    );
  }
  return <img src={url} alt="" loading="lazy" className="h-24 w-full object-cover" />;
}
