import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { createBackgroundRefreshSlot } from "./background";

export const BACKGROUND_SYNC_TASK = "skriuw-background-sync";

const MINIMUM_INTERVAL_MINUTES = 30;

export const backgroundRefreshSlot = createBackgroundRefreshSlot();

function expirationSignal(): { expired: Promise<void>; stop: () => void } {
  let stop: () => void = () => undefined;
  const expired = new Promise<void>((resolve) => {
    const subscription = BackgroundTask.addExpirationListener(resolve);
    stop = () => subscription.remove();
  });
  return { expired, stop };
}

function reportBackgroundFailure(error: unknown): void {
  console.error("background sync failed", error);
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const expiration = expirationSignal();
  try {
    const outcome = await backgroundRefreshSlot.run(expiration.expired, reportBackgroundFailure);
    return outcome.kind === "failed"
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } finally {
    expiration.stop();
  }
});

/**
 * @name setBackgroundSyncScheduled
 * @description Asks iOS to run the background sync task while an account is signed in, and
 * withdraws the request on sign-out. It is a no-op on Android, where a terminated app would be
 * started headless only to skip, and when the user turned Background App Refresh off.
 *
 * @example
 * await setBackgroundSyncScheduled(account.kind === "signed-in");
 */
export async function setBackgroundSyncScheduled(scheduled: boolean): Promise<void> {
  if (Platform.OS !== "ios") {
    return;
  }
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (registered === scheduled) {
    return;
  }
  if (!scheduled) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    return;
  }
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return;
  }
  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
}
