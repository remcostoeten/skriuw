import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace, useWorkspaceSelector } from "../../../shell/workspace-provider";
import {
  reconcileSearchIndex,
  type SearchIndexView,
} from "../index-status";
import {
  savedSearchView,
  savedSearchViewsEqual,
  setSearchSaved,
  type SavedSearchView,
} from "../saved/saved-searches";
import { createSearchRunner, type SearchOutcome } from "./search-runner";

export type WorkspaceSearch = {
  query: string;
  setQuery: (query: string) => void;
  outcome: SearchOutcome | null;
  running: boolean;
  failure: string | null;
  index: SearchIndexView | null;
  saved: SavedSearchView;
  isQuerySaved: boolean;
  toggleSaved: () => void;
};

export function useWorkspaceSearch(): WorkspaceSearch {
  const session = useWorkspace();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [index, setIndex] = useState<SearchIndexView | null>(null);
  const saved = useWorkspaceSelector(
    (state) => savedSearchView(state.settings),
    savedSearchViewsEqual,
  );

  const runner = useMemo(
    () =>
      createSearchRunner({
        getState: () => session.store.getState(),
        search: (text, limit, noteIds) => session.bridge.searchWorkspace(text, limit, noteIds),
      }),
    [session],
  );

  useEffect(() => {
    let cancelled = false;
    setRunning(true);
    runner
      .run(query)
      .then((result) => {
        if (cancelled || result === null) {
          return;
        }
        setOutcome(result);
        setFailure(null);
        setRunning(false);
      })
      .catch((error: unknown) => {
        session.reportFailure(error);
        if (cancelled) {
          return;
        }
        setOutcome(null);
        setFailure(error instanceof Error ? error.message : String(error));
        setRunning(false);
      });
    return () => {
      cancelled = true;
    };
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

  return { query, setQuery, outcome, running, failure, index, saved, isQuerySaved, toggleSaved };
}
