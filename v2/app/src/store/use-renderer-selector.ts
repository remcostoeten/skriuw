import { useMemo, useSyncExternalStore } from "react";
import type { Equality, RendererStore, Selector } from "./types";

export function useRendererSelector<T>(
  store: RendererStore,
  selector: Selector<T>,
  equality?: Equality<T>,
): T {
  const binding = useMemo(
    () => store.createBinding(selector, equality),
    [equality, selector, store],
  );
  return useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
}
