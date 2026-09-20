import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { createMemoryBridge } from "../../../../../shared/renderer-core/src/bridge/memory-adapter";
import type { BridgePort } from "../../../../../shared/renderer-core/src/bridge/port";
import { createInitialState, createRendererStore } from "../../../../../shared/renderer-core/src/store/store";
import type { RendererStore } from "../../../../../shared/renderer-core/src/store/types";
import { WorkspaceProvider } from "../../../shell/workspace-provider";
import { BENCHMARK_QUERIES, measureQueryLatency } from "../benchmark";
import { FIXTURE_NOTE_COUNT, thousandNoteSnapshot } from "../fixture";
import { SearchScreen } from "../search-screen";

const MARKER = "SKRIUW_SEARCH_PROBE";
const ROUNDS = 5;

type Harness = {
  bridge: BridgePort;
  store: RendererStore;
};

let harness: Harness | null = null;

/**
 * Built once, outside render: a thousand-note snapshot is the thing being
 * measured, so hydrating it must not land in a timed frame.
 */
function fixtureHarness(): Harness {
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

/**
 * The search surface over the 1,000-note fixture, timed on a device.
 * `e2e/run-android.sh` copies this into `mobile/app` for the length of a run
 * and reads the marker line back out of logcat.
 *
 * It measures the plan, the command round trip and the filter intersection
 * against the in-memory adapter: the native core still refuses
 * `searchWorkspace` (`mobile/src/bridge/native-adapter.ts`), so this is the
 * floor for query-to-results on the device, not the cost of SQLite's own
 * ranking.
 */
export default function SearchProbe() {
  const { bridge } = fixtureHarness();

  return (
    <WorkspaceProvider bridge={bridge}>
      <ProbeBody />
    </WorkspaceProvider>
  );
}

function ProbeBody() {
  const [outcome, setOutcome] = useState("running");

  useEffect(() => {
    const { bridge, store } = fixtureHarness();
    measureQueryLatency({ bridge, store, rounds: ROUNDS })
      .then(
        (report) =>
          `${MARKER} notes=${FIXTURE_NOTE_COUNT} queries=${BENCHMARK_QUERIES.length} ` +
          `rounds=${ROUNDS} samples=${report.samples.length} ` +
          `p50=${report.p50?.toFixed(1)}ms p95=${report.p95?.toFixed(1)}ms ` +
          `max=${report.max?.toFixed(1)}ms hits=${report.outcomes.reduce(
            (total, entry) => total + entry.hits.length,
            0,
          )}`,
      )
      .catch((error: unknown) => `${MARKER} failed ${String(error)}`)
      .then((line) => {
        console.log(line);
        setOutcome(line);
      });
  }, []);

  return (
    <View style={styles.root}>
      <Text accessibilityLabel="skriuw-search-probe" style={styles.line}>
        {outcome}
      </Text>
      <View style={styles.surface}>
        <SearchScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  line: {
    padding: 12,
    fontSize: 12,
  },
  surface: {
    flex: 1,
    minHeight: 0,
  },
});
