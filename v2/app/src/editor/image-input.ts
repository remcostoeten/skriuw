import type { EditorView } from "prosemirror-view";
import { commitOperations } from "@/actions/workspace";
import type { MediaBlobPayload } from "@/bridge/commands";
import { storeNoteImage } from "@/bridge/commands";
import { registerPendingWork } from "@/lifecycle/pending-work";
import { noop } from "@/shared/lib/noop";
import type { RendererStore } from "@/store/types";
import { productSchema } from "./schema";

type ImageDimensions = {
  width: number;
  height: number;
};

const inFlightPersists = new Set<Promise<void>>();

registerPendingWork(() => Promise.all([...inFlightPersists]).then(() => undefined));

function collectFiles(transfer: DataTransfer | null, mimePrefix: string): File[] {
  if (!transfer) {
    return [];
  }
  const itemFiles = [...transfer.items].flatMap((item) => {
    if (item.kind !== "file" || !item.type.startsWith(mimePrefix)) {
      return [];
    }
    const file = item.getAsFile();
    return file ? [file] : [];
  });
  if (itemFiles.length > 0) {
    return itemFiles;
  }
  return [...transfer.files].filter((file) => file.type.startsWith(mimePrefix));
}

export function collectImageFiles(transfer: DataTransfer | null): File[] {
  return collectFiles(transfer, "image/");
}

export function collectVideoFiles(transfer: DataTransfer | null): File[] {
  return collectFiles(transfer, "video/");
}

/**
 * Opens the platform file chooser and yields the chosen image files. The input
 * is detached again once the choice resolves, so repeated picks never stack up
 * hidden nodes in the document.
 */
export function pickImageFiles(onPicked: (files: readonly File[]) => void): void {
  pickMediaFiles("image/*", onPicked);
}

export function pickVideoFiles(onPicked: (files: readonly File[]) => void): void {
  pickMediaFiles("video/mp4,video/webm", onPicked);
}

function pickMediaFiles(accept: string, onPicked: (files: readonly File[]) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = true;
  input.hidden = true;
  document.body.append(input);
  input.addEventListener("change", () => {
    const files = [...(input.files ?? [])];
    input.remove();
    onPicked(files);
  });
  input.addEventListener("cancel", () => input.remove());
  // Older WebKitGTK builds never dispatch `cancel` on dismissal; once focus
  // returns from the picker, detach after `change` had its chance to fire.
  window.addEventListener(
    "focus",
    () => {
      window.setTimeout(() => input.remove(), 1000);
    },
    { once: true },
  );
  input.click();
}

/**
 * Inserts one `image_ref` node per file synchronously, then registers each
 * blob in the background. The keystroke path never waits on hashing or disk;
 * the node view upgrades from its loading state once the attach operation
 * lands in the store.
 */
export function insertImages(
  store: RendererStore,
  view: EditorView,
  noteId: string,
  files: readonly File[],
  position: number | null,
): boolean {
  const imageRef = productSchema.nodes.image_ref;
  if (!imageRef || files.length === 0) {
    return false;
  }
  let transaction = view.state.tr;
  let insertAt = position;
  const inserted: { id: string; file: File }[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const node = imageRef.create({ id, alt: file.name.replace(/\.[a-z0-9]+$/i, "") });
    if (insertAt === null) {
      transaction = transaction.replaceSelectionWith(node, false);
    } else {
      transaction = transaction.insert(insertAt, node);
      insertAt += node.nodeSize;
    }
    inserted.push({ id, file });
  }
  view.dispatch(transaction);
  for (const { id, file } of inserted) {
    persistMediaFile(store, noteId, id, file);
  }
  return true;
}

/**
 * Inserts one stored-video `media` node per file synchronously, mirroring
 * `insertImages`: the node renders a loading shell until its attach
 * operation lands in the store.
 */
export function insertVideos(
  store: RendererStore,
  view: EditorView,
  noteId: string,
  files: readonly File[],
  position: number | null,
): boolean {
  const media = productSchema.nodes.media;
  if (!media || files.length === 0) {
    return false;
  }
  let transaction = view.state.tr;
  let insertAt = position;
  const inserted: { id: string; file: File }[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const node = media.create({ kind: "video", refId: id, title: file.name });
    if (insertAt === null) {
      transaction = transaction.replaceSelectionWith(node, false);
    } else {
      transaction = transaction.insert(insertAt, node);
      insertAt += node.nodeSize;
    }
    inserted.push({ id, file });
  }
  view.dispatch(transaction);
  for (const { id, file } of inserted) {
    persistMediaFile(store, noteId, id, file);
  }
  return true;
}

/**
 * Adds an existing workspace asset to this note without copying its blob.
 * Attachment metadata remains note-scoped, while the content hash continues
 * to point at the library's single content-addressed file.
 */
export function insertLibraryMedia(
  store: RendererStore,
  view: EditorView,
  noteId: string,
  kind: "image" | "video",
  blob: MediaBlobPayload,
): boolean {
  if (!blob.mimeType.startsWith(`${kind}/`)) {
    return false;
  }
  const state = store.getState();
  const existing = [...state.images.values()].find(
    (image) => image.noteId === noteId && image.contentHash === blob.contentHash,
  );
  const known = existing ?? [...state.images.values()].find(
    (image) => image.contentHash === blob.contentHash,
  );
  const id = existing?.id ?? crypto.randomUUID();
  const node =
    kind === "image"
      ? productSchema.nodes.image_ref?.create({ id, alt: "" })
      : productSchema.nodes.media?.create({ kind: "video", refId: id, title: "Video" });
  if (!node) {
    return false;
  }
  view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
  if (!existing) {
    void commitOperations(store, [
      {
        type: "attach_image",
        image: {
          id,
          noteId,
          contentHash: blob.contentHash,
          mimeType: blob.mimeType,
          byteSize: blob.byteSize,
          width: known?.width ?? null,
          height: known?.height ?? null,
          createdAt: Date.now(),
        },
      },
    ]).catch((error) => {
      console.error("media library attachment rejected", error);
    });
  }
  return true;
}

/**
 * Hashes and registers one media file in the background, keeping the
 * keystroke path free from disk and IPC work. Shutdown waits on the
 * in-flight set via `registerPendingWork`.
 */
export function persistMediaFile(
  store: RendererStore,
  noteId: string,
  id: string,
  file: File,
): void {
  const task = persistImage(store, noteId, id, file);
  inFlightPersists.add(task);
  void task.finally(() => inFlightPersists.delete(task));
}

async function persistImage(
  store: RendererStore,
  noteId: string,
  id: string,
  file: File,
): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dimensions = await readDimensions(file);
    const stored = await storeNoteImage(bytes);
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
          createdAt: Date.now(),
        },
      },
    ]);
  } catch (error) {
    console.error("image attach rejected", error);
  }
}

async function readDimensions(file: File): Promise<ImageDimensions | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    noop();
    return null;
  }
}
