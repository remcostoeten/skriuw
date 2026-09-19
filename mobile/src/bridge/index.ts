import { skriuwCore } from "../../modules/skriuw-core";
import { createNativeBridge } from "./native-adapter";

export const nativeBridge = createNativeBridge(skriuwCore);
