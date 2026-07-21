import { useEffect, useRef } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut/react";
import { useRendererSelector } from "../store/use-renderer-selector";
import type { RendererStore } from "../store/types";
import { effectiveShortcutKeys, shortcutOverridesFromSettings } from "./bindings";
import type { ShortcutOverrides } from "./bindings";
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

function sameOverrides(left: ShortcutOverrides, right: ShortcutOverrides): boolean {
  const leftKeys = Object.keys(left) as (keyof ShortcutOverrides)[];
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
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
  if (!suspended) {
    return SHORTCUT_DEFINITIONS;
  }
  return activeWhileSuspended
    ? SHORTCUT_DEFINITIONS.filter((definition) => definition.id === activeWhileSuspended)
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
    sameOverrides,
  );

  useEffect(() => {
    const definitions = shortcutDefinitionsForState(suspended, activeWhileSuspended);
    const results = definitions.map((definition) =>
      $.bind(effectiveShortcutKeys(definition, overrides)).on(
        () => {
          actionsRef.current[definition.id]();
        },
        {
          description: definition.label,
          preventDefault: true,
          except: definition.worksWhileTyping ? neverExcept : undefined,
        },
      ),
    );
    return () => {
      for (const result of results) {
        result.unbind();
      }
    };
  }, [$, activeWhileSuspended, overrides, suspended]);

  return null;
}
