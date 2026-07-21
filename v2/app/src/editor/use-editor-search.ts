import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut/react";
import type { EditorView } from "prosemirror-view";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  shortcutDefinition,
  shortcutOverridesFromSettings,
} from "../shortcuts/bindings";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import { registerEditorSearchController } from "./search-controller";
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
} from "./search-plugin";

export function useEditorSearch(store: RendererStore, getView: () => EditorView | null) {
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

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    focusSearchInput();
    if (searchQuery) {
      const view = getView();
      if (view) {
        setSearch(view, searchQuery, searchOptions);
      }
    }
  }, [focusSearchInput, searchQuery, searchOptions, getView]);

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

  const showSearch = useCallback(() => {
    openSearch();
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
        open: showSearch,
      }),
    [showSearch],
  );

  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const bindings = [
      $.bind(effectiveShortcutKeys(shortcutDefinition("searchMatchCase"), overrides)).on(
        () => toggleSearchOption("caseSensitive"),
        { description: "Toggle match case", preventDefault: true },
      ),
      $.bind(effectiveShortcutKeys(shortcutDefinition("searchWholeWord"), overrides)).on(
        () => toggleSearchOption("wholeWord"),
        { description: "Toggle whole word", preventDefault: true },
      ),
      $.bind(effectiveShortcutKeys(shortcutDefinition("searchRegex"), overrides)).on(
        () => toggleSearchOption("regex"),
        { description: "Toggle regular expression", preventDefault: true },
      ),
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
