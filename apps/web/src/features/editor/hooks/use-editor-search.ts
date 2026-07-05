import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShortcutMap } from "@remcostoeten/use-shortcut/react";
import {
  getShortcutDef,
  useShortcutManager,
  type ShortcutId,
} from "@/core/shortcuts";
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
} from "@/features/editor/lib/search-plugin";
import {
  type EditorInstance,
  getEditorView,
} from "@/features/editor/lib/editor-instance";

export function useEditorSearch(editor: EditorInstance) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    ...defaultSearchOptions,
  });
  const [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);

  const regexError = useMemo(() => {
    if (!searchOptions.regex || searchQuery.length === 0) return false;
    return buildRegex(searchQuery, searchOptions) === null;
  }, [searchOptions, searchQuery]);

  const syncMatchInfo = useCallback(() => {
    const view = getEditorView(editor);
    const state = view ? getSearchState(view) : undefined;
    setMatchInfo({
      current: state?.current ?? 0,
      total: state?.matches.length ?? 0,
    });
  }, [editor]);

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    focusSearchInput();
    // Re-apply search if there's an existing query
    if (searchQuery) {
      const view = getEditorView(editor);
      if (view) {
        setSearch(view, searchQuery, searchOptions);
      }
    }
  }, [focusSearchInput, searchQuery, searchOptions, editor]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    const view = getEditorView(editor);
    if (view) {
      clearSearch(view);
      view.focus();
    }
  }, [editor]);

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      closeSearch();
      return;
    }
    openSearch();
  }, [closeSearch, openSearch, searchOpen]);

  const toggleSearchOption = useCallback((key: keyof SearchOptions) => {
    setSearchOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleNextMatch = useCallback(() => {
    const view = getEditorView(editor);
    if (!view) return;
    nextMatch(view);
    syncMatchInfo();
  }, [editor, syncMatchInfo]);

  const handlePreviousMatch = useCallback(() => {
    const view = getEditorView(editor);
    if (!view) return;
    previousMatch(view);
    syncMatchInfo();
  }, [editor, syncMatchInfo]);

  const handleReplaceCurrent = useCallback(() => {
    const view = getEditorView(editor);
    if (!view) return;
    replaceCurrent(view, replaceValue);
    syncMatchInfo();
  }, [editor, replaceValue, syncMatchInfo]);

  const handleReplaceAll = useCallback(() => {
    const view = getEditorView(editor);
    if (!view) return;
    replaceAll(view, replaceValue);
    syncMatchInfo();
  }, [editor, replaceValue, syncMatchInfo]);

  useEffect(() => {
    const view = getEditorView(editor);
    if (!view) return;
    setSearch(view, searchQuery, searchOptions);
    syncMatchInfo();
  }, [editor, searchOptions, searchQuery, syncMatchInfo]);

  const { bindings } = useShortcutManager();
  const shortcutKeys = useCallback(
    (id: ShortcutId) => bindings[id] ?? getShortcutDef(id).keys,
    [bindings],
  );

  useShortcutMap(
    {
      findInNote: {
        keys: shortcutKeys("notes.findInNote"),
        handler: toggleSearch,
        options: {
          description: "Find in note",
          preventDefault: true,
          stopOnMatch: true,
        },
      },
    },
    {
      ignoreInputs: false,
    },
  );

  useShortcutMap(
    {
      matchCase: {
        keys: shortcutKeys("notes.searchMatchCase"),
        handler: () => toggleSearchOption("caseSensitive"),
        options: {
          description: "Toggle match case",
          preventDefault: true,
        },
      },
      wholeWord: {
        keys: shortcutKeys("notes.searchWholeWord"),
        handler: () => toggleSearchOption("wholeWord"),
        options: {
          description: "Toggle whole word",
          preventDefault: true,
        },
      },
      regex: {
        keys: shortcutKeys("notes.searchRegex"),
        handler: () => toggleSearchOption("regex"),
        options: {
          description: "Toggle regular expression",
          preventDefault: true,
        },
      },
    },
    {
      disabled: !searchOpen,
      ignoreInputs: false,
    },
  );

  return {
    searchOpen,
    searchQuery,
    setSearchQuery,
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
    handleNextMatch,
    handlePreviousMatch,
    handleReplaceCurrent,
    handleReplaceAll,
  };
}
