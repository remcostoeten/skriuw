import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut/react";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  shortcutDefinition,
  shortcutOverridesFromSettings,
} from "@/commands/bindings";
import { useShortcutHints } from "@/commands/hints";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";
import { registerEditorSearchController } from "./search-controller";
import {
  EDITOR_SEARCH_SHORTCUT_IDS,
  type EditorSearchShortcutId,
} from "./editor-bound-shortcut-ids";
import {
  buildRegex,
  clearSearch,
  defaultSearchOptions,
  getSearchState,
  nextMatch,
  previousMatch,
  replaceAll,
  replaceCurrent,
  setSearch,
  type SearchOptions,
  type EditorSearchTarget,
} from "./search-plugin";

const SEARCH_OPTION_BY_SHORTCUT: Record<EditorSearchShortcutId, keyof SearchOptions> = {
  searchMatchCase: "caseSensitive",
  searchWholeWord: "wholeWord",
  searchRegex: "regex",
};

type EditorSearchOptions = {
  onBeforeOpen?: () => void;
};

export function useEditorSearch(
  store: RendererStore,
  getView: () => EditorSearchTarget | null,
  { onBeforeOpen }: EditorSearchOptions = {},
) {
  const $ = useShortcut({ ignoreInputs: false });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    ...defaultSearchOptions,
  });
  const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;

  const regexError = useMemo(() => {
    if (!searchOptions.regex || searchQuery.length === 0) return false;
    return buildRegex(searchQuery, searchOptions) === null;
  }, [searchOptions, searchQuery]);

  const syncMatchInfo = useCallback(() => {
    const view = getView();
    if (!view) return;
    const state = getSearchState(view);
    setMatchInfo({
      current: state?.current ?? 0,
      total: state?.matches.length ?? 0,
    });
  }, [getView]);

  const performSearch = useCallback(
    (query: string, options: SearchOptions) => {
      const view = getView();
      if (!view) return;
      setSearch(view, query, options);
      syncMatchInfo();
    },
    [getView, syncMatchInfo],
  );

  const handleSearchQueryChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      performSearch(value, searchOptions);
    },
    [performSearch, searchOptions],
  );

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  /**
   * The one open path for both find and find-and-replace. Re-arming the search
   * only happens on a closed panel, so opening replace over an open find panel
   * keeps the query and the current match instead of jumping back to the first.
   */
  const openSearch = useCallback(
    (withReplace: boolean) => {
      const wasOpen = searchOpenRef.current;
      onBeforeOpen?.();
      setSearchOpen(true);
      if (withReplace) {
        setShowReplace(true);
      }
      focusSearchInput();
      if (wasOpen || !searchQuery) {
        return;
      }
      const view = getView();
      if (view) {
        setSearch(view, searchQuery, searchOptions);
      }
    },
    [focusSearchInput, getView, onBeforeOpen, searchOptions, searchQuery],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    const view = getView();
    if (view) {
      clearSearch(view);
      view.focus();
    }
  }, [getView]);

  const resetSearch = useCallback(() => {
    if (!searchOpenRef.current) return;
    setSearchOpen(false);
    const view = getView();
    if (view) {
      clearSearch(view);
    }
  }, [getView]);

  /**
   * `mod+f` toggles: a press on an open panel closes it and hands focus back
   * to the note, instead of just re-selecting the query.
   */
  const toggleSearch = useCallback(() => {
    if (searchOpenRef.current) {
      closeSearch();
      return;
    }
    openSearch(false);
  }, [closeSearch, openSearch]);

  const showSearchAndReplace = useCallback(() => {
    openSearch(true);
  }, [openSearch]);

  const toggleSearchOption = useCallback(
    (key: keyof SearchOptions) => {
      const next = { ...searchOptions, [key]: !searchOptions[key] };
      setSearchOptions(next);
      performSearch(searchQuery, next);
    },
    [performSearch, searchOptions, searchQuery],
  );

  const handleNextMatch = useCallback(() => {
    const view = getView();
    if (!view) return;
    nextMatch(view);
    syncMatchInfo();
  }, [getView, syncMatchInfo]);

  const handlePreviousMatch = useCallback(() => {
    const view = getView();
    if (!view) return;
    previousMatch(view);
    syncMatchInfo();
  }, [getView, syncMatchInfo]);

  const handleReplaceCurrent = useCallback(() => {
    const view = getView();
    if (!view) return;
    replaceCurrent(view, replaceValue);
    syncMatchInfo();
  }, [getView, replaceValue, syncMatchInfo]);

  const handleReplaceAll = useCallback(() => {
    const view = getView();
    if (!view) return;
    replaceAll(view, replaceValue);
    syncMatchInfo();
  }, [getView, replaceValue, syncMatchInfo]);

  useEffect(
    () =>
      registerEditorSearchController({
        open: toggleSearch,
        openReplace: showSearchAndReplace,
      }),
    [toggleSearch, showSearchAndReplace],
  );

  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );
  const optionHints = useShortcutHints(store, EDITOR_SEARCH_SHORTCUT_IDS);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const bindings = [
      ...EDITOR_SEARCH_SHORTCUT_IDS.map((id) => {
        const definition = shortcutDefinition(id);
        return $.bind(effectiveShortcutKeys(definition, overrides)).on(
          () => toggleSearchOption(SEARCH_OPTION_BY_SHORTCUT[id]),
          {
            description: definition.description ?? definition.label,
            preventDefault: true,
          },
        );
      }),
      $.bind("escape").on(closeSearch, {
        description: "Close find and replace",
        preventDefault: true,
      }),
    ];
    return () => {
      for (const binding of bindings) {
        binding.unbind();
      }
    };
  }, [$, closeSearch, overrides, searchOpen, toggleSearchOption]);

  return {
    optionHints,
    searchOpen,
    searchQuery,
    setSearchQuery: handleSearchQueryChange,
    replaceValue,
    setReplaceValue,
    showReplace,
    setShowReplace,
    searchOptions,
    toggleSearchOption,
    matchInfo,
    regexError,
    findInputRef,
    closeSearch,
    resetSearch,
    syncMatchInfo,
    handleNextMatch,
    handlePreviousMatch,
    handleReplaceCurrent,
    handleReplaceAll,
  };
}
