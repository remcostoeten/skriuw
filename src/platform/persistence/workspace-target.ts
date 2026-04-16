import type { WorkspaceTarget } from "@/core/persistence/repositories/contracts";
import { getAuthStateSnapshot } from "@/platform/auth";

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
