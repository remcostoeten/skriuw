import { useMemo } from "react";
import { Button } from "@/shared/ui/button";
import { LockIcon, iconStrokeWidth } from "@/shared/icons/static";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import type { RendererState, RendererStore } from "@skriuw/renderer-core/store/types";
import { secretNoun } from "./lock-model";
import { requestSessionUnlock } from "./lock-session";

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
    <div
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="unlock-pane"
    >
      <LockIcon
        size={40}
        strokeWidth={iconStrokeWidth(40, 1.25)}
        className="text-muted-foreground"
      />
      <div className="max-w-md space-y-2">
        <p className="m-0 text-sm font-medium text-foreground">{title || "This note"} is locked</p>
        <p className="m-0 text-sm text-muted-foreground">
          {lock.configured
            ? `Enter your ${secretNoun(lock.kind)} to read and edit it.`
            : "This note was locked on another device. Its lock has not arrived here yet."}
        </p>
      </div>
      {lock.configured && (
        <Button variant="primary" onClick={requestSessionUnlock} autoFocus>
          Unlock notes…
        </Button>
      )}
    </div>
  );
}
