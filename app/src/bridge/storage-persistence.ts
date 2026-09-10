import { isBrowserRuntime } from "./runtime";

export type PersistenceState =
  | { kind: "unavailable" }
  | { kind: "persisted" }
  | { kind: "best-effort" }
  | { kind: "low-space"; remainingBytes: number };

const LOW_SPACE_BYTES = 32 * 1024 * 1024;
const ANNOUNCED_KEY = "skriuw.storage-risk";

async function remainingBytes(): Promise<number | null> {
  if (!navigator.storage?.estimate) {
    return null;
  }
  try {
    const estimate = await navigator.storage.estimate();
    if (estimate.quota === undefined || estimate.usage === undefined) {
      return null;
    }
    return Math.max(0, estimate.quota - estimate.usage);
  } catch (error) {
    console.error("storage estimate failed", error);
    return null;
  }
}

/**
 * Asks the browser to keep this origin's storage, and reports what it granted.
 *
 * The workspace database lives in OPFS, so eviction is data loss rather than a
 * cold cache. Mobile browsers evict best-effort origins under space pressure
 * and, on iOS, after weeks without a visit. A denied request is not a failure
 * to swallow: the caller surfaces it so the workspace can be exported before
 * the browser decides for the user.
 */
export async function requestWorkspacePersistence(): Promise<PersistenceState> {
  if (!isBrowserRuntime() || !navigator.storage?.persist) {
    return { kind: "unavailable" };
  }
  let persisted = false;
  try {
    persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch (error) {
    console.error("storage persistence request failed", error);
    return { kind: "unavailable" };
  }
  const remaining = await remainingBytes();
  if (remaining !== null && remaining < LOW_SPACE_BYTES) {
    return { kind: "low-space", remainingBytes: remaining };
  }
  return persisted ? { kind: "persisted" } : { kind: "best-effort" };
}

/**
 * The warning a persistence state deserves, or null when nothing is at risk.
 * Kept separate from the request so the wording is testable without a browser.
 */
export function describePersistenceRisk(state: PersistenceState): string | null {
  if (state.kind === "best-effort") {
    return "This browser may delete your workspace when storage runs low. Export a backup, or install Skriuw to keep it.";
  }
  if (state.kind === "low-space") {
    return "This device is almost out of storage. Free some space, or Skriuw may not be able to save.";
  }
  return null;
}

/**
 * True when this risk has not been reported on this device yet. A browser that
 * refuses persistence refuses it on every launch, and a warning repeated every
 * launch is one the user stops reading, so each distinct risk is said once.
 * Low space is the exception: it is a condition the user can act on and then
 * hit again, so it is reported whenever it returns after a healthy launch.
 */
export function claimRiskAnnouncement(state: PersistenceState, storage?: Storage): boolean {
  const risk = describePersistenceRisk(state) === null ? "" : state.kind;
  try {
    const area = storage ?? globalThis.localStorage;
    const previous = area.getItem(ANNOUNCED_KEY) ?? "";
    if (risk === previous) {
      return false;
    }
    if (risk) {
      area.setItem(ANNOUNCED_KEY, risk);
    } else {
      area.removeItem(ANNOUNCED_KEY);
    }
    return risk !== "";
  } catch {
    return risk !== "";
  }
}
