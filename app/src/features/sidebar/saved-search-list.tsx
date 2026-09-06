import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import {
  savedSearches,
  setSearchSaved,
} from "@/features/search/saved-searches";
import { showToast } from "@/shared/ui/toast";

type Props = {
  store: RendererStore;
  query: string;
  onSelect: (query: string) => void;
};

export function SavedSearchList({ store, query, onSelect }: Props) {
  const value = useRendererSelector(
    store,
    (state) => state.settings.savedSearches,
  );
  const searches = savedSearches({
    ...store.getState().settings,
    savedSearches: value,
  });
  if (!query && searches.length === 0) return null;
  return (
    <nav
      aria-label="Saved searches"
      className="max-h-40 shrink-0 overflow-y-auto border-b border-border px-2 py-1 text-xs"
    >
      {query && !searches.includes(query) && (
        <button
          type="button"
          className="w-full rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-accent"
          onClick={() => {
            void setSearchSaved(store, query, true).catch((error: unknown) =>
              showToast({ message: String(error) }),
            );
          }}
        >
          Save this search
        </button>
      )}
      {searches.map((search) => (
        <div key={search} className="flex items-center gap-1">
          <button
            type="button"
            aria-current={search === query ? "true" : undefined}
            className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left hover:bg-accent aria-[current=true]:bg-accent"
            title={search}
            onClick={() => onSelect(search)}
          >
            {search}
          </button>
          <button
            type="button"
            aria-label={`Remove saved search ${search}`}
            className="rounded px-2 py-1.5 text-muted-foreground hover:bg-accent"
            onClick={() => {
              void setSearchSaved(store, search, false).catch(
                (error: unknown) => showToast({ message: String(error) }),
              );
            }}
          >
            ×
          </button>
        </div>
      ))}
    </nav>
  );
}
