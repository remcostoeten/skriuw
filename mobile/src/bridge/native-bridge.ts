import { skriuwCore } from "../../modules/skriuw-core";
import { createNativeBridge } from "./native-adapter";

/** The device bridge. Importing this file loads the native module. */
export const nativeBridge = createNativeBridge(skriuwCore);
