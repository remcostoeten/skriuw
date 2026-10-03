import { listenForHistoryHeaders } from "@/features/history/live-history";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import type { HistoryHeader } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

type HistoryStartup = {
  attach(store: RendererStore): void;
  dispose(): void;
};

/**
 * Subscribes to the desktop history drain before bootstrap, holding headers
 * that arrive before the store exists and publishing them on `attach`. The
 * browser runtime has no history drain, so it listens to nothing.
 */
export async function listenForHistory(): Promise<HistoryStartup> {
  let store: RendererStore | null = null;
  const pendingHeaders: HistoryHeader[] = [];
  const unlisten = isBrowserRuntime()
    ? () => {}
    : await listenForHistoryHeaders((header) => {
        if (store) {
          store.publishHistoryHeader(header);
          return;
        }
        pendingHeaders.push(header);
      });
  return {
    attach(next) {
      store = next;
      for (const header of pendingHeaders) {
        next.publishHistoryHeader(header);
      }
      pendingHeaders.length = 0;
    },
    dispose: unlisten,
  };
}
