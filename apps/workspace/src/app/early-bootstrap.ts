import type { WorkspaceSnapshot } from "@skriuw/renderer-core/contracts/workspace";
import { bootstrapWorkspace, workspaceEventEpoch } from "@/platform/runtime/commands";

export type EarlyBootstrap = {
  snapshot: Promise<[number, WorkspaceSnapshot]>;
  sidebarExpansion: Promise<string[] | null>;
  paneLayout: Promise<string | null>;
};

declare global {
  var __SKRIUW_EARLY_BOOTSTRAP__: EarlyBootstrap | undefined;
}

/**
 * @name takeEarlyBootstrap
 * @description Hands over the workspace reads that `index.html` started
 * before the bundle loaded, once. Null in the browser, and on every later
 * call, so a retried startup reads the workspace again.
 *
 * @example
 * const early = takeEarlyBootstrap();
 * const snapshot = early ? await currentSnapshot(early.snapshot) : await bootstrapWorkspace();
 */
export function takeEarlyBootstrap(): EarlyBootstrap | null {
  const early = globalThis.__SKRIUW_EARLY_BOOTSTRAP__ ?? null;
  globalThis.__SKRIUW_EARLY_BOOTSTRAP__ = undefined;
  return early;
}

/**
 * @name currentSnapshot
 * @description Resolves an early snapshot only when no workspace change was
 * published between reading it and the renderer listening for changes, which
 * the caller must already be doing. Otherwise, and when the early read failed,
 * it reads the workspace again so the failure or the newer state surfaces
 * through the ordinary bootstrap.
 *
 * @example
 * await listenForSyncChanges();
 * const snapshot = await currentSnapshot(early.snapshot);
 */
export async function currentSnapshot(
  early: Promise<[number, WorkspaceSnapshot]>,
  readEpoch: () => Promise<number> = workspaceEventEpoch,
  bootstrap: () => Promise<WorkspaceSnapshot> = bootstrapWorkspace,
): Promise<WorkspaceSnapshot> {
  try {
    const [[epoch, snapshot], current] = await Promise.all([early, readEpoch()]);
    if (epoch === current) {
      return snapshot;
    }
  } catch (error) {
    console.error("early workspace read failed; reading it again", error);
  }
  return bootstrap();
}
