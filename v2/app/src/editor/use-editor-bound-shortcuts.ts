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

export type EditorBoundHandlers = Partial<Record<ShortcutActionId, () => void>>;

/**
 * A handler map that must cover every id in `Id`. Surfaces type their map with
 * this against their list from `editor-bound-shortcut-ids`, so adding an id to
 * the list without writing its handler fails to compile.
 */
export type EditorBoundHandlersFor<Id extends ShortcutActionId> = Record<Id, () => void>;

/**
 * Binds editor-only shortcut definitions to one editor surface. The listener
 * sits on `host` instead of the window, so the same keys pressed in the sidebar
 * tree, the find panel, the metadata panel, or the other split pane never reach
 * this editor. Keys still come from `SHORTCUT_DEFINITIONS`, so they stay
 * rebindable and conflict-checked.
 *
 * `handlers` and `activeScopes` have to be stable across renders, or every
 * render re-registers the bindings.
 */
export function useEditorBoundShortcuts(
  store: RendererStore,
  host: HTMLElement | null,
  handlers: EditorBoundHandlers,
  activeScopes?: string[],
): void {
  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );
  const platform = detectPlatform() as ShortcutPlatform;

  const shortcutMap = useMemo(() => {
    const map: ShortcutMap = {};
    for (const id of Object.keys(handlers) as ShortcutActionId[]) {
      const handler = handlers[id];
      const definition = shortcutDefinition(id);
      if (!handler || !shortcutBindsOnPlatform(definition, overrides, platform)) {
        continue;
      }
      map[id] = {
        keys: effectiveShortcutKeys(definition, overrides),
        handler,
        options: {
          description: definition.description ?? definition.label,
          preventDefault: true,
          scopes: definition.scopes,
        },
      };
    }
    return map;
  }, [handlers, overrides, platform]);

  useShortcutMap(shortcutMap, {
    target: host,
    ignoreInputs: false,
    disabled: host === null,
    activeScopes,
  });
}
