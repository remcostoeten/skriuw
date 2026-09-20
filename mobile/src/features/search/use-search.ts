import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace, useWorkspaceSelector } from "../../shell/workspace-provider";
import {
  reconcileSearchIndex,
  type SearchIndexView,
} from "./index-status";
import {
  savedSearchView,
  savedSearchViewsEqual,
  setSearchSaved,
  type SavedSearchView,
} from "./saved-searches";
import { createSearchRunner, type SearchOutcome } from "./search-runner";

export type WorkspaceSearch = {
  query: string;
  setQuery: (query: string) => void;
  /** The answer to the query last resolved; `null` until the first one lands. */
  outcome: SearchOutcome | null;
  /** True while the backend is answering a query the field has already typed. */
  running: boolean;
  index: SearchIndexView | null;
  saved: SavedSearchView;
  isQuerySaved: boolean;
  toggleSaved: () => void;
};

/**
 * Drives the search surface: operators resolve against the hydrated store,
 * the free text is ranked by the backend command, and a response for a query
 * the field has moved past is dropped rather than shown.
 */
export function useWorkspaceSearch(): WorkspaceSearch {
  const session = useWorkspace();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState<SearchIndexView | null>(null);
  const saved = useWorkspaceSelector(
    (state) => savedSearchView(state.settings),
    savedSearchViewsEqual,
  );
  const mounted = useRef(true);

  const runner = useMemo(
    () =>
      createSearchRunner({
        getState: () => session.store.getState(),
        search: (text, limit, noteIds) => session.bridge.searchWorkspace(text, limit, noteIds),
      }),
    [session],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setRunning(true);
    runner
      .run(query)
      .then((next) => {
        if (next === null || !mounted.current) {
          return;
        }
        setOutcome(next);
        setRunning(false);
      })
      .catch((error: unknown) => {
        session.reportFailure(error);
        if (mounted.current) {
          setRunning(false);
        }
      });
  }, [query, runner, session]);

  useEffect(() => {
    let cancelled = false;
    reconcileSearchIndex(
      {
        readStatus: () => session.bridge.searchIndexStatus(),
        rebuild: () => session.bridge.rebuildSearchIndex(),
      },
      (view) => {
        if (!cancelled) {
          setIndex(view);
        }
      },
    ).catch(session.reportFailure);
    return () => {
      cancelled = true;
    };
  }, [session]);

  const isQuerySaved = saved.queries.includes(query.trim());
  const toggleSaved = useCallback(() => {
    setSearchSaved(session, query, !isQuerySaved).catch(session.reportFailure);
  }, [isQuerySaved, query, session]);

  return { query, setQuery, outcome, running, index, saved, isQuerySaved, toggleSaved };
}
