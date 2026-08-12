import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";
import type { HistoryHeader } from "@/contracts/workspace";

export const HISTORY_HEADER_PUBLISHED_EVENT = "history-header-published";

type Listen = (
  event: string,
  handler: (event: Event<HistoryHeader>) => void,
) => Promise<UnlistenFn>;

export function listenForHistoryHeaders(
  publish: (header: HistoryHeader) => void,
  listenToEvent: Listen = listen,
): Promise<UnlistenFn> {
  return listenToEvent(HISTORY_HEADER_PUBLISHED_EVENT, (event) => {
    publish(event.payload);
  });
}
