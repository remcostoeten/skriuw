/**
 * Detects if the app is running inside a Tauri runtime.
 *
 * Checks multiple Tauri globals for v1/v2 compatibility.
 * For reliable detection, enable `withGlobalTauri: true` in tauri.conf.json.
 *
 * @returns `true` if Tauri APIs are available, `false` otherwise
 */
type TauriWin = {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }
  
  export function isTauriAvailable(): boolean {
    if (typeof window === "undefined") return false
  
    const w = window as unknown as TauriWin
    return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__)
  }
  