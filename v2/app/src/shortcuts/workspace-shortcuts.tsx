import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { ShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { AppRoute } from "../app-route";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  shortcutOverridesFromSettings,
} from "./bindings";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId } from "./definitions";

type ShortcutActions = Record<ShortcutActionId, () => void>;

type Props = {
  store: RendererStore;
  actions: ShortcutActions;
  route: AppRoute;
  /**
   * Suspends every workspace shortcut, e.g. while a modal owns the keyboard.
   * Keeps modal-local keys (Escape, recorder capture) from racing global
   * bindings.
   */
  suspended?: boolean;
  activeWhileSuspended?: ShortcutActionId;
};

/**
 * Scopes active for a route. `note-create` gates the global `mod+n` so it never
 * fires on the tag/people manager routes, which bind that key to their own
 * "new entity" action instead. `tags-route` gates keys that only make sense
 * inside the tag manager, like the "new tag" binding.
 */
function activeScopesForRoute(route: AppRoute): string[] {
  const scopes = route === "tags" || route === "people" ? [] : ["note-create"];
  if (route === "tags") {
    scopes.push("tags-route");
  }
  return scopes;
}

/**
 * Tracks whether keyboard focus sits inside the editor pane, which holds both
 * the ProseMirror surface and the search widget. Gates the `note-focus` scope
 * so keys like `mod+f` only fire while the user is in the note.
 */
function useNoteFocusScope(): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const syncFocus = () => {
      setFocused(
        document.activeElement instanceof HTMLElement &&
          document.activeElement.closest(".editor-pane") !== null,
      );
    };
    syncFocus();
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", syncFocus);
    return () => {
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
    };
  }, []);
  return focused;
}

/**
 * Definitions that should be enabled given the suspension state; the rest stay
 * registered but disabled.
 */
export function shortcutDefinitionsForState(
  suspended: boolean,
  activeWhileSuspended?: ShortcutActionId,
) {
  const bindable = SHORTCUT_DEFINITIONS.filter((definition) => !definition.boundInEditor);
  if (!suspended) {
    return bindable;
  }
  return activeWhileSuspended
    ? bindable.filter((definition) => definition.id === activeWhileSuspended)
    : [];
}

/**
 * Headless binder for app-wide shortcuts. Definitions live in
 * `definitions.ts`; user overrides come from workspace settings and rebind
 * live when they change. Adding a shortcut means adding a definition there
 * and an action here — no new listeners or components.
 */
export function WorkspaceShortcuts({
  store,
  actions,
  route,
  suspended = false,
  activeWhileSuspended,
}: Props) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );

  const shortcutMap = useMemo(() => {
    const map: ShortcutMap = {};
    for (const definition of SHORTCUT_DEFINITIONS) {
      if (definition.boundInEditor) {
        continue;
      }
      const handler = () => {
        actionsRef.current[definition.id]();
      };
      map[definition.id] = {
        keys: effectiveShortcutKeys(definition, overrides),
        handler,
        options: {
          description: definition.label,
          preventDefault: true,
          except: definition.worksWhileTyping ? undefined : "typing",
          scopes: definition.scopes,
        },
      };
      if (definition.secondaryKeys) {
        map[`${definition.id}:secondary`] = {
          keys: definition.secondaryKeys,
          handler,
          options: {
            description: definition.label,
            preventDefault: true,
            except: "typing",
          },
        };
      }
    }
    return map;
  }, [overrides]);

  const noteFocused = useNoteFocusScope();
  const results = useShortcutMap(shortcutMap, {
    activeScopes: noteFocused
      ? [...activeScopesForRoute(route), "note-focus"]
      : activeScopesForRoute(route),
    ignoreInputs: false,
  });

  useEffect(() => {
    const active = new Set<string>(
      shortcutDefinitionsForState(suspended, activeWhileSuspended).map(
        (definition) => definition.id,
      ),
    );
    for (const [id, result] of Object.entries(results)) {
      if (active.has(id.replace(/:secondary$/, ""))) {
        result.enable();
      } else {
        result.disable();
      }
    }
  }, [results, shortcutMap, suspended, activeWhileSuspended]);

  return null;
}
