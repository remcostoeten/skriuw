/** Stands in for the shell modules that need a provider: `theme`, `icons` and `workspace-provider`. */
import { currentWorkspaceValue, host } from "./native-host";

export const ShellIcon = host("ShellIcon");

export function useTheme() {
  return { color: () => "#000000" };
}

export function useWorkspaceSelector() {
  return currentWorkspaceValue();
}
