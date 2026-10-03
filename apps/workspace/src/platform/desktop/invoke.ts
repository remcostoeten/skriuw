import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/** Sends a command to the Tauri shell over IPC. */
export function invokeDesktop<T>(command: string, args?: unknown): Promise<T> {
  return args === undefined
    ? tauriInvoke<T>(command)
    : tauriInvoke<T>(command, args as Record<string, unknown>);
}
