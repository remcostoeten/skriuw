import { useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { focusTreeItem, type TreeRef } from "../tree/focus";
import { activateNote, revealNode } from "../tree/operations";

export type SidebarSearch = {
  query: string;
  trimmedQuery: string;
  inputRef: RefObject<HTMLInputElement | null>;
  fieldRef: RefObject<HTMLDivElement | null>;
  resultsRef: RefObject<HTMLDivElement | null>;
  savedSearchesRef: RefObject<HTMLDivElement | null>;
  focus: () => void;
  clear: (refocusInput?: boolean) => void;
  setQuery: (query: string) => void;
  selectSavedSearch: (query: string) => void;
  onAreaBlur: (event: FocusEvent) => void;
  onInputKeyDown: (event: KeyboardEvent) => void;
  onResultsKeyDown: (event: KeyboardEvent) => void;
  onNoteSelect: (id: string) => void;
  onFolderSelect: (id: string) => void;
};

export function useSidebarSearch(store: RendererStore, treeRef: TreeRef): SidebarSearch {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const savedSearchesRef = useRef<HTMLDivElement | null>(null);

  function clear(refocusInput = false): void {
    setQuery("");
    if (refocusInput) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function resultButtons(): HTMLButtonElement[] {
    return [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  }

  function focusTreeAfterSearch(): void {
    focusTreeItem(treeRef, store.getState().focusedNodeId);
  }

  return {
    query,
    trimmedQuery: query.trim(),
    inputRef,
    fieldRef,
    resultsRef,
    savedSearchesRef,
    focus: () => inputRef.current?.focus(),
    clear,
    setQuery,
    selectSavedSearch: (savedQuery) => {
      setQuery(savedQuery);
      inputRef.current?.focus();
    },
    onAreaBlur: (event) => {
      const next = event.relatedTarget as Node | null;
      const staysInside =
        next !== null &&
        (fieldRef.current?.contains(next) === true ||
          resultsRef.current?.contains(next) === true ||
          savedSearchesRef.current?.contains(next) === true);
      if (!staysInside) {
        clear();
      }
    },
    onInputKeyDown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (query !== "") {
          clear();
        } else {
          focusTreeAfterSearch();
        }
        return;
      }
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        resultButtons()[0]?.focus();
      }
    },
    onResultsKeyDown: (event) => {
      if (event.key === "/") {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clear(true);
        return;
      }
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }
      event.preventDefault();
      const buttons = resultButtons();
      if (buttons.length === 0) {
        return;
      }
      if (event.key === "Home") {
        buttons[0]?.focus();
        return;
      }
      if (event.key === "End") {
        buttons[buttons.length - 1]?.focus();
        return;
      }
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowUp" && index <= 0) {
        inputRef.current?.focus();
        return;
      }
      buttons[index + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
    },
    onNoteSelect: (id) => {
      revealNode(store, id);
      activateNote(store, id);
      clear();
      focusTreeAfterSearch();
    },
    onFolderSelect: (id) => {
      revealNode(store, id);
      if (!store.getState().expandedIds.has(id)) {
        store.toggleExpanded(id);
      }
      clear();
      focusTreeAfterSearch();
    },
  };
}
