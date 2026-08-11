import type { AppRoute } from "@/app-route";
import { METADATA_DEFAULT_WIDTH } from "./metadata-resize";
import { SIDEBAR_DEFAULT_WIDTH } from "./sidebar-resize";

export type PanelTracks = {
  sidebarOpen: boolean;
  metadataOpen: boolean;
  sidebarWidth: number;
  metadataWidth: number;
};

/**
 * Routes that share the resizable sidebar shell: the pane keeps its width,
 * collapse state and resize handle across them, only its content swaps.
 */
export function routeHasSidebar(route: AppRoute): boolean {
  return route === "notes" || route === "journal";
}

export function panelGridTemplate(
  route: AppRoute,
  sidebarOpen: boolean,
  metadataOpen: boolean,
  sidebarWidth: number = SIDEBAR_DEFAULT_WIDTH,
  metadataWidth: number = METADATA_DEFAULT_WIDTH,
): string {
  if (!routeHasSidebar(route)) {
    return "56px 1fr";
  }
  const sidebar = sidebarOpen ? `${sidebarWidth}px` : "0px";
  if (route !== "notes") {
    return `56px ${sidebar} minmax(300px, 1fr)`;
  }
  const metadata = metadataOpen ? `${metadataWidth}px` : "0px";
  return `56px ${sidebar} minmax(300px, 1fr) ${metadata}`;
}

export function panelTracksWith(
  tracks: PanelTracks,
  panel: "sidebar" | "metadata",
  width: number,
  collapsed: boolean,
): PanelTracks {
  if (panel === "sidebar") {
    return { ...tracks, sidebarOpen: !collapsed, sidebarWidth: width };
  }
  return { ...tracks, metadataOpen: !collapsed, metadataWidth: width };
}
