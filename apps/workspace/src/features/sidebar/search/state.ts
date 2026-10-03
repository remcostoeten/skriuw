import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { focusTreeItem, type TreeRef } from "../tree/focus";
import { activateNote, revealNode } from "../tree/operations";

export type SidebarSearch = {
  isOpen: boolean;
  query: string;
  trimmedQuery: string;
  inputRef: RefObject<HTMLInputElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  resultsRef: RefObject<HTMLDivElement | null>;
  savedSearchesRef: RefObject<HTMLDivElement | null>;
  open: () => void;
  openAndFocus: () => void;
  close: (restoreTrigger?: boolean) => void;
  setQuery: (query: string) => void;
  selectSavedSearch: (query: string) => void;
  onAreaBlur: (event: FocusEvent) => void;
  onInputKeyDown: (event: KeyboardEvent) => void;
  onResultsKeyDown: (event: KeyboardEvent) => void;
  onNoteSelect: (id: string) => void;
  onFolderSelect: (id: string) => void;
};

export function useSidebarSearch(store: RendererStore, treeRef: TreeRef): SidebarSearch {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const savedSearchesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  function close(restoreTrigger = false): void {
    setIsOpen(false);
    setQuery("");
    if (restoreTrigger) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function resultButtons(): HTMLButtonElement[] {
    return [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  }

  function focusTreeAfterSearch(): void {
    focusTreeItem(treeRef, store.getState().focusedNodeId);
  }

  return {
    isOpen,
    query,
    trimmedQuery: query.trim(),
    inputRef,
    triggerRef,
    overlayRef,
    resultsRef,
    savedSearchesRef,
    open: () => setIsOpen(true),
    openAndFocus: () => {
      setIsOpen(true);
      inputRef.current?.focus();
    },
    close,
    setQuery,
    selectSavedSearch: (savedQuery) => {
      setQuery(savedQuery);
      setIsOpen(true);
    },
    onAreaBlur: (event) => {
      const next = event.relatedTarget as Node | null;
      const staysInside =
        next !== null &&
        (overlayRef.current?.contains(next) === true ||
          resultsRef.current?.contains(next) === true ||
          savedSearchesRef.current?.contains(next) === true);
      if (!staysInside) {
        close();
      }
    },
    onInputKeyDown: (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
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
        close(true);
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
      close();
      focusTreeAfterSearch();
    },
    onFolderSelect: (id) => {
      revealNode(store, id);
      if (!store.getState().expandedIds.has(id)) {
        store.toggleExpanded(id);
      }
      close();
      focusTreeAfterSearch();
    },
  };
}
