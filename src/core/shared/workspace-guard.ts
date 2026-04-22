export type WorkspaceGuard = {
  workspaceId: string;
  isCurrent: () => boolean;
  runIfCurrent: (effect: () => void) => boolean;
};

export function captureWorkspaceGuard(
  resolveWorkspaceId: () => string,
  workspaceId = resolveWorkspaceId(),
): WorkspaceGuard {
  return {
    workspaceId,
    isCurrent: () => resolveWorkspaceId() === workspaceId,
    runIfCurrent: (effect) => {
      if (resolveWorkspaceId() !== workspaceId) {
        return false;
      }

      effect();
      return true;
    },
  };
}
