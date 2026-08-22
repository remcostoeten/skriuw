import { openExternalUrl, openLinkInApp } from "@/bridge/external-links";
import type { WorkspaceSettings } from "@/contracts/workspace";
import { opensLinksInApp } from "@/features/settings/settings-model";

export type LinkTarget = "app" | "system";

/** Where a plain activation (mod+click, the open shortcut, Enter) sends a link. */
export function defaultLinkTarget(settings: WorkspaceSettings): LinkTarget {
  return opensLinksInApp(settings) ? "app" : "system";
}

export function otherLinkTarget(target: LinkTarget): LinkTarget {
  return target === "app" ? "system" : "app";
}

export function linkTargetLabel(target: LinkTarget): string {
  return target === "app" ? "Open in Skriuw" : "Open in browser";
}

export function openLinkAt(target: LinkTarget, href: string): Promise<void> {
  return target === "app" ? openLinkInApp(href) : openExternalUrl(href);
}
