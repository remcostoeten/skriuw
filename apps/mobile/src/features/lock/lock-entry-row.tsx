import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RendererState } from "@skriuw/renderer-core/store/types";
import { useChrome } from "../../shell/chrome";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { useWorkspaceSelector } from "../../shell/workspace-provider";
import { lockEntryDetail } from "./lock-model";

function selectLockDetail(state: RendererState): string {
  return lockEntryDetail(state.noteLock);
}

/** The account sheet's way into the lock settings: one row that says where the lock stands. */
export function LockEntryRow() {
  const theme = useTheme();
  const chrome = useChrome();
  const detail = useWorkspaceSelector(selectLockDetail);

  return (
    <View>
      <Text style={[styles.heading, { color: theme.color("sidebar-foreground", 0.5) }]}>
        Security
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Locked notes"
        accessibilityHint={detail}
        onPress={() => chrome.openSheet("lock")}
        style={styles.row}
      >
        <Text style={[styles.label, { color: theme.color("sidebar-foreground") }]}>
          Locked notes
        </Text>
        <Text style={[styles.detail, { color: theme.color("sidebar-foreground", 0.5) }]}>
          {detail}
        </Text>
      </Pressable>
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
    minHeight: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  label: {
    fontSize: 15,
  },
  detail: {
    fontSize: 12,
  },
});
