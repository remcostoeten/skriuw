import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SearchHit } from "../../../../../shared/renderer-core/src/contracts/workspace";
import { MINIMUM_TOUCH_TARGET } from "../../../shell/metrics";
import { useTheme } from "../../../shell/theme";
import { snippetPlainText, snippetSegments } from "./snippet";

type Props = {
  hit: SearchHit;
  onOpen: (noteId: string) => void;
};

function SearchResultRowView({ hit, onOpen }: Props) {
  const theme = useTheme();
  const segments = snippetSegments(hit.snippet);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${hit.title}. ${snippetPlainText(hit.snippet)}`}
      onPress={() => onOpen(hit.noteId)}
      style={[styles.row, { borderBottomColor: theme.color("sidebar-border") }]}
    >
      <Text numberOfLines={1} style={[styles.title, { color: theme.color("foreground") }]}>
        {hit.title}
      </Text>
      {segments.length === 0 ? null : (
        <View>
          <Text numberOfLines={2} style={[styles.snippet, { color: theme.color("muted-foreground") }]}>
            {segments.map((segment, index) => (
              <Text
                key={index}
                style={
                  segment.matched
                    ? [styles.matched, { color: theme.color("foreground") }]
                    : undefined
                }
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export const SearchResultRow = memo(SearchResultRowView);

const styles = StyleSheet.create({
  row: {
    minHeight: MINIMUM_TOUCH_TARGET,
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
  },
  snippet: {
    fontSize: 13,
    lineHeight: 18,
  },
  matched: {
    fontWeight: "700",
  },
});
