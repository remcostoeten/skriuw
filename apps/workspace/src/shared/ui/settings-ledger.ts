import { createContext, useContext } from "react";

export type LedgerGroupEntry = {
  id: string;
  title: string;
  element: HTMLElement;
};

export type LedgerRegistry = {
  register: (entry: LedgerGroupEntry) => () => void;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => readonly LedgerGroupEntry[];
};

export type LedgerSearchMatch = ReadonlyMap<string, ReadonlySet<string> | null>;

export type SettingsLedger = {
  sectionId: string;
  sectionLabel: string;
  registry: LedgerRegistry | null;
  query: string;
  search: LedgerSearchMatch | null;
};

function documentOrder(left: LedgerGroupEntry, right: LedgerGroupEntry): number {
  const position = left.element.compareDocumentPosition(right.element);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

/**
 * @name createLedgerRegistry
 * @description Collects the groups a settings page renders, in document
 * order, so the sidebar outline lists exactly the groups on screen, including
 * groups that only appear for some accounts, runtimes or states.
 *
 * @example
 * const registry = createLedgerRegistry();
 * const unregister = registry.register({ id: "theme", title: "Theme", element });
 */
export function createLedgerRegistry(): LedgerRegistry {
  let entries: readonly LedgerGroupEntry[] = [];
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  return {
    register(entry) {
      entries = [...entries.filter((current) => current.id !== entry.id), entry].sort(
        documentOrder,
      );
      emit();
      return () => {
        if (!entries.includes(entry)) return;
        entries = entries.filter((current) => current !== entry);
        emit();
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return entries;
    },
  };
}

export const SettingsLedgerContext = createContext<SettingsLedger | null>(null);

export const LedgerGroupMatchContext = createContext<ReadonlySet<string> | null>(null);

export function useSettingsLedger(): SettingsLedger | null {
  return useContext(SettingsLedgerContext);
}

/**
 * @name ledgerGroupDomId
 * @description The element id of a settings group, unique across sections so
 * search results and jumps can address one group on a page.
 *
 * @example
 * document.getElementById(ledgerGroupDomId("appearance", "sidebar"));
 */
export function ledgerGroupDomId(sectionId: string, groupId: string): string {
  return `settings-${sectionId}-${groupId}`;
}
