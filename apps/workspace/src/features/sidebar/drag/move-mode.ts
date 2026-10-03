import { useEffect, useMemo, useState } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { moveCargoVanished } from "./rules";

export type MoveMode = {
  ids: readonly string[] | null;
  movingSet: ReadonlySet<string> | null;
  start: (ids: readonly string[]) => void;
  cancel: () => void;
};

export function useMoveMode(store: RendererStore, visibleIds: readonly string[]): MoveMode {
  const [moveIds, setMoveIds] = useState<readonly string[] | null>(null);
  const movingSet = useMemo(() => (moveIds ? new Set(moveIds) : null), [moveIds]);

  useEffect(() => {
    if (moveIds && moveCargoVanished(store.getState().nodes, moveIds)) {
      setMoveIds(null);
    }
  }, [moveIds, store, visibleIds]);

  return {
    ids: moveIds,
    movingSet,
    start: (ids) => setMoveIds(ids),
    cancel: () => setMoveIds(null),
  };
}
