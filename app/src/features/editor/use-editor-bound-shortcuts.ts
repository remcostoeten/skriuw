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
} from "@/commands/bindings";
import type { ShortcutActionId, ShortcutPlatform } from "@/commands/definitions";
import { useRendererSelector } from "@/store/use-renderer-selector";
import type { RendererStore } from "@/store/types";

/**
 * A handler that shares its combo with a global binding. `claims` decides, per
 * keypress, whether this editor owns the key: `false` leaves the event
 * untouched so it bubbles to the window binding, `true` swallows it so both
 * never fire on one press.
 */
export type EditorBoundClaim = {
  run: () => void;
  claims: () => boolean;
};

export type EditorBoundHandler = (() => void) | EditorBoundClaim;

export type EditorBoundHandlers = Partial<Record<ShortcutActionId, EditorBoundHandler>>;

/**
 * A handler map that must cover every id in `Id`. Surfaces type their map with
 * this against their list from `editor-bound-shortcut-ids`, so adding an id to
 * the list without writing its handler fails to compile.
 */
export type EditorBoundHandlersFor<Id extends ShortcutActionId> = Record<
  Id,
  EditorBoundHandler
>;

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
    // use-shortcut bakes hook-level `disabled` into each binding from the
    // options captured on the hook's first render, and every host here starts
    // as null state, so `disabled: host === null` would leave the bindings
    // permanently disabled. Registering an empty map until the host exists
    // gates the same way without touching `disabled`.
    if (host === null) return map;
    for (const id of Object.keys(handlers) as ShortcutActionId[]) {
      const entry = handlers[id];
      const definition = shortcutDefinition(id);
      if (!entry || !shortcutBindsOnPlatform(definition, overrides, platform)) {
        continue;
      }
      const claim: EditorBoundClaim | null = typeof entry === "function" ? null : entry;
      const handler: () => void = typeof entry === "function" ? entry : entry.run;
      const options = {
        description: definition.description ?? definition.label,
        preventDefault: true,
        scopes: definition.scopes,
        ...(claim ? { except: () => !claim.claims(), stopPropagation: true } : {}),
      };
      map[id] = {
        keys: effectiveShortcutKeys(definition, overrides),
        handler,
        options,
      };
      if (definition.secondaryKeys) {
        map[`${id}:secondary`] = {
          keys: definition.secondaryKeys,
          handler,
          options,
        };
      }
    }
    return map;
  }, [handlers, host, overrides, platform]);

  useShortcutMap(shortcutMap, {
    target: host,
    ignoreInputs: false,
    activeScopes,
  });
}
