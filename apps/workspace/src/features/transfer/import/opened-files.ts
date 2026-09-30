import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { takeOpenedFiles } from "@/bridge/commands";
import { openMarkdownFileInWorkspace } from "@/features/transfer/export/markdown-transfer";
import { activateNote } from "@/store/actions/workspace";
import { appRouteHash } from "@skriuw/renderer-core/route/app-route";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

export const OPENED_FILES_EVENT = "opened-files";

type Listen = (event: string, handler: () => void) => Promise<UnlistenFn>;
type TakeOpenedFiles = () => Promise<string[]>;
type OpenFile = (store: RendererStore, filePath: string) => Promise<string | null>;

/**
 * @name bindOpenedFiles
 * @description Opens the Markdown and MDX files the desktop shell was asked to
 * open, both the ones queued at launch and the ones a second launch forwards
 * later. Files open one at a time in arrival order, each becoming the active
 * note on the notes route.
 *
 * @example
 * const unlisten = await bindOpenedFiles(store);
 */
export async function bindOpenedFiles(
  store: RendererStore,
  listenToEvent: Listen = listen,
  take: TakeOpenedFiles = takeOpenedFiles,
  open: OpenFile = openMarkdownFileInWorkspace,
): Promise<UnlistenFn> {
  let queue = Promise.resolve();

  async function drain(): Promise<void> {
    const paths = await take();
    for (const path of paths) {
      const noteId = await open(store, path);
      if (noteId) {
        window.location.hash = appRouteHash("notes");
        activateNote(store, noteId);
      }
    }
  }

  function schedule(): void {
    queue = queue.then(drain).catch((error) => console.error("opening files failed", error));
  }

  const unlisten = await listenToEvent(OPENED_FILES_EVENT, schedule);
  schedule();
  return unlisten;
}
