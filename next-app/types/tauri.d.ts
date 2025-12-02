// Type declarations for optional Tauri modules
// These modules are only available in Tauri desktop environments, not in web deployments

declare module '@tauri-apps/api/window' {
  export function getCurrentWindow(): {
    minimize(): Promise<void>
    maximize(): Promise<void>
    unmaximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
  }
}

declare module '@tauri-apps/api/event' {
  export function listen<T = unknown>(
    event: string,
    handler: (event: { payload: T }) => void
  ): Promise<() => void>
}

