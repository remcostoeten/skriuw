import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { replaceRouteHash } from "@/app-route";
import { journalEntryDateKey } from "@/features/journal/model";
import { openJournalDay } from "@/features/journal/navigation";
import type { MediaUsage } from "@/features/settings/media-library-model";
import { MediaSection } from "@/features/settings/sections/media-section";
import { WindowControls } from "@/shell/window-controls";
import { activateNote } from "@/store/actions/workspace";

type Props = {
  store: RendererStore;
};

/**
 * Full-screen home for the media library, so a phone gets the whole viewport
 * instead of a settings panel. The content is the settings section itself.
 */
export function MediaLibraryView({ store }: Props) {
  function openReference(usage: MediaUsage): void {
    if (usage.surface === "journal") {
      const dateKey = journalEntryDateKey(store.getState(), usage.noteId);
      if (dateKey !== null) openJournalDay(dateKey);
      return;
    }
    activateNote(store, usage.noteId);
    replaceRouteHash("#/notes");
  }

  return (
    <main
      className="relative col-[2/-1] min-h-0 min-w-0 overflow-y-auto bg-theme-editor px-4 pb-6 pt-[26px]"
      aria-label="Media library"
    >
      <WindowControls className="absolute right-0 top-0" />
      <MediaSection store={store} onOpenReference={openReference} />
    </main>
  );
}
