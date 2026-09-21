import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ShellIcon } from "./icons";
import { MINIMUM_TOUCH_TARGET } from "./metrics";
import { useTheme } from "./theme";
import { pinnedEntriesEqual, pinnedEntriesSelector } from "./tree-model";
import { useWorkspaceSelector } from "./workspace-provider";

type Props = {
  onOpen: (noteId: string) => void;
};

/** Pinned nodes, most recently pinned first, above the tree. Absent when nothing is pinned. */
export function PinnedStrip({ onOpen }: Props) {
  const theme = useTheme();
  const pinned = useWorkspaceSelector(pinnedEntriesSelector, pinnedEntriesEqual);

  if (pinned.length === 0) {
    return null;
  }

  return (
    <View style={[styles.root, { borderBottomColor: theme.color("sidebar-border") }]}>
      <Text style={[styles.heading, { color: theme.color("sidebar-foreground", 0.5) }]}>
        Pinned
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {pinned.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${entry.title}`}
            onPress={() => onOpen(entry.id)}
            style={styles.target}
          >
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: theme.color("sidebar-accent"),
                  borderColor: theme.color("sidebar-border"),
                },
              ]}
            >
              <ShellIcon name="pin" size={12} color={theme.color("favorite")} />
              <Text
                numberOfLines={1}
                style={[styles.label, { color: theme.color("sidebar-foreground", 0.85) }]}
              >
                {entry.title}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heading: {
    paddingHorizontal: 14,
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    paddingHorizontal: 14,
    gap: 6,
  },
  target: {
    minWidth: MINIMUM_TOUCH_TARGET,
    height: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
  },
  chip: {
    maxWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 12,
    flexShrink: 1,
  },
});
