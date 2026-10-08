import { requireNativeModule } from "expo";

import { createSkriuwCore, type NativeSkriuwCore } from "./src/core";

export { DEFAULT_SLOT } from "./src/core";
export type {
  NativeSyncEvent,
  OpenedWorkspace,
  SaveDocumentRequest,
  SkriuwCore,
  WorkspaceRoute,
} from "./src/core";
export { SkriuwCoreError } from "./src/errors";
export type { SkriuwCoreErrorKind } from "./src/errors";

export const skriuwCore = createSkriuwCore(requireNativeModule<NativeSkriuwCore>("SkriuwCore"));
