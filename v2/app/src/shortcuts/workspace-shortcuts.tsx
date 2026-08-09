import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShortcutMap } from "@remcostoeten/use-shortcut/react";
import type {
  ShortcutConflict as RegistryShortcutConflict,
  ShortcutMap,
} from "@remcostoeten/use-shortcut/react";
import type { AppRoute } from "../app-route";
import { opensNotesInTabs } from "../settings/settings-model";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererState, RendererStore } from "../store/types";
import { routeHasSidebar } from "../shell/panel-layout";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  sequenceHandlerOptions,
  shortcutExcept,
  shortcutMatchesPhysicalKey,
  scopeSeparatedConflicts,
  shortcutOverridesFromSettings,
  shortcutScopesActive,
} from "./bindings";
import { SHORTCUT_DEFINITIONS } from "./definitions";
import type { ShortcutActionId } from "./definitions";

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
 * Scopes active for a route. Each mirrors the route gate on the command behind
 * the binding, so a key never fires into a command that would refuse it:
 * `notes-route` and `sidebar-route` match `onNotesRoute` and `onSidebarRoute`
 * in the command table, `tags-route` gates keys that only make sense inside the
 * tag manager, and `journal` gates the plain day-navigation keys so they never
 * steal a character anywhere else.
 */
function activeScopesForRoute(route: AppRoute): string[] {
  const scopes: string[] = [];
  if (route === "notes") {
    scopes.push("notes-route");
  }
  if (routeHasSidebar(route)) {
    scopes.push("sidebar-route");
  }
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
  const activeScopes = useMemo(
    () => activeShortcutScopes(route, noteFocused, tabsEnabled, splitActive),
    [route, noteFocused, tabsEnabled, splitActive],
  );
  const isScopeSeparated = useMemo(() => scopeSeparatedConflicts(overrides), [overrides]);
  const handleConflict = useCallback(
    (conflict: RegistryShortcutConflict) => {
      if (isScopeSeparated(conflict.combo, conflict.existingCombo)) {
        return;
      }
      console.warn(
        `[useShortcut] Conflict detected (${conflict.reason}) between "${conflict.combo}" and "${conflict.existingCombo}"`,
      );
    },
    [isScopeSeparated],
  );

  const results = useShortcutMap(shortcutMap, {
    activeScopes,
    ignoreInputs: false,
    onConflict: handleConflict,
  });

  useEffect(() => {
    const activeDefinitions = shortcutDefinitionsForState(
      suspended,
      activeWhileSuspended,
    );
    const activeScopeSet = new Set(activeScopes);
    const handlePhysicalShortcut = (event: KeyboardEvent) => {
      for (const definition of activeDefinitions) {
        if (
          !shortcutScopesActive(definition, activeScopeSet) ||
          !shortcutMatchesPhysicalKey(
            event,
            effectiveShortcutKeys(definition, overrides),
          ) ||
          shortcutExcept(definition, definition.worksWhileTyping === true)?.(event)
        ) {
          continue;
        }
        event.preventDefault();
        actionsRef.current[definition.id]();
        return;
      }
    };
    window.addEventListener("keydown", handlePhysicalShortcut);
    return () => window.removeEventListener("keydown", handlePhysicalShortcut);
  }, [activeScopes, activeWhileSuspended, overrides, suspended]);

  useEffect(() => {
    const activeScopeSet = new Set(activeScopes);
    const active = new Set<string>(
      shortcutDefinitionsForState(suspended, activeWhileSuspended)
        .filter((definition) => shortcutScopesActive(definition, activeScopeSet))
        .map((definition) => definition.id),
    );
    for (const [id, result] of Object.entries(results)) {
      if (active.has(id.replace(/:secondary$/, ""))) {
        result.enable();
      } else {
        result.disable();
      }
    }
  }, [results, shortcutMap, suspended, activeWhileSuspended, activeScopes]);

  return null;
}
