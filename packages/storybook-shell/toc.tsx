import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { useStorybookConfig } from "./config";

type Entry = {
  element: HTMLElement;
  label: string;
  level: number;
};

type Props = {
  contentRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  storyId: string;
};

function collectEntries(root: HTMLElement): Entry[] {
  return [...root.querySelectorAll<HTMLElement>("[data-toc]")].map((element) => ({
    element,
    label: element.dataset.toc ?? "",
    level: Number(element.dataset.tocLevel ?? 1),
  }));
}

/** On-this-page navigation built from `[data-toc]` elements in the story canvas, with scroll-spy. */
function useMinWidth(pixels: number): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(`(min-width: ${pixels}px)`);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(`(min-width: ${pixels}px)`).matches,
  );
}

export function TableOfContents({ contentRef, scrollRef, storyId }: Props) {
  const { labels, layout } = useStorybookConfig();
  const wide = useMinWidth(layout.tableOfContentsMinViewport);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useLayoutEffect(() => {
    if (contentRef.current) setEntries(collectEntries(contentRef.current));
    setActiveIndex(0);
  }, [contentRef, storyId]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || entries.length === 0) return;
    function spy() {
      const top = scroller!.getBoundingClientRect().top + 32;
      const atBottom = scroller!.scrollTop + scroller!.clientHeight >= scroller!.scrollHeight - 2;
      let index = 0;
      entries.forEach((entry, position) => {
        if (entry.element.getBoundingClientRect().top <= top) index = position;
      });
      setActiveIndex(atBottom ? entries.length - 1 : index);
    }
    spy();
    scroller.addEventListener("scroll", spy, { passive: true });
    return () => scroller.removeEventListener("scroll", spy);
  }, [entries, scrollRef]);

  if (!wide || entries.length < layout.tableOfContentsMinEntries) return null;

  return (
    <nav
      aria-label={labels.onThisPage}
      className="sticky top-10 max-h-[calc(100dvh-8rem)] w-44 shrink-0 self-start overflow-y-auto"
    >
      <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">{labels.onThisPage}</h2>
      <ul className="flex flex-col border-l border-border/60">
        {entries.map((entry, index) => (
          <li key={`${entry.label}-${index}`}>
            <button
              type="button"
              aria-current={index === activeIndex ? "location" : undefined}
              onClick={() => {
                entry.element.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
                entry.element.focus({ preventScroll: true });
              }}
              className={`-ml-px block w-full truncate border-l border-transparent py-1 pr-2 text-left text-[12px] text-muted-foreground hover:text-foreground aria-[current=location]:border-foreground aria-[current=location]:text-foreground ${entry.level > 1 ? "pl-6" : "pl-3"}`}
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
