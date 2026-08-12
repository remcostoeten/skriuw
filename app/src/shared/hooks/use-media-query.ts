import { useCallback, useSyncExternalStore } from "react";

import { noop } from "@/shared/lib/noop";

/**
 * Tracks a CSS media query so layout decisions React cannot express in a class
 * name stay in step with the stylesheet. Reports `false` wherever `matchMedia`
 * is unavailable, which keeps the desktop layout as the render-time default.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof matchMedia !== "function") {
        return noop;
      }
      const list = matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
