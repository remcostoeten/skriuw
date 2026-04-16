import type { WorkspaceTarget } from "./contracts";

export function isCloudWorkspaceTarget(
  target: WorkspaceTarget,
): target is Extract<WorkspaceTarget, { kind: "cloud" }> {
  return target.kind === "cloud";
}
