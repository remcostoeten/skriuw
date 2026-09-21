import { ICON_REGISTRY, type IconName } from "@skriuw/icons";

/**
 * Action-named icons the desktop renders through `AppIcon`. The table itself
 * is shared with the mobile shell (`packages/icons/registry.ts`), so both
 * platforms draw the same glyph and the same animation for an action.
 */
export const APP_ICONS = ICON_REGISTRY;

export type AppIconName = IconName;
