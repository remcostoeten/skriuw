import type { WorkspaceSettings } from "../contracts/workspace";

export function opensNotesInTabs(settings: WorkspaceSettings): boolean {
  return settings.openNotesInTabs === true;
}
