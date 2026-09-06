const calls: string[] = [];

export function resetBridgeCalls(): void {
  calls.length = 0;
}

export function readBridgeCalls(): string[] {
  return [...calls];
}

export function invoke<T>(command: string): Promise<T> {
  calls.push(command);
  if (command === "load_auth_token") {
    return Promise.resolve(null as T);
  }
  if (command === "plugin:event|listen" || command === "plugin:event|unlisten") {
    return Promise.resolve(0 as T);
  }
  if (command === "apply_workspace_operations") {
    return Promise.resolve({ applied: 1, revisions: [], rankChanges: [] } as T);
  }
  return Promise.reject(new Error(`unexpected performance bridge call: ${command}`));
}

export { Channel, convertFileSrc } from "../node_modules/@tauri-apps/api/core.js";
