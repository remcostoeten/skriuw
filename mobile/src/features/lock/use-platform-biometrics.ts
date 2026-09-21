import { useMemo } from "react";
import { useWorkspace } from "../../shell/workspace-provider";
import { platformSecureStore } from "../auth/platform-keystore";
import type { BiometricUnlock } from "./biometrics";
import { createPlatformBiometricUnlock, loadLocalAuthentication } from "./platform-biometrics";

/** Biometric unlock on this device, reporting through the open workspace session. */
export function usePlatformBiometrics(): BiometricUnlock {
  const session = useWorkspace();
  return useMemo(
    () =>
      createPlatformBiometricUnlock({
        secureStore: platformSecureStore(),
        loadLocalAuthentication,
        reportError: session.reportFailure,
      }),
    [session],
  );
}
