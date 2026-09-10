const HEIGHT_PROPERTY = "--viewport-height";
const KEYBOARD_PROPERTY = "--keyboard-inset";

type ViewportMetrics = {
  height: number;
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
    return { height: view.innerHeight, keyboardInset: 0 };
  }
  const occluded = view.innerHeight - visual.height - visual.offsetTop;
  return {
    height: visual.height,
    keyboardInset: Math.max(0, Math.round(occluded)),
  };
}

/**
 * Publishes the visual viewport as custom properties and keeps them current.
 * Layout reads the properties, so no component subscribes to resize events and
 * the keyboard never pushes fixed chrome off screen.
 */
export function bindViewport(view: Window, root: HTMLElement): () => void {
  function apply(): void {
    const metrics = viewportMetrics(view);
    root.style.setProperty(HEIGHT_PROPERTY, `${metrics.height}px`);
    root.style.setProperty(KEYBOARD_PROPERTY, `${metrics.keyboardInset}px`);
  }
  apply();
  const visual = view.visualViewport;
  visual?.addEventListener("resize", apply);
  visual?.addEventListener("scroll", apply);
  view.addEventListener("orientationchange", apply);
  return () => {
    visual?.removeEventListener("resize", apply);
    visual?.removeEventListener("scroll", apply);
    view.removeEventListener("orientationchange", apply);
  };
}
