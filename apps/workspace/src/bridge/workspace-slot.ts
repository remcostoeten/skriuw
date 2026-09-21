/**
 * Browser mirror of the desktop workspace registry: which cloud account owns
 * the durable storage this tab opens.
 *
 * One browser profile may be used by more than one account. Without this the
 * first account to sign in brands the single OPFS workspace forever and every
 * later account dead-ends, so each account gets its own database and blob
 * directory and switching is a reload rather than a conflict.
 */

const STORAGE_KEY = "skriuw.workspace-slots.v1";
const DEFAULT_DATABASE = "workspace.sqlite3";
const DEFAULT_BLOBS = "skriuw-media-blobs";

/** Mirrors `is_workspace_id` in `apps/workspace/src-tauri/src/workspace_slots.rs`. */
function isWorkspaceId(value: string): boolean {
  return /^w_[0-9a-f]{64}$/.test(value);
}

export type SlotAdoption = "claimed" | "active" | "switched";

type Registry = {
  /** Cloud workspace whose storage is open, or null while still unclaimed. */
  active: string | null;
  /**
   * Cloud workspace to name suffix. The empty string is the default storage a
   * profile already has, which is what lets a first sign-in claim the notes
   * the user wrote before they had an account.
   */
  slots: Record<string, string>;
};

const EMPTY: Registry = { active: null, slots: {} };

function storageArea(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * An unreadable registry must never keep the workspace from opening, so it
 * degrades to the default storage. Anything this module would not have written
 * is rejected: the suffix names a file, and a profile is not a trust boundary
 * against itself but is against an extension that can write local storage.
 */
function read(): Registry {
  const raw = storageArea()?.getItem(STORAGE_KEY);
  if (!raw) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  const registry = parsed as Partial<Registry> | null;
  if (
    registry === null ||
    typeof registry !== "object" ||
    typeof registry.slots !== "object" ||
    registry.slots === null
  ) {
    return EMPTY;
  }
  const slots: Record<string, string> = {};
  for (const [id, suffix] of Object.entries(registry.slots)) {
    if (!isWorkspaceId(id)) return EMPTY;
    if (suffix !== "" && suffix !== id) return EMPTY;
    slots[id] = suffix;
  }
  const active = typeof registry.active === "string" ? registry.active : null;
  if (active !== null && !(active in slots)) return EMPTY;
  return { active, slots };
}

function write(registry: Registry): void {
  const storage = storageArea();
  if (!storage) {
    throw new Error("This browser blocks local storage, so accounts cannot be kept apart.");
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

function activeSuffix(): string {
  const registry = read();
  return registry.active === null ? "" : (registry.slots[registry.active] ?? "");
}

/** SQLite database name for the workspace this tab opens. */
export function activeDatabaseName(): string {
  const suffix = activeSuffix();
  return suffix === "" ? DEFAULT_DATABASE : `workspace-${suffix}.sqlite3`;
}

/** OPFS directory holding this workspace's media blobs. */
export function activeBlobsDirectory(): string {
  const suffix = activeSuffix();
  return suffix === "" ? DEFAULT_BLOBS : `${DEFAULT_BLOBS}-${suffix}`;
}

/** True for every OPFS directory that has ever held workspace media blobs. */
export function isBlobsDirectory(name: string): boolean {
  return name === DEFAULT_BLOBS || name.startsWith(`${DEFAULT_BLOBS}-w_`);
}

/** Cloud workspace that owns this profile's storage, or null while unclaimed. */
export function activeWorkspaceSlot(): string | null {
  return read().active;
}

/**
 * Points this profile at the signed-in account's own workspace. An unclaimed
 * workspace is claimed in place so a first sign-in keeps the notes already
 * written; another account's workspace is left untouched and reached again by
 * signing back in. The caller reloads on `switched`.
 *
 * `linked` is the workspace this storage has already synced with, which the
 * storage itself records. A profile predating this registry has no entry but
 * may very much have an owner, and claiming it for whoever signs in next would
 * hand one account's notes to another.
 */
export function adoptWorkspaceSlot(
  workspaceId: string,
  linked: string | null = null,
): SlotAdoption {
  if (!isWorkspaceId(workspaceId)) {
    throw new Error("the cloud returned an unusable workspace identity");
  }
  let registry = read();
  if (registry.active === null && linked !== null && isWorkspaceId(linked)) {
    registry = { active: linked, slots: { ...registry.slots, [linked]: "" } };
  }
  if (registry.active === workspaceId) {
    write(registry);
    return "active";
  }
  if (registry.active === null) {
    write({ active: workspaceId, slots: { ...registry.slots, [workspaceId]: "" } });
    return "claimed";
  }
  write({
    active: workspaceId,
    slots: { ...registry.slots, [workspaceId]: registry.slots[workspaceId] ?? workspaceId },
  });
  return "switched";
}
