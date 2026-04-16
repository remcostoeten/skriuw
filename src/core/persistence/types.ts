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

export function isCloudWorkspaceTarget(
  target: WorkspaceTarget,
): target is Extract<WorkspaceTarget, { kind: "cloud" }> {
  return target.kind === "cloud";
}
