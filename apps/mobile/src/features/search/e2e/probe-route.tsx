import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENCHMARK_QUERIES, measureQueryLatency } from "@/features/search/benchmark/benchmark";
import { FIXTURE_NOTE_COUNT } from "@/features/search/benchmark/fixture";
import { fixtureHarness } from "@/features/search/benchmark/fixture-harness";
import { SearchScreen } from "@/features/search/search-screen";
import { WorkspaceProvider } from "@/shell/workspace-provider";

const MARKER = "SKRIUW_SEARCH_PROBE";
const ROUNDS = 5;

export default function SearchProbe() {
  return (
    <WorkspaceProvider bridge={fixtureHarness().bridge}>
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
