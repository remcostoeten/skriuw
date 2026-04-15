import { getAuthStateSnapshot } from "@/platform/auth";
import type { WorkspaceTarget } from "./contracts";

export function getWorkspaceTarget(): WorkspaceTarget {
  const auth = getAuthStateSnapshot();
  const workspaceId = auth.user?.id ?? auth.workspaceId;

  if (auth.phase === "authenticated" && auth.user) {
    return {
      kind: "cloud",
      workspaceId,
      userId: auth.user.id,
    };
  }

  return {
    kind: "local",
    workspaceId,
  };
}

export function isCloudWorkspaceTarget(
  target: WorkspaceTarget,
): target is Extract<WorkspaceTarget, { kind: "cloud" }> {
  return target.kind === "cloud";
}
