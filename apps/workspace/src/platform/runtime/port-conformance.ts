import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import type * as commands from "./commands";

type Conforms = typeof commands extends BridgePort ? true : never;

export const desktopCommandsImplementBridgePort: Conforms = true;
