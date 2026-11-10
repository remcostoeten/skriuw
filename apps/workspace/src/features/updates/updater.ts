import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { hasTauriRuntime } from "@/platform/runtime/runtime";
import { settingsCopy } from "@/shared/ui/settings-copy";

export type UpdateOutcome =
  | { status: "unsupported" }
  | { status: "upToDate" }
  | { status: "available"; version: string }
  | { status: "error"; message: string };

export type InstallProgress = {
  downloadedBytes: number;
  totalBytes: number | null;
};

let pendingUpdate: Update | null = null;

function replacePendingUpdate(next: Update | null): void {
  const previous = pendingUpdate;
  pendingUpdate = next;
  if (previous && previous !== next) {
    previous.close().catch((error) => {
      console.error("closing a superseded update failed", error);
    });
  }
}

/**
 * @name checkForUpdate
 * @description Asks the release feed whether a newer signed build exists for
 * this platform and remembers it for `installPendingUpdate`. Resolves to
 * `unsupported` outside the desktop shell, where there is nothing to replace.
 *
 * @example
 * const outcome = await checkForUpdate();
 * if (outcome.status === "available") {
 *   showVersion(outcome.version);
 * }
 */
export async function checkForUpdate(): Promise<UpdateOutcome> {
  if (!hasTauriRuntime()) {
    return { status: "unsupported" };
  }
  try {
    const update = await check();
    replacePendingUpdate(update);
    return update ? { status: "available", version: update.version } : { status: "upToDate" };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * @name installPendingUpdate
 * @description Downloads and installs the update found by the last
 * `checkForUpdate`, reporting download progress, then restarts Skriuw on the
 * new build. On Windows the installer closes the app itself before the restart
 * is reached.
 *
 * @example
 * await installPendingUpdate((progress) => setProgress(progress));
 */
export async function installPendingUpdate(
  onProgress: (progress: InstallProgress) => void,
): Promise<void> {
  const update = pendingUpdate;
  if (!update) {
    throw new Error(settingsCopy.about.checkAgainBeforeInstalling);
  }
  const progress: InstallProgress = { downloadedBytes: 0, totalBytes: null };
  await update.downloadAndInstall((event: DownloadEvent) => {
    if (event.event === "Started") {
      progress.totalBytes = event.data.contentLength ?? null;
    } else if (event.event === "Progress") {
      progress.downloadedBytes += event.data.chunkLength;
    }
    onProgress({ ...progress });
  });
  await relaunch();
}

/**
 * @name downloadPercentage
 * @description Converts install progress into a whole percentage, or `null`
 * while the download size is unknown.
 *
 * @example
 * downloadPercentage({ downloadedBytes: 512, totalBytes: 1024 }); // 50
 */
export function downloadPercentage(progress: InstallProgress): number | null {
  if (!progress.totalBytes) {
    return null;
  }
  return Math.min(100, Math.floor((progress.downloadedBytes / progress.totalBytes) * 100));
}

/**
 * @name describeUpdateOutcome
 * @description Renders an update check result as the status line shown under
 * the version in Settings > About.
 *
 * @example
 * describeUpdateOutcome({ status: "available", version: "0.55.0" });
 */
export function describeUpdateOutcome(outcome: UpdateOutcome): string {
  if (outcome.status === "unsupported") {
    return settingsCopy.about.updatesComeWithTheDesktopApp;
  }
  if (outcome.status === "upToDate") {
    return settingsCopy.about.youreOnTheLatestVersion;
  }
  if (outcome.status === "available") {
    return `Version ${outcome.version} is available.`;
  }
  return outcome.message;
}
