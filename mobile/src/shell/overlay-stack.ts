export type OverlayStack = {
  /** Claims the back gesture for an overlay that is now open. Returns the release for when it closes. */
  open: (onBack: () => void) => () => void;
  /**
   * Answers one hardware back press. `true` closed the overlay on top and the
   * press is consumed; `false` leaves the press to the platform, which leaves
   * the application.
   */
  handleBack: () => boolean;
  readonly depth: number;
};

type Entry = {
  id: number;
  onBack: () => void;
};

/**
 * ADR-0047 on Android: back closes what is on top, then leaves. The web build
 * spends a history entry per overlay because a browser's back is navigation;
 * a native shell has no history to spend, so the open overlays are held in
 * order and the topmost one answers the press.
 *
 * Closing an overlay any other way releases its claim, so the stack never
 * holds an overlay that is no longer on screen, and a release for an entry
 * that a back press already popped does nothing.
 */
export function createOverlayStack(): OverlayStack {
  const entries: Entry[] = [];
  let sequence = 0;

  return {
    open(onBack) {
      const id = ++sequence;
      entries.push({ id, onBack });
      return () => {
        const position = entries.findIndex((entry) => entry.id === id);
        if (position >= 0) {
          entries.splice(position, 1);
        }
      };
    },
    handleBack() {
      const top = entries.pop();
      if (!top) {
        return false;
      }
      top.onBack();
      return true;
    },
    get depth() {
      return entries.length;
    },
  };
}
