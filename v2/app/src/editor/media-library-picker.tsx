import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { listMediaBlobs } from "../bridge/commands";
import type { MediaBlobPayload } from "../bridge/commands";
import { ImageIcon, SearchIcon, UploadIcon, VideoIcon } from "../shared/icons";
import { resolveImageBlobUrl } from "../shared/lib/image-blob-url";
import { resolveMediaPlaybackUrl } from "../shared/lib/media-playback-url";
import { Dialog } from "../shared/ui/dialog";

export type LibraryMediaKind = "image" | "video";

type Props = {
  open: boolean;
  kind: LibraryMediaKind;
  onOpenChange: (open: boolean) => void;
  onSelect: (blob: MediaBlobPayload) => void;
  onUpload: () => void;
  onUseUrl?: () => void;
};

export function MediaLibraryPicker({
  open,
  kind,
  onOpenChange,
  onSelect,
  onUpload,
  onUseUrl,
}: Props) {
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
    void listMediaBlobs()
      .then(setBlobs)
      .catch(() => {
        setBlobs([]);
        setFailed(true);
      });
  }, [open]);

  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (blobs ?? [])
      .filter((blob) => blob.mimeType.startsWith(`${kind}/`))
      .filter(
        (blob) =>
          !needle ||
          blob.mimeType.toLocaleLowerCase().includes(needle) ||
          blob.contentHash.toLocaleLowerCase().includes(needle),
      )
      .sort(
        (left, right) =>
          right.modifiedAtMs - left.modifiedAtMs ||
          left.contentHash.localeCompare(right.contentHash),
      );
  }, [blobs, kind, query]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(items.length - 1, 0)));
  }, [items.length]);

  function moveFocus(next: number): void {
    const index = Math.max(0, Math.min(next, items.length - 1));
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
      moveFocus(items.length - 1);
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
          Pick a {label} already stored in this workspace. Use arrow keys to move between assets.
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {onUseUrl && (
            <button type="button" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted" onClick={onUseUrl}>
              Embed URL instead
            </button>
          )}
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted" onClick={onUpload}>
            <UploadIcon size={13} /> Upload new
          </button>
        </span>
      </div>
      <label className="relative m-3 block">
        <SearchIcon size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <span className="sr-only">Search {label} assets</span>
        <input
          autoFocus
          type="search"
          value={query}
          placeholder={`Search ${label} assets`}
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      {failed ? (
        <p className="p-6 text-center text-sm text-destructive">Media could not be loaded. Close and try again.</p>
      ) : blobs === null ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading {label} assets…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <Icon size={22} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No {label} assets match.</p>
          <button type="button" className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background" onClick={onUpload}>
            Upload {label}
          </button>
        </div>
      ) : (
        <ul aria-label={`${label} assets`} className="grid max-h-[52vh] list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 overflow-y-auto p-3.5">
          {items.map((item, index) => (
            <li key={item.contentHash}>
              <button
                ref={(element) => { cardRefs.current[index] = element; }}
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
                  <span className="truncate">{item.mimeType.replace(`${kind}/`, "").toUpperCase()}</span>
                  <span className="shrink-0">{Math.ceil(item.byteSize / 1024)} KB</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function AssetPreview({ blob, kind }: { blob: MediaBlobPayload; kind: LibraryMediaKind }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const resolve = kind === "image" ? resolveImageBlobUrl(blob.contentHash, blob.mimeType) : resolveMediaPlaybackUrl(blob.contentHash, blob.mimeType);
    void resolve.then((value) => { if (active) setUrl(value); }).catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [blob.byteSize, blob.contentHash, blob.mimeType, kind]);
  if (kind === "video") {
    return url ? <video src={url} muted preload="metadata" className="h-24 w-full object-cover" /> : <span className="block h-24 w-full bg-muted" aria-hidden="true" />;
  }
  return url ? <img src={url} alt="" loading="lazy" className="h-24 w-full object-cover" /> : <span className="block h-24 w-full bg-muted" aria-hidden="true" />;
}
