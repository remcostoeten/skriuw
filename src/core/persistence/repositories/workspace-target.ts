import { getAuthStateSnapshot } from "@/platform/auth";

export type WorkspaceTarget =
  | {
      kind: "local";
      workspaceId: string;
    }
  | {
      kind: "cloud";
      workspaceId: string;
      userId: string;
    };

export function getWorkspaceTarget(): WorkspaceTarget {
  const auth = getAuthStateSnapshot();

  if (auth.user && auth.canSync) {
    return {
      kind: "cloud",
      workspaceId: auth.workspaceId,
      userId: auth.user.id,
    };
  }

  return {
    kind: "local",
    workspaceId: auth.workspaceId,
  };
}

export function isCloudWorkspaceTarget(
  target: WorkspaceTarget,
): target is Extract<WorkspaceTarget, { kind: "cloud" }> {
  return target.kind === "cloud";
}
