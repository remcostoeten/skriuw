import { detectPlatform } from "@remcostoeten/use-shortcut/constants";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import { sameOverrides, selectShortcutOverrides } from "@/settings/sections/selectors";
import type { RendererStore } from "@/store/types";
import { useRendererSelector } from "@/store/use-renderer-selector";
import {
  effectiveShortcutKeys,
  shortcutBindsOnPlatform,
  shortcutDefinition,
} from "./bindings";
import type { ShortcutOverrides } from "./bindings";
import type { ShortcutActionId, ShortcutPlatform } from "./definitions";

/**
 * The combo an icon button should advertise: the action's effective binding,
 * formatted for `platform`, with sequences shown step by step. Returns nothing
 * when the default combo does not bind on this platform and the user has not
 * rebound it, so a tooltip never advertises a dead key.
 */
export function shortcutHint(
  id: ShortcutActionId,
  overrides: ShortcutOverrides,
  platform: ShortcutPlatform,
): string | undefined {
  const definition = shortcutDefinition(id);
  if (!shortcutBindsOnPlatform(definition, overrides, platform)) {
    return undefined;
  }
  return effectiveShortcutKeys(definition, overrides)
    .split(" then ")
    .map((step) => formatShortcut(step, platform))
    .join(" ");
}

/**
 * Tooltip hints for a fixed set of actions, kept in sync with user rebinds
 * through a single narrow subscription to `shortcutOverrides`.
 */
export function useShortcutHints<Id extends ShortcutActionId>(
  store: RendererStore,
  ids: readonly Id[],
): Record<Id, string | undefined> {
  const overrides = useRendererSelector(store, selectShortcutOverrides, sameOverrides);
  const platform = detectPlatform() as ShortcutPlatform;
  const hints = {} as Record<Id, string | undefined>;
  for (const id of ids) {
    hints[id] = shortcutHint(id, overrides, platform);
  }
  return hints;
}
