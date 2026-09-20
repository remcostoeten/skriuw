import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ShellIcon } from "../../shell/icons";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";

type Props = {
  queries: readonly string[];
  activeQuery: string;
  onApply: (query: string) => void;
  onRemove: (query: string) => void;
};

const REMOVE_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 12 };

/** The workspace's saved queries, in the order they were saved. */
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
              hitSlop={REMOVE_HIT_SLOP}
              onPress={() => onRemove(query)}
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
    gap: 8,
    height: 32,
    maxWidth: 220,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    flexShrink: 1,
    justifyContent: "center",
    minHeight: MINIMUM_TOUCH_TARGET - 12,
  },
  chipText: {
    fontSize: 13,
  },
});
