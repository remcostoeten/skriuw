const HEIGHT_PROPERTY = "--viewport-height";
const TOP_PROPERTY = "--viewport-top";
const KEYBOARD_PROPERTY = "--keyboard-inset";
const KEYBOARD_ATTRIBUTE = "keyboard";
const KEYBOARD_OPEN_PX = 120;

type ViewportMetrics = {
  height: number;
  top: number;
  keyboardInset: number;
};

/**
 * Reads the space the page can actually paint into. `visualViewport` shrinks
 * when a software keyboard opens, while the layout viewport does not, so the
 * difference is the inset that keeps toolbars and the caret above the keyboard
 * instead of behind it.
 */
export function viewportMetrics(view: Window): ViewportMetrics {
  const visual = view.visualViewport;
  if (!visual) {
    return { height: view.innerHeight, top: 0, keyboardInset: 0 };
  }
  const occluded = view.innerHeight - visual.height - visual.offsetTop;
  return {
    height: visual.height,
    top: Math.max(0, Math.round(visual.offsetTop)),
    keyboardInset: Math.max(0, Math.round(occluded)),
  };
}

/** A software keyboard is the only thing that takes this much of a phone viewport. */
export function keyboardOpen(metrics: ViewportMetrics): boolean {
  return metrics.keyboardInset >= KEYBOARD_OPEN_PX;
}

/**
 * Publishes the visual viewport as custom properties and keeps them current.
 * Layout reads the properties, so no component subscribes to resize events and
 * the keyboard never pushes fixed chrome off screen.
 */
export function bindViewport(view: Window, root: HTMLElement): () => void {
  function apply(): void {
    const metrics = viewportMetrics(view);
    root.style.setProperty(TOP_PROPERTY, `${metrics.top}px`);
    root.style.setProperty(KEYBOARD_PROPERTY, `${metrics.keyboardInset}px`);
    if (keyboardOpen(metrics)) {
      root.style.setProperty(HEIGHT_PROPERTY, `${metrics.height}px`);
      root.dataset[KEYBOARD_ATTRIBUTE] = "open";
    } else {
      // iOS standalone PWAs can report a stale, too-small viewport at launch
      // with no follow-up resize; the stylesheet's 100dvh never goes stale.
      root.style.removeProperty(HEIGHT_PROPERTY);
      delete root.dataset[KEYBOARD_ATTRIBUTE];
    }
  }
  apply();
  const visual = view.visualViewport;
  visual?.addEventListener("resize", apply);
  visual?.addEventListener("scroll", apply);
  view.addEventListener("orientationchange", apply);
  view.addEventListener("resize", apply);
  view.addEventListener("pageshow", apply);
  return () => {
    visual?.removeEventListener("resize", apply);
    visual?.removeEventListener("scroll", apply);
    view.removeEventListener("orientationchange", apply);
    view.removeEventListener("resize", apply);
    view.removeEventListener("pageshow", apply);
  };
}
