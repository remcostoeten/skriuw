import type { WorkspaceSettings } from "@/contracts/workspace";
import { commitOperations } from "@/store/actions/workspace";
import type { RendererStore } from "@/store/types";

/** Reads bounded, portable sidebar query preferences. */
export function savedSearches(settings: WorkspaceSettings): readonly string[] {
  const value = settings.savedSearches;
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (query) =>
        typeof query !== "string" ||
        query.trim().length === 0 ||
        query.length > 512,
    )
  ) {
    throw new Error(
      "Saved searches are invalid. Restore a verified workspace backup.",
    );
  }
  return value as string[];
}

/** Adds or removes a query while preserving the other workspace preferences. */
export async function setSearchSaved(
  store: RendererStore,
  query: string,
  saved: boolean,
): Promise<void> {
  const normalized = query.trim();
  if (!normalized || normalized.length > 512)
    throw new Error("Search must contain 1–512 characters.");
  const settings = store.getState().settings;
  const current = savedSearches(settings);
  if (current.includes(normalized) === saved) return;
  const next = saved
    ? [...current, normalized]
    : current.filter((entry) => entry !== normalized);
  if (next.length > 100)
    throw new Error(
      "Remove a saved search before adding another (limit: 100).",
    );
  await commitOperations(store, [
    { type: "update_settings", settings: { ...settings, savedSearches: next } },
  ]);
}
