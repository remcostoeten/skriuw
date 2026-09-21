import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import { demoSnapshot } from "../shell/demo-workspace";

/**
 * Web has no native core to reach, so the export is a preview: the in-memory
 * adapter over the demo workspace, which is what `expo export --platform web`
 * and the audit harness in `docs/benchmarks/` drive. Nothing written here
 * survives a reload, and no web build is a release target.
 */
export async function loadWorkspaceBridge(): Promise<BridgePort> {
  return createMemoryBridge({ snapshot: demoSnapshot() });
}
