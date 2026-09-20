import { createMemoryBridge } from "../../../../shared/renderer-core/src/bridge/memory-adapter";
import type { BridgePort } from "../../../../shared/renderer-core/src/bridge/port";
import {
  createInitialState,
  createRendererStore,
} from "../../../../shared/renderer-core/src/store/store";
import type { RendererStore } from "../../../../shared/renderer-core/src/store/types";
import { thousandNoteSnapshot } from "./fixture";

export type FixtureHarness = {
  bridge: BridgePort;
  store: RendererStore;
};

let harness: FixtureHarness | null = null;

/**
 * The 1,000-note fixture behind a command surface and a hydrated store, built
 * once per process. Hydrating the snapshot is the thing being measured, so it
 * must not land inside a timed frame.
 */
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
