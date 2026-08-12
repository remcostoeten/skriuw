const calls: string[] = [];

export function resetBridgeCalls(): void {
  calls.length = 0;
}

export function readBridgeCalls(): string[] {
  return [...calls];
}

export function invoke<T>(command: string): Promise<T> {
  calls.push(command);
  if (command === "apply_workspace_operations") {
    return Promise.resolve({ applied: 1, revisions: [], rankChanges: [] } as T);
  }
  return Promise.reject(new Error(`unexpected performance bridge call: ${command}`));
}
