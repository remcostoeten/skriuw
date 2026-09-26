import { Pressable, StyleSheet, Text, View } from "react-native";
import { MINIMUM_TOUCH_TARGET } from "../../shell/metrics";
import { useTheme } from "../../shell/theme";
import { formatListDate, type DateKey } from "@skriuw/renderer-core/journal/dates";
import { MOOD_OPTIONS } from "./model";
import type { Anniversary } from "./on-this-day";

type Props = {
  anniversaries: readonly Anniversary[];
  excerptOf: (noteId: string) => string;
  onOpenDay: (key: DateKey) => void;
};

/**
 * Earlier entries that share this day, nearest first. Absent when the day
 * recalls nothing, so an untravelled journal shows no empty shelf
 * (`apps/docs/content/v2/specs/journal-daily.md`, "On this day").
 */
export function OnThisDaySection({ anniversaries, excerptOf, onOpenDay }: Props) {
  const theme = useTheme();

  if (anniversaries.length === 0) {
    return null;
  }

  return (
    <View style={styles.root}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: theme.color("muted-foreground") }]}
      >
        On this day
      </Text>
      <View accessibilityRole="list" style={styles.list}>
        {anniversaries.map((anniversary) => {
          const mood = anniversary.entry.mood;
          const excerpt = excerptOf(anniversary.entry.noteId);
          return (
            <Pressable
              key={anniversary.entry.noteId}
              accessibilityRole="button"
              accessibilityLabel={`${anniversary.label}, ${formatListDate(anniversary.entry.dateKey)}`}
              onPress={() => onOpenDay(anniversary.entry.dateKey)}
              style={[styles.row, { borderColor: theme.color("border") }]}
            >
              <View style={styles.rowHeader}>
                <Text style={[styles.label, { color: theme.color("foreground") }]}>
                  {anniversary.label}
                </Text>
                <Text style={[styles.date, { color: theme.color("muted-foreground") }]}>
                  {formatListDate(anniversary.entry.dateKey)}
                </Text>
                {mood === null ? null : (
                  <Text style={[styles.mood, { color: theme.color(MOOD_OPTIONS[mood].token) }]}>
                    {MOOD_OPTIONS[mood].icon}
                  </Text>
                )}
              </View>
              {excerpt.length === 0 ? null : (
                <Text
                  numberOfLines={2}
                  style={[styles.excerpt, { color: theme.color("foreground", 0.7) }]}
                >
                  {excerpt}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: "600",
  },
  list: {
    gap: 8,
  },
  row: {
    minHeight: MINIMUM_TOUCH_TARGET,
    gap: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
  date: {
    flex: 1,
    fontSize: 12,
  },
  mood: {
    fontSize: 13,
    fontWeight: "700",
  },
  excerpt: {
    fontSize: 13,
    lineHeight: 18,
  },
});
