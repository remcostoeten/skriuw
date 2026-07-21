import { useEffect, useRef } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut/react";
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
  /**
   * Suspends every workspace shortcut, e.g. while a modal owns the keyboard.
   * Keeps modal-local keys (Escape, recorder capture) from racing global
   * bindings.
   */
  suspended?: boolean;
  activeWhileSuspended?: ShortcutActionId;
};

function neverExcept(): boolean {
  return false;
}

/**
 * Headless binder for app-wide shortcuts. Definitions live in
 * `definitions.ts`; user overrides come from workspace settings and rebind
 * live when they change. Adding a shortcut means adding a definition there
 * and an action here — no new listeners or components.
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

export function WorkspaceShortcuts({
  store,
  actions,
  suspended = false,
  activeWhileSuspended,
}: Props) {
  const $ = useShortcut();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameShortcutOverrides,
  );

  useEffect(() => {
    const definitions = shortcutDefinitionsForState(suspended, activeWhileSuspended);
    const results = definitions.flatMap((definition) => {
      const handler = () => {
        actionsRef.current[definition.id]();
      };
      const primary = $.bind(effectiveShortcutKeys(definition, overrides)).on(handler, {
        description: definition.label,
        preventDefault: true,
        except: definition.worksWhileTyping ? neverExcept : undefined,
      });
      if (!definition.secondaryKeys) {
        return [primary];
      }
      const secondary = $.bind(definition.secondaryKeys).on(handler, {
        description: definition.label,
        preventDefault: true,
      });
      return [primary, secondary];
    });
    return () => {
      for (const result of results) {
        result.unbind();
      }
    };
  }, [$, activeWhileSuspended, overrides, suspended]);

  return null;
}
