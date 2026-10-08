import { settingsCopy } from "@/shared/ui/settings-copy";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import {
  describeEmptyNoteCount,
  findEmptyNoteIds,
  restoreEmptyNotes,
  trashEmptyNotes,
} from "@/features/notes/empty-notes";
import { showToast } from "@/shared/ui/toast";
import {
  settingsButton,
  settingsRow,
  settingsRowDescription,
  settingsRowLabel,
} from "@/shared/ui/settings-controls";

type Props = {
  store: RendererStore;
};

function selectEmptyNoteCount(state: RendererState): number {
  return findEmptyNoteIds(state).length;
}

export function EmptyNotesRow({ store }: Props) {
  const count = useRendererSelector(store, selectEmptyNoteCount);

  function cleanUp(): void {
    void trashEmptyNotes(store).then((cleanup) => {
      if (cleanup.noteIds.length === 0) {
        return;
      }
      showToast({
        message: `Moved ${describeEmptyNoteCount(cleanup.noteIds.length)} to trash`,
        action: { label: "Undo", run: () => restoreEmptyNotes(store, cleanup) },
      });
    });
  }

  return (
    <div className={settingsRow}>
      <span className={settingsRowLabel}>
        Empty notes
        <span className={settingsRowDescription}>
          {count === 0
            ? settingsCopy.data.noNotesWithoutContentPinnedLocked
            : `Moves ${describeEmptyNoteCount(count)} to the trash. Pinned, locked and journal notes are left alone.`}
        </span>
      </span>
      <button type="button" className={settingsButton} disabled={count === 0} onClick={cleanUp}>
        Clean up
      </button>
    </div>
  );
}
