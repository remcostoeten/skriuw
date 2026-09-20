import type { WorkspaceSettings } from "../../../../shared/renderer-core/src/contracts/workspace";
import { commitOperations, type WorkspaceSession } from "../../bridge/commit";

/** Saved queries a workspace may hold before the list stops being navigable. */
export const SAVED_SEARCH_LIMIT = 100;

/** Longest query that can be saved, matching the desktop bound. */
export const SAVED_SEARCH_MAX_LENGTH = 512;

/**
 * Reads the bounded, portable saved-query preference. The same
 * `settings.savedSearches` key the desktop sidebar writes, validated the same
 * way, so a workspace synced from either interface reads back on the other.
 */
export function savedSearches(settings: WorkspaceSettings): readonly string[] {
  const value = settings.savedSearches;
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.length > SAVED_SEARCH_LIMIT ||
    value.some(
      (query) =>
        typeof query !== "string" ||
        query.trim().length === 0 ||
        query.length > SAVED_SEARCH_MAX_LENGTH,
    )
  ) {
    throw new Error("Saved searches are invalid. Restore a verified workspace backup.");
  }
  return value as string[];
}

export type SavedSearchView = {
  queries: readonly string[];
  /** Why the stored list could not be read, for the surface to show in place of it. */
  error: string | null;
};

/**
 * The saved list as a surface can render it. An unreadable preference is
 * reported rather than thrown, so one corrupt settings row costs the search
 * screen its chips instead of costing the application its next frame.
 */
export function savedSearchView(settings: WorkspaceSettings): SavedSearchView {
  try {
    return { queries: savedSearches(settings), error: null };
  } catch (error) {
    return { queries: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export function savedSearchViewsEqual(left: SavedSearchView, right: SavedSearchView): boolean {
  return (
    left.error === right.error &&
    left.queries.length === right.queries.length &&
    left.queries.every((query, index) => query === right.queries[index])
  );
}

/** Adds or removes a query while preserving the other workspace preferences. */
export async function setSearchSaved(
  session: WorkspaceSession,
  query: string,
  saved: boolean,
): Promise<void> {
  const normalized = query.trim();
  if (normalized.length === 0 || normalized.length > SAVED_SEARCH_MAX_LENGTH) {
    throw new Error(`Search must contain 1–${SAVED_SEARCH_MAX_LENGTH} characters.`);
  }
  const settings = session.store.getState().settings;
  const current = savedSearches(settings);
  if (current.includes(normalized) === saved) {
    return;
  }
  const next = saved
    ? [...current, normalized]
    : current.filter((entry) => entry !== normalized);
  if (next.length > SAVED_SEARCH_LIMIT) {
    throw new Error(`Remove a saved search before adding another (limit: ${SAVED_SEARCH_LIMIT}).`);
  }
  await commitOperations(session, [
    { type: "update_settings", settings: { ...settings, savedSearches: next } },
  ]);
}
