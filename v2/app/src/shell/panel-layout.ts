import type { AppRoute } from "../app-route";

export function panelGridTemplate(
  route: AppRoute,
  sidebarOpen: boolean,
  metadataOpen: boolean,
): string {
  if (route !== "notes") {
    return "56px 1fr";
  }
  const sidebar = sidebarOpen ? "minmax(152px, 260px)" : "0px";
  const metadata = metadataOpen ? "minmax(180px, 240px)" : "0px";
  return `56px ${sidebar} minmax(300px, 1fr) ${metadata}`;
}
