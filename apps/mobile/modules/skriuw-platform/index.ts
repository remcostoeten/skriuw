import { requireOptionalNativeModule } from "expo";

import { createSkriuwPlatform, type NativeSkriuwPlatform } from "./src/platform";

export type { LaunchAnchor, LaunchTiming, SkriuwPlatform } from "./src/platform";

export const skriuwPlatform = createSkriuwPlatform(
  requireOptionalNativeModule<NativeSkriuwPlatform>("SkriuwPlatform"),
);
