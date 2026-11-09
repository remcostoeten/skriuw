import { routeHasSidebar, type AppRoute } from "@skriuw/renderer-core/route/app-route";
import { METADATA_DEFAULT_WIDTH } from "./metadata-resize";
import { SIDEBAR_DEFAULT_WIDTH } from "./sidebar-resize";

export type PanelTracks = {
  sidebarOpen: boolean;
  metadataOpen: boolean;
  sidebarWidth: number;
  metadataWidth: number;
};

export const FOCUS_GRID_TEMPLATE = "0px 0px minmax(300px, 1fr) 0px";

export const RAIL_WIDTH = 56;

export const RAIL_WIDE_WIDTH = 188;

export function panelGridTemplate(
  route: AppRoute,
  sidebarOpen: boolean,
  metadataOpen: boolean,
  sidebarWidth: number = SIDEBAR_DEFAULT_WIDTH,
  metadataWidth: number = METADATA_DEFAULT_WIDTH,
  railWidth: number = RAIL_WIDTH,
): string {
  const rail = `${railWidth}px`;
  if (!routeHasSidebar(route)) {
    return `${rail} 1fr`;
  }
  const sidebar = sidebarOpen ? `${sidebarWidth}px` : "0px";
  if (route !== "notes") {
    return `${rail} ${sidebar} minmax(300px, 1fr)`;
  }
  const metadata = metadataOpen ? `${metadataWidth}px` : "0px";
  return `${rail} ${sidebar} minmax(300px, 1fr) ${metadata}`;
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
