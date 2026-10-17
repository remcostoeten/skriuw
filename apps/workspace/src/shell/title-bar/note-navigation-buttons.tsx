import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { Tooltip } from "@skriuw/shared/ui/tooltip";
import { AppIcon } from "@/shared/icons/app-icon";
import { toolbarIconButtonClass } from "@/shared/ui/toolbar-button";
import { useNoteNavigation } from "./note-navigation";

type Props = {
  store: RendererStore;
  previousHint: string | undefined;
  nextHint: string | undefined;
};

export function NoteNavigationButtons({ store, previousHint, nextHint }: Props) {
  const noteNav = useNoteNavigation(store);
  return (
    <>
      <Tooltip label="Previous note" side="bottom" shortcut={previousHint}>
        <button
          type="button"
          onClick={noteNav.navigatePrev}
          disabled={!noteNav.canNavigatePrev}
          className={toolbarIconButtonClass}
          aria-label="Previous note"
        >
          <AppIcon name="previous-note" size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Next note" side="bottom" shortcut={nextHint}>
        <button
          type="button"
          onClick={noteNav.navigateNext}
          disabled={!noteNav.canNavigateNext}
          className={toolbarIconButtonClass}
          aria-label="Next note"
        >
          <AppIcon name="next-note" size={16} />
        </button>
      </Tooltip>
    </>
  );
}
