import { createBackgroundRefreshSlot } from "./background";

export const BACKGROUND_SYNC_TASK = "skriuw-background-sync";

export const backgroundRefreshSlot = createBackgroundRefreshSlot();

export async function setBackgroundSyncScheduled(): Promise<void> {}
