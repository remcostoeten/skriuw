import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { ShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { AppRoute } from "../app-route";
import { opensNotesInTabs } from "../settings/settings-model";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import {
  effectiveShortcutKeys,
  modifiedDigitPosition,
  sameCombo,
  sameShortcutOverrides,
  sequenceHandlerOptions,
  shortcutExcept,
  shortcutOverridesFromSettings,
} from "./bindings";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId } from "./definitions";
import { RAIL_ITEMS, railModShiftKeys } from "./rail-items";

type ShortcutActions = Record<ShortcutActionId, () => void>;

function selectTabsEnabled(state: RendererState): boolean {
  return opensNotesInTabs(state.settings);
}

function selectSplitActive(state: RendererState): boolean {
  return state.panes.length > 1;
}

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
 * "new entity" action instead, nor on the history route, which has no note
 * surface to drop the new note into. `tags-route` gates keys that only make sense
 * inside the tag manager, like the "new tag" binding. `journal` gates the plain
 * day-navigation keys on the journal route, so they never steal a character
 * anywhere else.
 */
function activeScopesForRoute(route: AppRoute): string[] {
  const scopes = route === "notes" || route === "trash" ? ["note-create"] : [];
  if (route === "tags") {
    scopes.push("tags-route");
  }
  if (route === "journal") {
    scopes.push("journal");
  }
  return scopes;
}

/**
 * Every scope active right now. `tabs` gates the tab-strip management keys on the
 * tabbed workspace being on and `split` gates the directional pane keys on a
 * split existing, so with either off those keypresses never match and fall
 * through to whatever else claims them.
 */
export function activeShortcutScopes(
  route: AppRoute,
  noteFocused: boolean,
  tabsEnabled: boolean,
  splitActive: boolean,
): string[] {
  const scopes = activeScopesForRoute(route);
  if (noteFocused) {
    scopes.push("note-focus");
  }
  if (route !== "notes") {
    return scopes;
  }
  if (tabsEnabled) {
    scopes.push("tabs");
  }
  if (splitActive) {
    scopes.push("split");
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
          description: definition.description ?? definition.label,
          preventDefault: true,
          except: shortcutExcept(definition, definition.worksWhileTyping === true),
          scopes: definition.scopes,
        },
      };
      if (definition.secondaryKeys) {
        map[`${definition.id}:secondary`] = {
          keys: definition.secondaryKeys,
          handler,
          options: {
            description: definition.description ?? definition.label,
            preventDefault: true,
            except: shortcutExcept(
              definition,
              definition.secondaryWorksWhileTyping === true,
            ),
            scopes: definition.scopes,
            ...sequenceHandlerOptions(definition.secondaryKeys),
          },
        };
      }
    }
    return map;
  }, [overrides]);

  const noteFocused = useNoteFocusScope();
  const tabsEnabled = useRendererSelector(store, selectTabsEnabled);
  const splitActive = useRendererSelector(store, selectSplitActive);
  const results = useShortcutMap(shortcutMap, {
    activeScopes: activeShortcutScopes(route, noteFocused, tabsEnabled, splitActive),
    ignoreInputs: false,
  });

  useEffect(() => {
    if (suspended) {
      return;
    }
    const handleModifiedDigit = (event: KeyboardEvent) => {
      const position = modifiedDigitPosition(event, RAIL_ITEMS.length);
      if (position === null) {
        return;
      }
      const item = RAIL_ITEMS[position - 1];
      if (!item) {
        return;
      }
      const definition = SHORTCUT_DEFINITIONS.find(
        (candidate) => candidate.id === item.actionId,
      );
      if (
        !definition ||
        !sameCombo(effectiveShortcutKeys(definition, overrides), railModShiftKeys(position)) ||
        shortcutExcept(definition, true)?.(event)
      ) {
        return;
      }
      event.preventDefault();
      actionsRef.current[item.actionId]();
    };
    window.addEventListener("keydown", handleModifiedDigit);
    return () => window.removeEventListener("keydown", handleModifiedDigit);
  }, [overrides, suspended]);

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
