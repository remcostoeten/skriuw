import { useMemo } from "react";
import { EMPTY_STATE_COLORS } from "@/shared/empty-state/app-theme";
import { EmptyState } from "@/shared/empty-state/empty-state";
import { IconStack } from "@/shared/empty-state/illustrations";
import { LockIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { settingsButton, settingsButtonPrimary } from "@/shared/ui/settings-controls";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { secretNoun } from "./state/model";
import { requestSessionUnlock } from "./session/node-lock";

type Props = {
  store: RendererStore;
  noteId: string;
};

function selectLock(state: RendererState) {
  return state.noteLock;
}

/**
 * Stands in for the editor while a locked note's body is withheld. The editor
 * never mounts behind it, so nothing can save over the sealed body.
 */
export function UnlockPane({ store, noteId }: Props) {
  const lock = useRendererSelector(store, selectLock);
  const selectTitle = useMemo(
    () => (state: RendererState) => state.nodes.get(noteId)?.title ?? "",
    [noteId],
  );
  const title = useRendererSelector(store, selectTitle);
  return (
    <div className="flex h-full items-center justify-center p-8" data-testid="unlock-pane">
      <EmptyState
        colors={EMPTY_STATE_COLORS}
        illustration={<IconStack icon={<LockIcon />} />}
        title={`${title || "This note"} is locked`}
        description={
          lock.configured
            ? `Enter your ${secretNoun(lock.kind)} to read and edit it.`
            : "This note was locked on another device. Its lock has not arrived here yet."
        }
        className="max-w-md"
      >
        {lock.configured && (
          <button
            type="button"
            className={cn(settingsButton, settingsButtonPrimary)}
            onClick={requestSessionUnlock}
            autoFocus
          >
            Unlock notes…
          </button>
        )}
      </EmptyState>
    </div>
  );
}
