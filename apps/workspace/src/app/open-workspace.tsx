import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { App } from "@/app";
import { listenForExpiredSession } from "@/app/auth-startup";
import { announcePersistenceRisk } from "@/app/browser-startup";
import { listenForHistory } from "@/app/history-startup";
import { listenForSyncChanges } from "@/app/sync-startup";
import { bindDesktopWindowClose, bindUiPersistence } from "@/app/ui-persistence";
import { loadWorkspaceStore } from "@/app/workspace-bootstrap";
import { currentSessionToken } from "@/features/auth/session";
import {
  applyLaunchCapture,
  parseLaunchCapture,
  stripLaunchCapture,
} from "@/features/capture/launch-capture";
import { bindLockSession } from "@/features/lock/lock";
import { seedRelationshipFixture } from "@/features/onboarding/debug-seed";
import { bindStarterReclaim } from "@/features/onboarding/reclaim";
import { seedStarterWorkspace } from "@/features/onboarding/seed";
import { bindSettingsToRoot } from "@/features/settings/apply-settings";
import { bindOpenedFiles } from "@/features/transfer/opened-files";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { showToast } from "@/shared/ui/toast";
import { bindThemeColor } from "@/shell/theme-color";
import { flushPendingWork } from "@/store/pending-work";
import type { RendererStore } from "@skriuw/renderer-core/store/types";

async function seedWorkspace(store: RendererStore): Promise<void> {
  bindStarterReclaim(store);
  await seedStarterWorkspace(store, async () => (await currentSessionToken()) !== undefined).catch(
    (error) => {
      console.error("starter workspace seeding failed", error);
    },
  );
  await seedRelationshipFixture(store).catch((error) => {
    console.error("relationship fixture seeding failed", error);
  });
}

function captureLaunchShare(store: RendererStore): void {
  const launchCapture = parseLaunchCapture(window.location.search);
  if (!launchCapture) {
    return;
  }
  window.history.replaceState(null, "", stripLaunchCapture(window.location.href));
  applyLaunchCapture(store, launchCapture).catch((error) => {
    console.error("launch capture failed", error);
    showToast({
      message: "Skriuw could not capture what was shared. Try pasting it into a note.",
      durationMs: 8_000,
    });
  });
}

/**
 * Opens the workspace and mounts the application. Live event listeners are
 * subscribed before bootstrap so nothing published during it is lost. Resolves
 * with a `detach` that flushes and unbinds everything the session registered,
 * so the tab can give the durable database up without losing accepted writes.
 */
export async function openWorkspace(root: Root): Promise<() => Promise<void>> {
  let history: Awaited<ReturnType<typeof listenForHistory>> | null = null;
  let sync: Awaited<ReturnType<typeof listenForSyncChanges>> | null = null;
  let unlistenSessionExpiry: UnlistenFn | null = null;
  let unlistenOpenedFiles: UnlistenFn | null = null;
  try {
    sync = await listenForSyncChanges();
    unlistenSessionExpiry = await listenForExpiredSession();
    history = await listenForHistory();
    const store = await loadWorkspaceStore();
    const unbindWindowClosePersistence = await bindDesktopWindowClose(store);
    const disposeUiPersistence = bindUiPersistence(store);
    history.attach(store);
    sync.attach(store);
    const liveSync = sync;
    const liveHistory = history;
    function teardownSession(): void {
      liveSync.dispose();
      liveHistory.dispose();
      unlistenSessionExpiry?.();
      unlistenOpenedFiles?.();
      unbindWindowClosePersistence();
      unbindLockSession();
      unbindThemeColor();
      disposeUiPersistence();
    }
    window.addEventListener("pagehide", teardownSession, { once: true });
    await seedWorkspace(store);
    bindSettingsToRoot(store, document.documentElement);
    const unbindLockSession = bindLockSession(store);
    const unbindThemeColor = bindThemeColor(store, document.documentElement);
    void announcePersistenceRisk();
    captureLaunchShare(store);
    if (!isBrowserRuntime()) {
      unlistenOpenedFiles = await bindOpenedFiles(store);
    }
    root.render(
      <StrictMode>
        <App store={store} />
      </StrictMode>,
    );
    return async () => {
      window.removeEventListener("pagehide", teardownSession);
      await flushPendingWork();
      teardownSession();
    };
  } catch (error) {
    history?.dispose();
    sync?.stopListening();
    unlistenSessionExpiry?.();
    unlistenOpenedFiles?.();
    throw error;
  }
}
