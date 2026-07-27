type TauriGlobal = { window?: Record<string, unknown> };

/**
 * Makes `@tauri-apps/api` `invoke` resolve with an empty acknowledgement, so
 * tests can exercise actions that commit workspace operations without a real
 * backend and without the rejection path re-bootstrapping the store.
 */
export function setupTauriInvokeStub(): void {
  const globals = globalThis as TauriGlobal;
  globals.window = {
    ...(globals.window ?? {}),
    __TAURI_INTERNALS__: {
      invoke: () => Promise.resolve({ applied: 0, revisions: [], rankChanges: [] }),
      transformCallback: (callback: unknown) => callback,
    },
  };
}
