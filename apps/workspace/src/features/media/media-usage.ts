import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { journalEntryDateKey } from "@/features/journal/model";
import { openJournalDay } from "@/features/journal/navigation";
import {
  projectMediaLibrary,
  type MediaLibraryEntry,
  type MediaUsage,
} from "@/features/settings/media-library-model";
import { activateNote } from "@/store/actions/workspace";

/**
 * The library view of one stored file, built from workspace references alone
 * so an editor surface can show usages without listing blobs on disk.
 */
export function mediaEntryForContentHash(
  state: Pick<RendererState, "images" | "nodes" | "documents" | "mediaMetadata">,
  contentHash: string,
): MediaLibraryEntry | null {
  const entries = projectMediaLibrary(
    [],
    state.images,
    state.nodes,
    state.documents,
    state.mediaMetadata,
  );
  return entries.find((entry) => entry.contentHash === contentHash) ?? null;
}

/** Short label for where a usage sits, e.g. `Journal cover ×2`. */
export function mediaUsageDetail(usage: MediaUsage): string {
  const surface = usage.surface === "journal" ? "Journal " : "";
  const count = usage.count > 1 ? ` ×${usage.count}` : "";
  return `${surface}${usage.placement}${count}`;
}

/** Navigates to the note or journal day that references a file. */
export function openMediaUsage(store: RendererStore, usage: MediaUsage): void {
  if (usage.surface === "journal") {
    const dateKey = journalEntryDateKey(store.getState(), usage.noteId);
    if (dateKey !== null) openJournalDay(dateKey);
    return;
  }
  activateNote(store, usage.noteId);
}
