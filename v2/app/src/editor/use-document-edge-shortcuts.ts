import { useMemo } from "react";
import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { useShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { ShortcutMap } from "@remcostoeten/use-shortcut/react";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  shortcutBindsOnPlatform,
  shortcutDefinition,
  shortcutOverridesFromSettings,
} from "../shortcuts/bindings";
import type { ShortcutActionId, ShortcutPlatform } from "../shortcuts/definitions";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import type { DocumentEdge } from "./document-edges";

const EDGE_ACTIONS: readonly { id: ShortcutActionId; edge: DocumentEdge }[] = [
  { id: "goToDocumentStart", edge: "start" },
  { id: "goToDocumentEnd", edge: "end" },
];

/**
 * Binds the document start/end jumps to one editor surface. The listener sits on
 * `host` rather than the window, so arrow keys in the sidebar, the find panel,
 * the metadata panel, or the other split pane never reach it.
 */
export function useDocumentEdgeShortcuts(
  store: RendererStore,
  host: HTMLElement | null,
  jumpToEdge: (edge: DocumentEdge) => void,
): void {
  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );
  const platform = detectPlatform() as ShortcutPlatform;

  const shortcutMap = useMemo(() => {
    const map: ShortcutMap = {};
    for (const { id, edge } of EDGE_ACTIONS) {
      const definition = shortcutDefinition(id);
      if (!shortcutBindsOnPlatform(definition, overrides, platform)) {
        continue;
      }
      map[id] = {
        keys: effectiveShortcutKeys(definition, overrides),
        handler: () => jumpToEdge(edge),
        options: {
          description: definition.description ?? definition.label,
          preventDefault: true,
        },
      };
    }
    return map;
  }, [jumpToEdge, overrides, platform]);

  useShortcutMap(shortcutMap, {
    target: host,
    ignoreInputs: false,
    disabled: host === null,
  });
}
