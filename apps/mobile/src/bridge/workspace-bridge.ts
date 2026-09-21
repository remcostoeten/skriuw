import type { BridgePort } from "@skriuw/renderer-core/bridge/port";

const MISSING_CORE_MESSAGE =
  "This build does not include the Skriuw core module, so it cannot open a workspace on this device.";

const MISSING_CORE_RECOVERY =
  "Install a development or release build of Skriuw. Expo Go cannot load the native core.";

/**
 * The module is absent in Expo Go and in any client built before the native
 * core shipped. `requireNativeModule` throws a bare resolver message there, so
 * it is replaced with one that says what to do instead.
 */
export function describeCoreLoadFailure(error: unknown): Error {
  return new Error(`${MISSING_CORE_MESSAGE} ${MISSING_CORE_RECOVERY}`, { cause: error });
}

/**
 * The bridge the shell runs against. SQLite is canonical and native
 * (`docs/specs/mobile-app.md`, R-A1), so a native build that cannot reach the
 * core fails startup rather than falling back to data it would later lose.
 *
 * Loading is deferred to call time so the failure arrives as a rejected promise
 * that the startup-failure screen can render, rather than as an import-time
 * throw that takes the whole bundle down.
 */
export async function loadWorkspaceBridge(): Promise<BridgePort> {
  try {
    const { nativeBridge } = await import("./native-bridge");
    return nativeBridge;
  } catch (error) {
    throw describeCoreLoadFailure(error);
  }
}
