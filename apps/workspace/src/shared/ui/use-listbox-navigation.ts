import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

type Params = {
  /** Length of the currently filtered list; the active index is clamped to it. */
  count: number;
  onSelect: (index: number) => void;
};

type ListboxNavigation = {
  activeIndex: number;
  /** Attach to the scroll container; rows must carry `data-index`. */
  listRef: RefObject<HTMLDivElement | null>;
  /** Attach to the search input that owns `role="combobox"`. */
  onKeyDown: (event: KeyboardEvent) => void;
  setActiveIndex: (index: number) => void;
};

/**
 * Keyboard model shared by the search-and-pick dialogs: arrow traversal,
 * clamping as the filter narrows, and scrolling the active row into view.
 * `shift+arrow` jumps to either end, since the 60% keyboards this is built for
 * have no Home or End keys; both are still honoured where they exist.
 */
export function useListboxNavigation({ count, onSelect }: Params): ListboxNavigation {
  const [requestedIndex, setRequestedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.min(requestedIndex, Math.max(count - 1, 0));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function move(target: number): void {
    setRequestedIndex(count === 0 ? 0 : Math.max(0, Math.min(target, count - 1)));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(event.shiftKey ? count - 1 : activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(event.shiftKey ? 0 : activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(0);
    } else if (event.key === "End") {
      event.preventDefault();
      move(count - 1);
    } else if (event.key === "Enter" && count > 0) {
      event.preventDefault();
      onSelect(activeIndex);
    }
  }

  return { activeIndex, listRef, onKeyDown, setActiveIndex: setRequestedIndex };
}
