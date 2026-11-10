import { useEffect, useRef, useState, type RefObject } from "react";
import { currentInspectorSection, type InspectorSection, type SectionTop } from "./inspector-model";

export const INSPECTOR_INDEX_HEIGHT = 40;
const READING_LINE = 84;

type Spy = {
  current: InspectorSection | null;
  scrolled: boolean;
  pin: (section: InspectorSection) => void;
};

function measureTops(scroller: HTMLElement, sections: readonly InspectorSection[]): SectionTop[] {
  const origin = scroller.getBoundingClientRect().top;
  return sections.flatMap((section) => {
    const element = scroller.querySelector<HTMLElement>(`[data-inspector-section="${section}"]`);
    return element ? [{ section, top: element.getBoundingClientRect().top - origin }] : [];
  });
}

export function useInspectorSpy(
  scrollerRef: RefObject<HTMLElement | null>,
  sections: readonly InspectorSection[],
): Spy {
  const [current, setCurrent] = useState<InspectorSection | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const pinnedRef = useRef<InspectorSection | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const element = scroller;
    function update(): void {
      setScrolled(element.scrollTop > 2);
      if (pinnedRef.current !== null) {
        setCurrent(pinnedRef.current);
        return;
      }
      const atEnd =
        element.scrollTop > 0 &&
        element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
      setCurrent(currentInspectorSection(measureTops(element, sections), READING_LINE, atEnd));
    }
    function release(): void {
      pinnedRef.current = null;
    }
    function releaseOnArrow(event: KeyboardEvent): void {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        release();
      }
    }
    update();
    element.addEventListener("scroll", update, { passive: true });
    element.addEventListener("wheel", release, { passive: true });
    element.addEventListener("touchmove", release, { passive: true });
    element.addEventListener("pointerdown", release, { passive: true });
    element.addEventListener("keydown", releaseOnArrow);
    return () => {
      element.removeEventListener("scroll", update);
      element.removeEventListener("wheel", release);
      element.removeEventListener("touchmove", release);
      element.removeEventListener("pointerdown", release);
      element.removeEventListener("keydown", releaseOnArrow);
    };
  }, [scrollerRef, sections]);

  function pin(section: InspectorSection): void {
    pinnedRef.current = section;
    setCurrent(section);
  }

  return { current, scrolled, pin };
}
