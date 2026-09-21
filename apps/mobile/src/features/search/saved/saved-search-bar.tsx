import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ShellIcon } from "../../../shell/icons";
import { MINIMUM_TOUCH_TARGET } from "../../../shell/metrics";
import { useTheme } from "../../../shell/theme";

type Props = {
  queries: readonly string[];
  activeQuery: string;
  onApply: (query: string) => void;
  onRemove: (query: string) => void;
};

export function SavedSearchBar({ queries, activeQuery, onApply, onRemove }: Props) {
  const theme = useTheme();

  if (queries.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      accessibilityLabel="Saved searches"
    >
      {queries.map((query) => {
        const current = query === activeQuery.trim();
        return (
          <View
            key={query}
            style={[
              styles.chip,
              {
                backgroundColor: theme.color(current ? "sidebar-accent" : "sidebar-background"),
                borderColor: theme.color("sidebar-border"),
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Search ${query}`}
              accessibilityState={{ selected: current }}
              onPress={() => onApply(query)}
              style={styles.chipLabel}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: theme.color("sidebar-foreground") }]}
              >
                {query}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove saved search ${query}`}
              onPress={() => onRemove(query)}
              style={styles.remove}
            >
              <ShellIcon name="close" size={12} color={theme.color("sidebar-foreground", 0.6)} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    height: MINIMUM_TOUCH_TARGET,
    maxWidth: 240,
    paddingLeft: 14,
    borderRadius: MINIMUM_TOUCH_TARGET / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    flexShrink: 1,
    justifyContent: "center",
    minWidth: MINIMUM_TOUCH_TARGET - 14,
    height: MINIMUM_TOUCH_TARGET,
  },
  remove: {
    width: MINIMUM_TOUCH_TARGET,
    height: MINIMUM_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 13,
  },
});
