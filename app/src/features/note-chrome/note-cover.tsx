import { useEffect, useMemo, useRef, useState } from "react";
import { commitOperations } from "@/store/actions/workspace";
import { downloadRemoteMedia, listMediaBlobs, storeNoteImage } from "@/bridge/commands";
import type { MediaBlobPayload, StoredImagePayload } from "@/bridge/commands";
import { isBrowserRuntime } from "@/bridge/runtime";
import { pickImageFiles } from "@/features/editor/image-input";
import { registerPendingWork } from "@/shell/pending-work";
import {
  CloseIcon,
  DownloadIcon,
  ImageIcon,
  MaximizeIcon,
  RestoreIcon,
  SearchIcon,
} from "@/shared/icons/static";
import { noop } from "@/shared/lib/noop";
import { cn } from "@/shared/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { Dialog } from "@/shared/ui/dialog";
import { resolveImageBlobUrl } from "@/shared/lib/image-blob-url";
import {
  projectCoverMediaPicker,
  type CoverMediaPickerFilter,
  type CoverMediaPickerSort,
} from "@/features/settings/cover-media-picker-model";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@/store/types";
import {
  applyCoverFocalPreset,
  COVER_FOCAL_PRESETS,
  coverTransformForKey,
  type CoverTransform,
} from "./cover-transform-model";

type Props = {
  store: RendererStore;
  selectNoteId: (state: RendererState) => string | null;
};

type ImageDimensions = {
  width: number;
  height: number;
};

type DragOrigin = CoverTransform & {
  pointerId: number;
  clientX: number;
  clientY: number;
};

const inFlightCoverWrites = new Set<Promise<void>>();

registerPendingWork(() => Promise.all([...inFlightCoverWrites]).then(() => undefined));

function selectImages(state: RendererState) {
  return state.images;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

async function imageDimensions(file: File): Promise<ImageDimensions | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

/**
 * Reads the intrinsic size of an already-stored blob. Downloads arrive as raw
 * bytes rather than a `File`, so the dimensions come from the blob URL the
 * cover would render anyway.
 */
function storedImageDimensions(url: string | null): Promise<ImageDimensions | null> {
  if (url === null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => resolve(null);
    probe.src = url;
  });
}

function failureMessage(reason: unknown): string {
  if (typeof reason === "string" && reason.length > 0) {
    return reason;
  }
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message;
  }
  return "Could not add that image.";
}

function useCoverUrl(contentHash: string | null, mimeType: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (contentHash === null || mimeType === null) {
      return () => {
        active = false;
      };
    }
    void resolveImageBlobUrl(contentHash, mimeType).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [contentHash, mimeType]);
  return url;
}

export function NoteCover({ store, selectNoteId }: Props) {
  const noteId = useRendererSelector(store, selectNoteId);
  const selectCoverImageId = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected ? (state.sourceNodes.get(selected)?.coverImageId ?? null) : null;
    },
    [selectNoteId],
  );
  const coverImageId = useRendererSelector(store, selectCoverImageId);
  const selectFullWidth = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected ? (state.sourceNodes.get(selected)?.coverFullWidth ?? false) : false;
    },
    [selectNoteId],
  );
  const fullWidth = useRendererSelector(store, selectFullWidth);
  const selectPositionX = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected ? (state.sourceNodes.get(selected)?.coverPositionX ?? 50) : 50;
    },
    [selectNoteId],
  );
  const selectPositionY = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected ? (state.sourceNodes.get(selected)?.coverPositionY ?? 50) : 50;
    },
    [selectNoteId],
  );
  const selectZoom = useMemo(
    () => (state: RendererState) => {
      const selected = selectNoteId(state);
      return selected ? (state.sourceNodes.get(selected)?.coverZoom ?? 1) : 1;
    },
    [selectNoteId],
  );
  const positionX = useRendererSelector(store, selectPositionX);
  const positionY = useRendererSelector(store, selectPositionY);
  const zoom = useRendererSelector(store, selectZoom);
  const selectCoverImage = useMemo(
    () => (state: RendererState) =>
      coverImageId ? state.images.get(coverImageId) : undefined,
    [coverImageId],
  );
  const image = useRendererSelector(store, selectCoverImage);
  const images = useRendererSelector(store, selectImages);
  const url = useCoverUrl(image?.contentHash ?? null, image?.mimeType ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [canZoom, setCanZoom] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBlobs, setPickerBlobs] = useState<MediaBlobPayload[] | null>(null);
  const [pickerFailed, setPickerFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<CoverTransform>({ positionX, positionY, zoom });
  const dragRef = useRef<DragOrigin | null>(null);

  useEffect(() => {
    if (!editing) {
      draftRef.current = { positionX, positionY, zoom };
    }
  }, [editing, positionX, positionY, zoom]);

  useEffect(() => {
    if (editing) {
      coverRef.current?.focus();
    }
  }, [editing]);

  function paintTransform(transform: CoverTransform): void {
    const element = imageRef.current;
    if (!element) return;
    element.style.objectPosition = `${transform.positionX}% ${transform.positionY}%`;
    element.style.transform = `scale(${transform.zoom})`;
  }

  function commitTransform(transform: CoverTransform): void {
    if (noteId === null) return;
    draftRef.current = transform;
    paintTransform(transform);
    const write = commitOperations(store, [
      {
        type: "set_note_cover_transform",
        noteId,
        positionX: transform.positionX,
        positionY: transform.positionY,
        zoom: transform.zoom,
        at: Date.now(),
      },
    ])
      .catch((reason) => {
        console.error("cover transform update rejected", reason);
        setError("Could not save cover position.");
      })
      .finally(() => inFlightCoverWrites.delete(write));
    inFlightCoverWrites.add(write);
  }

  function beginEditing(): void {
    draftRef.current = { positionX, positionY, zoom };
    setEditing(true);
    requestAnimationFrame(() => {
      paintTransform(draftRef.current);
      coverRef.current?.focus();
    });
  }

  function finishEditing(): void {
    setEditing(false);
    commitTransform(draftRef.current);
  }

  function resetTransform(): void {
    const reset = { positionX: 50, positionY: 50, zoom: 1 };
    draftRef.current = reset;
    paintTransform(reset);
    if (!editing) commitTransform(reset);
  }

  function setFocalPoint(
    presetId: (typeof COVER_FOCAL_PRESETS)[number]["id"],
    persist: boolean,
  ): void {
    const next = applyCoverFocalPreset(draftRef.current, presetId);
    draftRef.current = next;
    paintTransform(next);
    if (persist) commitTransform(next);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!editing || event.target !== event.currentTarget) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
      const saved = { positionX, positionY, zoom };
      draftRef.current = saved;
      paintTransform(saved);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finishEditing();
      return;
    }
    const next = coverTransformForKey(draftRef.current, event.key, {
      shiftKey: event.shiftKey,
      maxZoom: canZoom ? 3 : 1,
    });
    if (next === null) return;
    event.preventDefault();
    draftRef.current = next;
    paintTransform(next);
  }

  function changeZoom(delta: number, persist: boolean): void {
    if (!canZoom && delta > 0) return;
    const current = draftRef.current;
    const next = { ...current, zoom: clamp(current.zoom + delta, 1, 3) };
    draftRef.current = next;
    paintTransform(next);
    if (persist) commitTransform(next);
  }

  function openMediaPicker(): void {
    setPickerOpen(true);
    setPickerFailed(false);
    void listMediaBlobs()
      .then((blobs) => setPickerBlobs(blobs))
      .catch(() => {
        setPickerBlobs([]);
        setPickerFailed(true);
      });
  }

  function uploadCover(): void {
    if (noteId === null || busy) return;
    setPickerOpen(false);
    pickImageFiles((files) => {
      const file = files[0];
      if (!file) return;
      setBusy(true);
      setError(null);
      const write = (async () => {
        const id = crypto.randomUUID();
        const [bytes, dimensions] = await Promise.all([
          file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
          imageDimensions(file),
        ]);
        const stored = await storeNoteImage(bytes);
        const at = Date.now();
        await commitOperations(store, [
          {
            type: "attach_image",
            image: {
              id,
              noteId,
              contentHash: stored.contentHash,
              mimeType: stored.mimeType,
              byteSize: stored.byteSize,
              width: dimensions?.width ?? null,
              height: dimensions?.height ?? null,
              createdAt: at,
            },
          },
          { type: "set_note_cover", noteId, imageId: id, at },
        ]);
        draftRef.current = { positionX: 50, positionY: 50, zoom: 1 };
        setEditing(true);
      })()
        .catch((reason) => {
          console.error("cover image update rejected", reason);
          setError("Could not save cover image.");
        })
        .finally(() => {
          inFlightCoverWrites.delete(write);
          setBusy(false);
        });
      inFlightCoverWrites.add(write);
    });
  }

  /**
   * Reuses this note's existing attachment for the same content hash so
   * picking a cover twice never registers a duplicate image record.
   */
  function coverOperations(
    targetNoteId: string,
    blob: { contentHash: string; mimeType: string; byteSize: number },
    dimensions: ImageDimensions | null,
  ) {
    const state = store.getState();
    const sameNote = [...state.images.values()].find(
      (candidate) =>
        candidate.noteId === targetNoteId && candidate.contentHash === blob.contentHash,
    );
    const known = sameNote
      ?? [...state.images.values()].find(
        (candidate) => candidate.contentHash === blob.contentHash,
      );
    const imageId = sameNote?.id ?? crypto.randomUUID();
    const at = Date.now();
    return sameNote
      ? [{ type: "set_note_cover" as const, noteId: targetNoteId, imageId, at }]
      : [
          {
            type: "attach_image" as const,
            image: {
              id: imageId,
              noteId: targetNoteId,
              contentHash: blob.contentHash,
              mimeType: blob.mimeType,
              byteSize: blob.byteSize,
              width: dimensions?.width ?? known?.width ?? null,
              height: dimensions?.height ?? known?.height ?? null,
              createdAt: at,
            },
          },
          { type: "set_note_cover" as const, noteId: targetNoteId, imageId, at },
        ];
  }

  function selectMediaCover(blob: MediaBlobPayload): void {
    if (noteId === null || busy) return;
    setPickerOpen(false);
    setBusy(true);
    setError(null);
    const write = commitOperations(store, coverOperations(noteId, blob, null))
      .then(() => {
        draftRef.current = { positionX: 50, positionY: 50, zoom: 1 };
        setEditing(true);
      })
      .catch((reason) => {
        console.error("media cover selection rejected", reason);
        setError("Could not use this media asset.");
      })
      .finally(() => {
        inFlightCoverWrites.delete(write);
        setBusy(false);
      });
    inFlightCoverWrites.add(write);
  }

  /**
   * Downloads a pasted address into the blob store and adopts it as the cover.
   * The returned promise rejects with the reason so the picker can show it
   * without closing; the tracked copy only exists to hold shutdown open.
   */
  function addCoverFromUrl(url: string): Promise<void> {
    if (noteId === null || busy) return Promise.resolve();
    setBusy(true);
    setError(null);
    const download = (async () => {
      const stored: StoredImagePayload = await downloadRemoteMedia(url);
      const dimensions = await storedImageDimensions(
        await resolveImageBlobUrl(stored.contentHash, stored.mimeType),
      );
      await commitOperations(store, coverOperations(noteId, stored, dimensions));
      draftRef.current = { positionX: 50, positionY: 50, zoom: 1 };
      setPickerOpen(false);
      setEditing(true);
    })();
    const write = download.catch(noop).finally(() => {
      inFlightCoverWrites.delete(write);
      setBusy(false);
    });
    inFlightCoverWrites.add(write);
    return download;
  }

  function removeCover(): void {
    if (noteId === null || busy) return;
    setError(null);
    const write = commitOperations(store, [
      { type: "set_note_cover", noteId, imageId: null, at: Date.now() },
    ])
      .catch((reason) => {
        console.error("cover image removal rejected", reason);
        setError("Could not remove cover image.");
      })
      .finally(() => inFlightCoverWrites.delete(write));
    inFlightCoverWrites.add(write);
  }

  function toggleFullWidth(): void {
    if (noteId === null || busy) return;
    const write = commitOperations(store, [
      {
        type: "set_note_cover_full_width",
        noteId,
        fullWidth: !fullWidth,
        at: Date.now(),
      },
    ])
      .catch((reason) => {
        console.error("cover width update rejected", reason);
        setError("Could not change cover width.");
      })
      .finally(() => inFlightCoverWrites.delete(write));
    inFlightCoverWrites.add(write);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    if (!editing) {
      draftRef.current = { positionX, positionY, zoom };
      setEditing(true);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      ...draftRef.current,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const origin = dragRef.current;
    if (!editing || origin?.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = {
      positionX: clamp(origin.positionX - ((event.clientX - origin.clientX) / bounds.width) * 100, 0, 100),
      positionY: clamp(origin.positionY - ((event.clientY - origin.clientY) / bounds.height) * 100, 0, 100),
      zoom: origin.zoom,
    };
    draftRef.current = next;
    paintTransform(next);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (!editing || (!canZoom && event.deltaY < 0)) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 0.1 : -0.1, false);
  }

  const mediaPicker = (
    <CoverMediaPicker
      open={pickerOpen}
      blobs={pickerBlobs}
      images={images}
      currentCoverImageId={coverImageId}
      failed={pickerFailed}
      onOpenChange={setPickerOpen}
      onSelect={selectMediaCover}
      onUpload={uploadCover}
      onSubmitUrl={isBrowserRuntime() ? null : addCoverFromUrl}
    />
  );

  if (coverImageId === null) {
    return (
      <>
        <div className="absolute left-0 right-0 top-8 z-10 mx-auto h-0 w-[calc(100%_-_6rem)] max-w-[72ch]">
          <button
            type="button"
            className="absolute right-0 top-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/55 outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50"
            disabled={busy}
            onClick={openMediaPicker}
          >
            <ImageIcon size={12} />
            {busy ? "Adding cover…" : "Add cover"}
          </button>
          {error && (
            <span className="absolute right-0 top-6 whitespace-nowrap text-xs text-destructive">
              {error}
            </span>
          )}
        </div>
        {mediaPicker}
      </>
    );
  }

  return (
    <>
      <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={coverRef}
          tabIndex={editing ? 0 : -1}
          aria-label={editing ? "Adjust cover image" : undefined}
          className={cn(
            "group relative mb-5 h-52 overflow-hidden border border-border/40 bg-muted",
            editing && "cursor-grab select-none touch-none active:cursor-grabbing",
            fullWidth
              ? "w-full rounded-none border-x-0"
              : "mx-auto mt-8 w-[calc(100%_-_6rem)] max-w-[72ch] rounded-md",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        >
          {url ? (
            <img
              ref={imageRef}
              src={url}
              alt=""
              className={cn(
                "pointer-events-none h-full w-full object-cover",
                editing && "will-change-transform",
              )}
              style={{
                objectPosition: `${positionX}% ${positionY}%`,
                transform: `scale(${zoom})`,
              }}
              draggable={false}
              onLoad={(event) => {
                const element = event.currentTarget;
                setCanZoom(
                  element.naturalWidth > element.clientWidth ||
                    element.naturalHeight > element.clientHeight,
                );
                if (editing) paintTransform(draftRef.current);
              }}
            />
          ) : (
            <div
              className="h-full w-full animate-pulse bg-muted"
              aria-label="Loading cover image"
            />
          )}
          {editing ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
                <span className="rounded bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
                  Drag or arrows to position · scroll or +/− to zoom
                </span>
              </div>
              <div
                className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center rounded-md border border-border/50 bg-background/95 p-0.5 shadow-sm"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span
                  className="grid grid-cols-3 gap-0.5 px-1"
                  aria-label="Focal point presets"
                >
                  {COVER_FOCAL_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-label={preset.label}
                      title={preset.label}
                      className="h-2.5 w-2.5 rounded-[2px] border border-foreground/25 bg-muted hover:border-foreground hover:bg-foreground/25"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFocalPoint(preset.id, false);
                      }}
                    />
                  ))}
                </span>
                <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
                <button
                  type="button"
                  aria-label="Zoom out"
                  className="h-7 w-7 rounded text-sm text-foreground hover:bg-muted disabled:opacity-40"
                  onClick={(event) => {
                    event.stopPropagation();
                    changeZoom(-0.1, false);
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label="Zoom in"
                  className="h-7 w-7 rounded text-sm text-foreground hover:bg-muted disabled:opacity-40"
                  disabled={!canZoom}
                  onClick={(event) => {
                    event.stopPropagation();
                    changeZoom(0.1, false);
                  }}
                >
                  +
                </button>
                <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
                <button
                  type="button"
                  className="rounded px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    resetTransform();
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="rounded bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background"
                  onClick={(event) => {
                    event.stopPropagation();
                    finishEditing();
                  }}
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <div
              className="absolute bottom-2.5 right-2.5 flex items-center rounded-md border border-border/50 bg-background/90 p-0.5 opacity-0 shadow-sm transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                disabled={busy}
                onClick={openMediaPicker}
              >
                <ImageIcon size={12} />
                {busy ? "Saving…" : "Change"}
              </button>
              <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                aria-pressed={fullWidth}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                disabled={busy}
                onClick={toggleFullWidth}
              >
                {fullWidth ? <RestoreIcon size={12} /> : <MaximizeIcon size={12} />}
                {fullWidth ? "Content width" : "Full width"}
              </button>
              <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden="true" />
              <button
                type="button"
                aria-label="Remove cover"
                title="Remove cover"
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={busy}
                onClick={removeCover}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )}
          {error && (
            <div className="absolute bottom-3 left-3 rounded bg-background/90 px-2 py-1 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={beginEditing}>Adjust cover</ContextMenuItem>
        <ContextMenuItem disabled={!canZoom || zoom >= 3} onClick={() => changeZoom(0.1, true)}>
          Zoom in
        </ContextMenuItem>
        <ContextMenuItem disabled={zoom <= 1} onClick={() => changeZoom(-0.1, true)}>
          Zoom out
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Focal point</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-40">
            {COVER_FOCAL_PRESETS.map((preset) => (
              <ContextMenuItem
                key={preset.id}
                onClick={() => setFocalPoint(preset.id, true)}
              >
                {preset.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={resetTransform}>Reset position</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={toggleFullWidth}>
          {fullWidth ? "Use content width" : "Use full width"}
        </ContextMenuItem>
        <ContextMenuItem onClick={openMediaPicker}>Choose from media…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onClick={removeCover}>
          Remove cover
        </ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
      {mediaPicker}
    </>
  );
}

type CoverMediaPickerProps = {
  open: boolean;
  blobs: MediaBlobPayload[] | null;
  images: RendererState["images"];
  currentCoverImageId: string | null;
  failed: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (blob: MediaBlobPayload) => void;
  onUpload: () => void;
  onSubmitUrl: ((url: string) => Promise<void>) | null;
};

function CoverMediaPicker({
  open,
  blobs,
  images,
  currentCoverImageId,
  failed,
  onOpenChange,
  onSelect,
  onUpload,
  onSubmitUrl,
}: CoverMediaPickerProps) {
  const [query, setQuery] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CoverMediaPickerFilter>("all");
  const [sort, setSort] = useState<CoverMediaPickerSort>("recent");
  const items = useMemo(
    () =>
      projectCoverMediaPicker(blobs ?? [], images, {
        query,
        filter,
        sort,
        currentCoverImageId,
      }),
    [blobs, currentCoverImageId, filter, images, query, sort],
  );

  function submitRemoteUrl(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = remoteUrl.trim();
    if (!onSubmitUrl || trimmed.length === 0 || remoteBusy) return;
    setRemoteBusy(true);
    setRemoteError(null);
    void onSubmitUrl(trimmed)
      .then(() => setRemoteUrl(""))
      .catch((reason) => setRemoteError(failureMessage(reason)))
      .finally(() => setRemoteBusy(false));
  }

  return (
    <Dialog
      open={open}
      title="Choose cover"
      className="w-[min(760px,calc(100vw-24px))]"
      onOpenChange={onOpenChange}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
        <p className="text-xs text-muted-foreground">
          Pick any image stored in this workspace.
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          onClick={onUpload}
        >
          <ImageIcon size={13} />
          Upload new
        </button>
      </div>
      {onSubmitUrl && (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5"
          onSubmit={submitRemoteUrl}
        >
          <label className="min-w-48 flex-1">
            <span className="sr-only">Image address</span>
            <input
              type="url"
              inputMode="url"
              value={remoteUrl}
              placeholder="Paste an image address (https://…)"
              className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => {
                setRemoteUrl(event.currentTarget.value);
                setRemoteError(null);
              }}
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            disabled={remoteBusy || remoteUrl.trim().length === 0}
          >
            <DownloadIcon size={13} />
            {remoteBusy ? "Downloading…" : "Download"}
          </button>
          <p className="w-full text-[11px] text-muted-foreground">
            {remoteError ? (
              <span className="text-destructive">{remoteError}</span>
            ) : (
              "The image is downloaded once and stored in this workspace."
            )}
          </p>
        </form>
      )}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
        <label className="relative min-w-48 flex-1">
          <SearchIcon
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <span className="sr-only">Search media</span>
          <input
            type="search"
            value={query}
            placeholder="Search media"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <select
          aria-label="Filter media"
          value={filter}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) =>
            setFilter(event.currentTarget.value as CoverMediaPickerFilter)
          }
        >
          <option value="all">All assets</option>
          <option value="used">Used</option>
          <option value="unused">Unused</option>
          <option value="duplicates">Reused</option>
        </select>
        <select
          aria-label="Sort media"
          value={sort}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) =>
            setSort(event.currentTarget.value as CoverMediaPickerSort)
          }
        >
          <option value="recent">Recent</option>
          <option value="size">Largest</option>
          <option value="usage">Most used</option>
        </select>
      </div>
      {failed ? (
        <p className="p-6 text-center text-sm text-destructive">
          Media could not be loaded. Close and try again.
        </p>
      ) : blobs === null ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading media…</p>
      ) : blobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">No media stored yet.</p>
          <button
            type="button"
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
            onClick={onUpload}
          >
            Upload first image
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No media matches search and filter.
        </p>
      ) : (
        <ul className="grid max-h-[52vh] list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 overflow-y-auto p-3.5">
          {items.map((item) => (
            <li key={item.contentHash}>
              <button
                type="button"
                aria-pressed={item.isCurrent}
                className={cn(
                  "group/media block w-full overflow-hidden rounded-md border bg-muted text-left outline-none hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring",
                  item.isCurrent ? "border-foreground/60" : "border-border",
                )}
                onClick={() => onSelect(item)}
              >
                <span className="relative block">
                  <CoverPickerPreview blob={item} />
                  <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
                    {item.isCurrent && (
                      <span className="rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-medium text-foreground shadow-sm">
                        Current cover
                      </span>
                    )}
                    {item.isUsed && (
                      <span className="rounded bg-background/90 px-1.5 py-0.5 text-[9px] text-muted-foreground shadow-sm">
                        {item.isDuplicate ? "Reused" : "Used"} {item.usageCount}×
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                  <span className="truncate">{item.mimeType.replace("image/", "").toUpperCase()}</span>
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

function CoverPickerPreview({ blob }: { blob: MediaBlobPayload }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveImageBlobUrl(blob.contentHash, blob.mimeType)
      .then((resolved) => {
        if (active) setUrl(resolved);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [blob.contentHash, blob.mimeType]);
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="h-24 w-full object-cover transition-transform duration-150 ease-out group-hover/media:scale-[1.02] motion-reduce:transition-none"
    />
  ) : (
    <span className="block h-24 w-full bg-muted" aria-hidden="true" />
  );
}
