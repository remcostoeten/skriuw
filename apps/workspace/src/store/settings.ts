import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { commitOperations } from "./commit";

export function updateSettings(store: RendererStore, settings: WorkspaceSettings): void {
  void commitOperations(store, [{ type: "update_settings", settings }]).catch(
    reportRejection("update settings"),
  );
}

function reportRejection(action: string) {
  return (error: unknown) => {
    console.error(`${action} rejected`, error);
  };
}
