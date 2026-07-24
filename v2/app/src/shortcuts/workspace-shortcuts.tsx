import { useEffect, useMemo, useRef } from "react";
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
 * "new entity" action instead.
 */
function activeScopesForRoute(route: AppRoute): string[] {
  return route === "tags" || route === "people" ? [] : ["note-create"];
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

  const results = useShortcutMap(shortcutMap, {
    activeScopes: activeScopesForRoute(route),
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
