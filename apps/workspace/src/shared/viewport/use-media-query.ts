import { useCallback, useSyncExternalStore } from "react";

import { noop } from "@skriuw/shared/helpers/noop";

const listsByMatcher = new WeakMap<typeof matchMedia, Map<string, MediaQueryList>>();

function mediaQueryList(query: string): MediaQueryList {
  let lists = listsByMatcher.get(matchMedia);
  if (!lists) {
    lists = new Map();
    listsByMatcher.set(matchMedia, lists);
  }
  let list = lists.get(query);
  if (!list) {
    list = matchMedia(query);
    lists.set(query, list);
  }
  return list;
}

/**
 * Tracks a CSS media query so layout decisions React cannot express in a class
 * name stay in step with the stylesheet. Reports `false` wherever `matchMedia`
 * is unavailable, which keeps the desktop layout as the render-time default.
 * One `MediaQueryList` per query is shared, because every render and store
 * check reads the snapshot.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof matchMedia !== "function") {
        return noop;
      }
      const list = mediaQueryList(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => typeof matchMedia === "function" && mediaQueryList(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
