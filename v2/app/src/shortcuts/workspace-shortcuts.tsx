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
export function WorkspaceShortcuts({ store, actions, suspended = false }: Props) {
  const $ = useShortcut();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const overrides = useRendererSelector(
    store,
    (state) => shortcutOverridesFromSettings(state.settings),
    sameOverrides,
  );

  useEffect(() => {
    if (suspended) {
      return;
    }
    const results = SHORTCUT_DEFINITIONS.map((definition) =>
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
  }, [$, overrides, suspended]);

  return null;
}
