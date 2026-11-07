import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../shell/theme";
import { COLD_START_BUDGET_MS, summarizeColdStarts } from "./cold-start";
import { readColdStarts } from "./cold-start-log";

function seconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function ColdStartSection() {
  const theme = useTheme();
  const [summary] = useState(() => summarizeColdStarts(readColdStarts()));

  if (summary === null) {
    return null;
  }

  const verdict = summary.withinBudget
    ? `Within the ${seconds(COLD_START_BUDGET_MS)} budget`
    : `Over the ${seconds(COLD_START_BUDGET_MS)} budget`;

  return (
    <View>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: theme.color("sidebar-foreground", 0.5) }]}
      >
        Startup
      </Text>
      <View accessible style={styles.row}>
        <Text style={[styles.label, { color: theme.color("sidebar-foreground") }]}>
          {`Last launch ${seconds(summary.latestMs)}`}
        </Text>
        <Text style={[styles.detail, { color: theme.color("sidebar-foreground", 0.5) }]}>
          {`95th percentile of ${summary.count} launches: ${seconds(summary.p95Ms)}. ${verdict}.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 2,
  },
  label: {
    fontSize: 15,
  },
  detail: {
    fontSize: 12,
  },
});
