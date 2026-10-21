import { useMemo } from "react";
import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import {
  effectiveShortcutKeys,
  sameShortcutOverrides,
  selectShortcutOverrides,
  shortcutBindsOnPlatform,
  shortcutDefinition,
  shortcutShadowedByQuit,
} from "./bindings";
import type { ShortcutOverrides } from "./bindings";
import type { ShortcutActionId, ShortcutPlatform } from "./definitions";

/**
 * The combo an icon button should advertise: the action's effective binding,
 * formatted for `platform`, with sequences shown step by step. Returns nothing
 * when the default combo does not bind on this platform and the user has not
 * rebound it, or when Quit claimed the combo, so a tooltip never advertises a
 * dead key.
 */
export function shortcutHint(
  id: ShortcutActionId,
  overrides: ShortcutOverrides,
  platform: ShortcutPlatform,
): string | undefined {
  const definition = shortcutDefinition(id);
  const keys = effectiveShortcutKeys(definition, overrides);
  if (
    !shortcutBindsOnPlatform(definition, overrides, platform) ||
    shortcutShadowedByQuit(definition, keys, overrides)
  ) {
    return undefined;
  }
  return keys
    .split(" then ")
    .map((step) => formatShortcut(step, platform))
    .join(" ");
}

const hintsByOverrides = new WeakMap<ShortcutOverrides, Map<string, string | undefined>>();

function cachedShortcutHint(
  id: ShortcutActionId,
  overrides: ShortcutOverrides,
  platform: ShortcutPlatform,
): string | undefined {
  let hints = hintsByOverrides.get(overrides);
  if (!hints) {
    hints = new Map();
    hintsByOverrides.set(overrides, hints);
  }
  const key = `${platform}:${id}`;
  if (hints.has(key)) return hints.get(key);
  const hint = shortcutHint(id, overrides, platform);
  hints.set(key, hint);
  return hint;
}

/**
 * Tooltip hints for a fixed set of actions, kept in sync with user rebinds
 * through a single narrow subscription to `shortcutOverrides`. Formatting is
 * cached per overrides snapshot, so a surface that remounts on note switch
 * does not re-format every combo.
 */
export function useShortcutHints<Id extends ShortcutActionId>(
  store: RendererStore,
  ids: readonly Id[],
): Record<Id, string | undefined> {
  const overrides = useRendererSelector(store, selectShortcutOverrides, sameShortcutOverrides);
  const platform = detectPlatform() as ShortcutPlatform;
  return useMemo(() => {
    const hints = {} as Record<Id, string | undefined>;
    for (const id of ids) {
      hints[id] = cachedShortcutHint(id, overrides, platform);
    }
    return hints;
  }, [ids, overrides, platform]);
}
