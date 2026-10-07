import { revealMainWindow } from "@/platform/runtime/commands";
import { isBrowserRuntime } from "@/platform/runtime/runtime";

const REVEAL_FRAME_TIMEOUT_MS = 100;

let revealed = false;

/**
 * Reveals the main window once the first application frame has painted.
 * `index.html` normally reveals it earlier with its inline splash, so this
 * covers a page whose inline reveal failed; a Rust-side failsafe reveals it
 * anyway if neither gets there.
 */
export function revealWindow(): void {
  if (isBrowserRuntime() || revealed) {
    return;
  }
  function reveal(): void {
    if (revealed) {
      return;
    }
    revealed = true;
    void revealMainWindow().catch((error) => console.error("window reveal failed", error));
  }
  // WebKitGTK does not reliably schedule animation frames for an unmapped
  // window, so the paint-aligned path is raced against a timer. Losing the
  // race costs a few milliseconds; relying on frames alone can stall until
  // the Rust failsafe fires.
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  setTimeout(reveal, REVEAL_FRAME_TIMEOUT_MS);
}
