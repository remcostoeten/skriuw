import { checkForUpdate } from "@/features/updates/updater";
import { hasTauriRuntime } from "@/platform/runtime/runtime";
import { scheduleIdle } from "@/shared/scheduling/idle";
import { showToast } from "@/shared/ui/toast";

const STARTUP_CHECK_DELAY_MS = 20_000;

/**
 * @name scheduleStartupUpdateCheck
 * @description Checks the release feed once, well after the workspace is
 * interactive, and offers a found update in a toast that opens Settings >
 * About. Installing stays a deliberate click there, because the Windows
 * installer closes the app. Returns a function that cancels a pending check.
 *
 * @example
 * useEffect(() => scheduleStartupUpdateCheck(() => openSettingsAt("about")), [openSettingsAt]);
 */
export function scheduleStartupUpdateCheck(openAbout: () => void): () => void {
  if (!hasTauriRuntime()) {
    return () => {};
  }
  let cancelled = false;
  let cancelIdle: (() => void) | null = null;
  const timer = setTimeout(() => {
    cancelIdle = scheduleIdle(() => {
      void checkForUpdate().then((outcome) => {
        if (cancelled || outcome.status !== "available") {
          return;
        }
        showToast({
          message: `Skriuw ${outcome.version} is available.`,
          description: "Install it from Settings > About when you are ready to restart.",
          action: { label: "View update", run: openAbout },
          durationMs: 30_000,
        });
      });
    }, 5_000);
  }, STARTUP_CHECK_DELAY_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    cancelIdle?.();
  };
}
