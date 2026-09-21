import { createMemoryBridge } from "@skriuw/renderer-core/bridge/memory-adapter";
import type { BridgePort } from "@skriuw/renderer-core/bridge/port";
import { createInitialState, createRendererStore } from "@skriuw/renderer-core/store/store";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { thousandNoteSnapshot } from "./fixture";

export type FixtureHarness = {
  bridge: BridgePort;
  store: RendererStore;
};

let harness: FixtureHarness | null = null;

export function fixtureHarness(): FixtureHarness {
  if (harness === null) {
    const snapshot = thousandNoteSnapshot();
    harness = {
      bridge: createMemoryBridge({ snapshot }),
      store: createRendererStore(
        createInitialState(snapshot, undefined, {
          tags: snapshot.tags,
          people: snapshot.people,
          references: snapshot.references,
        }),
      ),
    };
  }
  return harness;
}
